// lib/sigapTahapanDb.ts  (khusus server)
//
// (2 Nov 2026) Blokir antar tahapan + buka kunci (tahap F2). Aturan murni: lib/sigapTahapan.ts. Tabel izin: sigap_pelatihan_izin_buka (SQL 20261102zl).
// TAHAN SQL BELUM DIJALANKAN: tabel izin / aturan belum ada -> blokir mati (bawaan), tidak ada izin, penyimpanan menolak dengan pesan jelas.
// Keadaan tahapan dihitung dari data yang sama untuk tiga tempat (mulai tes, beranda peserta, Monitoring), supaya angkanya selalu sama.

import type { Db } from "@/lib/sigap";
import { muatAturan } from "@/lib/sigapAturanDb";
import type { AturanPelatihan } from "@/lib/sigapAturanTes";
import { muatTesDaftar } from "@/lib/sigapTesDb";
import { pesertaKelas } from "@/lib/sigapAbsenDb";
import { muatStatusMateriBatch } from "@/lib/sigapMateriDb";
import { tesTuntas, type TesBaris } from "@/lib/sigapTes";
import { TAHAP_KOSONG, akhirHariWib, izinBerlaku, type BarisIzin, type KodeTahap, type MasukanTahapan } from "@/lib/sigapTahapan";
import { muatRuntutanBatch, tanggalBukaPretest, type RuntutanBatch } from "@/lib/vanguardRuntutanDb"; // (2 Nov 2026) Vanguard 3 hari berturut-turut

export const PESAN_SQL_IZIN = "Tabel izin buka kunci belum ada di database. Jalankan SQL 20261102zl_aturan_nilai_v2.sql lebih dulu.";
const KOLOM_IZIN = "id, akun_id, tahap, alasan, asal, status, diputuskan_oleh, berlaku_sampai, dibuat_at, diputuskan_at";
const HARI_MS = 86_400_000;

const galatTabel = (m: string | undefined) => /relation|does not exist|schema cache/i.test(m ?? "");

export type BarisIzinLengkap = BarisIzin & { id: number; akun_id: number };

/** Izin / permintaan 3 hari terakhir (cukup untuk "berlaku sampai 23.59 hari yang sama"), per akun. Tabel belum ada -> kosong. */
export async function muatIzin(db: Db, kegiatanId: number, akunIds: readonly number[] | null, sekarang: number): Promise<{ tersedia: boolean; peta: Map<number, BarisIzinLengkap[]> }> {
  const peta = new Map<number, BarisIzinLengkap[]>();
  try {
    let q = db.from("sigap_pelatihan_izin_buka").select(KOLOM_IZIN).eq("kegiatan_id", kegiatanId).gte("dibuat_at", new Date(sekarang - 3 * HARI_MS).toISOString()).order("dibuat_at", { ascending: false }).limit(5000);
    if (akunIds && akunIds.length > 0) q = q.in("akun_id", [...akunIds]);
    const { data, error } = await q;
    if (error) return { tersedia: false, peta };
    for (const r of (data ?? []) as unknown as BarisIzinLengkap[]) {
      const daftar = peta.get(r.akun_id) ?? [];
      daftar.push(r);
      peta.set(r.akun_id, daftar);
    }
    return { tersedia: true, peta };
  } catch {
    return { tersedia: false, peta };
  }
}

/** Izin berlaku terbaru untuk tiap tahapan tes seorang akun (null = tidak ada). */
export function izinBerlakuPerTahap(baris: readonly BarisIzinLengkap[] | undefined, sekarang: number): Record<"pretest" | "posttest", BarisIzinLengkap | null> {
  const cari = (tahap: string) => (baris ?? []).find((b) => b.tahap === tahap && izinBerlaku(b, sekarang)) ?? null;
  return { pretest: cari("pretest"), posttest: cari("posttest") };
}

