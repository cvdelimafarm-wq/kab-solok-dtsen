// lib/portal/korwilMonitor.ts  (hanya server)
//
// (19 Okt 2026) Monitoring Korwil di HP -- HANYA-BACA: tidak menulis apa pun.
// Kelompok & tim: bencana_kelompok_tim (kortim + PML tiap kelompok); PPL = petugas aktif beratasan PML itu (bencana_petugas.atasan_id).
// Sub SLS: bencana_alokasi_subsls (pml_id), dibekukan = bencana_wilayah.nonaktif. KK: fungsi database bencana_pendataan_ringkas (sama dengan
// Lembar Pendataan & tab Monitoring). Administrasi: bencana_monitoring_lapangan (sama dengan Monitoring Lapangan). Perhitungan di lib/korwilMonitor.ts.

import type { Db } from "@/lib/sigap";
import { hariIniWib, hariLengkap } from "@/lib/sigap";
import { KEGIATAN_PENDATAAN_ID } from "@/lib/pendataan";
import { monitoringLapangan } from "@/lib/portal/lapangan";
import { memoWaktu } from "@/lib/portal/memoSingkat";
import type { AkunPortal } from "@/lib/portal/server";
import type { BarisKkMon, HasilMon } from "@/lib/pendataanMonitor";
import type { InfoKorwil } from "@/lib/sigapTahap";
import { geserTanggal } from "@/lib/korwilTempo";
import {
  susunAdministrasi,
  susunLapanganKorwil,
  type AnggotaKorwil,
  type BarisHariKorwil,
  type DataKorwil,
  type HarianTim,
  type LapanganKorwil,
  type PilihanKelompok,
  type SubInfoKorwil,
  type SubPmlKorwil,
  type TimKorwilMasuk,
} from "@/lib/korwilMonitor";

/** Periode kegiatan Pendataan Pascabencana mulai 10 Okt 2026 (sama dengan tab Monitoring). */
export const MULAI_KORWIL = "2026-10-10";
const TTL_MS = 45_000;
const HASIL: HasilMon[] = ["terdampak", "tidak_terdampak", "tidak_ditemukan"];

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

type BarisKelompok = { kelompok: number; peran: string; akun_id: number; urutan: number | null };

/** Semua kelompok tempat akun ini menjadi kortim (korwil), urut (urutan, kelompok); kosong = bukan kortim. Yang pertama = kelompok bawaan. */
export async function daftarKelompokKortim(db: Db, akunId: number): Promise<number[]> {
  const { data, error } = await db
    .from("bencana_kelompok_tim")
    .select("kelompok, urutan")
    .eq("kegiatan_id", KEGIATAN_PENDATAAN_ID)
    .eq("aktif", true)
    .eq("peran", "kortim")
    .eq("akun_id", akunId);
  if (error) throw new Error(`Gagal membaca kelompok: ${error.message}`);
  return ((data ?? []) as { kelompok: number; urutan: number | null }[])
    .map((b) => ({ kelompok: n(b.kelompok), urutan: n(b.urutan) }))
    .sort((a, b) => a.urutan - b.urutan || a.kelompok - b.kelompok)
    .map((b) => b.kelompok);
}

/** Kelompok bawaan akun ini sebagai kortim (yang pertama); null = bukan kortim. */
export async function kelompokKortim(db: Db, akunId: number): Promise<number | null> {
  return (await daftarKelompokKortim(db, akunId))[0] ?? null;
}

/** Semua kelompok beserta nama kortimnya (untuk pemilih kelompok bagi admin). */
export async function daftarKelompok(db: Db): Promise<PilihanKelompok[]> {
  const { data, error } = await db.from("bencana_kelompok_tim").select("kelompok, peran, akun_id, urutan").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).eq("aktif", true).eq("peran", "kortim").order("kelompok").order("urutan");
  if (error) throw new Error(`Gagal membaca kelompok: ${error.message}`);
  const baris = (data ?? []) as BarisKelompok[];
  const nama = await namaAkun(db, baris.map((b) => n(b.akun_id)));
  const per = new Map<number, string[]>();
  for (const b of baris) per.set(n(b.kelompok), [...(per.get(n(b.kelompok)) ?? []), nama.get(n(b.akun_id)) ?? `Akun ${b.akun_id}`]);
  return [...per.entries()].map(([kelompok, korwil]) => ({ kelompok, korwil }));
}

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const hasil = new Map<number, string>();
  const unik = Array.from(new Set(ids));
  if (unik.length === 0) return hasil;
  const { data } = await db.from("sigap_akun").select("id, nama").in("id", unik);
  for (const r of (data ?? []) as { id: number; nama: string }[]) hasil.set(n(r.id), String(r.nama ?? ""));
  return hasil;
}

