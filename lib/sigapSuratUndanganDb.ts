// lib/sigapSuratUndanganDb.ts
//
// (9 Nov 2026) Pemuat data surat undangan pelatihan per kelas (tabel sigap_pelatihan_surat_undangan, berkas di bucket sigap-files).
// Semua fungsi TAHAN tabel belum ada (SQL 20261109c belum dijalankan): kembali kosong / undefined, tidak melempar galat.

import type { Db } from "@/lib/sigap";
import { BUCKET_SIGAP } from "@/lib/sigap";

export type SuratUndangan = {
  id: number;
  kelas: number;
  jalur: string;
  nomor: string;
  tanggal: string;
  perihal: string;
  aktif: boolean;
  alasan_ganti: string | null;
  dibuat_oleh: string | null;
  dibuat_at: string;
  diganti_at: string | null;
};

const KOLOM = "id, kelas, jalur, nomor, tanggal, perihal, aktif, alasan_ganti, dibuat_oleh, dibuat_at, diganti_at";

const baris = (b: Record<string, unknown>): SuratUndangan => ({
  id: Number(b.id),
  kelas: Number(b.kelas),
  jalur: String(b.jalur ?? "unggah"),
  nomor: String(b.nomor ?? ""),
  tanggal: String(b.tanggal ?? "").slice(0, 10),
  perihal: String(b.perihal ?? ""),
  aktif: b.aktif === true,
  alasan_ganti: (b.alasan_ganti as string | null) ?? null,
  dibuat_oleh: (b.dibuat_oleh as string | null) ?? null,
  dibuat_at: String(b.dibuat_at ?? ""),
  diganti_at: (b.diganti_at as string | null) ?? null,
});

/** Surat aktif + riwayat satu kelas. `tersedia` = false bila tabel belum ada. */
export async function muatSurat(db: Db, kegiatanId: number, kelas: number): Promise<{ tersedia: boolean; aktif: SuratUndangan | null; riwayat: SuratUndangan[] }> {
  const { data, error } = await db.from("sigap_pelatihan_surat_undangan").select(KOLOM).eq("kegiatan_id", kegiatanId).eq("kelas", kelas).order("dibuat_at", { ascending: false }).limit(50);
  if (error) return { tersedia: false, aktif: null, riwayat: [] };
  const semua = ((data ?? []) as Record<string, unknown>[]).map(baris);
  return { tersedia: true, aktif: semua.find((s) => s.aktif) ?? null, riwayat: semua.filter((s) => !s.aktif) };
}

/** Kelas yang punya surat aktif. undefined = tabel belum ada (butir Kesiapan jatuh ke hitungan nomor di Arsip). */
export async function muatKelasBerSurat(db: Db, kegiatanId: number): Promise<number[] | undefined> {
  const { data, error } = await db.from("sigap_pelatihan_surat_undangan").select("kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).limit(100);
  if (error) return undefined;
  return ((data ?? []) as { kelas: number }[]).map((r) => Number(r.kelas));
}

/** Berkas PDF surat aktif (untuk lampiran laporan). null bila tidak ada / gagal diunduh. */
export async function unduhSuratAktif(db: Db, kegiatanId: number, kelas: number): Promise<{ bytes: Uint8Array; nomor: string; tanggal: string; perihal: string } | null> {
  const { data, error } = await db.from("sigap_pelatihan_surat_undangan").select("file_path, nomor, tanggal, perihal").eq("kegiatan_id", kegiatanId).eq("kelas", kelas).eq("aktif", true).maybeSingle();
  if (error || !data) return null;
  const { data: blob } = await db.storage.from(BUCKET_SIGAP).download(String(data.file_path));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), nomor: String(data.nomor), tanggal: String(data.tanggal).slice(0, 10), perihal: String(data.perihal) };
}

/** Tautan sementara (1 jam) untuk membuka PDF surat tertentu dari kelas ini. */
export async function tautanSurat(db: Db, kegiatanId: number, kelas: number, id: number): Promise<string | null> {
  const { data } = await db.from("sigap_pelatihan_surat_undangan").select("file_path").eq("id", id).eq("kegiatan_id", kegiatanId).eq("kelas", kelas).maybeSingle();
  if (!data) return null;
  const { data: s } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(String(data.file_path), 3600);
  return s?.signedUrl ?? null;
}

/** Nomor, tanggal, perihal surat aktif satu kelas (tanpa berkas). null bila tidak ada / tabel belum ada. */
export async function ringkasSuratAktif(db: Db, kegiatanId: number, kelas: number): Promise<{ nomor: string; tanggal: string; perihal: string } | null> {
  const { data, error } = await db.from("sigap_pelatihan_surat_undangan").select("nomor, tanggal, perihal").eq("kegiatan_id", kegiatanId).eq("kelas", kelas).eq("aktif", true).maybeSingle();
  if (error || !data) return null;
  return { nomor: String(data.nomor), tanggal: String(data.tanggal).slice(0, 10), perihal: String(data.perihal) };
}
