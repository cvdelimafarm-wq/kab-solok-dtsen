// lib/sigapMateriDb.ts  (khusus server)
//
// (2 Nov 2026) Tahap C: materi tab Instrumen (video + tautan) dan progres peserta. Aturan murni: lib/sigapMateri.ts. Tabel: SQL 20261102zm_pelatihan_materi.sql.
// TAHAN SQL BELUM DIJALANKAN: membaca -> daftar kosong / tidak ada yang wajib (tidak memblokir apa pun); menulis -> pesan jelas menunjuk SQL.

import type { Db } from "@/lib/sigap";
import {
  PROGRES_KOSONG, bacaSegmen, ringkasMateri, terapkanLaporan,
  type JenisMateri, type Laporan, type MasukanMateri, type Progres, type RingkasMateri,
} from "@/lib/sigapMateri";

export const PESAN_SQL_MATERI = "Tabel materi pelatihan belum ada di database. Jalankan SQL 20261102zm_pelatihan_materi.sql lebih dulu.";
const KOLOM_MATERI = "id, urutan, jenis, judul, url, youtube_id, durasi_detik, wajib, aktif";
const KOLOM_PROGRES = "materi_id, akun_id, segmen, detik_unik, selesai_at, selesai_manual, putar_terakhir_at";

const galatTabel = (m: string | undefined) => /relation|does not exist|schema cache/i.test(m ?? "");

export type BarisMateri = { id: number; urutan: number; jenis: JenisMateri; judul: string; url: string; youtube_id: string | null; durasi_detik: number | null; wajib: boolean; aktif: boolean };
type BarisProgres = { materi_id: number; akun_id: number; segmen: unknown; detik_unik: number | null; selesai_at: string | null; selesai_manual: boolean | null; putar_terakhir_at: string | null };

const keProgres = (r: BarisProgres): Progres => ({
  segmen: bacaSegmen(r.segmen),
  detik_unik: Number(r.detik_unik ?? 0),
  selesai_at: r.selesai_at ?? null,
  selesai_manual: !!r.selesai_manual,
  putar_terakhir_at: r.putar_terakhir_at ?? null,
});

/** Materi aktif kegiatan (urut). Tabel belum ada / galat -> tidak tersedia. */
export async function muatMateri(db: Db, kegiatanId: number): Promise<{ tersedia: boolean; materi: BarisMateri[] }> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_materi").select(KOLOM_MATERI).eq("kegiatan_id", kegiatanId).eq("aktif", true).order("urutan", { ascending: true }).order("id", { ascending: true }).limit(200);
    if (error) return { tersedia: false, materi: [] };
    return { tersedia: true, materi: ((data ?? []) as unknown as BarisMateri[]).map((m) => ({ ...m, id: Number(m.id), urutan: Number(m.urutan ?? 0), durasi_detik: m.durasi_detik === null || m.durasi_detik === undefined ? null : Number(m.durasi_detik), wajib: !!m.wajib })) };
  } catch {
    return { tersedia: false, materi: [] };
  }
}

/** Progres beberapa akun pada beberapa materi: akun -> (materi -> progres). */
export async function muatProgresBatch(db: Db, materiIds: readonly number[], akunIds: readonly number[]): Promise<Map<number, Map<number, Progres>>> {
  const peta = new Map<number, Map<number, Progres>>();
  if (materiIds.length === 0 || akunIds.length === 0) return peta;
  try {
    const { data, error } = await db.from("sigap_pelatihan_materi_progres").select(KOLOM_PROGRES).in("materi_id", [...materiIds]).in("akun_id", [...akunIds]).limit(50000);
    if (error) return peta;
    for (const r of (data ?? []) as unknown as BarisProgres[]) {
      const m = peta.get(Number(r.akun_id)) ?? new Map<number, Progres>();
      m.set(Number(r.materi_id), keProgres(r));
      peta.set(Number(r.akun_id), m);
    }
  } catch {
    /* dianggap belum ada progres */
  }
  return peta;
}

export type HasilMateri<T = object> = ({ ok: true } & T) | { ok: false; pesan: string; status?: number };

async function ambilMateri(db: Db, kegiatanId: number, materiId: number): Promise<{ ada: boolean; baris: BarisMateri | null; tabelAda: boolean }> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_materi").select(KOLOM_MATERI).eq("kegiatan_id", kegiatanId).eq("id", materiId).eq("aktif", true).maybeSingle();
    if (error) return { ada: false, baris: null, tabelAda: !galatTabel(error.message) };
    return { ada: !!data, baris: (data as unknown as BarisMateri | null) ?? null, tabelAda: true };
  } catch {
    return { ada: false, baris: null, tabelAda: false };
  }
}

