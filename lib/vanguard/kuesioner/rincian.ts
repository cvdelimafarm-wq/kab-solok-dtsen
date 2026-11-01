// lib/vanguard/kuesioner/rincian.ts  (murni)
//
// (1 Nov 2026) VANGUARD V6-0: daftar rincian Blok IV.1 kuesioner VSEN26.KP (R.1 s.d. R.225) = dasar Mode Kuesioner Penuh.
// Sumber: PDF kuesioner VSEN26.KP September 2026 (diekstrak per posisi kata, lalu dirapikan manual pada baris bertata letak rumit). Nomor R.x = nomor urut kolom (1) pada kuesioner.
// Baris judul kelompok (A. PADI-PADIAN ... N. ROKOK DAN TEMBAKAU) ada di `KELOMPOK_IV1`, bukan di `RINCIAN_IV1` (yang hanya memuat baris isian). Bukan data responden; hanya daftar rincian.
// Catatan: rincian "(sebutkan)" tidak punya satuan baku (satuan null). Blok IV.2 (R.226–R.347) belum dimuat (V6b).

import data from "./rincian-iv1.json";

export type KelompokIv1 = { kel: string; nama: string; no: number; sampai: number };
export type RincianIv1 = { no: number; kode: string | null; nama: string; satuan: string | null; kel: string; sub?: string };

export const KELOMPOK_IV1: KelompokIv1[] = data.kelompok as KelompokIv1[];
export const RINCIAN_IV1: RincianIv1[] = data.rincian as RincianIv1[];

export const cariRincianIv1 = (no: number): RincianIv1 | undefined => RINCIAN_IV1.find((r) => r.no === no);
export const rincianKelompok = (kel: string): RincianIv1[] => RINCIAN_IV1.filter((r) => r.kel === kel);
/** Rincian "lainnya (sebutkan)": tempat memasukkan komoditas yang tidak punya baris sendiri (rawan salah letak). */
export const rincianLainnya = (r: RincianIv1): boolean => /\(sebutkan\)|^Lainnya/i.test(r.nama);