/** PML (petugas id) satu kelompok: dari akun PML di bencana_kelompok_tim -> petugas_bencana_id. */
async function pmlKelompok(db: Db, kelompok: number): Promise<{ korwilAkun: number[]; pmlPetugas: number[] } | null> {
  const { data, error } = await db.from("bencana_kelompok_tim").select("kelompok, peran, akun_id, urutan").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).eq("aktif", true).eq("kelompok", kelompok);
  if (error) throw new Error(`Gagal membaca kelompok: ${error.message}`);
  const baris = (data ?? []) as BarisKelompok[];
  if (baris.length === 0) return null;
  const pmlAkun = baris.filter((b) => b.peran === "pml").map((b) => n(b.akun_id));
  const { data: ak } = pmlAkun.length ? await db.from("sigap_akun").select("id, petugas_bencana_id").in("id", pmlAkun) : { data: [] };
  const pmlPetugas = ((ak ?? []) as { id: number; petugas_bencana_id: number | null }[]).map((a) => a.petugas_bencana_id).filter((x): x is number => x != null).map(n);
  return {
    korwilAkun: baris
      .filter((b) => b.peran === "kortim")
      .sort((a, b) => n(a.urutan) - n(b.urutan))
      .map((b) => n(b.akun_id)),
    pmlPetugas: Array.from(new Set(pmlPetugas)),
  };
}

/** Tim (PML + PPL aktif beserta akunnya) untuk daftar PML tertentu. */
async function bangunTim(db: Db, pmlIds: number[], tampil: boolean): Promise<TimKorwilMasuk[]> {
  if (pmlIds.length === 0) return [];
  const [{ data: pm }, { data: pp }] = await Promise.all([
    db.from("bencana_petugas").select("id, nama, aktif").in("id", pmlIds),
    db.from("bencana_petugas").select("id, nama, atasan_id, aktif").in("atasan_id", pmlIds).eq("peran", "ppl"),
  ]);
  const pmlRows = (pm ?? []) as { id: number; nama: string; aktif: boolean | null }[];
  const pplRows = ((pp ?? []) as { id: number; nama: string; atasan_id: number; aktif: boolean | null }[]).filter((x) => x.aktif !== false);
  const semua = [...pmlRows.map((x) => n(x.id)), ...pplRows.map((x) => n(x.id))];
  const { data: ak } = semua.length ? await db.from("sigap_akun").select("id, petugas_bencana_id").in("petugas_bencana_id", semua).eq("aktif", true) : { data: [] };
  const akunPer = new Map<number, number[]>();
  for (const a of (ak ?? []) as { id: number; petugas_bencana_id: number }[]) akunPer.set(n(a.petugas_bencana_id), [...(akunPer.get(n(a.petugas_bencana_id)) ?? []), n(a.id)]);
  const anggota = (x: { id: number; nama: string }): AnggotaKorwil => ({ petugas_id: n(x.id), nama: String(x.nama ?? ""), akun_ids: akunPer.get(n(x.id)) ?? [] });
  return pmlRows.map((p) => ({ pml: anggota(p), ppl: pplRows.filter((x) => n(x.atasan_id) === n(p.id)).map(anggota), tampil }));
}

/** (27 Okt 2026) Anggota satu kelompok yang bisa diperiksa pada Lembar Supervisi: PML dan PPL aktif yang punya akun SIGAP. Satu baris per petugas (akun pertama). */
export type AnggotaPeriksa = { akun_id: number; nama: string; peran: "pml" | "ppl"; pml_nama: string | null };
export async function anggotaKelompok(db: Db, kelompok: number): Promise<AnggotaPeriksa[] | null> {
  const k = await pmlKelompok(db, kelompok);
  if (!k) return null;
  const tim = await bangunTim(db, k.pmlPetugas, true);
  const hasil: AnggotaPeriksa[] = [];
  for (const t of tim) {
    if (t.pml.akun_ids[0] != null) hasil.push({ akun_id: t.pml.akun_ids[0], nama: t.pml.nama, peran: "pml", pml_nama: null });
    for (const p of t.ppl) if (p.akun_ids[0] != null) hasil.push({ akun_id: p.akun_ids[0], nama: p.nama, peran: "ppl", pml_nama: t.pml.nama });
  }
  return hasil;
}

