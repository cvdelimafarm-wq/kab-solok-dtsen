// lib/sigapAbsenDb.ts  (khusus server)
//
// (2 Nov 2026) Absen peserta, tahap E: akses basis data. TAHAN SQL BELUM DIJALANKAN (20261102zk): tabel belum ada -> `tersedia:false` dan penulisan
// menolak dengan pesan jelas; tidak pernah melempar galat ke halaman lain. Kedatangan (hari pertama) memakai `sigap_pelatihan_presensi` yang sudah ada.

import type { Db } from "@/lib/sigap";
import { FILTER_BUKAN_ADMINISTRASI } from "@/lib/sigapTesDb";
import { muatPenolak } from "@/lib/sigapPelatihanBaruDb";
import {
  CENTANG_MASSAL_MAKS, JENDELA_MENIT_BAWAAN, RADIUS_RADAR_BAWAAN_M, SALAH_KODE_MAKS, bacaSusulan, buatKode, keadaanSesi, penandaSusulan, kodeCocok, nilaiRadar, PESAN_RADAR, rapikanSesi, rentangHari, tanggalWib, tungguKode, tutupAtDari,
  type BarisRekap, type MetodeAbsen, type Posisi, type SesiRencana,
} from "@/lib/sigapAbsen";

import { putuskanKodeLuring, type KodeLuring } from "./sigapAbsenLuring"; // (14 Nov 2026) luring 3d

export const PESAN_SQL = "Absen peserta belum aktif di basis data. Jalankan SQL 20261102zk_kegiatan_absen.";

// ---------- pengaturan ----------

export type AturAbsen = { sesi: SesiRencana[]; jendela_menit: number; radius_m: number; ada: boolean };

export async function muatAtur(db: Db, kegiatanId: number): Promise<AturAbsen> {
  const bawaan: AturAbsen = { sesi: rapikanSesi(null), jendela_menit: JENDELA_MENIT_BAWAAN, radius_m: RADIUS_RADAR_BAWAAN_M, ada: false };
  try {
    const { data, error } = await db.from("sigap_kegiatan_absen_atur").select("sesi, jendela_menit, radius_m").eq("kegiatan_id", kegiatanId).maybeSingle();
    if (error || !data) return bawaan;
    const d = data as { sesi: unknown; jendela_menit: number; radius_m: number };
    return { sesi: rapikanSesi(d.sesi), jendela_menit: Number(d.jendela_menit) || JENDELA_MENIT_BAWAAN, radius_m: Number(d.radius_m) || RADIUS_RADAR_BAWAAN_M, ada: true };
  } catch {
    return bawaan;
  }
}

