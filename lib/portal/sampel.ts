// lib/portal/sampel.ts  (hanya server)
//
// (30 Okt 2026) Alokasi sampel per SLS (strategi sampel_sls): baca/tulis tabel sigap_sampel*, pencocokan PPL/PML, pratinjau dan unggah templat Excel, penggantian sampel.
// Migrasi 20261030g. Aman dipakai SEBELUM migrasi dijalankan: pembacaan memberi daftar kosong dan `siap: false`; menulis memberi pesan yang jelas.
// Data tertulis lewat fungsi atomik di basis data (sigap_sampel_impor / _ganti / _batal_ganti), bukan rangkaian query dari sini.

import type { Db } from "@/lib/sigap";
import { penugasanAkun } from "@/lib/sigap";
import type { AkunPortal } from "@/lib/portal/server";
import { peringatanWilayah } from "@/lib/wilayah/wilayah";
import {
  KONFIG_SAMPEL_AWAL, bacaKonfigSampel, cocokkanPetugasSampel, kelompokPpl, ketModulSampel, periksaAlokasi, periksaBarisSampel, periksaPermintaanGanti, rekapSampel,
  type BarisSampelCocok, type DataSampelAdmin, type DataSampelSaya, type GalatBaris, type InfoSampel, type Kandidat, type KonfigSampel, type Pemetaan, type RekapSampel, type RiwayatUnggah, type SampelRow,
} from "@/lib/sampelSls";
import {
  bandingkanPenugasan, bentukTimJson, cocokkanAtasan, ringkasTim, susunTim,
  type BandingPenugasan, type PemetaanAtasan, type PeranTim, type RingkasTim, type SimpulTim,
} from "@/lib/timSampel";

export class GalatSampel extends Error {
  constructor(pesan: string, readonly status = 400, readonly kode?: string, readonly rinci?: Record<string, unknown>) {
    super(pesan);
  }
}

const PESAN_BELUM_MIGRASI = "Fitur alokasi sampel belum aktif di basis data (migrasi 20261030g belum dijalankan).";
const PESAN_BELUM_MIGRASI_TIM = "Susunan tim belum aktif di basis data (migrasi 20261102c belum dijalankan).";
const KOLOM =
  "id, urut, kode_wilayah, kode_sls, nama_responden, anggota_lain, status, lat, lng, ppl_akun_id, pml_akun_id, ppl_nama, pml_nama, menggantikan_id, alasan, diganti_at, diganti_oleh";

const belumMigrasi = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === "42P01" || e.code === "42883" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache|Could not find/i.test(e.message ?? ""));