/** Kuis Adu Sigap: ada (ruang atau konfigurasi dengan soal) dan siapa saja yang tercatat ikut (ruang sudah selesai). Gagal baca -> kuis dianggap tidak ada. */
export async function muatKuisBatch(db: Db, kegiatanId: number, akunIds: readonly number[]): Promise<{ ada: boolean; ikut: Set<number> }> {
  const ikut = new Set<number>();
  try {
    const { data: ruang, error } = await db.from("sigap_kuis_ruang").select("id, status").eq("kegiatan_id", kegiatanId).limit(2000);
    if (error) return { ada: false, ikut };
    const ruangSelesai = new Set(((ruang ?? []) as { id: number; status: string }[]).filter((r) => r.status === "selesai").map((r) => Number(r.id)));
    let ada = (ruang ?? []).length > 0;
    if (!ada) {
      const { data: kelas } = await db.from("sigap_kuis_kelas").select("kuis_id").eq("kegiatan_id", kegiatanId).limit(100);
      const kuisIds = Array.from(new Set(((kelas ?? []) as { kuis_id: number | null }[]).map((k) => k.kuis_id).filter((x): x is number => x !== null && x !== undefined).map(Number)));
      if (kuisIds.length > 0) {
        const { data: soal } = await db.from("sigap_kuis_soal").select("kuis_id").in("kuis_id", kuisIds).limit(1);
        ada = (soal ?? []).length > 0;
      }
    }
    if (ada && ruangSelesai.size > 0 && akunIds.length > 0) {
      const { data: peserta } = await db.from("sigap_kuis_peserta").select("akun_id, ruang_id").in("akun_id", [...akunIds]).in("ruang_id", Array.from(ruangSelesai)).limit(20000);
      for (const p of (peserta ?? []) as { akun_id: number; ruang_id: number }[]) ikut.add(Number(p.akun_id));
    }
    return { ada, ikut };
  } catch {
    return { ada: false, ikut };
  }
}

export type KeadaanTahapanBatch = {
  aturan: AturanPelatihan;
  tes: TesBaris[];
  masukan: Map<number, MasukanTahapan>;
  kuis_ada: boolean;
  /** (2 Nov 2026) Aturan + runtutan Vanguard per akun (mode, hari ini, batas mulai). `berlaku` false = Vanguard tidak diatur / tidak menyala. */
  vanguard: RuntutanBatch;
};

/**
 * Masukan tahapan beberapa akun sekaligus. Video TERHUBUNG (Tahap C): `ada` bila kegiatan punya video yang diatur WAJIB; tuntas bila semua video wajib selesai (terbukti ditonton, atau ditandai manual).
 * Vanguard (2 Nov 2026): `ada` bila aturan Vanguard kegiatan bermode "wajib" DAN Vanguard menyala; tuntas bila ada N hari berturut-turut yang memenuhi (lib/runtutanVanguard.ts).
 * Mode "opsional" / "tidak_ada" tidak mengunci (`ada = false`); runtutan tetap dihitung untuk tampilan. Tabel materi belum ada -> video `ada = false` (tidak memblokir).
 * Pretest / posttest `ada` bila tesnya aktif; tuntas menurut `tesTuntas` (wajib 100 = skor 100). Sesi yang batas waktunya lewat tetapi belum dinilai dianggap selesai.
 */