async function halaman<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let dari = 0; dari < 60_000; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) throw new Error(error.message);
    const b = (data ?? []) as T[];
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
}

/**
 * (19 Okt 2026) Hitungan KK PROPORSIONAL untuk sekumpulan tim PML: satu-satunya sumber angka target/realisasi KK bersama Monitoring Korwil,
 * kartu tahap & Beranda (ringkasModulPendataan) dan header Lembar Pendataan -- supaya angka di semua layar sama (keputusan user 19 Okt).
 * Tim lain yang ikut memegang Sub SLS yang sama ikut dimuat (tampil = false) agar pembagian Sub SLS bersama benar.
 */
async function lapanganTim(db: Db, pmlPetugas: number[], timKelompok: TimKorwilMasuk[]): Promise<LapanganKorwil> {
  // Sub SLS tim kelompok, lalu pemegang lain Sub SLS yang sama (tim di kelompok lain) supaya pembagian proporsional benar
  const alokasi = await halaman<{ idsubsls: string; pml_id: number | null }>((a, b) =>
    db.from("bencana_alokasi_subsls").select("idsubsls, pml_id").in("pml_id", pmlPetugas.length ? pmlPetugas : [-1]).order("idsubsls").range(a, b),
  );
  const subPml: SubPmlKorwil[] = alokasi.filter((x) => x.pml_id != null).map((x) => ({ idsubsls: x.idsubsls, pml_id: n(x.pml_id) }));
  const idsSub = Array.from(new Set(subPml.map((s) => s.idsubsls)));
  // (27 Okt 2026) Dua pekerjaan berikut tidak saling bergantung, jadi dijalankan bersamaan (urutan hasil per potongan tetap sama):
  //  (a) pemegang lain Sub SLS yang sama -> tim luar;  (b) nama wilayah + Sub SLS non aktif.
  const potongan: string[][] = [];
  for (let i = 0; i < idsSub.length; i += 200) potongan.push(idsSub.slice(i, i + 200));

  const muatTimLuar = async () => {
    const hasilLain = await Promise.all(
      potongan.map(async (potong) => {
        const { data } = await db.from("bencana_alokasi_subsls").select("idsubsls, pml_id").in("idsubsls", potong).not("pml_id", "is", null);
        return (data ?? []) as { idsubsls: string; pml_id: number | null }[];
      }),
    );
    const lain = hasilLain.flat();
    const pmlLuar = Array.from(new Set(lain.map((x) => n(x.pml_id)).filter((id) => id > 0 && !pmlPetugas.includes(id))));
    const timLuar = await bangunTim(db, pmlLuar, false);
    return { lain, pmlLuar, timLuar };
  };

  // nama wilayah + Sub SLS non aktif (kolom `nonaktif` ada sejak migrasi 20261018a; bila belum ada, semua dianggap aktif)
  const muatWilayah = async () => {
    const info = new Map<string, SubInfoKorwil>();
    const nonaktif = new Set<string>();
    type BarisWilayah = { idsubsls: string; nagari: string; sls: string; sub_sls: string; nonaktif?: boolean | null };
    type HasilWilayah = { data: BarisWilayah[] | null; error: unknown };
    const hasilWil = await Promise.all(
      potongan.map(async (potong) => {
        let res = (await db.from("bencana_wilayah").select("idsubsls, nagari, sls, sub_sls, nonaktif").in("idsubsls", potong)) as unknown as HasilWilayah;
        if (res.error) res = (await db.from("bencana_wilayah").select("idsubsls, nagari, sls, sub_sls").in("idsubsls", potong)) as unknown as HasilWilayah;
        return res.data ?? [];
      }),
    );
    for (const r of hasilWil.flat()) {
      info.set(r.idsubsls, { nagari: String(r.nagari ?? ""), sls: String(r.sls ?? ""), sub_sls: String(r.sub_sls ?? "") });
      if (r.nonaktif === true) nonaktif.add(r.idsubsls);
    }
    return { info, nonaktif };
  };

  const [{ lain, pmlLuar, timLuar }, { info, nonaktif }] = await Promise.all([muatTimLuar(), muatWilayah()]);
  for (const x of lain) if (pmlLuar.includes(n(x.pml_id))) subPml.push({ idsubsls: x.idsubsls, pml_id: n(x.pml_id) });
  const semuaTim = [...timKelompok, ...timLuar];

  // ringkasan KK per tim (beberapa tim sekaligus)
  const baris: BarisKkMon[] = [];
  const pmlSemua = semuaTim.map((t) => t.pml.petugas_id);
  for (let i = 0; i < pmlSemua.length; i += 6) {
    const hasil = await Promise.all(
      pmlSemua.slice(i, i + 6).map(async (pml) => {
        const { data, error } = await db.rpc("bencana_pendataan_ringkas", { p_pml: pml });
        if (error) throw new Error(`Gagal memuat ringkasan tim: ${error.message}`);
        return ((data ?? []) as Record<string, unknown>[]).map(
          (r): BarisKkMon => ({ pml_id: pml, idsubsls: String(r.idsubsls), ppl_akun_id: r.ppl_akun_id == null ? null : n(r.ppl_akun_id), hasil: HASIL.includes(r.hasil as HasilMon) ? (r.hasil as HasilMon) : null, jumlah: n(r.jumlah) }),
        );
      }),
    );
    for (const h of hasil) baris.push(...h);
  }

  return susunLapanganKorwil({ tim: semuaTim, sub: subPml, nonaktif, baris, info });
}