const num = (x: unknown): number | null => {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------------------------------------------------------------

export async function muatKonfigSampel(db: Db, kegiatanId: number): Promise<KonfigSampel> {
  const { data, error } = await db.from("sigap_sampel_konfig").select("target_per_sls, maks_sls_per_ppl, boleh_ganti").eq("kegiatan_id", kegiatanId).maybeSingle();
  if (error || !data) return { ...KONFIG_SAMPEL_AWAL };
  return bacaKonfigSampel(data);
}

type Saring = { ppl?: number; pml?: number };

/** Sampel aktif kegiatan (disaring menurut PPL/PML bila diberikan). `siap` false = tabel belum ada. */
export async function bacaSampel(db: Db, kegiatanId: number, saring: Saring = {}): Promise<{ rows: SampelRow[]; siap: boolean }> {
  let q = db.from("sigap_sampel").select(KOLOM).eq("kegiatan_id", kegiatanId).is("nonaktif_at", null).order("urut").order("id").range(0, 4999);
  if (saring.ppl != null) q = q.eq("ppl_akun_id", saring.ppl);
  if (saring.pml != null) q = q.eq("pml_akun_id", saring.pml);
  const { data, error } = await q;
  if (error) {
    if (belumMigrasi(error)) return { rows: [], siap: false };
    throw new Error(error.message);
  }
  const mentah = (data ?? []) as Record<string, unknown>[];
  const idAkun = Array.from(new Set(mentah.map((r) => num(r.diganti_oleh)).filter((x): x is number => x != null)));
  const nama = new Map<number, string>();
  if (idAkun.length > 0) {
    const { data: ak } = await db.from("sigap_akun").select("id, nama").in("id", idAkun);
    for (const a of ak ?? []) nama.set(Number(a.id), String(a.nama));
  }
  const rows = mentah.map(
    (r): SampelRow => ({
      id: Number(r.id),
      urut: Number(r.urut),
      kode_wilayah: String(r.kode_wilayah),
      kode_sls: String(r.kode_sls),
      nama_responden: String(r.nama_responden),
      anggota_lain: (r.anggota_lain as string | null) ?? null,
      status: r.status === "cadangan" ? "cadangan" : "utama",
      lat: num(r.lat),
      lng: num(r.lng),
      ppl_akun_id: Number(r.ppl_akun_id),
      pml_akun_id: Number(r.pml_akun_id),
      ppl_nama: String(r.ppl_nama),
      pml_nama: String(r.pml_nama),
      menggantikan_id: num(r.menggantikan_id),
      alasan: (r.alasan as string | null) ?? null,
      diganti_at: (r.diganti_at as string | null) ?? null,
      diganti_oleh: num(r.diganti_oleh) != null ? nama.get(num(r.diganti_oleh) as number) ?? null : null,
    }),
  );
  return { rows, siap: true };
}

async function namaKegiatan(db: Db, kegiatanId: number): Promise<string | null> {
  const { data } = await db.from("sigap_kegiatan").select("nama").eq("id", kegiatanId).maybeSingle();
  return data ? String(data.nama) : null;
}

/** PPL, PML, korwil, dan supervisor yang sudah ditugaskan pada kegiatan (sumber pencocokan nama) + peta akun -> peran untuk semua penugasan aktif. */
export async function petugasKegiatan(db: Db, kegiatanId: number): Promise<{ ppl: Kandidat[]; pml: Kandidat[]; korwil: Kandidat[]; supervisor: Kandidat[]; peranAda: Map<number, string> }> {
  const { data: pen, error } = await db.from("sigap_penugasan").select("akun_id, peran").eq("kegiatan_id", kegiatanId).eq("aktif", true).range(0, 4999);
  if (error) throw new Error(error.message);
  const ids = Array.from(new Set((pen ?? []).map((p) => Number(p.akun_id))));
  const nama = new Map<number, string>();
  if (ids.length > 0) {
    const { data: ak } = await db.from("sigap_akun").select("id, nama").in("id", ids);
    for (const a of ak ?? []) nama.set(Number(a.id), String(a.nama));
  }
  const ambil = (peran: string): Kandidat[] =>
    (pen ?? []).filter((p) => p.peran === peran && nama.has(Number(p.akun_id))).map((p) => ({ id: Number(p.akun_id), nama: nama.get(Number(p.akun_id)) as string }));
  const peranAda = new Map<number, string>((pen ?? []).map((p) => [Number(p.akun_id), String(p.peran)]));
  return { ppl: ambil("ppl"), pml: ambil("pml"), korwil: ambil("korwil"), supervisor: ambil("supervisor"), peranAda };
}

/** Semua akun aktif yang boleh ditugaskan: organik dan Mitra. Dipakai pencocokan nama pada mode "tugaskan otomatis". */
async function akunBolehDitugaskan(db: Db): Promise<{ semua: Kandidat[]; organik: Kandidat[] }> {
  const { data, error } = await db.from("sigap_akun").select("id, nama, jenis").eq("aktif", true).in("jenis", ["organik", "mitra"]).range(0, 1999);
  if (error) throw new Error(error.message);
  const semua = (data ?? []).map((a) => ({ id: Number(a.id), nama: String(a.nama), jenis: String(a.jenis) }));
  return { semua: semua.map(({ id, nama }) => ({ id, nama })), organik: semua.filter((a) => a.jenis === "organik").map(({ id, nama }) => ({ id, nama })) };
}

async function riwayatUnggah(db: Db, kegiatanId: number): Promise<RiwayatUnggah[]> {
  const { data, error } = await db
    .from("sigap_sampel_unggah")
    .select("id, nama_berkas, diunggah_at, oleh, jumlah, utama, cadangan, digantikan_at")
    .eq("kegiatan_id", kegiatanId)
    .order("id", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    nama_berkas: (r.nama_berkas as string | null) ?? null,
    diunggah_at: String(r.diunggah_at),
    oleh: (r.oleh as string | null) ?? null,
    jumlah: Number(r.jumlah),
    utama: Number(r.utama),
    cadangan: Number(r.cadangan),
    aktif: r.digantikan_at == null,
  }));
}

