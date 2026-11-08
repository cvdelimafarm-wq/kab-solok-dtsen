// lib/portal/sampelObjek.ts  (hanya server)
//
// (8 Nov 2026, D1+D2) Sampel model 2 dan 3: profil variabel, daftar objek sampel, pratinjau/unggah Excel, hasil per objek. Migrasi 20261108a. Aman dipakai SEBELUM migrasi:
// pembacaan memberi `siap: false`; menulis memberi pesan yang jelas. Penulisan lewat fungsi atomik di basis data.

import type { Db } from "@/lib/sigap";
import type { AkunPortal } from "@/lib/portal/server";
import { GalatSampel, akunBolehDitugaskan, peranSampel, petugasKegiatan } from "@/lib/portal/sampel";
import { bentukTimJson, bandingkanPenugasan, ringkasTim, type BandingPenugasan, type PemetaanAtasan, type PeranTim, type RingkasTim, type SimpulTim } from "@/lib/timSampel";
import type { GalatBaris, InfoSampel, Pemetaan } from "@/lib/sampelSls";
import { kodeKelompok, tingkatKelompok as kodeKelompokObjek } from "@/lib/seleksiTurunanObjek";
import {
  KUNCI_BEBAS, bacaProfil, bentukObjekJson, cocokkanPetugasObjek, kolomProfil, periksaBarisObjek, periksaCatatHasil, periksaObjek, periksaWilayahObjek,
  rekapHasilObjek, rekapObjek, tingkatPlot, validasiProfil, bacaHasilObjek,
  type BarisObjekCocok, type DataObjekAdmin, type DataObjekSaya, type HasilObjek, type ObjekSaya, type ProfilTersimpan, type RekapObjek, type RiwayatObjek, type RingkasPpl,
  type TingkatWilayah, type WilayahMasterLengkap,
} from "@/lib/sampelObjek";

const PESAN_BELUM_MIGRASI = "Sampel model 2/3 belum aktif di basis data (migrasi 20261108a belum dijalankan).";
const BATAS_DAFTAR = 200;

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

async function namaAkunMap(db: Db, ids: readonly number[]): Promise<Map<number, string>> {
  const nama = new Map<number, string>();
  for (const bagian of potong(Array.from(new Set(ids)), 200)) {
    const { data } = await db.from("sigap_akun").select("id, nama").in("id", bagian);
    for (const a of (data ?? []) as Record<string, unknown>[]) nama.set(Number(a.id), String(a.nama));
  }
  return nama;
}