export async function simpanAtur(db: Db, kegiatanId: number, masuk: { sesi?: unknown; jendela_menit?: unknown; radius_m?: unknown }, oleh: string): Promise<{ ok: true; atur: AturAbsen } | { ok: false; pesan: string }> {
  const lama = await muatAtur(db, kegiatanId);
  const jendela = masuk.jendela_menit === undefined ? lama.jendela_menit : Number(masuk.jendela_menit);
  const radius = masuk.radius_m === undefined ? lama.radius_m : Number(masuk.radius_m);
  if (!Number.isInteger(jendela) || jendela < 5 || jendela > 240) return { ok: false, pesan: "Jendela absen harus 5 sampai 240 menit." };
  if (!Number.isInteger(radius) || radius < 10 || radius > 500) return { ok: false, pesan: "Radius radar harus 10 sampai 500 meter." };
  const sesi = masuk.sesi === undefined ? lama.sesi : rapikanSesi(masuk.sesi);
  try {
    const { error } = await db.from("sigap_kegiatan_absen_atur").upsert({ kegiatan_id: kegiatanId, sesi, jendela_menit: jendela, radius_m: radius, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id" });
    if (error) return { ok: false, pesan: PESAN_SQL };
    return { ok: true, atur: { sesi, jendela_menit: jendela, radius_m: radius, ada: true } };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

/** Hari kegiatan (YYYY-MM-DD) dari tanggal mulai dan selesai kegiatan. */
export async function hariKegiatan(db: Db, kegiatanId: number): Promise<string[]> {
  try {
    const { data } = await db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai").eq("id", kegiatanId).maybeSingle();
    const k = data as { tanggal_mulai?: string | null; tanggal_selesai?: string | null } | null;
    return rentangHari(k?.tanggal_mulai ?? null, k?.tanggal_selesai ?? null);
  } catch {
    return [];
  }
}

// ---------- peserta ----------

export type PesertaAbsen = { akun_id: number; nama: string; kelas: number | null; penugasan_id: number };

/** Peserta pelatihan (PML dan PPL aktif, bukan penolak undangan). `kelas` null = semua kelas. */
export async function pesertaKelas(db: Db, kegiatanId: number, kelas: number | null): Promise<PesertaAbsen[]> {
  const { data } = await db.from("sigap_penugasan").select("id, akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(5000);
  const baris = ((data ?? []) as { id: number; akun_id: number; peran: string; kelas: number | null }[]).filter((p) => (p.peran === "ppl" || p.peran === "pml") && (kelas === null || Number(p.kelas) === kelas));
  if (baris.length === 0) return [];
  const [{ data: akun }, tolak] = await Promise.all([db.from("sigap_akun").select("id, nama").in("id", baris.map((b) => b.akun_id)).limit(5000), muatPenolak(db, kegiatanId)]);
  const nama = new Map(((akun ?? []) as { id: number; nama: string }[]).map((a) => [a.id, a.nama]));
  const lihat = new Set<number>();
  const hasil: PesertaAbsen[] = [];
  for (const b of baris) {
    if (tolak.has(b.akun_id) || lihat.has(b.akun_id)) continue;
    lihat.add(b.akun_id);
    hasil.push({ akun_id: b.akun_id, nama: nama.get(b.akun_id) ?? `Akun ${b.akun_id}`, kelas: b.kelas === null || b.kelas === undefined ? null : Number(b.kelas), penugasan_id: b.id });
  }
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

// ---------- sesi ----------

export type SesiAbsen = {
  id: number; kegiatan_id: number; tanggal: string; no: number; label: string; jam_rencana: string | null; kelas: number | null; metode: MetodeAbsen[];
  kode: string | null; radius_m: number; jendela_menit: number; status: "dibuka" | "ditutup"; dibuka_oleh: string | null; dibuka_at: string; tutup_at: string; ditutup_at: string | null;
};
const KOLOM_SESI = "id, kegiatan_id, tanggal, no, label, jam_rencana, kelas, metode, kode, radius_m, jendela_menit, status, dibuka_oleh, dibuka_at, tutup_at, ditutup_at";

export async function muatSesiHari(db: Db, kegiatanId: number, tanggal: string): Promise<{ tersedia: boolean; sesi: SesiAbsen[] }> {
  try {
    const { data, error } = await db.from("sigap_kegiatan_absen_sesi").select(KOLOM_SESI).eq("kegiatan_id", kegiatanId).eq("tanggal", tanggal).order("no", { ascending: true }).limit(200);
    if (error) return { tersedia: false, sesi: [] };
    return { tersedia: true, sesi: (data ?? []) as SesiAbsen[] };
  } catch {
    return { tersedia: false, sesi: [] };
  }
}

export type MasukanMulai = { tanggal: string; no: number; label: string; jam: string | null; kelas: number | null; metode: MetodeAbsen[]; disarankan: number | null };

/**
 * Memulai (atau membuka kembali) presensi sesi. Jendela dihitung di server: tutup_at = sekarang + jendela_menit. Kode TETAP bila sesi pernah dibuka dengan kode;
 * dibuat baru hanya bila metode kode dipilih dan belum ada kode. Membuka kembali tidak menghapus kehadiran yang sudah tercatat.
 */
export async function mulaiSesi(db: Db, kegiatanId: number, masuk: MasukanMulai, oleh: string, acak: () => number, nowMs: number): Promise<{ ok: true; sesi: SesiAbsen } | { ok: false; pesan: string }> {
  try {
    const atur = await muatAtur(db, kegiatanId);
    const { data: ada, error: e0 } = await db.from("sigap_kegiatan_absen_sesi").select(KOLOM_SESI).eq("kegiatan_id", kegiatanId).eq("tanggal", masuk.tanggal).eq("no", masuk.no).limit(50);
    if (e0) return { ok: false, pesan: PESAN_SQL };
    const lama = ((ada ?? []) as SesiAbsen[]).find((s) => (s.kelas ?? null) === (masuk.kelas ?? null));
    const pakaiKode = masuk.metode.includes("kode");
    const kode = pakaiKode ? lama?.kode ?? buatKode(acak) : lama?.kode ?? null;
    const buka = new Date(nowMs).toISOString();
    const tutup = new Date(tutupAtDari(nowMs, atur.jendela_menit)).toISOString();
    const nilai = {
      kegiatan_id: kegiatanId, tanggal: masuk.tanggal, no: masuk.no, label: masuk.label.slice(0, 40), jam_rencana: masuk.jam, kelas: masuk.kelas, metode: masuk.metode, kode,
      radius_m: atur.radius_m, jendela_menit: atur.jendela_menit, status: "dibuka", dibuka_oleh: oleh.slice(0, 120), dibuka_at: buka, tutup_at: tutup, ditutup_at: null,
    };
    let baris: SesiAbsen | null = null;
    if (lama) {
      const { data, error } = await db.from("sigap_kegiatan_absen_sesi").update(nilai).eq("id", lama.id).select(KOLOM_SESI).maybeSingle();
      if (error) return { ok: false, pesan: "Presensi belum dapat dibuka." };
      baris = (data as SesiAbsen | null) ?? { ...lama, ...nilai } as SesiAbsen;
    } else {
      const { data, error } = await db.from("sigap_kegiatan_absen_sesi").insert(nilai).select(KOLOM_SESI).maybeSingle();
      if (error || !data) return { ok: false, pesan: error?.code === "23505" ? "Sesi ini baru saja dibuka pengelola lain. Muat ulang." : "Presensi belum dapat dibuka." };
      baris = data as SesiAbsen;
    }
    // sesi baru dibuka: bersihkan percobaan salah-ketik lama supaya peserta tidak terkunci dari pembukaan sebelumnya
    await db.from("sigap_kegiatan_absen_salah").delete().eq("absen_sesi_id", baris.id);
    await db.from("sigap_kegiatan_absen_buka").insert({ absen_sesi_id: baris.id, dibuka_oleh: oleh.slice(0, 120), dibuka_at: buka, tutup_at: tutup, disarankan_no: masuk.disarankan, dipilih_no: masuk.no });
    return { ok: true, sesi: baris };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

export async function ambilSesi(db: Db, kegiatanId: number, sesiId: number): Promise<SesiAbsen | null> {
  try {
    const { data } = await db.from("sigap_kegiatan_absen_sesi").select(KOLOM_SESI).eq("kegiatan_id", kegiatanId).eq("id", sesiId).maybeSingle();
    return (data as SesiAbsen | null) ?? null;
  } catch {
    return null;
  }
}

/** (3 Nov 2026) Ganti metode pada sesi yang sedang dibuka (jendela waktu tetap). Metode kode memakai kode sesi yang ada atau membuat baru. */
export async function gantiMetode(db: Db, sesi: SesiAbsen, metode: MetodeAbsen, acak: () => number): Promise<{ ok: true; kode: string | null } | { ok: false; pesan: string }> {
  try {
    const kode = metode === "kode" ? sesi.kode ?? buatKode(acak) : sesi.kode ?? null;
    const { error } = await db.from("sigap_kegiatan_absen_sesi").update({ metode: [metode], kode }).eq("id", sesi.id).eq("kegiatan_id", sesi.kegiatan_id);
    return error ? { ok: false, pesan: "Metode belum dapat diganti." } : { ok: true, kode };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

export async function tutupSesi(db: Db, kegiatanId: number, sesiId: number, nowMs: number): Promise<{ ok: boolean; pesan?: string }> {
  try {
    const { error } = await db.from("sigap_kegiatan_absen_sesi").update({ status: "ditutup", ditutup_at: new Date(nowMs).toISOString() }).eq("id", sesiId).eq("kegiatan_id", kegiatanId);
    return error ? { ok: false, pesan: "Sesi belum dapat ditutup." } : { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

/** Sesi yang sedang terbuka untuk peserta berkelas `kelas` pada hari ini (kelas sesi null = semua kelas). */
export async function sesiTerbukaUntuk(db: Db, kegiatanId: number, kelas: number | null, nowMs: number): Promise<SesiAbsen[]> {
  const { sesi } = await muatSesiHari(db, kegiatanId, tanggalWib(nowMs));
  return sesi.filter((s) => keadaanSesi(s, nowMs) === "dibuka" && (s.kelas === null || s.kelas === undefined || kelas === null || Number(s.kelas) === Number(kelas)));
}

// ---------- kehadiran sesi ----------

export type HadirAbsen = { absen_sesi_id: number; akun_id: number; metode: MetodeAbsen; diterima: boolean; manual: boolean; alasan: string | null; jarak_m: number | null; akurasi_m: number | null; dicatat_oleh: string | null; at: string };
const KOLOM_HADIR = "absen_sesi_id, akun_id, metode, diterima, manual, alasan, jarak_m, akurasi_m, dicatat_oleh, at";

export async function muatHadir(db: Db, sesiIds: readonly number[]): Promise<HadirAbsen[]> {
  if (sesiIds.length === 0) return [];
  try {
    const { data, error } = await db.from("sigap_kegiatan_absen_hadir").select(KOLOM_HADIR).in("absen_sesi_id", [...sesiIds]).limit(20000);
    return error ? [] : ((data ?? []) as HadirAbsen[]);
  } catch {
    return [];
  }
}

/** Pengelola mencentang (atau membatalkan centang) satu peserta. Boleh juga setelah jendela habis (koreksi manual). */
export async function centangPeserta(db: Db, sesi: SesiAbsen, akunId: number, hadir: boolean, oleh: string, alasan: string | null): Promise<{ ok: boolean; pesan?: string }> {
  try {
    if (!hadir) {
      const { error } = await db.from("sigap_kegiatan_absen_hadir").delete().eq("absen_sesi_id", sesi.id).eq("akun_id", akunId);
      return error ? { ok: false, pesan: "Centang belum dapat dibatalkan." } : { ok: true };
    }
    const { error } = await db.from("sigap_kegiatan_absen_hadir").upsert(
      { absen_sesi_id: sesi.id, akun_id: akunId, metode: "centang", diterima: true, manual: true, alasan: alasan ? alasan.slice(0, 200) : null, dicatat_oleh: oleh.slice(0, 120), at: new Date().toISOString() },
      { onConflict: "absen_sesi_id,akun_id" }
    );
    return error ? { ok: false, pesan: "Centang belum dapat disimpan." } : { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

type Cek = { ok: true } | { ok: false; pesan: string; status: number };
function sesiBolehDiisi(sesi: SesiAbsen | null, kelasPeserta: number | null, metode: MetodeAbsen, nowMs: number): Cek {
  if (!sesi) return { ok: false, pesan: "Sesi absen tidak ditemukan.", status: 404 };
  if (keadaanSesi(sesi, nowMs) !== "dibuka") return { ok: false, pesan: "Waktu absen sesi ini sudah habis. Hubungi panitia atau instruktur.", status: 409 };
  if (sesi.kelas !== null && sesi.kelas !== undefined && kelasPeserta !== null && Number(sesi.kelas) !== Number(kelasPeserta)) return { ok: false, pesan: "Sesi ini untuk kelas lain.", status: 403 };
  if (!sesi.metode.includes(metode)) return { ok: false, pesan: "Metode ini tidak diaktifkan untuk sesi ini.", status: 409 };
  return { ok: true };
}

export type HasilAbsen = { ok: true; sudah?: boolean } | { ok: false; pesan: string; status: number; tunggu_detik?: number; sisa_percobaan?: number; kode?: string; jarak_m?: number | null };

/** Peserta mengetik kode. Salah 5x -> tunggu 1 menit. Kode benar -> hadir (metode kode). */
export async function kirimKode(db: Db, sesi: SesiAbsen | null, akunId: number, kelasPeserta: number | null, masukan: unknown, nowMs: number): Promise<HasilAbsen> {
  const cek = sesiBolehDiisi(sesi, kelasPeserta, "kode", nowMs);
  if (!cek.ok) return cek;
  const s = sesi as SesiAbsen;
  try {
    const { data: sudah } = await db.from("sigap_kegiatan_absen_hadir").select("diterima").eq("absen_sesi_id", s.id).eq("akun_id", akunId).maybeSingle();
    if ((sudah as { diterima: boolean } | null)?.diterima) return { ok: true, sudah: true };
    const { data: sl } = await db.from("sigap_kegiatan_absen_salah").select("jumlah, terakhir_at").eq("absen_sesi_id", s.id).eq("akun_id", akunId).maybeSingle();
    const salah = (sl as { jumlah: number; terakhir_at: string } | null) ?? null;
    const tunggu = tungguKode(salah?.jumlah ?? 0, salah ? Date.parse(salah.terakhir_at) : null, nowMs);
    if (tunggu > 0) return { ok: false, pesan: `Terlalu banyak salah ketik. Coba lagi ${tunggu} detik lagi.`, status: 429, tunggu_detik: tunggu };
    if (!kodeCocok(masukan, s.kode)) {
      // sampai sini masa tunggu sudah lewat; hitungan yang sudah mencapai batas dimulai lagi dari nol
      const dasar = salah && salah.jumlah >= SALAH_KODE_MAKS ? 0 : salah?.jumlah ?? 0;
      const jumlah = dasar + 1;
      await db.from("sigap_kegiatan_absen_salah").upsert({ absen_sesi_id: s.id, akun_id: akunId, jumlah, terakhir_at: new Date(nowMs).toISOString() }, { onConflict: "absen_sesi_id,akun_id" });
      const sisa = Math.max(0, SALAH_KODE_MAKS - jumlah);
      return { ok: false, pesan: sisa > 0 ? `Kode salah. Sisa percobaan ${sisa}.` : "Kode salah 5 kali. Tunggu 1 menit sebelum mencoba lagi.", status: 422, sisa_percobaan: sisa, tunggu_detik: sisa > 0 ? 0 : 60 };
    }
    const { error } = await db.from("sigap_kegiatan_absen_hadir").upsert({ absen_sesi_id: s.id, akun_id: akunId, metode: "kode", diterima: true, manual: false, at: new Date(nowMs).toISOString() }, { onConflict: "absen_sesi_id,akun_id" });
    if (error) return { ok: false, pesan: "Kehadiran belum dapat disimpan.", status: 500 };
    return { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL, status: 500 };
  }
}

// ---------- radar ----------

export async function simpanPosisiPengelola(db: Db, sesi: SesiAbsen, akunId: number, pos: Posisi, nowMs: number): Promise<{ ok: boolean }> {
  try {
    const { error } = await db.from("sigap_kegiatan_absen_posisi").upsert({ absen_sesi_id: sesi.id, akun_id: akunId, lat: pos.lat, lng: pos.lng, akurasi_m: pos.akurasi, at: new Date(nowMs).toISOString() }, { onConflict: "absen_sesi_id" });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function muatPosisiPengelola(db: Db, sesiId: number): Promise<(Posisi & { at: number }) | null> {
  try {
    const { data } = await db.from("sigap_kegiatan_absen_posisi").select("lat, lng, akurasi_m, at").eq("absen_sesi_id", sesiId).maybeSingle();
    const d = data as { lat: number; lng: number; akurasi_m: number | null; at: string } | null;
    return d ? { lat: d.lat, lng: d.lng, akurasi: d.akurasi_m ?? 0, at: Date.parse(d.at) } : null;
  } catch {
    return null;
  }
}

/** Peserta mengonfirmasi lokasi. Masuk radius -> hadir (radar); di luar -> dicatat (diterima=false) supaya tampil di daftar "di luar radar". */
export async function konfirmasiLokasi(db: Db, sesi: SesiAbsen | null, akunId: number, kelasPeserta: number | null, pos: unknown, nowMs: number): Promise<HasilAbsen> {
  const cek = sesiBolehDiisi(sesi, kelasPeserta, "radar", nowMs);
  if (!cek.ok) return cek;
  const s = sesi as SesiAbsen;
  try {
    const { data: sudah } = await db.from("sigap_kegiatan_absen_hadir").select("diterima").eq("absen_sesi_id", s.id).eq("akun_id", akunId).maybeSingle();
    if ((sudah as { diterima: boolean } | null)?.diterima) return { ok: true, sudah: true };
    const pusat = await muatPosisiPengelola(db, s.id);
    const h = nilaiRadar(pusat, pos, s.radius_m, nowMs);
    const p = (pos && typeof pos === "object" ? pos : {}) as Partial<Posisi>;
    if (h.kode !== "masuk") {
      if (h.kode === "luar" || h.kode === "akurasi") {
        await db.from("sigap_kegiatan_absen_hadir").upsert(
          { absen_sesi_id: s.id, akun_id: akunId, metode: "radar", diterima: false, manual: false, lat: p.lat ?? null, lng: p.lng ?? null, akurasi_m: p.akurasi ?? null, jarak_m: h.jarak_m, alasan: h.kode === "luar" ? "di luar radius radar" : "akurasi GPS lemah", at: new Date(nowMs).toISOString() },
          { onConflict: "absen_sesi_id,akun_id" }
        );
      }
      return { ok: false, pesan: PESAN_RADAR[h.kode], status: 422, kode: h.kode, jarak_m: h.jarak_m };
    }
    const { error } = await db.from("sigap_kegiatan_absen_hadir").upsert(
      { absen_sesi_id: s.id, akun_id: akunId, metode: "radar", diterima: true, manual: false, lat: p.lat ?? null, lng: p.lng ?? null, akurasi_m: p.akurasi ?? null, jarak_m: h.jarak_m, alasan: null, at: new Date(nowMs).toISOString() },
      { onConflict: "absen_sesi_id,akun_id" }
    );
    if (error) return { ok: false, pesan: "Kehadiran belum dapat disimpan.", status: 500 };
    return { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL, status: 500 };
  }
}

// ---------- kedatangan (hari pertama; memakai presensi yang sudah ada) ----------

export type DatangAbsen = { at: string; manual: boolean; terlambat: boolean; jarak_m: number | null };

/** Kedatangan peserta pada `tanggal`: presensi diterima paling awal hari itu. */
export async function muatDatang(db: Db, kegiatanId: number, tanggal: string, akunIds: readonly number[]): Promise<Map<number, DatangAbsen>> {
  const hasil = new Map<number, DatangAbsen>();
  if (akunIds.length === 0) return hasil;
  try {
    const { data } = await db.from("sigap_pelatihan_presensi").select("akun_id, at, manual, terlambat, jarak_m").eq("kegiatan_id", kegiatanId).eq("tanggal", tanggal).eq("diterima", true).in("akun_id", [...akunIds]).order("at", { ascending: true }).limit(10000);
    for (const r of (data ?? []) as { akun_id: number; at: string; manual: boolean; terlambat: boolean; jarak_m: number | null }[]) {
      if (!hasil.has(r.akun_id)) hasil.set(r.akun_id, { at: r.at, manual: !!r.manual, terlambat: !!r.terlambat, jarak_m: r.jarak_m ?? null });
    }
  } catch {
    /* kosong */
  }
  return hasil;
}

/** Pengelola mencentang kedatangan manual (GPS peserta meleset). Alasan wajib; dicatat seperti presensi manual yang sudah ada. */
export async function catatDatangManual(db: Db, kegiatanId: number, peserta: PesertaAbsen, tanggal: string, alasan: string, oleh: string, nowMs: number): Promise<{ ok: boolean; pesan?: string }> {
  const a = alasan.trim();
  if (a.length < 3) return { ok: false, pesan: "Alasan centang manual wajib diisi." };
  try {
    const { data: ada } = await db.from("sigap_pelatihan_presensi").select("id").eq("kegiatan_id", kegiatanId).eq("akun_id", peserta.akun_id).eq("tanggal", tanggal).eq("diterima", true).limit(1);
    if (((ada ?? []) as unknown[]).length > 0) return { ok: true };
    const { error } = await db.from("sigap_pelatihan_presensi").insert({
      kegiatan_id: kegiatanId, akun_id: peserta.akun_id, penugasan_id: peserta.penugasan_id, tanggal, sesi_no: 1, at: new Date(nowMs).toISOString(),
      diterima: true, manual: true, alasan: a.slice(0, 200), dicatat_oleh: oleh.slice(0, 120), terlambat: false,
    });
    return error ? { ok: false, pesan: "Kedatangan belum dapat dicatat." } : { ok: true };
  } catch {
    return { ok: false, pesan: "Kedatangan belum dapat dicatat." };
  }
}

/** Membatalkan centang kedatangan manual (hanya baris manual; presensi GPS peserta tidak dihapus). */
export async function batalDatangManual(db: Db, kegiatanId: number, akunId: number, tanggal: string): Promise<{ ok: boolean; pesan?: string }> {
  try {
    const { error } = await db.from("sigap_pelatihan_presensi").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("tanggal", tanggal).eq("manual", true);
    return error ? { ok: false, pesan: "Centang belum dapat dibatalkan." } : { ok: true };
  } catch {
    return { ok: false, pesan: "Centang belum dapat dibatalkan." };
  }
}

// ---------- alat darurat (3 Nov 2026, push 114) ----------

/** Kode bocor: buat kode baru (pasti berbeda); kode lama langsung mati dan percobaan salah-ketik dibersihkan supaya peserta tidak terkunci. */
export async function kodeBaru(db: Db, sesi: SesiAbsen, acak: () => number): Promise<{ ok: true; kode: string } | { ok: false; pesan: string }> {
  if (!sesi.metode.includes("kode")) return { ok: false, pesan: "Sesi ini sedang tidak memakai kode. Ganti metode ke Kode unik dahulu." };
  try {
    let kode = buatKode(acak);
    if (kode === sesi.kode) kode = `${kode.slice(0, -1)}${(Number(kode.slice(-1)) + 1) % 10}`; // pasti berbeda walau sumber acak menghasilkan angka sama
    const { error } = await db.from("sigap_kegiatan_absen_sesi").update({ kode }).eq("id", sesi.id).eq("kegiatan_id", sesi.kegiatan_id);
    if (error) return { ok: false, pesan: "Kode belum dapat dibuat ulang." };
    await db.from("sigap_kegiatan_absen_salah").delete().eq("absen_sesi_id", sesi.id);
    return { ok: true, kode };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

/** Radius radar sementara untuk SATU sesi (pengaturan umum kegiatan tidak berubah). */
export async function ubahRadius(db: Db, sesi: SesiAbsen, radius: number): Promise<{ ok: boolean; pesan?: string }> {
  try {
    const { error } = await db.from("sigap_kegiatan_absen_sesi").update({ radius_m: radius }).eq("id", sesi.id).eq("kegiatan_id", sesi.kegiatan_id);
    return error ? { ok: false, pesan: "Radius belum dapat diubah." } : { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

export type MasukanSusulan = { tanggal: string; no: number; label: string; jam: string; mulaiMs: number; kelas: number | null; alasan: string };

/**
 * Sesi LUPA dibuka: dicatat sesudah kejadian dengan jam sebenarnya dan alasan. Sesinya langsung berstatus ditutup (peserta tidak bisa lagi mengisi sendiri);
 * kehadiran diisi pengelola dengan centang. Ditandai di `dibuka_oleh` ("Nama (susulan: alasan)"), tanpa kolom baru.
 */
export async function catatSusulan(db: Db, kegiatanId: number, masuk: MasukanSusulan, oleh: string, nowMs: number): Promise<{ ok: true; sesi: SesiAbsen } | { ok: false; pesan: string }> {
  try {
    const atur = await muatAtur(db, kegiatanId);
    const { data: ada, error: e0 } = await db.from("sigap_kegiatan_absen_sesi").select(KOLOM_SESI).eq("kegiatan_id", kegiatanId).eq("tanggal", masuk.tanggal).eq("no", masuk.no).limit(50);
    if (e0) return { ok: false, pesan: PESAN_SQL };
    if (((ada ?? []) as SesiAbsen[]).some((s) => (s.kelas ?? null) === (masuk.kelas ?? null))) return { ok: false, pesan: "Sesi ini sudah pernah dimulai. Lengkapi daftar hadirnya dengan Centang." };
    const buka = new Date(masuk.mulaiMs).toISOString();
    const nilai = {
      kegiatan_id: kegiatanId, tanggal: masuk.tanggal, no: masuk.no, label: masuk.label.slice(0, 40), jam_rencana: atur.sesi.find((x) => x.no === masuk.no)?.jam || masuk.jam, kelas: masuk.kelas,
      metode: ["centang"], kode: null, radius_m: atur.radius_m, jendela_menit: atur.jendela_menit, status: "ditutup", dibuka_oleh: penandaSusulan(oleh, masuk.alasan),
      dibuka_at: buka, tutup_at: new Date(masuk.mulaiMs + atur.jendela_menit * 60_000).toISOString(), ditutup_at: new Date(nowMs).toISOString(),
    };
    const { data, error } = await db.from("sigap_kegiatan_absen_sesi").insert(nilai).select(KOLOM_SESI).maybeSingle();
    if (error || !data) return { ok: false, pesan: error?.code === "23505" ? "Sesi ini baru saja dibuka pengelola lain. Muat ulang." : "Sesi susulan belum dapat dicatat." };
    const baris = data as SesiAbsen;
    await db.from("sigap_kegiatan_absen_buka").insert({ absen_sesi_id: baris.id, dibuka_oleh: nilai.dibuka_oleh, dibuka_at: buka, tutup_at: nilai.tutup_at, disarankan_no: null, dipilih_no: masuk.no });
    return { ok: true, sesi: baris };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

/**
 * Centang massal ("semua yang ada di ruangan"): hanya peserta kelas sesi yang BELUM tercatat hadir; yang sudah hadir (GPS/kode/centang) tidak ditimpa.
 * Percobaan radar di luar radius (diterima=false) ikut diganti menjadi hadir. Wajib beralasan; tercatat manual sehingga masuk rekap koreksi.
 */
export async function centangMassal(db: Db, sesi: SesiAbsen, peserta: readonly PesertaAbsen[], oleh: string, alasan: string, nowMs: number): Promise<{ ok: true; jumlah: number } | { ok: false; pesan: string }> {
  if (peserta.length === 0) return { ok: false, pesan: "Pilih minimal satu peserta." };
  if (peserta.length > CENTANG_MASSAL_MAKS) return { ok: false, pesan: `Maksimal ${CENTANG_MASSAL_MAKS} peserta sekali centang.` };
  try {
    const sudah = new Set((await muatHadir(db, [sesi.id])).filter((h) => h.diterima).map((h) => h.akun_id));
    const baru = peserta.filter((p) => !sudah.has(p.akun_id));
    if (baru.length === 0) return { ok: true, jumlah: 0 };
    const at = new Date(nowMs).toISOString();
    const { error } = await db.from("sigap_kegiatan_absen_hadir").upsert(
      baru.map((p) => ({ absen_sesi_id: sesi.id, akun_id: p.akun_id, metode: "centang", diterima: true, manual: true, alasan: alasan.slice(0, 200), jarak_m: null, akurasi_m: null, dicatat_oleh: oleh.slice(0, 120), at })),
      { onConflict: "absen_sesi_id,akun_id" }
    );
    return error ? { ok: false, pesan: "Centang massal belum dapat disimpan." } : { ok: true, jumlah: baru.length };
  } catch {
    return { ok: false, pesan: PESAN_SQL };
  }
}

/**
 * Rekap koreksi untuk laporan: semua centang manual sesi, centang manual kedatangan, dan sesi susulan. `kelas` null = semua kelas (panitia);
 * angka = hanya kelas itu (instruktur). Terbaru di atas.
 */
export async function muatRekapKoreksi(db: Db, kegiatanId: number, kelas: number | null): Promise<BarisRekap[]> {
  const hasil: BarisRekap[] = [];
  try {
    const [peserta, { data: sesiData }] = await Promise.all([
      pesertaKelas(db, kegiatanId, kelas),
      db.from("sigap_kegiatan_absen_sesi").select(KOLOM_SESI).eq("kegiatan_id", kegiatanId).order("tanggal", { ascending: false }).limit(2000),
    ]);
    const nama = new Map(peserta.map((p) => [p.akun_id, p.nama]));
    const sesiSemua = ((sesiData ?? []) as SesiAbsen[]).filter((s) => kelas === null || Number(s.kelas) === kelas);
    const labelSesi = (s: SesiAbsen) => `${s.label}${s.kelas !== null && s.kelas !== undefined ? ` · Kelas ${s.kelas}` : ""}`;
    const petaSesi = new Map(sesiSemua.map((s) => [s.id, s]));
    for (const s of sesiSemua) {
      const alasan = bacaSusulan(s.dibuka_oleh);
      if (alasan === null) continue;
      hasil.push({ jenis: "susulan", tanggal: s.tanggal, sesi: labelSesi(s), nama: s.kelas !== null && s.kelas !== undefined ? `Kelas ${s.kelas}` : "Semua kelas", alasan, oleh: (s.dibuka_oleh ?? "").replace(/\s*\(susulan: .*\)$/, ""), at: s.ditutup_at ?? s.dibuka_at });
    }
    if (petaSesi.size > 0) {
      const { data } = await db.from("sigap_kegiatan_absen_hadir").select(KOLOM_HADIR).eq("manual", true).in("absen_sesi_id", [...petaSesi.keys()]).limit(20000);
      for (const h of (data ?? []) as HadirAbsen[]) {
        const s = petaSesi.get(h.absen_sesi_id);
        if (!s || !h.diterima) continue;
        hasil.push({ jenis: "centang", tanggal: s.tanggal, sesi: labelSesi(s), nama: nama.get(h.akun_id) ?? `Akun ${h.akun_id}`, alasan: h.alasan ?? "", oleh: h.dicatat_oleh ?? "", at: h.at });
      }
    }
    const { data: dm } = await db.from("sigap_pelatihan_presensi").select("akun_id, tanggal, at, alasan, dicatat_oleh").eq("kegiatan_id", kegiatanId).eq("manual", true).eq("diterima", true).order("at", { ascending: false }).limit(5000);
    for (const r of (dm ?? []) as { akun_id: number; tanggal: string; at: string; alasan: string | null; dicatat_oleh: string | null }[]) {
      if (kelas !== null && !nama.has(r.akun_id)) continue;
      hasil.push({ jenis: "datang", tanggal: r.tanggal, sesi: "Kedatangan", nama: nama.get(r.akun_id) ?? `Akun ${r.akun_id}`, alasan: r.alasan ?? "", oleh: r.dicatat_oleh ?? "", at: r.at });
    }
  } catch {
    /* kosong */
  }
  return hasil.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 3000);
}

// ---------- (14 Nov 2026, luring 3d) absen kode tanpa sinyal ----------

/**
 * Kode yang diketik tanpa sinyal (lib/sigapAbsenLuring.ts). Sesi dicari dari kode + jam ketik; batas salah ketik berlaku untuk sesi-sesi kelas
 * peserta hari itu (salah ketik dihitung pada semua sesi kode kelasnya, supaya jalur ini tidak bisa dipakai menebak kode).
 */
export async function kirimKodeLuring(db: Db, kegiatanId: number, akunId: number, kelasPeserta: number | null, k: KodeLuring, nowMs: number): Promise<HasilAbsen> {
  const t = k.hp_ms + k.selisih_ms;
  const hari = await muatSesiHari(db, kegiatanId, tanggalWib(t));
  if (!hari.tersedia) return { ok: false, pesan: PESAN_SQL, status: 500 };
  const kelasku = hari.sesi.filter((s) => (s.kelas === null || kelasPeserta === null || Number(s.kelas) === Number(kelasPeserta)) && s.metode.includes("kode"));
  try {
    const ids = kelasku.map((s) => s.id);
    const { data: sl } = ids.length ? await db.from("sigap_kegiatan_absen_salah").select("absen_sesi_id, jumlah, terakhir_at").eq("akun_id", akunId).in("absen_sesi_id", ids) : { data: [] };
    const baris = (sl ?? []) as { absen_sesi_id: number; jumlah: number; terakhir_at: string }[];
    const tunggu = Math.max(0, ...baris.map((b) => tungguKode(b.jumlah, Date.parse(b.terakhir_at), nowMs)));
    if (tunggu > 0) return { ok: false, pesan: `Terlalu banyak salah ketik. Coba lagi ${tunggu} detik lagi.`, status: 429, tunggu_detik: tunggu };
    const p = putuskanKodeLuring(kelasku, k, kelasPeserta, nowMs);
    if (!p.ok) {
      if (p.salah_kode) {
        for (const s of kelasku) {
          const lama = baris.find((b) => b.absen_sesi_id === s.id);
          const dasar = lama && lama.jumlah >= SALAH_KODE_MAKS ? 0 : lama?.jumlah ?? 0;
          await db.from("sigap_kegiatan_absen_salah").upsert({ absen_sesi_id: s.id, akun_id: akunId, jumlah: dasar + 1, terakhir_at: new Date(nowMs).toISOString() }, { onConflict: "absen_sesi_id,akun_id" });
        }
      }
      return p;
    }
    const { data: sudah } = await db.from("sigap_kegiatan_absen_hadir").select("diterima").eq("absen_sesi_id", p.sesi_id).eq("akun_id", akunId).maybeSingle();
    if ((sudah as { diterima: boolean } | null)?.diterima) return { ok: true, sudah: true };
    const cap = { hp_ms: k.hp_ms, selisih_ms: k.selisih_ms, kirim_hp_ms: k.kirim_hp_ms, catatan: p.catatan, diterima_at: new Date(nowMs).toISOString() };
    const isi = { absen_sesi_id: p.sesi_id, akun_id: akunId, metode: "kode", diterima: true, manual: false, at: new Date(p.t).toISOString() };
    let { error } = await db.from("sigap_kegiatan_absen_hadir").upsert({ ...isi, luring_cap: cap }, { onConflict: "absen_sesi_id,akun_id" });
    if (error && /luring_cap/i.test(error.message)) ({ error } = await db.from("sigap_kegiatan_absen_hadir").upsert(isi, { onConflict: "absen_sesi_id,akun_id" }));
    if (error) return { ok: false, pesan: "Kehadiran belum dapat disimpan.", status: 500 };
    return { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL, status: 500 };
  }
}