export async function muatTahapanBatch(db: Db, kegiatanId: number, akunIds: readonly number[], sekarang: number, aturanDiketahui?: AturanPelatihan): Promise<KeadaanTahapanBatch> {
  const [aturan, daftar, kuis, materi] = await Promise.all([aturanDiketahui ? Promise.resolve(aturanDiketahui) : muatAturan(db, kegiatanId), muatTesDaftar(db, kegiatanId), muatKuisBatch(db, kegiatanId, akunIds), muatStatusMateriBatch(db, kegiatanId, akunIds)]);
  const vanguard = await muatRuntutanBatch(db, kegiatanId, akunIds, sekarang, tanggalBukaPretest(daftar));
  const tes = daftar.filter((t) => t.aktif && (t.jenis === "pretest" || t.jenis === "posttest"));
  const sesiPerTes = new Map<number, Map<number, { selesai_at: string | null; batas_at: string | null; skor: number | string | null; skor_terbaik: number | string | null }>>();
  if (tes.length > 0 && akunIds.length > 0) {
    try {
      const { data } = await db.from("sigap_tes_sesi").select("tes_id, akun_id, selesai_at, batas_at, skor, skor_terbaik").in("tes_id", tes.map((t) => t.id)).in("akun_id", [...akunIds]).limit(20000);
      for (const s of (data ?? []) as { tes_id: number; akun_id: number; selesai_at: string | null; batas_at: string | null; skor: number | string | null; skor_terbaik: number | string | null }[]) {
        const peta = sesiPerTes.get(s.tes_id) ?? new Map();
        peta.set(s.akun_id, s);
        sesiPerTes.set(s.tes_id, peta);
      }
    } catch {
      /* dianggap belum ada sesi */
    }
  }
  const masukan = new Map<number, MasukanTahapan>();
  for (const akun of akunIds) {
    const m = TAHAP_KOSONG();
    for (const t of tes) {
      const s = sesiPerTes.get(t.id)?.get(akun) ?? null;
      const kedaluwarsa = !!s && !s.selesai_at && !!s.batas_at && new Date(s.batas_at).getTime() <= sekarang;
      const angka = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
      const tuntas = !!s && (tesTuntas(t, { selesai_at: s.selesai_at, skor: angka(s.skor), skor_terbaik: angka(s.skor_terbaik) }) || (kedaluwarsa && !t.wajib_100));
      m[t.jenis as "pretest" | "posttest"] = { ada: true, tuntas };
    }
    m.kuis = { ada: kuis.ada, tuntas: kuis.ikut.has(akun) };
    m.video = { ada: materi.video_wajib_ada, tuntas: materi.video_tuntas.has(akun) };
    m.vanguard = { ada: vanguard.mengunci, tuntas: vanguard.peta.get(akun)?.tuntas ?? false };
    masukan.set(akun, m);
  }
  return { aturan, tes, masukan, kuis_ada: kuis.ada, vanguard };
}

// ---------- tulis ----------

export type HasilIzin = { ok: true; id?: number; sudah?: boolean } | { ok: false; pesan: string };

/** Petugas meminta buka kunci. Permintaan menunggu untuk tahapan yang sama tidak digandakan. */
export async function ajukanIzin(db: Db, kegiatanId: number, akunId: number, tahap: KodeTahap, alasan: string): Promise<HasilIzin> {
  try {
    const { data: ada, error: e0 } = await db.from("sigap_pelatihan_izin_buka").select("id").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("tahap", tahap).eq("status", "menunggu").limit(1);
    if (e0) return { ok: false, pesan: galatTabel(e0.message) ? PESAN_SQL_IZIN : e0.message };
    if ((ada ?? []).length > 0) return { ok: true, id: Number((ada as { id: number }[])[0].id), sudah: true };
    const { data, error } = await db.from("sigap_pelatihan_izin_buka").insert({ kegiatan_id: kegiatanId, akun_id: akunId, tahap, alasan, asal: "petugas", status: "menunggu" }).select("id").maybeSingle();
    if (error) return { ok: false, pesan: galatTabel(error.message) ? PESAN_SQL_IZIN : error.message };
    return { ok: true, id: data ? Number((data as { id: number }).id) : undefined };
  } catch {
    return { ok: false, pesan: PESAN_SQL_IZIN };
  }
}

