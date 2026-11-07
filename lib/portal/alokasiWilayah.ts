// lib/portal/alokasiWilayah.ts  (hanya server)
//
// (7 Nov 2026) Alokasi per sub SLS (lapis 2 rancangan sampel lintas survei): baca/tulis sigap_alokasi_*, master_wilayah, master_kk; pratinjau dan unggah templat Excel;
// sisi petugas (sub SLS saya + daftar KK master per sub SLS). Migrasi 20261107e. Aman dipakai SEBELUM migrasi dijalankan: pembacaan memberi `siap: false`;
// menulis memberi pesan yang jelas. Penulisan lewat fungsi atomik di basis data (sigap_alokasi_impor).

import type { Db } from "@/lib/sigap";
import type { AkunPortal } from "@/lib/portal/server";
import { GalatSampel, akunBolehDitugaskan, peranSampel, petugasKegiatan } from "@/lib/portal/sampel";
import { bentukTimJson, bandingkanPenugasan, ringkasTim, type BandingPenugasan, type RingkasTim, type SimpulTim, type PeranTim } from "@/lib/timSampel";
import type { GalatBaris, Pemetaan } from "@/lib/sampelSls";
import {
  cocokkanAlokasi, periksaAlokasiWilayah, periksaBarisAlokasi, periksaTerhadapMaster, rekapAlokasi,
  type BarisAlokasi, type BarisAlokasiCocok, type DataAlokasiAdmin, type DataAlokasiSaya, type KkMaster, type KonfigAlokasi, type RekapAlokasi, type RiwayatAlokasi, type WilayahAlokasi, type WilayahMaster,
} from "@/lib/alokasiWilayah";
import type { PemetaanAtasan } from "@/lib/timSampel";

const PESAN_BELUM_MIGRASI = "Alokasi sub SLS belum aktif di basis data (migrasi 20261107e belum dijalankan).";
export const KONFIG_ALOKASI_AWAL: KonfigAlokasi = { target_per_sls: 10, maks_sls_per_ppl: 2, dengan_updating: true };