/** Seluruh master wilayah aktif (sekitar 1.100 baris; PostgREST membatasi 1.000 per permintaan, jadi dibaca berhalaman). */
async function masterLengkap(db: Db): Promise<WilayahMasterLengkap[]> {
  const hasil: WilayahMasterLengkap[] = [];
  for (let dari = 0; dari < 20_000; dari += 1000) {
    const { data, error } = await db.from("master_wilayah").select("idsubsls, kd_kec, iddesa, idsls, kecamatan, nagari, sls, sub_sls").eq("aktif", true).order("idsubsls").range(dari, dari + 999);
    if (error) {
      if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
      throw new Error(error.message);
    }
    const h = (data ?? []) as Record<string, unknown>[];
    for (const r of h) {
      hasil.push({ idsubsls: String(r.idsubsls), kd_kec: String(r.kd_kec), iddesa: String(r.iddesa), idsls: String(r.idsls), kecamatan: String(r.kecamatan), nagari: String(r.nagari), sls: String(r.sls), sub_sls: String(r.sub_sls) });
    }
    if (h.length < 1000) break;
  }
  return hasil;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------------------------------------------------------------

/** Profil kegiatan. `siap` false = tabel belum ada. profil null = model 1. */
export async function muatProfil(db: Db, kegiatanId: number): Promise<{ profil: ProfilTersimpan | null; siap: boolean }> {
  const { data, error } = await db.from("sigap_sampel_profil").select("model, variabel, label_bebas, level_plot").eq("kegiatan_id", kegiatanId).maybeSingle();
  if (error) {
    if (belumMigrasi(error)) return { profil: null, siap: false };
    throw new Error(error.message);
  }
  if (!data) return { profil: null, siap: true };
  const p = bacaProfil({ model: data.model, variabel: data.variabel, label_bebas: data.label_bebas });
  if (!p) return { profil: null, siap: true };
  return { profil: { ...p, level: tingkatPlot(p.variabel) }, siap: true };
}

export async function simpanProfil(db: Db, akun: AkunPortal, kegiatanId: number, mentah: unknown): Promise<{ level_plot: TingkatWilayah | null }> {
  const p = bacaProfil(mentah);
  if (!p) throw new GalatSampel("Profil tidak terbaca (model dan variabel wajib).");
  const sah = validasiProfil(p);
  if (sah.length > 0) throw new GalatSampel(sah[0], 400, "PROFIL_TIDAK_SAH", { semua: sah });
  if ((await namaKegiatan(db, kegiatanId)) == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const { data, error } = await db.rpc("sigap_profil_simpan", { p_kegiatan: kegiatanId, p_oleh: akun.nama, p_model: p.model, p_variabel: p.variabel, p_label: p.label_bebas });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = data as { ok?: boolean; pesan?: string; kode?: string; level_plot?: string | null } | null;
  if (!h?.ok) throw new GalatSampel(h?.pesan ?? "Profil gagal disimpan.", 400, h?.kode);
  return { level_plot: (h.level_plot as TingkatWilayah | null) ?? null };
}

export async function hapusProfil(db: Db, kegiatanId: number): Promise<void> {
  const { data, error } = await db.rpc("sigap_profil_hapus", { p_kegiatan: kegiatanId });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = data as { ok?: boolean; pesan?: string; kode?: string } | null;
  if (!h?.ok) throw new GalatSampel(h?.pesan ?? "Profil gagal dihapus.", 400, h?.kode);
}

export async function kosongkanObjek(db: Db, kegiatanId: number): Promise<number> {
  const { data, error } = await db.rpc("sigap_objek_kosongkan", { p_kegiatan: kegiatanId });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  return Number((data as { dikosongkan?: number } | null)?.dikosongkan ?? 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pembacaan objek
// ---------------------------------------------------------------------------------------------------------------------------------

type BarisDb = {
  id: number; urut: number; kode_wilayah: string | null; nama_sampel: string | null; jumlah: number; ppl_akun_id: number | null; pml_akun_id: number | null;
  atribut: Record<string, unknown>; hasil: HasilObjek | null; jumlah_didata: number | null; hasil_at: string | null;
};
const KOLOM_OBJEK = "id, urut, kode_wilayah, nama_sampel, jumlah, ppl_akun_id, pml_akun_id, atribut, hasil, jumlah_didata, hasil_at";

/** Objek aktif kegiatan (disaring menurut PPL/PML bila diberikan), berhalaman sampai 5.000 baris. */
async function bacaObjek(db: Db, kegiatanId: number, saring: { ppl?: number; pml?: number } = {}): Promise<{ baris: BarisDb[]; siap: boolean }> {
  const baris: BarisDb[] = [];
  for (let dari = 0; dari < 5000; dari += 1000) {
    let q = db.from("sigap_sampel_objek").select(KOLOM_OBJEK).eq("kegiatan_id", kegiatanId).is("nonaktif_at", null).order("urut").order("id").range(dari, dari + 999);
    if (saring.ppl != null) q = q.eq("ppl_akun_id", saring.ppl);
    if (saring.pml != null) q = q.eq("pml_akun_id", saring.pml);
    const { data, error } = await q;
    if (error) {
      if (belumMigrasi(error)) return { baris: [], siap: false };
      throw new Error(error.message);
    }
    const h = (data ?? []) as Record<string, unknown>[];
    for (const r of h) {
      baris.push({
        id: Number(r.id), urut: Number(r.urut), kode_wilayah: (r.kode_wilayah as string | null) ?? null, nama_sampel: (r.nama_sampel as string | null) ?? null, jumlah: Number(r.jumlah),
        ppl_akun_id: num(r.ppl_akun_id), pml_akun_id: num(r.pml_akun_id), atribut: (r.atribut as Record<string, unknown>) ?? {}, hasil: bacaHasilObjek(r.hasil),
        jumlah_didata: num(r.jumlah_didata), hasil_at: (r.hasil_at as string | null) ?? null,
      });
    }
    if (h.length < 1000) break;
  }
  return { baris, siap: true };
}

async function riwayatObjek(db: Db, kegiatanId: number): Promise<RiwayatObjek[]> {
  const { data, error } = await db.from("sigap_objek_unggah").select("id, nama_berkas, diunggah_at, oleh, jumlah, jumlah_sampel, dengan_petugas, digantikan_at").eq("kegiatan_id", kegiatanId).order("id", { ascending: false }).limit(20);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id), nama_berkas: (r.nama_berkas as string | null) ?? null, diunggah_at: String(r.diunggah_at), oleh: (r.oleh as string | null) ?? null,
    jumlah: Number(r.jumlah), jumlah_sampel: Number(r.jumlah_sampel), dengan_petugas: Number(r.dengan_petugas), aktif: r.digantikan_at == null,
  }));
}

