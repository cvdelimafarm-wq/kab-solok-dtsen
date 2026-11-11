// lib/tindakLanjut.ts
// (11 Nov 2026) Status tindak lanjut masalah di halaman monitoring: Belum ditangani (tanpa baris) | Dalam proses | Selesai.
// Dipakai klien (papan "Perlu tindakan") dan API /api/portal/tindak-lanjut. Fungsi murni.

export const API_TINDAK_LANJUT = "/api/portal/tindak-lanjut";
export const SUMBER_TINDAK = ["lapangan", "progres"] as const;
export type SumberTindak = (typeof SUMBER_TINDAK)[number];
export type StatusTindak = "belum" | "proses" | "selesai";
export const LABEL_STATUS_TINDAK: Record<StatusTindak, string> = { belum: "Belum ditangani", proses: "Dalam proses", selesai: "Selesai" };
export const MAKS_CATATAN_TINDAK = 300;

export type BarisTindak = {
  sumber: string;
  kunci: string;
  status: "proses" | "selesai";
  catatan: string | null;
  masalah: string | null;
  nama_oleh: string | null;
  diubah_pada: string;
};
export type DataTindak = { baris: BarisTindak[]; bisa_ubah: boolean };

export const sahSumber = (v: unknown): v is SumberTindak => typeof v === "string" && (SUMBER_TINDAK as readonly string[]).includes(v);
export const sahKunci = (v: unknown): v is string => typeof v === "string" && /^[a-z]{2,10}:[A-Za-z0-9_-]{1,40}$/.test(v);

/**
 * Status yang berlaku untuk masalah yang sedang terdeteksi. "Selesai" hanya berlaku bila masalah yang tercatat saat itu sama dengan masalah sekarang;
 * bila berbeda, masalah dianggap muncul lagi (belum ditangani, kambuh = true).
 */
export function statusEfektif(b: BarisTindak | undefined, masalahSekarang: string): { status: StatusTindak; kambuh: boolean } {
  if (!b) return { status: "belum", kambuh: false };
  if (b.status === "proses") return { status: "proses", kambuh: false };
  return b.masalah === masalahSekarang ? { status: "selesai", kambuh: false } : { status: "belum", kambuh: true };
}
