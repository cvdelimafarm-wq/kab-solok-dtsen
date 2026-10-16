// lib/portal/spdt.ts  (hanya server)
//
// (16 Okt 2026) Lembar Pendataan SPDT NTP 2026: peran akun, daftar KK menurut peran, pencatatan "koordinat dibuka", dan data Monitoring.
// Akses: Supervisor (peran supervisor_spdt_ntp, menu spdt.supervisor) = semua KK; PML = KK yang pml_akun_id-nya dirinya; PPL = KK yang ppl_akun_id-nya dirinya.
// Tabel: sigap_spdt_kk (daftar KK) dan sigap_spdt_buka (koordinat KK yang dibuka per hari). Lembar ini hanya BACA -- petugas tidak mengisi hasil apa pun.

import type { Db } from "@/lib/sigap";
import { penugasanAkun } from "@/lib/sigap";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import type { AkunPortal } from "@/lib/portal/server";
import { memoWaktu } from "@/lib/portal/memoSingkat";
import { tanggalWib } from "@/lib/sigapTahap";
import {
  KEGIATAN_SPDT_ID,
  MENU_SUPERVISOR_SPDT,
  awalHariWib,
  ringkasSpdt,
  susunMonitoring,
  type DataMonitoring,
  type InfoSpdt,
  type KkRingan,
  type KkSpdt,
  type PeranSpdt,
} from "@/lib/spdtNtp";

const KOLOM_KK =
  "id, urut, kode_wilayah, kecamatan, nagari, jorong, nama_kk, anggota_lain, alamat, akurasi_m, lat, lng, ppl_nama, pml_nama, ppl_akun_id, pml_akun_id";

const num = (x: unknown): number | null => {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/** Peran akun pada SPDT NTP: supervisor (izin menu) > pml > ppl; null = bukan petugas SPDT NTP. Disimpan 60 detik. */
export function peranSpdt(db: Db, akunId: number): Promise<PeranSpdt | null> {
  return memoWaktu(`spdt-peran:${akunId}`, 60_000, async () => {
    const [{ izin }, pen] = await Promise.all([izinAkun(db, akunId), penugasanAkun(db, akunId)]);
    if (boleh(izin, MENU_SUPERVISOR_SPDT, "lihat", KEGIATAN_SPDT_ID)) return "supervisor";
    const p = pen.find((x) => x.kegiatan.id === KEGIATAN_SPDT_ID);
    if (p?.peran === "pml") return "pml";
    if (p?.peran === "ppl") return "ppl";
    return null;
  });
}

/** KK yang boleh dilihat akun ini. Daftar KK praktis tetap -> disimpan 5 menit per akun. */
export function bacaKkSpdt(db: Db, akunId: number, peran: PeranSpdt): Promise<KkSpdt[]> {
  return memoWaktu(`spdt-kk:${peran}:${akunId}`, 5 * 60_000, async () => {
    let q = db.from("sigap_spdt_kk").select(KOLOM_KK).eq("kegiatan_id", KEGIATAN_SPDT_ID).order("urut").range(0, 4999);
    if (peran === "ppl") q = q.eq("ppl_akun_id", akunId);
    else if (peran === "pml") q = q.eq("pml_akun_id", akunId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: Number(r.id),
      urut: Number(r.urut),
      kode_wilayah: String(r.kode_wilayah),
      kecamatan: String(r.kecamatan),
      nagari: String(r.nagari),
      jorong: String(r.jorong),
      nama_kk: String(r.nama_kk),
      anggota_lain: (r.anggota_lain as string | null) ?? null,
      alamat: (r.alamat as string | null) ?? null,
      akurasi_m: num(r.akurasi_m),
      lat: Number(r.lat),
      lng: Number(r.lng),
      ppl_nama: String(r.ppl_nama),
      pml_nama: String(r.pml_nama),
      ppl_akun_id: num(r.ppl_akun_id),
      pml_akun_id: num(r.pml_akun_id),
    }));
  });
}

/** Ringkasan untuk modul tahap. Gagal baca tabel (belum dimigrasi) -> null, tahapan lain tetap jalan. */
export async function ringkasModulSpdt(db: Db, akun: AkunPortal): Promise<InfoSpdt | null> {
  try {
    const peran = await peranSpdt(db, akun.id);
    if (!peran) return null;
    const kk = await bacaKkSpdt(db, akun.id, peran);
    return ringkasSpdt(peran, kk);
  } catch {
    return null;
  }
}