async function adaAlokasiModel1(db: Db, kegiatanId: number): Promise<boolean> {
  const { count, error } = await db.from("sigap_alokasi_wilayah").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId).is("nonaktif_at", null);
  return !error && (count ?? 0) > 0;
}

function ringkasPerPpl(baris: readonly BarisDb[], nama: ReadonlyMap<number, string>): RingkasPpl[] {
  const peta = new Map<number, RingkasPpl>();
  for (const b of baris) {
    if (b.ppl_akun_id == null) continue;
    const r = peta.get(b.ppl_akun_id) ?? { ppl_id: b.ppl_akun_id, ppl_nama: nama.get(b.ppl_akun_id) ?? `akun ${b.ppl_akun_id}`, pml_nama: b.pml_akun_id != null ? nama.get(b.pml_akun_id) ?? null : null, objek: 0, sampel: 0, didata: 0, menolak: 0, tidak_ditemukan: 0, belum: 0, sampel_didata: 0 };
    r.objek++;
    r.sampel += b.jumlah;
    if (!b.hasil) r.belum++;
    else r[b.hasil]++;
    if (b.hasil === "didata") r.sampel_didata += b.jumlah_didata ?? b.jumlah;
    peta.set(b.ppl_akun_id, r);
  }
  return Array.from(peta.values()).sort((a, b) => a.ppl_nama.localeCompare(b.ppl_nama));
}