async function ambilProgres(db: Db, materiId: number, akunId: number): Promise<Progres> {
  try {
    const { data } = await db.from("sigap_pelatihan_materi_progres").select(KOLOM_PROGRES).eq("materi_id", materiId).eq("akun_id", akunId).maybeSingle();
    return data ? keProgres(data as unknown as BarisProgres) : PROGRES_KOSONG();
  } catch {
    return PROGRES_KOSONG();
  }
}

async function simpanProgres(db: Db, materiId: number, akunId: number, p: Progres, sekarang: number): Promise<string | null> {
  const { error } = await db.from("sigap_pelatihan_materi_progres").upsert(
    { materi_id: materiId, akun_id: akunId, segmen: p.segmen, detik_unik: p.detik_unik, selesai_at: p.selesai_at, selesai_manual: p.selesai_manual, putar_terakhir_at: p.putar_terakhir_at, diperbarui_at: new Date(sekarang).toISOString() },
    { onConflict: "materi_id,akun_id" }
  );
  return error ? (galatTabel(error.message) ? PESAN_SQL_MATERI : error.message) : null;
}

/** Laporan putar video dari pemutar peserta. */
export async function laporPutar(db: Db, kegiatanId: number, akunId: number, lap: Laporan, sekarang: number): Promise<HasilMateri<{ progres: Progres; selesai_baru: boolean; dipangkas: boolean; durasi: number | null }>> {
  const m = await ambilMateri(db, kegiatanId, lap.materi_id);
  if (!m.tabelAda) return { ok: false, pesan: PESAN_SQL_MATERI, status: 500 };
  if (!m.baris) return { ok: false, pesan: "Materi tidak ditemukan.", status: 404 };
  if (m.baris.jenis !== "video") return { ok: false, pesan: "Materi ini bukan video.", status: 400 };
  const durasi = m.baris.durasi_detik ?? lap.durasi;
  // durasi pertama yang dilaporkan pemutar disimpan bila pengelola tidak mengisinya (pelacakan selesai butuh durasi)
  if (m.baris.durasi_detik === null && lap.durasi) {
    try {
      await db.from("sigap_pelatihan_materi").update({ durasi_detik: lap.durasi }).eq("id", lap.materi_id).eq("kegiatan_id", kegiatanId).is("durasi_detik", null);
    } catch {
      /* hanya pelengkap */
    }
  }
  const lama = await ambilProgres(db, lap.materi_id, akunId);
  const h = terapkanLaporan(lama, lap, durasi, sekarang);
  if (h.progres !== lama) {
    const galat = await simpanProgres(db, lap.materi_id, akunId, h.progres, sekarang);
    if (galat) return { ok: false, pesan: galat, status: 500 };
  }
  return { ok: true, progres: h.progres, selesai_baru: h.selesai_baru, dipangkas: h.dipangkas, durasi };
}

/** Peserta membuka tautan instrumen: dicatat sekali (waktu pertama). */
export async function catatBuka(db: Db, kegiatanId: number, akunId: number, materiId: number, sekarang: number): Promise<HasilMateri<{ progres: Progres }>> {
  const m = await ambilMateri(db, kegiatanId, materiId);
  if (!m.tabelAda) return { ok: false, pesan: PESAN_SQL_MATERI, status: 500 };
  if (!m.baris) return { ok: false, pesan: "Materi tidak ditemukan.", status: 404 };
  if (m.baris.jenis !== "tautan") return { ok: false, pesan: "Materi ini bukan tautan.", status: 400 };
  const lama = await ambilProgres(db, materiId, akunId);
  if (lama.selesai_at) return { ok: true, progres: lama };
  const baru: Progres = { ...lama, selesai_at: new Date(sekarang).toISOString(), selesai_manual: false };
  const galat = await simpanProgres(db, materiId, akunId, baru, sekarang);
  return galat ? { ok: false, pesan: galat, status: 500 } : { ok: true, progres: baru };
}

/** Cadangan: peserta menandai video sudah ditonton sendiri. Diberi tanda manual; tidak menimpa penyelesaian yang sudah terbukti. */
export async function catatManual(db: Db, kegiatanId: number, akunId: number, materiId: number, sekarang: number): Promise<HasilMateri<{ progres: Progres }>> {
  const m = await ambilMateri(db, kegiatanId, materiId);
  if (!m.tabelAda) return { ok: false, pesan: PESAN_SQL_MATERI, status: 500 };
  if (!m.baris) return { ok: false, pesan: "Materi tidak ditemukan.", status: 404 };
  if (m.baris.jenis !== "video") return { ok: false, pesan: "Tandai manual hanya untuk video.", status: 400 };
  const lama = await ambilProgres(db, materiId, akunId);
  if (lama.selesai_at) return { ok: true, progres: lama };
  const baru: Progres = { ...lama, selesai_at: new Date(sekarang).toISOString(), selesai_manual: true };
  const galat = await simpanProgres(db, materiId, akunId, baru, sekarang);
  return galat ? { ok: false, pesan: galat, status: 500 } : { ok: true, progres: baru };
}