/** Akun ini supervisor SPDT NTP pada kegiatan induk? (dipakai indukUntukAkun agar supervisor tanpa penugasan tetap melihat kegiatannya) */
export async function adalahSupervisorSpdt(db: Db, akunId: number): Promise<boolean> {
  return (await peranSpdt(db, akunId)) === "supervisor";
}

export type HasilBuka = { ok: true; dicatat: boolean } | { ok: false; pesan: string; status: number };

/** Catat bahwa akun membuka koordinat KK hari ini (satu baris per KK per akun per hari). */
export async function catatBuka(db: Db, akun: AkunPortal, peran: PeranSpdt, kkId: number, navigasi: boolean): Promise<HasilBuka> {
  const { data: kk, error } = await db.from("sigap_spdt_kk").select("id, ppl_akun_id, pml_akun_id").eq("id", kkId).eq("kegiatan_id", KEGIATAN_SPDT_ID).maybeSingle();
  if (error) return { ok: false, pesan: error.message, status: 500 };
  if (!kk) return { ok: false, pesan: "KK tidak ditemukan.", status: 404 };
  const diizinkan = peran === "supervisor" || (peran === "pml" && kk.pml_akun_id === akun.id) || (peran === "ppl" && kk.ppl_akun_id === akun.id);
  if (!diizinkan) return { ok: false, pesan: "KK ini bukan bagian dari wilayah Anda.", status: 403 };

  const tanggal = tanggalWib(Date.now());
  const sekarang = new Date().toISOString();
  const { data: ada } = await db.from("sigap_spdt_buka").select("id, navigasi").eq("kk_id", kkId).eq("akun_id", akun.id).eq("tanggal", tanggal).maybeSingle();
  if (ada) {
    await db.from("sigap_spdt_buka").update({ terakhir_at: sekarang, navigasi: !!ada.navigasi || navigasi }).eq("id", ada.id);
    return { ok: true, dicatat: true };
  }
  const { error: e2 } = await db.from("sigap_spdt_buka").insert({ kk_id: kkId, akun_id: akun.id, tanggal, pertama_at: sekarang, terakhir_at: sekarang, navigasi });
  // dua ketukan bersamaan: yang kedua kena batas unik -> tidak apa-apa
  if (e2 && e2.code !== "23505") return { ok: false, pesan: e2.message, status: 500 };
  return { ok: true, dicatat: true };
}

/** Data Monitoring: Supervisor = semua grup; PML = grupnya sendiri. */
export async function bacaMonitoring(db: Db, akun: AkunPortal, peran: PeranSpdt): Promise<DataMonitoring> {
  const tanggal = tanggalWib(Date.now());
  const semua = await bacaKkSpdt(db, akun.id, peran);
  const kk: KkRingan[] = semua.map((k) => ({ id: k.id, ppl_akun_id: k.ppl_akun_id, pml_akun_id: k.pml_akun_id, ppl_nama: k.ppl_nama, pml_nama: k.pml_nama }));
  const akunIds = Array.from(new Set(kk.flatMap((k) => [k.ppl_akun_id, k.pml_akun_id]).filter((x): x is number => x != null)));

  const [{ data: ak }, { data: ss }, { data: bk }] = akunIds.length
    ? await Promise.all([
        db.from("sigap_akun").select("id, nama").in("id", akunIds),
        db.from("sigap_log_sesi").select("akun_id, mulai_at, terakhir_aktif_at").in("akun_id", akunIds).gte("terakhir_aktif_at", awalHariWib(tanggal)),
        db.from("sigap_spdt_buka").select("akun_id, kk_id").eq("tanggal", tanggal).in("akun_id", akunIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const nama = new Map<number, string>((ak ?? []).map((a) => [Number(a.id), String(a.nama)]));
  const { grup, ringkas } = susunMonitoring({
    tanggal,
    kk,
    nama,
    sesi: (ss ?? []).map((s) => ({ akun_id: Number(s.akun_id), mulai_at: String(s.mulai_at), terakhir_aktif_at: String(s.terakhir_aktif_at) })),
    buka: (bk ?? []).map((b) => ({ akun_id: Number(b.akun_id), kk_id: Number(b.kk_id) })),
  });
  return { sekarang: new Date().toISOString(), tanggal, peran, grup, ringkas };
}