/** Data layar admin (Kelola Pendataan, tab Persiapan). */
export async function dataAdminObjek(db: Db, kegiatanId: number, bolehKelola: boolean): Promise<DataObjekAdmin> {
  const nama = await namaKegiatan(db, kegiatanId);
  if (nama == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const { profil, siap } = await muatProfil(db, kegiatanId);
  const kosong: RekapObjek = { objek: 0, sampel: 0, wilayah: 0, ppl: 0, pml: 0, tanpa_petugas: 0 };
  if (!siap) {
    return { sekarang: new Date().toISOString(), kegiatan: { id: kegiatanId, nama }, boleh_kelola: bolehKelola, siap: false, model: 1, profil: null, alokasi_model1_aktif: false, rekap: kosong, hasil: rekapHasilObjek([]), ringkas_ppl: [], tanpa_petugas: 0, riwayat: [], petugas: { ppl: 0, pml: 0 } };
  }
  const [{ baris }, petugas, riwayat, aktif1] = await Promise.all([bacaObjek(db, kegiatanId), petugasKegiatan(db, kegiatanId), riwayatObjek(db, kegiatanId), adaAlokasiModel1(db, kegiatanId)]);
  const namaAkun = await namaAkunMap(db, baris.flatMap((b) => [b.ppl_akun_id, b.pml_akun_id]).filter((x): x is number => x != null));
  return {
    sekarang: new Date().toISOString(),
    kegiatan: { id: kegiatanId, nama },
    boleh_kelola: bolehKelola,
    siap: true,
    model: profil ? profil.model : 1,
    profil,
    alokasi_model1_aktif: aktif1,
    rekap: rekapObjek(baris.map((b) => ({ kode_wilayah: b.kode_wilayah, jumlah: b.jumlah, ppl_akun_id: b.ppl_akun_id, pml_akun_id: b.pml_akun_id }))),
    hasil: rekapHasilObjek(baris),
    ringkas_ppl: ringkasPerPpl(baris, namaAkun),
    tanpa_petugas: baris.filter((b) => b.ppl_akun_id == null).length,
    riwayat,
    petugas: { ppl: petugas.ppl.length, pml: petugas.pml.length },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pratinjau dan unggah
// ---------------------------------------------------------------------------------------------------------------------------------

export type PratinjauTimObjek = { ringkas: RingkasTim; baru: { nama: string; peran: PeranTim }[]; baru_total: number; bentrok: BandingPenugasan["bentrok"]; peringatan: string[]; pemetaan_atasan: PemetaanAtasan[] };
export type PratinjauObjek = {
  bisa_simpan: boolean;
  baris_berkas: number;
  dilewati: number;
  rekap: RekapObjek;
  galat: GalatBaris[];
  galat_total: number;
  peringatan: GalatBaris[];
  peringatan_total: number;
  pemetaan: Pemetaan[];
  catatan: string[];
  ringkas_ppl: { ppl_nama: string; pml_nama: string; objek: number; sampel: number }[];
  jumlah_lama: number;
  petugas: { ppl: number; pml: number };
  otomatis: boolean;
  tim: PratinjauTimObjek;
};
export type HasilImporObjek = { unggah_id: number; jumlah: number; jumlah_sampel: number; dengan_petugas: number; penugasan_baru: number; tim: number };

async function siapkan(db: Db, kegiatanId: number, mentah: unknown, otomatis: boolean) {
  if (!Array.isArray(mentah)) throw new GalatSampel("Isi berkas tidak terbaca.");
  const { profil, siap } = await muatProfil(db, kegiatanId);
  if (!siap) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
  if (!profil) throw new GalatSampel("Simpan dulu profil variabel kegiatan ini (pilih model 2 atau 3).", 400, "PROFIL_BELUM_ADA");
  const baris = mentah.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x));
  const periksa = periksaBarisObjek(profil, baris);
  const level = tingkatPlot(profil.variabel);
  const [petugas, master] = await Promise.all([petugasKegiatan(db, kegiatanId), level ? masterLengkap(db) : Promise.resolve([] as WilayahMasterLengkap[])]);
  const wilayah = periksaWilayahObjek(level, periksa.baris, periksa.nomor, master);
  const calon = otomatis ? await akunBolehDitugaskan(db) : null;
  const kand = {
    ppl: calon ? calon.semua : petugas.ppl,
    pml: calon ? calon.semua : petugas.pml,
    korwil: calon ? calon.organik : petugas.korwil,
    supervisor: calon ? calon.organik : petugas.supervisor,
  };
  const { final, hasil: cocok } = cocokkanPetugasObjek(periksa.baris, wilayah.kode, periksa.nomor, kand, otomatis ? "akun" : "penugasan", new Map());
  const namaAkun = new Map<number, string>([...kand.ppl, ...kand.pml, ...kand.korwil, ...kand.supervisor].map((p) => [p.id, p.nama]));
  const banding = bandingkanPenugasan(cocok.tim.simpul, petugas.peranAda);
  const galatTim: GalatBaris[] = [
    ...cocok.tim.galat.map((pesan) => ({ baris: 0, pesan })),
    ...banding.bentrok.map((x) => ({ baris: 0, pesan: `${x.nama} sudah ditugaskan sebagai ${x.peran_ada.toUpperCase()} pada kegiatan ini, tetapi berkas menuliskannya sebagai ${x.peran_berkas.toUpperCase()}. Samakan dahulu di Penugasan dan ST.` })),
  ];
  // galat pembacaan berkas tingkat berkas (baris 0/1) membuat daftar kosong; wilayah dicocokkan hanya untuk baris yang lolos pembacaan
  const galat: GalatBaris[] = [...periksa.galat, ...wilayah.galat, ...cocok.galat, ...galatTim].sort((a, b) => a.baris - b.baris);
  const peringatan = [...periksa.peringatan, ...wilayah.peringatan].sort((a, b) => a.baris - b.baris);
  return { profil, level, baris, periksa, final, petugas, cocok, banding, galat, peringatan, namaAkun };
}

export async function pratinjauObjek(db: Db, kegiatanId: number, mentah: unknown, otomatis = false): Promise<PratinjauObjek> {
  const { baris, periksa, final, petugas, cocok, banding, galat, peringatan, namaAkun } = await siapkan(db, kegiatanId, mentah, otomatis);
  const lama = await bacaObjek(db, kegiatanId);
  const perPpl = new Map<number, { ppl_nama: string; pml_nama: string; objek: number; sampel: number }>();
  for (const b of final) {
    if (b.ppl_akun_id == null) continue;
    const p = perPpl.get(b.ppl_akun_id) ?? { ppl_nama: namaAkun.get(b.ppl_akun_id) ?? b.ppl_nama, pml_nama: b.pml_akun_id != null ? namaAkun.get(b.pml_akun_id) ?? b.pml_nama : b.pml_nama, objek: 0, sampel: 0 };
    p.objek++;
    p.sampel += b.jumlah;
    perPpl.set(b.ppl_akun_id, p);
  }
  return {
    bisa_simpan: galat.length === 0 && final.length > 0,
    baris_berkas: baris.length,
    dilewati: periksa.dilewati,
    rekap: rekapObjek(final),
    galat: galat.slice(0, BATAS_DAFTAR),
    galat_total: galat.length,
    peringatan: peringatan.slice(0, BATAS_DAFTAR),
    peringatan_total: peringatan.length,
    pemetaan: cocok.pemetaan,
    catatan: periksaObjek(final, namaAkun),
    ringkas_ppl: Array.from(perPpl.values()).sort((a, b) => a.ppl_nama.localeCompare(b.ppl_nama)),
    jumlah_lama: lama.baris.length,
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

export async function imporObjek(db: Db, akun: AkunPortal, kegiatanId: number, namaBerkas: string, mentah: unknown, otomatis = false): Promise<HasilImporObjek> {
  const { level, periksa, final, cocok, galat, peringatan } = await siapkan(db, kegiatanId, mentah, otomatis);
  if (galat.length > 0) throw new GalatSampel(`Berkas masih memuat ${galat.length} baris bermasalah. Perbaiki lalu pratinjau lagi.`, 400, "BERKAS_BERMASALAH");
  if (final.length === 0) throw new GalatSampel("Berkas tidak berisi baris sampel.");
  const { data, error } = await db.rpc("sigap_objek_impor", {
    p_kegiatan: kegiatanId,
    p_oleh: akun.nama,
    p_berkas: namaBerkas.slice(0, 200) || null,
    p_baris: bentukObjekJson(final as BarisObjekCocok[], level),
    p_catatan: { peringatan: peringatan.length, dilewati: periksa.dilewati, otomatis },
    p_tim: bentukTimJson(cocok.tim.simpul),
    p_tugaskan: otomatis,
  });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = data as { ok?: boolean; pesan?: string; kode?: string; unggah_id?: number; jumlah?: number; jumlah_sampel?: number; dengan_petugas?: number; penugasan_baru?: number; tim?: number } | null;
  if (!h?.ok) throw new GalatSampel(h?.pesan ?? "Daftar sampel gagal disimpan.", 400, h?.kode);
  return { unggah_id: Number(h.unggah_id), jumlah: Number(h.jumlah), jumlah_sampel: Number(h.jumlah_sampel ?? 0), dengan_petugas: Number(h.dengan_petugas ?? 0), penugasan_baru: Number(h.penugasan_baru ?? 0), tim: Number(h.tim ?? 0) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Sisi petugas
// ---------------------------------------------------------------------------------------------------------------------------------

function labelWilayah(kode: string | null, level: TingkatWilayah | null, master: ReadonlyMap<string, WilayahMasterLengkap>): string {
  if (!kode || !level) return "";
  const m = master.get(kode);
  if (!m) return kode;
  if (level === "kecamatan") return m.kecamatan;
  if (level === "nagari") return `${m.nagari}, ${m.kecamatan}`;
  if (level === "sls") return `${m.sls}, ${m.nagari}`;
  return `${m.sls} (sub ${m.sub_sls}), ${m.nagari}`;
}

/** Peta kode di tingkat profil -> baris master contoh (untuk nama wilayah). */
async function petaNamaWilayah(db: Db, level: TingkatWilayah | null, kode: readonly (string | null)[]): Promise<Map<string, WilayahMasterLengkap>> {
  const hasil = new Map<string, WilayahMasterLengkap>();
  if (!level) return hasil;
  const unik = Array.from(new Set(kode.filter((x): x is string => !!x)));
  if (unik.length === 0) return hasil;
  const kolomKode = level === "kecamatan" ? "kd_kec" : level === "nagari" ? "iddesa" : level === "sls" ? "idsls" : "idsubsls";
  // PostgREST memotong 1.000 baris per permintaan; satu kecamatan bisa memuat ratusan sub SLS, jadi tingkat kasar dibaca dalam kelompok kecil.
  const ukuran = level === "kecamatan" ? 2 : level === "nagari" ? 15 : 150;
  for (const bagian of potong(unik, ukuran)) {
    const { data, error } = await db.from("master_wilayah").select("idsubsls, kd_kec, iddesa, idsls, kecamatan, nagari, sls, sub_sls").in(kolomKode, bagian).range(0, 999);
    if (error) {
      if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
      throw new Error(error.message);
    }
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const m: WilayahMasterLengkap = { idsubsls: String(r.idsubsls), kd_kec: String(r.kd_kec), iddesa: String(r.iddesa), idsls: String(r.idsls), kecamatan: String(r.kecamatan), nagari: String(r.nagari), sls: String(r.sls), sub_sls: String(r.sub_sls) };
      const k = level === "kecamatan" ? m.kd_kec : level === "nagari" ? m.iddesa : level === "sls" ? m.idsls : m.idsubsls;
      if (!hasil.has(k)) hasil.set(k, m);
    }
  }
  return hasil;
}

export async function dataObjekSaya(db: Db, akun: AkunPortal, kegiatanId: number): Promise<DataObjekSaya> {
  const peran = await peranSampel(db, akun.id, kegiatanId);
  if (!peran) throw new GalatSampel("Daftar sampel khusus PPL dan PML kegiatan ini.", 403);
  const nama = await namaKegiatan(db, kegiatanId);
  if (nama == null) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const { profil, siap } = await muatProfil(db, kegiatanId);
  if (!siap) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
  if (!profil) throw new GalatSampel("Kegiatan ini tidak memakai daftar sampel model 2/3.", 404, "BUKAN_MODEL_OBJEK");
  const { baris } = await bacaObjek(db, kegiatanId, peran === "ppl" ? { ppl: akun.id } : { pml: akun.id });
  const [master, namaAkun] = await Promise.all([
    petaNamaWilayah(db, profil.level, baris.map((b) => b.kode_wilayah)),
    namaAkunMap(db, baris.flatMap((b) => [b.ppl_akun_id, b.pml_akun_id]).filter((x): x is number => x != null)),
  ]);
  const kolomAtribut = kolomProfil(profil).filter((k) => k.kunci === "alamat" || k.kunci === "patokan" || (KUNCI_BEBAS as readonly string[]).includes(k.kunci));
  const objek = baris.map((b): ObjekSaya => {
    const atribut: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(b.atribut)) if (typeof v === "string" || typeof v === "number") atribut[k] = v;
    return {
      id: b.id, urut: b.urut, kode_wilayah: b.kode_wilayah, wilayah: labelWilayah(b.kode_wilayah, profil.level, master), nama_sampel: b.nama_sampel, jumlah: b.jumlah, atribut,
      ppl_id: b.ppl_akun_id, ppl_nama: b.ppl_akun_id != null ? namaAkun.get(b.ppl_akun_id) ?? null : null, pml_nama: b.pml_akun_id != null ? namaAkun.get(b.pml_akun_id) ?? null : null,
      hasil: b.hasil, jumlah_didata: b.jumlah_didata, hasil_at: b.hasil_at,
    };
  });
  return { sekarang: new Date().toISOString(), kegiatan: { id: kegiatanId, nama }, peran, saya: { id: akun.id, nama: akun.nama }, profil, kolom_atribut: kolomAtribut, objek, rekap: rekapHasilObjek(objek) };
}

/** PPL mencatat hasil satu objek miliknya. hasil null = hapus catatan (koreksi). */
export async function catatHasilObjek(db: Db, akun: AkunPortal, kegiatanId: number, objekId: unknown, hasil: unknown, jumlahDidata: unknown): Promise<{ hasil: HasilObjek | null; jumlah_didata: number | null }> {
  const id = Number(objekId);
  if (!Number.isInteger(id) || id <= 0) throw new GalatSampel("Sampel tidak sah.");
  const peran = await peranSampel(db, akun.id, kegiatanId);
  if (peran !== "ppl") throw new GalatSampel("Hasil hanya dicatat oleh PPL sampel itu.", 403);
  const { data: o, error: e1 } = await db.from("sigap_sampel_objek").select("id, jumlah, nama_sampel, ppl_akun_id, kegiatan_id, nonaktif_at").eq("id", id).maybeSingle();
  if (e1) {
    if (belumMigrasi(e1)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(e1.message);
  }
  if (!o || Number(o.kegiatan_id) !== kegiatanId || o.nonaktif_at != null) throw new GalatSampel("Sampel tidak ditemukan atau sudah diganti unggahan baru.", 404);
  if (Number(o.ppl_akun_id) !== akun.id) throw new GalatSampel("Sampel ini bukan penugasan Anda.", 403);
  let h: HasilObjek | null = null;
  let jd: number | null = null;
  if (hasil !== null && hasil !== undefined) {
    const p = periksaCatatHasil({ jumlah: Number(o.jumlah), nama_sampel: (o.nama_sampel as string | null) ?? null }, hasil, jumlahDidata);
    if (!p.ok) throw new GalatSampel(p.pesan);
    h = p.hasil;
    jd = p.jumlah_didata;
  }
  const { data, error } = await db.rpc("sigap_objek_catat", { p_objek: id, p_akun: akun.id, p_hasil: h, p_jumlah_didata: jd });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const r = data as { ok?: boolean; pesan?: string; kode?: string; hasil?: string | null; jumlah_didata?: number | null } | null;
  if (!r?.ok) throw new GalatSampel(r?.pesan ?? "Hasil gagal dicatat.", 400, r?.kode);
  return { hasil: bacaHasilObjek(r.hasil), jumlah_didata: num(r.jumlah_didata) };
}

/**
 * Objek aktif sebuah kegiatan model 2/3 dalam bentuk ringan (kode wilayah, jumlah, petugas) untuk modul lain yang hanya MEMBACA turunan sampel
 * (wilayah tugas identifikasi lanjutan, usulan jumlah petugas). `profil` null = model 1 atau tabel belum ada; baris kosong bila belum ada daftar.
 */
export async function objekRingan(db: Db, kegiatanId: number, denganTitik = false): Promise<{ profil: ProfilTersimpan | null; baris: { kode_wilayah: string | null; jumlah: number; ppl_akun_id: number | null; pml_akun_id: number | null; lat: number | null; lng: number | null }[] }> {
  const { profil } = await muatProfil(db, kegiatanId).catch(() => ({ profil: null as ProfilTersimpan | null }));
  if (!profil || (profil.model !== 2 && profil.model !== 3)) return { profil: null, baris: [] };
  const baris: { kode_wilayah: string | null; jumlah: number; ppl_akun_id: number | null; pml_akun_id: number | null; lat: number | null; lng: number | null }[] = [];
  for (let i = 0; i < 30; i++) {
    const { data, error } = await db.from("sigap_sampel_objek").select(denganTitik ? "kode_wilayah, jumlah, ppl_akun_id, pml_akun_id, atribut" : "kode_wilayah, jumlah, ppl_akun_id, pml_akun_id").eq("kegiatan_id", kegiatanId).is("nonaktif_at", null).order("id").range(i * 1000, i * 1000 + 999);
    if (error) return { profil, baris: [] };
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const at = (r.atribut ?? {}) as Record<string, unknown>;
      baris.push({ kode_wilayah: (r.kode_wilayah as string | null) ?? null, jumlah: Math.max(1, num(r.jumlah) ?? 1), ppl_akun_id: num(r.ppl_akun_id), pml_akun_id: num(r.pml_akun_id), lat: num(at.lat), lng: num(at.lng) });
    }
    if ((data ?? []).length < 1000) break;
  }
  return { profil, baris };
}

/** Objek -> baris (kecamatan, nagari, target=jumlah) seperti alokasi, untuk daftar nagari wilayah tugas. Objek tanpa master wilayah muncul dengan nama kosong (dihitung tanpa_master). */
export async function wilayahObjekRingan(db: Db, kegiatanId: number): Promise<{ ada: boolean; objek: number; wilayah: { kecamatan: string; nagari: string; target: number }[] }> {
  const { profil, baris } = await objekRingan(db, kegiatanId);
  if (!profil || baris.length === 0) return { ada: false, objek: 0, wilayah: [] };
  const nama = await petaNamaWilayah(db, profil.level, baris.map((b) => b.kode_wilayah));
  const wilayah = baris
    .filter((b) => b.kode_wilayah)
    .map((b) => {
      const m = nama.get(String(b.kode_wilayah));
      return { kecamatan: m?.kecamatan ?? "", nagari: m?.nagari ?? "", target: b.jumlah };
    });
  return { ada: true, objek: baris.length, wilayah };
}

/** Bahan usulan wilayah seleksi dari objek model 2/3: baris (kode, jumlah, titik), tingkat profil, dan nama wilayah per kode kelompok (tingkat sub SLS naik ke SLS). */
export async function dataSeleksiObjek(db: Db, kegiatanId: number): Promise<{ ada: boolean; model: 2 | 3 | null; tingkat: TingkatWilayah | null; baris: { kode_wilayah: string | null; jumlah: number; lat: number | null; lng: number | null }[]; nama: Map<string, { kecamatan: string; nagari: string; sls: string }> }> {
  const { profil, baris } = await objekRingan(db, kegiatanId, true);
  const kosong = { ada: false, model: null, tingkat: null, baris: [], nama: new Map<string, { kecamatan: string; nagari: string; sls: string }>() };
  if (!profil || baris.length === 0 || !profil.level) return kosong;
  const kelompok = kodeKelompokObjek(profil.level);
  const kode = Array.from(new Set(baris.map((b) => kodeKelompok(b.kode_wilayah, profil.level as TingkatWilayah)).filter((x): x is string => !!x)));
  const m = await petaNamaWilayah(db, kelompok, kode);
  const nama = new Map<string, { kecamatan: string; nagari: string; sls: string }>();
  for (const [k, v] of m) nama.set(k, { kecamatan: v.kecamatan, nagari: v.nagari, sls: v.sls });
  return { ada: true, model: profil.model as 2 | 3, tingkat: profil.level, baris, nama };
}

/** Ringkasan modul tahap Beranda untuk kegiatan MODEL 2/3. null = bukan petugas, bukan model 2/3, belum ada sampel atas nama akun ini, atau tabel belum ada. */
export async function ringkasModulObjek(db: Db, akun: AkunPortal, kegiatanId: number): Promise<InfoSampel | null> {
  try {
    const peran = await peranSampel(db, akun.id, kegiatanId);
    if (!peran) return null;
    const { profil, siap } = await muatProfil(db, kegiatanId);
    if (!siap || !profil) return null;
    const { baris } = await bacaObjek(db, kegiatanId, peran === "ppl" ? { ppl: akun.id } : { pml: akun.id });
    if (baris.length === 0) return null;
    const r = rekapHasilObjek(baris);
    return {
      kegiatan_id: kegiatanId, peran, sls: 0, utama: 0, cadangan: 0, diganti: 0,
      ppl: new Set(baris.map((b) => b.ppl_akun_id).filter((x): x is number => x != null)).size,
      objek: { baris: baris.length, sampel: r.sampel, didata: r.sampel_didata, wilayah: new Set(baris.map((b) => b.kode_wilayah).filter((x): x is string => !!x)).size },
    };
  } catch {
    return null;
  }
}