/** Pengelola membuka kunci langsung. Permintaan menunggu milik orang & tahapan yang sama ikut disetujui (tidak dibuat baris kedua). */
export async function bukaLangsung(db: Db, kegiatanId: number, akunId: number, tahap: KodeTahap, alasan: string, oleh: string, sekarang: number): Promise<HasilIzin> {
  const sampai = akhirHariWib(sekarang);
  const tanda = new Date(sekarang).toISOString();
  try {
    const { data: ubah, error: e1 } = await db
      .from("sigap_pelatihan_izin_buka")
      .update({ status: "disetujui", diputuskan_oleh: oleh.slice(0, 120), berlaku_sampai: sampai, diputuskan_at: tanda })
      .eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("tahap", tahap).eq("status", "menunggu")
      .select("id");
    if (e1) return { ok: false, pesan: galatTabel(e1.message) ? PESAN_SQL_IZIN : e1.message };
    if ((ubah ?? []).length > 0) return { ok: true, id: Number((ubah as { id: number }[])[0].id), sudah: true };
    const { data, error } = await db
      .from("sigap_pelatihan_izin_buka")
      .insert({ kegiatan_id: kegiatanId, akun_id: akunId, tahap, alasan, asal: "pengelola", status: "disetujui", diputuskan_oleh: oleh.slice(0, 120), berlaku_sampai: sampai, diputuskan_at: tanda })
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, pesan: galatTabel(error.message) ? PESAN_SQL_IZIN : error.message };
    return { ok: true, id: data ? Number((data as { id: number }).id) : undefined };
  } catch {
    return { ok: false, pesan: PESAN_SQL_IZIN };
  }
}

export async function ambilIzin(db: Db, kegiatanId: number, id: number): Promise<BarisIzinLengkap | null> {
  try {
    const { data } = await db.from("sigap_pelatihan_izin_buka").select(KOLOM_IZIN).eq("kegiatan_id", kegiatanId).eq("id", id).maybeSingle();
    return (data as unknown as BarisIzinLengkap | null) ?? null;
  } catch {
    return null;
  }
}

/** Menyetujui / menolak permintaan yang masih menunggu. Idempoten terhadap klik ganda: yang sudah diputuskan tidak diubah. */
export async function putuskanIzin(db: Db, kegiatanId: number, id: number, setuju: boolean, oleh: string, sekarang: number): Promise<HasilIzin> {
  try {
    const { data, error } = await db
      .from("sigap_pelatihan_izin_buka")
      .update({ status: setuju ? "disetujui" : "ditolak", diputuskan_oleh: oleh.slice(0, 120), berlaku_sampai: setuju ? akhirHariWib(sekarang) : null, diputuskan_at: new Date(sekarang).toISOString() })
      .eq("kegiatan_id", kegiatanId).eq("id", id).eq("status", "menunggu")
      .select("id");
    if (error) return { ok: false, pesan: galatTabel(error.message) ? PESAN_SQL_IZIN : error.message };
    if ((data ?? []).length === 0) return { ok: false, pesan: "Permintaan ini sudah diputuskan." };
    return { ok: true, id };
  } catch {
    return { ok: false, pesan: PESAN_SQL_IZIN };
  }
}

export type PermintaanMenunggu = { id: number; akun_id: number; nama: string; kelas: number | null; tahap: string; alasan: string | null; dibuat_at: string };

/** Permintaan petugas yang menunggu keputusan (terbaru dahulu), dilengkapi nama dan kelas. `kelas` = batasi ke satu kelas (instruktur); null = semua (panitia). */
export async function daftarMenunggu(db: Db, kegiatanId: number, kelas: number | null): Promise<PermintaanMenunggu[]> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_izin_buka").select(KOLOM_IZIN).eq("kegiatan_id", kegiatanId).eq("status", "menunggu").eq("asal", "petugas").order("dibuat_at", { ascending: false }).limit(500);
    if (error || !data || data.length === 0) return [];
    const baris = data as unknown as BarisIzinLengkap[];
    const peserta = new Map((await pesertaKelas(db, kegiatanId, kelas)).map((p) => [p.akun_id, p]));
    const hasil: PermintaanMenunggu[] = [];
    for (const b of baris) {
      const p = peserta.get(b.akun_id);
      if (!p) continue; // bukan peserta kelas ini (atau sudah menolak undangan)
      hasil.push({ id: b.id, akun_id: b.akun_id, nama: p.nama, kelas: p.kelas, tahap: b.tahap, alasan: b.alasan ?? null, dibuat_at: b.dibuat_at ?? "" });
    }
    return hasil;
  } catch {
    return [];
  }
}