/** Data layar admin (Kelola Pendataan, tab Persiapan). */
export async function dataAdminSampel(db: Db, kegiatanId: number, bolehKelola: boolean): Promise<DataSampelAdmin> {
  const nama = await namaKegiatan(db, kegiatanId);
  if (nama == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const [{ rows, siap }, konfig, petugas, riwayat] = await Promise.all([bacaSampel(db, kegiatanId), muatKonfigSampel(db, kegiatanId), petugasKegiatan(db, kegiatanId), riwayatUnggah(db, kegiatanId)]);
  return {
    sekarang: new Date().toISOString(),
    kegiatan: { id: kegiatanId, nama },
    boleh_kelola: bolehKelola,
    siap,
    konfig,
    rekap: rekapSampel(rows),
    sampel: rows,
    riwayat,
    petugas: { ppl: petugas.ppl.length, pml: petugas.pml.length },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pratinjau dan unggah
// ---------------------------------------------------------------------------------------------------------------------------------

export type PratinjauSampel = {
  bisa_simpan: boolean;
  baris_berkas: number;
  dilewati: number;
  rekap: RekapSampel;
  galat: GalatBaris[];
  galat_total: number;
  peringatan: GalatBaris[];
  peringatan_total: number;
  pemetaan: Pemetaan[];
  alokasi: string[];
  ringkas_ppl: { ppl_nama: string; pml_nama: string; sls: number; utama: number; cadangan: number }[];
  /** alokasi aktif sekarang yang akan digantikan */
  jumlah_lama: number;
  ada_pengganti: number;
  petugas: { ppl: number; pml: number };
  /** (2 Nov 2026) susunan tim yang akan tersimpan bersama alokasi */
  otomatis: boolean;
  tim: PratinjauTim;
};

export type PratinjauTim = {
  ringkas: RingkasTim;
  /** belum ditugaskan pada kegiatan: ditugaskan saat disimpan bila `otomatis` */
  baru: { nama: string; peran: PeranTim }[];
  baru_total: number;
  bentrok: BandingPenugasan["bentrok"];
  peringatan: string[];
  pemetaan_atasan: PemetaanAtasan[];
};

const BATAS_DAFTAR = 200;
const bentukJson = (b: BarisSampelCocok) => ({
  kode_wilayah: b.kode_wilayah,
  kode_sls: b.kode_sls,
  nama_responden: b.nama_responden,
  anggota_lain: b.anggota_lain,
  status: b.status,
  lat: b.lat,
  lng: b.lng,
  ppl_akun_id: b.ppl_akun_id,
  pml_akun_id: b.pml_akun_id,
  ppl_nama: b.ppl_nama,
  pml_nama: b.pml_nama,
});

async function siapkanBaris(db: Db, kegiatanId: number, mentah: unknown, otomatis: boolean) {
  if (!Array.isArray(mentah)) throw new GalatSampel("Isi berkas tidak terbaca.");
  const baris = mentah.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x));
  const periksa0 = periksaBarisSampel(baris);
  // Master wilayah tertanam di kode: kode yang tidak ada di master jadi peringatan (baris tetap masuk, PJ yang memutuskan).
  const wilayah = peringatanWilayah(periksa0.baris.map((x) => x.kode_wilayah), periksa0.nomor);
  const periksa = { ...periksa0, peringatan: [...periksa0.peringatan, ...wilayah].sort((x, y) => x.baris - y.baris) };
  const [petugas, konfig] = await Promise.all([petugasKegiatan(db, kegiatanId), muatKonfigSampel(db, kegiatanId)]);
  // Mode otomatis: nama dicocokkan ke SEMUA akun aktif (PPL/PML: organik dan Mitra; korwil/supervisor: organik); yang belum ditugaskan ditugaskan saat disimpan.
  // Mode biasa (perilaku lama): hanya ke petugas yang sudah ditugaskan pada kegiatan itu.
  const calon = otomatis ? await akunBolehDitugaskan(db) : null;
  const kandPpl = calon ? calon.semua : petugas.ppl;
  const kandPml = calon ? calon.semua : petugas.pml;
  const kandKorwil = calon ? calon.organik : petugas.korwil;
  const kandSupervisor = calon ? calon.organik : petugas.supervisor;
  const atasan = cocokkanAtasan(periksa.baris, kandKorwil, kandSupervisor, periksa.nomor, otomatis ? "akun" : "penugasan");
  const cocok = cocokkanPetugasSampel(atasan.baris, kandPpl, kandPml, periksa.nomor);
  const namaAkun = new Map<number, string>([...kandPpl, ...kandPml, ...kandKorwil, ...kandSupervisor].map((p) => [p.id, p.nama]));
  const final = cocok.cocok.map((b) => ({ ...b, ppl_nama: namaAkun.get(b.ppl_akun_id) ?? b.ppl_nama, pml_nama: namaAkun.get(b.pml_akun_id) ?? b.pml_nama }));
  const tim = susunTim(final, namaAkun);
  const banding = bandingkanPenugasan(tim.simpul, petugas.peranAda);
  const galatTim: GalatBaris[] = [
    ...tim.galat.map((pesan) => ({ baris: 0, pesan })),
    ...banding.bentrok.map((x) => ({ baris: 0, pesan: `${x.nama} sudah ditugaskan sebagai ${x.peran_ada.toUpperCase()} pada kegiatan ini, tetapi berkas menuliskannya sebagai ${x.peran_berkas.toUpperCase()}. Samakan dahulu di Penugasan dan ST.` })),
  ];
  const galat: GalatBaris[] = [...periksa.galat, ...atasan.galat, ...cocok.galat, ...galatTim].sort((a, b) => a.baris - b.baris);
  return { baris, periksa, atasan, cocok, final, petugas, konfig, tim, banding, galat, otomatis };
}

export async function pratinjauSampel(db: Db, kegiatanId: number, mentah: unknown, otomatis = false): Promise<PratinjauSampel> {
  const { baris, periksa, atasan, cocok, final, petugas, konfig, tim, banding, galat } = await siapkanBaris(db, kegiatanId, mentah, otomatis);
  const lama = await bacaSampel(db, kegiatanId);
  const semua: SampelRow[] = final.map((b, i) => ({ ...b, id: i + 1, urut: i + 1, menggantikan_id: null, alasan: null, diganti_at: null, diganti_oleh: null }));
  return {
    bisa_simpan: galat.length === 0 && final.length > 0,
    baris_berkas: baris.length,
    dilewati: periksa.dilewati,
    rekap: rekapSampel(semua),
    galat: galat.slice(0, BATAS_DAFTAR),
    galat_total: galat.length,
    peringatan: periksa.peringatan.slice(0, BATAS_DAFTAR),
    peringatan_total: periksa.peringatan.length,
    pemetaan: cocok.pemetaan,
    alokasi: periksaAlokasi(final, konfig),
    ringkas_ppl: kelompokPpl(semua).map((p) => ({ ppl_nama: p.ppl_nama, pml_nama: p.pml_nama, sls: p.sls.length, utama: p.utama, cadangan: p.cadangan })),
    jumlah_lama: lama.rows.length,
    ada_pengganti: lama.rows.filter((r) => r.menggantikan_id != null).length,
    petugas: { ppl: petugas.ppl.length, pml: petugas.pml.length },
    otomatis,
    tim: {
      ringkas: ringkasTim(tim.simpul, banding),
      baru: banding.baru.slice(0, BATAS_DAFTAR).map((x: SimpulTim) => ({ nama: x.nama, peran: x.peran })),
      baru_total: banding.baru.length,
      bentrok: banding.bentrok.slice(0, BATAS_DAFTAR),
      peringatan: tim.peringatan.slice(0, BATAS_DAFTAR),
      pemetaan_atasan: atasan.pemetaan,
    },
  };
}

export type HasilImporSampel = { unggah_id: number; jumlah: number; utama: number; cadangan: number; penugasan_baru: number; tim: number };

export async function imporSampel(db: Db, akun: AkunPortal, kegiatanId: number, namaBerkas: string, mentah: unknown, paksa: boolean, otomatis = false): Promise<HasilImporSampel> {
  const { periksa, final, konfig, tim, galat } = await siapkanBaris(db, kegiatanId, mentah, otomatis);
  if (galat.length > 0) throw new GalatSampel(`Berkas masih memuat ${galat.length} baris bermasalah. Perbaiki lalu pratinjau lagi.`, 400, "BERKAS_BERMASALAH");
  if (final.length === 0) throw new GalatSampel("Berkas tidak berisi baris sampel.");
  const catatan = { peringatan: periksa.peringatan.length, alokasi: periksaAlokasi(final, konfig).length, otomatis };
  // (2 Nov 2026) satu panggilan menulis sampel + penugasan baru + susunan tim (migrasi 20261102c). Bila migrasi itu belum dijalankan dan berkas tidak memerlukannya
  // (mode biasa), jatuh ke fungsi lama supaya alokasi tetap bisa disimpan.
  let { data, error } = await db.rpc("sigap_tim_sampel_impor", {
    p_kegiatan: kegiatanId,
    p_oleh: akun.nama,
    p_berkas: namaBerkas.slice(0, 200) || null,
    p_baris: final.map(bentukJson),
    p_catatan: catatan,
    p_paksa: paksa,
    p_tim: bentukTimJson(tim.simpul),
    p_tugaskan: otomatis,
  });
  if (error && belumMigrasi(error) && !otomatis && tim.simpul.every((x) => x.peran === "ppl" || x.peran === "pml")) {
    ({ data, error } = await db.rpc("sigap_sampel_impor", {
      p_kegiatan: kegiatanId,
      p_oleh: akun.nama,
      p_berkas: namaBerkas.slice(0, 200) || null,
      p_baris: final.map(bentukJson),
      p_catatan: catatan,
      p_paksa: paksa,
    }));
  }
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(otomatis ? PESAN_BELUM_MIGRASI_TIM : PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = data as { ok?: boolean; pesan?: string; kode?: string; n?: number; unggah_id?: number; jumlah?: number; utama?: number; cadangan?: number; penugasan_baru?: number; tim?: number } | null;
  if (!h?.ok) throw new GalatSampel(h?.pesan ?? "Alokasi gagal disimpan.", h?.kode === "ADA_PENGGANTIAN" ? 409 : 400, h?.kode, { n: h?.n });
  return { unggah_id: Number(h.unggah_id), jumlah: Number(h.jumlah), utama: Number(h.utama), cadangan: Number(h.cadangan), penugasan_baru: Number(h.penugasan_baru ?? 0), tim: Number(h.tim ?? 0) };
}

export async function simpanKonfigSampel(db: Db, kegiatanId: number, mentah: unknown, oleh: string): Promise<KonfigSampel> {
  const konfig = bacaKonfigSampel(mentah);
  if ((await namaKegiatan(db, kegiatanId)) == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const { error } = await db.from("sigap_sampel_konfig").upsert({ kegiatan_id: kegiatanId, ...konfig, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id" });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  return konfig;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Sisi petugas
// ---------------------------------------------------------------------------------------------------------------------------------

/** Peran akun pada kegiatan sampel: ppl atau pml (penugasan aktif); null = bukan petugas kegiatan itu. */
export async function peranSampel(db: Db, akunId: number, kegiatanId: number): Promise<"ppl" | "pml" | null> {
  const pen = await penugasanAkun(db, akunId);
  const p = pen.find((x) => x.kegiatan.id === kegiatanId);
  return p?.peran === "ppl" ? "ppl" : p?.peran === "pml" ? "pml" : null;
}

export async function dataSampelSaya(db: Db, akun: AkunPortal, kegiatanId: number): Promise<DataSampelSaya> {
  const peran = await peranSampel(db, akun.id, kegiatanId);
  if (!peran) throw new GalatSampel("Alokasi sampel khusus PPL dan PML kegiatan ini.", 403);
  const nama = await namaKegiatan(db, kegiatanId);
  if (nama == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const [{ rows }, konfig] = await Promise.all([bacaSampel(db, kegiatanId, peran === "ppl" ? { ppl: akun.id } : { pml: akun.id }), muatKonfigSampel(db, kegiatanId)]);
  return { sekarang: new Date().toISOString(), kegiatan: { id: kegiatanId, nama }, peran, saya: { id: akun.id, nama: akun.nama }, konfig, sampel: rows };
}

/** Ringkasan untuk modul tahap Beranda. null = bukan petugas, atau belum ada alokasi, atau tabel belum ada. */
export async function ringkasModulSampel(db: Db, akun: AkunPortal, kegiatanId: number): Promise<InfoSampel | null> {
  try {
    const peran = await peranSampel(db, akun.id, kegiatanId);
    if (!peran) return null;
    const { rows } = await bacaSampel(db, kegiatanId, peran === "ppl" ? { ppl: akun.id } : { pml: akun.id });
    if (rows.length === 0) return null;
    const r = rekapSampel(rows);
    return { kegiatan_id: kegiatanId, peran, sls: r.sls, utama: r.utama, cadangan: r.cadangan, diganti: r.diganti, ppl: r.ppl };
  } catch {
    return null;
  }
}
export { ketModulSampel };

type HasilRpc = { ok?: boolean; pesan?: string } | null;
async function panggilRpc(db: Db, fn: string, args: Record<string, unknown>): Promise<void> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = data as HasilRpc;
  if (!h?.ok) throw new GalatSampel(h?.pesan ?? "Perubahan ditolak.", 409);
}

export async function gantiSampel(db: Db, akun: AkunPortal, kegiatanId: number, mentah: unknown): Promise<void> {
  const peran = await peranSampel(db, akun.id, kegiatanId);
  if (peran !== "ppl") throw new GalatSampel("Hanya PPL yang dapat menandai penggantian sampel.", 403);
  const p = periksaPermintaanGanti(mentah);
  if (!p.ok) throw new GalatSampel(p.pesan);
  await panggilRpc(db, "sigap_sampel_ganti", { p_kegiatan: kegiatanId, p_akun: akun.id, p_utama: p.data.utama_id, p_cadangan: p.data.cadangan_id, p_alasan: p.data.alasan });
}

export async function batalGantiSampel(db: Db, akun: AkunPortal, kegiatanId: number, cadanganId: number, sebagaiAdmin: boolean): Promise<void> {
  if (!Number.isInteger(cadanganId) || cadanganId <= 0) throw new GalatSampel("Sampel tidak valid.");
  if (!sebagaiAdmin) {
    const peran = await peranSampel(db, akun.id, kegiatanId);
    if (peran !== "ppl") throw new GalatSampel("Hanya PPL yang dapat membatalkan penggantian sampel.", 403);
  }
  await panggilRpc(db, "sigap_sampel_batal_ganti", { p_kegiatan: kegiatanId, p_akun: akun.id, p_cadangan: cadanganId, p_admin: sebagaiAdmin });
}