const belumMigrasi = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === "42P01" || e.code === "42883" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache|Could not find/i.test(e.message ?? ""));
const num = (x: unknown): number | null => {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const potong = <T,>(a: readonly T[], n: number): T[][] => {
  const h: T[][] = [];
  for (let i = 0; i < a.length; i += n) h.push(a.slice(i, i + n));
  return h;
};

async function namaKegiatan(db: Db, kegiatanId: number): Promise<string | null> {
  const { data } = await db.from("sigap_kegiatan").select("nama").eq("id", kegiatanId).maybeSingle();
  return data ? String(data.nama) : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Setelan
// ---------------------------------------------------------------------------------------------------------------------------------

const bulat = (v: unknown, min: number, maks: number, awal: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= maks ? n : awal;
};

/** Setelan alokasi dari tabel setelan sampel. Kolom dengan_updating baru ada setelah migrasi 20261107e; sebelum itu dipakai bawaan (dengan updating). */
export async function muatKonfigAlokasi(db: Db, kegiatanId: number): Promise<KonfigAlokasi> {
  const { data, error } = await db.from("sigap_sampel_konfig").select("target_per_sls, maks_sls_per_ppl, dengan_updating").eq("kegiatan_id", kegiatanId).maybeSingle();
  if (error) {
    const lama = await db.from("sigap_sampel_konfig").select("target_per_sls, maks_sls_per_ppl").eq("kegiatan_id", kegiatanId).maybeSingle();
    const d = lama.data as Record<string, unknown> | null;
    return d
      ? { target_per_sls: bulat(d.target_per_sls, 1, 100, KONFIG_ALOKASI_AWAL.target_per_sls), maks_sls_per_ppl: bulat(d.maks_sls_per_ppl, 1, 50, KONFIG_ALOKASI_AWAL.maks_sls_per_ppl), dengan_updating: true }
      : { ...KONFIG_ALOKASI_AWAL };
  }
  if (!data) return { ...KONFIG_ALOKASI_AWAL };
  const d = data as Record<string, unknown>;
  return {
    target_per_sls: bulat(d.target_per_sls, 1, 100, KONFIG_ALOKASI_AWAL.target_per_sls),
    maks_sls_per_ppl: bulat(d.maks_sls_per_ppl, 1, 50, KONFIG_ALOKASI_AWAL.maks_sls_per_ppl),
    dengan_updating: typeof d.dengan_updating === "boolean" ? d.dengan_updating : true,
  };
}

/** Simpan pilihan model 1 (dengan/tanpa updating), setelan lain dipertahankan. */
export async function simpanModelAlokasi(db: Db, kegiatanId: number, denganUpdating: unknown, oleh: string): Promise<KonfigAlokasi> {
  if (typeof denganUpdating !== "boolean") throw new GalatSampel("Pilihan model tidak sah.");
  if ((await namaKegiatan(db, kegiatanId)) == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const sekarang = await muatKonfigAlokasi(db, kegiatanId);
  const { data: lama } = await db.from("sigap_sampel_konfig").select("boleh_ganti").eq("kegiatan_id", kegiatanId).maybeSingle();
  const bolehGanti = typeof (lama as { boleh_ganti?: unknown } | null)?.boleh_ganti === "boolean" ? ((lama as { boleh_ganti: boolean }).boleh_ganti) : true;
  const { error } = await db.from("sigap_sampel_konfig").upsert(
    { kegiatan_id: kegiatanId, target_per_sls: sekarang.target_per_sls, maks_sls_per_ppl: sekarang.maks_sls_per_ppl, boleh_ganti: bolehGanti, dengan_updating: denganUpdating, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() },
    { onConflict: "kegiatan_id" },
  );
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  return { ...sekarang, dengan_updating: denganUpdating };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------------------------------------------------------------

async function masterWilayah(db: Db, ids: readonly string[]): Promise<Map<string, WilayahMaster>> {
  const hasil = new Map<string, WilayahMaster>();
  for (const bagian of potong(Array.from(new Set(ids)), 200)) {
    const { data, error } = await db.from("master_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").in("idsubsls", bagian).eq("aktif", true);
    if (error) {
      if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
      throw new Error(error.message);
    }
    for (const r of (data ?? []) as Record<string, unknown>[]) hasil.set(String(r.idsubsls), { idsubsls: String(r.idsubsls), kecamatan: String(r.kecamatan), nagari: String(r.nagari), sls: String(r.sls), sub_sls: String(r.sub_sls) });
  }
  return hasil;
}

async function jumlahKk(db: Db, ids: readonly string[]): Promise<Map<string, number>> {
  const hasil = new Map<string, number>();
  for (const bagian of potong(Array.from(new Set(ids)), 300)) {
    const { data, error } = await db.rpc("master_kk_hitung", { p_ids: bagian });
    if (error) {
      if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
      throw new Error(error.message);
    }
    for (const r of (data ?? []) as { idsubsls: string; jumlah: number | string }[]) hasil.set(String(r.idsubsls), Number(r.jumlah));
  }
  return hasil;
}

async function namaAkunMap(db: Db, ids: readonly number[]): Promise<Map<number, string>> {
  const nama = new Map<number, string>();
  for (const bagian of potong(Array.from(new Set(ids)), 200)) {
    const { data } = await db.from("sigap_akun").select("id, nama").in("id", bagian);
    for (const a of (data ?? []) as Record<string, unknown>[]) nama.set(Number(a.id), String(a.nama));
  }
  return nama;
}

const KOLOM_ALOKASI = "id, idsubsls, nks, target_sampel, ppl_akun_id, pml_akun_id, urut";

/** Alokasi aktif kegiatan (disaring menurut PPL/PML bila diberikan). `siap` false = tabel belum ada. */
export async function bacaAlokasi(db: Db, kegiatanId: number, targetBawaan: number, saring: { ppl?: number; pml?: number } = {}): Promise<{ wilayah: WilayahAlokasi[]; siap: boolean }> {
  let q = db.from("sigap_alokasi_wilayah").select(KOLOM_ALOKASI).eq("kegiatan_id", kegiatanId).is("nonaktif_at", null).order("urut").order("id").range(0, 1999);
  if (saring.ppl != null) q = q.eq("ppl_akun_id", saring.ppl);
  if (saring.pml != null) q = q.eq("pml_akun_id", saring.pml);
  const { data, error } = await q;
  if (error) {
    if (belumMigrasi(error)) return { wilayah: [], siap: false };
    throw new Error(error.message);
  }
  const mentah = (data ?? []) as Record<string, unknown>[];
  const ids = mentah.map((r) => String(r.idsubsls));
  const [master, kk, nama] = await Promise.all([
    masterWilayah(db, ids),
    jumlahKk(db, ids),
    namaAkunMap(db, mentah.flatMap((r) => [num(r.ppl_akun_id), num(r.pml_akun_id)]).filter((x): x is number => x != null)),
  ]);
  const wilayah = mentah.map((r): WilayahAlokasi => {
    const id = String(r.idsubsls);
    const m = master.get(id);
    const ppl = num(r.ppl_akun_id);
    const pml = num(r.pml_akun_id);
    return {
      id: Number(r.id),
      idsubsls: id,
      nks: (r.nks as string | null) ?? null,
      target: num(r.target_sampel) ?? targetBawaan,
      kecamatan: m?.kecamatan ?? "",
      nagari: m?.nagari ?? "",
      sls: m?.sls ?? "",
      sub_sls: m?.sub_sls ?? "",
      kd_kec: id.slice(0, 7),
      ppl_akun_id: ppl,
      pml_akun_id: pml,
      ppl_nama: ppl != null ? nama.get(ppl) ?? null : null,
      pml_nama: pml != null ? nama.get(pml) ?? null : null,
      jumlah_kk: kk.get(id) ?? 0,
    };
  });
  return { wilayah, siap: true };
}

async function riwayatAlokasi(db: Db, kegiatanId: number): Promise<RiwayatAlokasi[]> {
  const { data, error } = await db.from("sigap_alokasi_unggah").select("id, nama_berkas, diunggah_at, oleh, jumlah, dengan_petugas, digantikan_at").eq("kegiatan_id", kegiatanId).order("id", { ascending: false }).limit(20);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    nama_berkas: (r.nama_berkas as string | null) ?? null,
    diunggah_at: String(r.diunggah_at),
    oleh: (r.oleh as string | null) ?? null,
    jumlah: Number(r.jumlah),
    dengan_petugas: Number(r.dengan_petugas),
    aktif: r.digantikan_at == null,
  }));
}

function rekapDari(w: readonly WilayahAlokasi[], targetBawaan: number): RekapAlokasi {
  return rekapAlokasi(
    w.map((x): BarisAlokasiCocok => ({ idsubsls: x.idsubsls, nks: x.nks, target: x.target, ppl_nama: x.ppl_nama ?? "", pml_nama: x.pml_nama ?? "", ppl_akun_id: x.ppl_akun_id, pml_akun_id: x.pml_akun_id })),
    targetBawaan,
  );
}

/** Data layar admin (Kelola Pendataan, tab Persiapan). */
export async function dataAdminAlokasi(db: Db, kegiatanId: number, bolehKelola: boolean): Promise<DataAlokasiAdmin> {
  const nama = await namaKegiatan(db, kegiatanId);
  if (nama == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const konfig = await muatKonfigAlokasi(db, kegiatanId);
  const [{ wilayah, siap }, petugas, riwayat] = await Promise.all([bacaAlokasi(db, kegiatanId, konfig.target_per_sls), petugasKegiatan(db, kegiatanId), riwayatAlokasi(db, kegiatanId)]);
  return { sekarang: new Date().toISOString(), kegiatan: { id: kegiatanId, nama }, boleh_kelola: bolehKelola, siap, konfig, rekap: rekapDari(wilayah, konfig.target_per_sls), wilayah, riwayat, petugas: { ppl: petugas.ppl.length, pml: petugas.pml.length } };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pratinjau dan unggah
// ---------------------------------------------------------------------------------------------------------------------------------

export type PratinjauTimAlokasi = { ringkas: RingkasTim; baru: { nama: string; peran: PeranTim }[]; baru_total: number; bentrok: BandingPenugasan["bentrok"]; peringatan: string[]; pemetaan_atasan: PemetaanAtasan[] };
export type PratinjauAlokasi = {
  bisa_simpan: boolean;
  baris_berkas: number;
  dilewati: number;
  rekap: RekapAlokasi;
  galat: GalatBaris[];
  galat_total: number;
  peringatan: GalatBaris[];
  peringatan_total: number;
  pemetaan: Pemetaan[];
  alokasi: string[];
  ringkas_ppl: { ppl_nama: string; pml_nama: string; subsls: number; target: number }[];
  jumlah_lama: number;
  petugas: { ppl: number; pml: number };
  otomatis: boolean;
  tim: PratinjauTimAlokasi;
};
export type HasilImporAlokasi = { unggah_id: number; jumlah: number; dengan_petugas: number; penugasan_baru: number; tim: number };

const BATAS_DAFTAR = 200;

async function siapkan(db: Db, kegiatanId: number, mentah: unknown, otomatis: boolean) {
  if (!Array.isArray(mentah)) throw new GalatSampel("Isi berkas tidak terbaca.");
  const baris = mentah.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x));
  const periksa = periksaBarisAlokasi(baris);
  const [petugas, konfig, master] = await Promise.all([petugasKegiatan(db, kegiatanId), muatKonfigAlokasi(db, kegiatanId), masterWilayah(db, periksa.baris.map((b) => b.idsubsls))]);
  const wilayah = periksaTerhadapMaster(periksa.baris, periksa.nomor, master);
  const calon = otomatis ? await akunBolehDitugaskan(db) : null;
  const kand = {
    ppl: calon ? calon.semua : petugas.ppl,
    pml: calon ? calon.semua : petugas.pml,
    korwil: calon ? calon.organik : petugas.korwil,
    supervisor: calon ? calon.organik : petugas.supervisor,
  };
  const cocok = cocokkanAlokasi(periksa.baris, periksa.nomor, kand, otomatis ? "akun" : "penugasan", new Map());
  const namaAkun = new Map<number, string>([...kand.ppl, ...kand.pml, ...kand.korwil, ...kand.supervisor].map((p) => [p.id, p.nama]));
  const final = cocok.final.map((b) => ({ ...b, ppl_nama: b.ppl_akun_id != null ? namaAkun.get(b.ppl_akun_id) ?? b.ppl_nama : b.ppl_nama, pml_nama: b.pml_akun_id != null ? namaAkun.get(b.pml_akun_id) ?? b.pml_nama : b.pml_nama }));
  const banding = bandingkanPenugasan(cocok.tim.simpul, petugas.peranAda);
  const galatTim: GalatBaris[] = [
    ...cocok.tim.galat.map((pesan) => ({ baris: 0, pesan })),
    ...banding.bentrok.map((x) => ({ baris: 0, pesan: `${x.nama} sudah ditugaskan sebagai ${x.peran_ada.toUpperCase()} pada kegiatan ini, tetapi berkas menuliskannya sebagai ${x.peran_berkas.toUpperCase()}. Samakan dahulu di Penugasan dan ST.` })),
  ];
  const galat: GalatBaris[] = [...periksa.galat, ...wilayah.galat, ...cocok.galat, ...galatTim].sort((a, b) => a.baris - b.baris);
  const peringatan = [...periksa.peringatan, ...wilayah.peringatan].sort((a, b) => a.baris - b.baris);
  return { baris, periksa, final, petugas, konfig, cocok, banding, galat, peringatan, namaAkun };
}

export async function pratinjauAlokasi(db: Db, kegiatanId: number, mentah: unknown, otomatis = false): Promise<PratinjauAlokasi> {
  const { baris, periksa, final, petugas, konfig, cocok, banding, galat, peringatan, namaAkun } = await siapkan(db, kegiatanId, mentah, otomatis);
  const kk = await jumlahKk(db, final.map((b) => b.idsubsls));
  const lama = await bacaAlokasi(db, kegiatanId, konfig.target_per_sls);
  const perPpl = new Map<number, { ppl_nama: string; pml_nama: string; subsls: number; target: number }>();
  for (const b of final) {
    if (b.ppl_akun_id == null) continue;
    const p = perPpl.get(b.ppl_akun_id) ?? { ppl_nama: b.ppl_nama, pml_nama: b.pml_nama, subsls: 0, target: 0 };
    p.subsls++;
    p.target += b.target ?? konfig.target_per_sls;
    perPpl.set(b.ppl_akun_id, p);
  }
  return {
    bisa_simpan: galat.length === 0 && final.length > 0,
    baris_berkas: baris.length,
    dilewati: periksa.dilewati,
    rekap: rekapAlokasi(final, konfig.target_per_sls),
    galat: galat.slice(0, BATAS_DAFTAR),
    galat_total: galat.length,
    peringatan: peringatan.slice(0, BATAS_DAFTAR),
    peringatan_total: peringatan.length,
    pemetaan: cocok.pemetaan,
    alokasi: periksaAlokasiWilayah(final, konfig.maks_sls_per_ppl, kk, namaAkun),
    ringkas_ppl: Array.from(perPpl.values()).sort((a, b) => a.ppl_nama.localeCompare(b.ppl_nama)),
    jumlah_lama: lama.wilayah.length,
    petugas: { ppl: petugas.ppl.length, pml: petugas.pml.length },
    otomatis,
    tim: {
      ringkas: ringkasTim(cocok.tim.simpul, banding),
      baru: banding.baru.slice(0, BATAS_DAFTAR).map((x: SimpulTim) => ({ nama: x.nama, peran: x.peran })),
      baru_total: banding.baru.length,
      bentrok: banding.bentrok.slice(0, BATAS_DAFTAR),
      peringatan: cocok.tim.peringatan.slice(0, BATAS_DAFTAR),
      pemetaan_atasan: cocok.pemetaan_atasan,
    },
  };
}

const bentukJson = (b: BarisAlokasiCocok) => ({ idsubsls: b.idsubsls, nks: b.nks, target_sampel: b.target, ppl_akun_id: b.ppl_akun_id, pml_akun_id: b.pml_akun_id });

export async function imporAlokasi(db: Db, akun: AkunPortal, kegiatanId: number, namaBerkas: string, mentah: unknown, otomatis = false): Promise<HasilImporAlokasi> {
  const { periksa, final, cocok, galat, peringatan } = await siapkan(db, kegiatanId, mentah, otomatis);
  if (galat.length > 0) throw new GalatSampel(`Berkas masih memuat ${galat.length} baris bermasalah. Perbaiki lalu pratinjau lagi.`, 400, "BERKAS_BERMASALAH");
  if (final.length === 0) throw new GalatSampel("Berkas tidak berisi baris alokasi.");
  const { data, error } = await db.rpc("sigap_alokasi_impor", {
    p_kegiatan: kegiatanId,
    p_oleh: akun.nama,
    p_berkas: namaBerkas.slice(0, 200) || null,
    p_baris: final.map(bentukJson),
    p_catatan: { peringatan: peringatan.length, dilewati: periksa.dilewati, otomatis },
    p_tim: bentukTimJson(cocok.tim.simpul),
    p_tugaskan: otomatis,
  });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = data as { ok?: boolean; pesan?: string; kode?: string; unggah_id?: number; jumlah?: number; dengan_petugas?: number; penugasan_baru?: number; tim?: number } | null;
  if (!h?.ok) throw new GalatSampel(h?.pesan ?? "Alokasi gagal disimpan.", 400, h?.kode);
  return { unggah_id: Number(h.unggah_id), jumlah: Number(h.jumlah), dengan_petugas: Number(h.dengan_petugas ?? 0), penugasan_baru: Number(h.penugasan_baru ?? 0), tim: Number(h.tim ?? 0) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Sisi petugas
// ---------------------------------------------------------------------------------------------------------------------------------

export async function dataAlokasiSaya(db: Db, akun: AkunPortal, kegiatanId: number): Promise<DataAlokasiSaya> {
  const peran = await peranSampel(db, akun.id, kegiatanId);
  if (!peran) throw new GalatSampel("Alokasi wilayah khusus PPL dan PML kegiatan ini.", 403);
  const nama = await namaKegiatan(db, kegiatanId);
  if (nama == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const konfig = await muatKonfigAlokasi(db, kegiatanId);
  const { wilayah } = await bacaAlokasi(db, kegiatanId, konfig.target_per_sls, peran === "ppl" ? { ppl: akun.id } : { pml: akun.id });
  return { sekarang: new Date().toISOString(), kegiatan: { id: kegiatanId, nama }, peran, saya: { id: akun.id, nama: akun.nama }, konfig, wilayah };
}

/** Daftar KK master satu sub SLS. Hanya PPL/PML yang memegang sub SLS itu pada kegiatan tersebut. */
export async function kkSubslsSaya(db: Db, akun: AkunPortal, kegiatanId: number, idsubsls: string): Promise<KkMaster[]> {
  if (!/^\d{16}$/.test(idsubsls)) throw new GalatSampel("Kode sub SLS tidak sah.");
  const peran = await peranSampel(db, akun.id, kegiatanId);
  if (!peran) throw new GalatSampel("Daftar KK khusus PPL dan PML sub SLS ini.", 403);
  const { data: al, error: e1 } = await db.from("sigap_alokasi_wilayah").select("id").eq("kegiatan_id", kegiatanId).eq("idsubsls", idsubsls).is("nonaktif_at", null).eq(peran === "ppl" ? "ppl_akun_id" : "pml_akun_id", akun.id).maybeSingle();
  if (e1) {
    if (belumMigrasi(e1)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(e1.message);
  }
  if (!al) throw new GalatSampel("Sub SLS ini bukan bagian dari alokasi Anda.", 403);
  const { data, error } = await db.from("master_kk").select("id, nama_kk, anggota_lain, patokan, lat, lng").eq("idsubsls", idsubsls).eq("aktif", true).order("nama_kk").range(0, 1999);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r): KkMaster => ({ id: Number(r.id), nama_kk: String(r.nama_kk), anggota_lain: (r.anggota_lain as string | null) ?? null, patokan: (r.patokan as string | null) ?? null, lat: num(r.lat), lng: num(r.lng) }));
}

export type { BarisAlokasi };