/** Cadangan bila kegiatan tidak terbaca: akhir periode Pendataan Pascabencana 2026. */
const SELESAI_BAWAAN = "2026-11-10";

async function tanggalSelesai(db: Db): Promise<string> {
  const { data } = await db.from("sigap_kegiatan").select("tanggal_selesai").eq("id", KEGIATAN_PENDATAAN_ID).maybeSingle();
  const t = (data as { tanggal_selesai?: string | null } | null)?.tanggal_selesai;
  return typeof t === "string" && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : SELESAI_BAWAAN;
}

/**
 * (27 Okt 2026) KK berhasil didata (terdampak / tidak terdampak) per tanggal WIB untuk tiap tim kelompok, 8 hari terakhir termasuk hari ini.
 * Hanya KK di Sub SLS AKTIF tim (yang dihitung dalam target) dan yang ditandai anggota tim itu. Dasar kecepatan di lib/korwilTempo.ts.
 */
async function harianTim(db: Db, tim: TimKorwilMasuk[], lapangan: LapanganKorwil, hariIni: string): Promise<HarianTim[]> {
  const mulai = geserTanggal(hariIni, -8);
  const akunKeTim = new Map<number, number>();
  for (const t of tim) for (const p of [t.pml, ...t.ppl]) for (const a of p.akun_ids) if (!akunKeTim.has(a)) akunKeTim.set(a, t.pml.petugas_id);
  const subAktif = new Map<number, Set<string>>();
  for (const t of lapangan.tim) subAktif.set(t.pml_id, new Set(t.sub.map((x) => x.idsubsls)));
  const hasil = new Map<number, Record<string, number>>(tim.map((t) => [t.pml.petugas_id, {}]));
  const akunIds = Array.from(akunKeTim.keys());
  if (akunIds.length > 0) {
    const baris = await halaman<{ ppl_akun_id: number | null; idsubsls: string; status_at: string | null }>((a, b) =>
      db
        .from("bencana_pendataan_kk")
        .select("ppl_akun_id, idsubsls, status_at")
        .eq("aktif", true)
        .in("hasil", ["terdampak", "tidak_terdampak"])
        .in("ppl_akun_id", akunIds)
        .gte("status_at", `${mulai}T00:00:00+07:00`)
        .order("id")
        .range(a, b),
    );
    for (const r of baris) {
      if (r.ppl_akun_id == null || !r.status_at) continue;
      const pml = akunKeTim.get(n(r.ppl_akun_id));
      if (pml == null || !(subAktif.get(pml)?.has(r.idsubsls) ?? false)) continue;
      const tgl = new Date(Date.parse(r.status_at) + 7 * 3_600_000).toISOString().slice(0, 10);
      const per = hasil.get(pml)!;
      per[tgl] = (per[tgl] ?? 0) + 1;
    }
  }
  return lapangan.tim.map((t) => ({ pml_id: t.pml_id, per_hari: hasil.get(t.pml_id) ?? {} }));
}