/** Tambah / ubah materi (pengelola). id kosong = baru. */
export async function simpanMateri(db: Db, kegiatanId: number, m: MasukanMateri, oleh: string): Promise<HasilMateri<{ id: number }>> {
  const isi = { urutan: m.urutan, jenis: m.jenis, judul: m.judul, url: m.url, youtube_id: m.youtube_id, durasi_detik: m.durasi_detik, wajib: m.wajib, diubah_at: new Date().toISOString() };
  try {
    if (m.id) {
      const { data, error } = await db.from("sigap_pelatihan_materi").update(isi).eq("id", m.id).eq("kegiatan_id", kegiatanId).select("id").maybeSingle();
      if (error) return { ok: false, pesan: galatTabel(error.message) ? PESAN_SQL_MATERI : error.message, status: 500 };
      if (!data) return { ok: false, pesan: "Materi tidak ditemukan.", status: 404 };
      return { ok: true, id: m.id };
    }
    const { data, error } = await db.from("sigap_pelatihan_materi").insert({ ...isi, kegiatan_id: kegiatanId, dibuat_oleh: oleh.slice(0, 120) }).select("id").single();
    if (error) return { ok: false, pesan: galatTabel(error.message) ? PESAN_SQL_MATERI : error.message, status: 500 };
    return { ok: true, id: Number((data as { id: number }).id) };
  } catch {
    return { ok: false, pesan: PESAN_SQL_MATERI, status: 500 };
  }
}

/** Menyembunyikan materi (tidak dihapus; progres peserta tetap tersimpan). */
export async function nonaktifkanMateri(db: Db, kegiatanId: number, id: number): Promise<HasilMateri<{ judul: string }>> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_materi").update({ aktif: false, diubah_at: new Date().toISOString() }).eq("id", id).eq("kegiatan_id", kegiatanId).eq("aktif", true).select("judul").maybeSingle();
    if (error) return { ok: false, pesan: galatTabel(error.message) ? PESAN_SQL_MATERI : error.message, status: 500 };
    if (!data) return { ok: false, pesan: "Materi tidak ditemukan.", status: 404 };
    return { ok: true, judul: String((data as { judul: string }).judul) };
  } catch {
    return { ok: false, pesan: PESAN_SQL_MATERI, status: 500 };
  }
}

export type StatusMateriBatch = {
  tersedia: boolean;
  /** kegiatan memiliki minimal satu video wajib */
  video_wajib_ada: boolean;
  /** akun yang sudah menyelesaikan SEMUA video wajib */
  video_tuntas: Set<number>;
  /** akun -> jumlah materi wajib yang belum selesai (video belum tuntas + tautan belum dibuka) */
  belum: Map<number, number>;
  /** akun yang menyelesaikan materi wajib dengan tombol manual */
  manual: Set<number>;
  wajib_total: number;
};

/** Ringkasan materi wajib beberapa akun sekaligus (dipakai blokir tahapan, penanda tab, dan Monitoring). Gagal / SQL belum ada -> tidak ada yang wajib. */
export async function muatStatusMateriBatch(db: Db, kegiatanId: number, akunIds: readonly number[]): Promise<StatusMateriBatch> {
  const kosong: StatusMateriBatch = { tersedia: false, video_wajib_ada: false, video_tuntas: new Set(), belum: new Map(), manual: new Set(), wajib_total: 0 };
  const { tersedia, materi } = await muatMateri(db, kegiatanId);
  if (!tersedia) return kosong;
  const wajib = materi.filter((m) => m.wajib);
  const hasil: StatusMateriBatch = { ...kosong, tersedia: true, wajib_total: wajib.length, video_wajib_ada: wajib.some((m) => m.jenis === "video") };
  if (wajib.length === 0) return hasil;
  const progres = await muatProgresBatch(db, wajib.map((m) => m.id), akunIds);
  for (const akun of akunIds) {
    const r: RingkasMateri = ringkasMateri(wajib, progres.get(akun) ?? new Map());
    hasil.belum.set(akun, r.belum);
    if (r.video_wajib_tuntas) hasil.video_tuntas.add(akun);
    if (r.ada_manual) hasil.manual.add(akun);
  }
  return hasil;
}