async function muatKelompok(db: Db, kelompok: number): Promise<Omit<DataKorwil, "pilihan"> | null> {
  const k = await pmlKelompok(db, kelompok);
  if (!k) return null;
  const hariIni = hariIniWib();

  // (27 Okt 2026) Pekerjaan yang tidak saling bergantung dimulai bersamaan: administrasi harian (fungsi database, ±0,15 dtk; satu muatan dipakai
  // semua kelompok), tanggal selesai, dan nama korwil berjalan sambil tim & lapangan dimuat. Isi hasil tidak berubah.
  const lapP = memoWaktu("korwil:lapangan", TTL_MS, () => monitoringLapangan(db, MULAI_KORWIL, hariIni));
  lapP.catch(() => undefined); // bila langkah lain gagal lebih dulu, jangan sampai menjadi "unhandled rejection"
  const selesaiP = tanggalSelesai(db);
  const namaKorwilP = namaAkun(db, k.korwilAkun);

  const timKelompok = await bangunTim(db, k.pmlPetugas, true);
  const lapangan = await lapanganTim(db, k.pmlPetugas, timKelompok);

  // administrasi harian (sama dengan Monitoring Lapangan)
  const [namaKorwil, selesai, harian, lap] = await Promise.all([
    namaKorwilP,
    selesaiP,
    harianTim(db, timKelompok, lapangan, hariIni).catch((): HarianTim[] => []),
    lapP,
  ]);
  const akunKelompok = new Set(timKelompok.flatMap((t) => [t.pml, ...t.ppl].flatMap((p) => p.akun_ids)));
  const hari: BarisHariKorwil[] = lap.baris
    .filter((b) => akunKelompok.has(b.akun_id))
    .map((b) => ({
      akun_id: b.akun_id,
      tanggal: b.tanggal,
      hari_kerja: b.hari_kerja,
      lengkap: hariLengkap(b.ada_laporan, b.jumlah_foto, lap.aturan),
      ada_laporan: b.ada_laporan,
      jumlah_foto: b.jumlah_foto,
      aktif: b.sub_idf > 0 || b.kk_berhasil > 0 || b.kk_tdk_ditemukan > 0,
    }));

  return {
    sekarang: new Date().toISOString(),
    hari_ini: hariIni,
    mulai: MULAI_KORWIL,
    selesai,
    harian,
    kelompok,
    korwil: k.korwilAkun.map((a) => namaKorwil.get(a) ?? `Akun ${a}`),
    lapangan,
    administrasi: susunAdministrasi({ tim: timKelompok, baris: hari, mulai: MULAI_KORWIL, hariIni }),
  };
}

/** Data Monitoring Korwil satu kelompok (disimpan ±45 detik; permintaan serentak berbagi satu pemuatan). null = kelompok tidak ada. */
export function monitoringKorwil(db: Db, kelompok: number, paksa = false): Promise<Omit<DataKorwil, "pilihan"> | null> {
  const kunci = `korwil:${kelompok}`;
  if (paksa) return muatKelompok(db, kelompok);
  return memoWaktu(kunci, TTL_MS, () => muatKelompok(db, kelompok));
}

/** Ringkas murah untuk kartu modul di tahap Pendataan (tanpa menghitung progres): kelompok, jumlah tim PML, jumlah PPL. null = bukan kortim. */
export async function ringkasModulKorwil(db: Db, akun: Pick<AkunPortal, "id">): Promise<InfoKorwil | null> {
  return memoWaktu(`korwil-ringkas:${akun.id}`, 60_000, async () => {
    const kel = await kelompokKortim(db, akun.id);
    if (kel == null) return null;
    const k = await pmlKelompok(db, kel);
    if (!k) return null;
    const { data } = k.pmlPetugas.length ? await db.from("bencana_petugas").select("id").in("atasan_id", k.pmlPetugas).eq("peran", "ppl").neq("aktif", false) : { data: [] };
    return { kelompok: kel, tim: k.pmlPetugas.length, ppl: (data ?? []).length };
  });
}

/** Angka KK proporsional satu tim PML (target = KK tim + bagian sisa Sub SLS bersama; didata = realisasi + tidak ditemukan). null = tim tak dikenal/gagal. */
export type KkProporsionalTim = { total: number; didata: number; realisasi: number; tidak_ditemukan: number; sub: number };
export function kkProporsionalTim(db: Db, pmlId: number): Promise<KkProporsionalTim | null> {
  return memoWaktu(`kk-prop:${pmlId}`, TTL_MS, async () => {
    try {
      const tim = await bangunTim(db, [pmlId], true);
      if (tim.length === 0) return null;
      const l = await lapanganTim(db, [pmlId], tim);
      const t = l.tim.find((x) => x.pml_id === pmlId);
      if (!t || t.target <= 0) return null;
      return { total: t.target, didata: t.realisasi + t.tidak_ditemukan, realisasi: t.realisasi, tidak_ditemukan: t.tidak_ditemukan, sub: t.sub.length };
    } catch {
      return null;
    }
  });
}
