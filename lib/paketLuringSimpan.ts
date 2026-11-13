// lib/paketLuringSimpan.ts
//
// (14 Nov 2026, luring 3b-1) Penyimpanan paket soal TERSANDI di HP (lib/sigapTesLuring.ts). Paket diunduh di belakang sejak H-1 tanpa tombol;
// halaman memakai `statusPaket` untuk tanda "Siap tanpa sinyal". Paket tidak bertanda `kotor`, jadi ikut dibuang saat keluar akun
// (bersihkanSaatKeluar) dan diunduh lagi ketika masuk: isinya tersandi dan tanpa kunci jawaban, jadi aman disimpan, tetapi tidak perlu tertinggal.
// Murni kecuali adaptor penyimpanan (disuntik di tes).

import { AWALAN_LURING, type Penyimpan } from "./luringSimpan";
import type { PaketTes } from "./sigapTesLuring";

export const kunciPaket = (jenis: string): string => `${AWALAN_LURING}paket:${jenis}`;

/** selisihMs = jam server - jam HP saat paket diterima (dipakai menerjemahkan cap waktu tanpa sinyal ke jam server). */
type SimpananPaket = { v: 1; pemilik: string; paket: PaketTes; selisihMs?: number };

/** Selisih jam server - jam HP dari paket yang baru diterima (diunduh_at = jam server saat paket disusun). */
export const selisihDariPaket = (paket: PaketTes, hpMs: number): number => {
  const s = Date.parse(paket.diunduh_at);
  return Number.isFinite(s) ? s - hpMs : 0;
};

export function simpanPaket(p: Penyimpan, jenis: string, pemilik: string, paket: PaketTes, selisihMs = 0): boolean {
  try {
    p.setItem(kunciPaket(jenis), JSON.stringify({ v: 1, pemilik, paket, selisihMs } satisfies SimpananPaket));
    return true;
  } catch {
    return false; // penyimpanan penuh: tanda "belum siap" tetap tampil
  }
}

export function bacaPaketLengkap(p: Penyimpan, jenis: string, pemilik: string): { paket: PaketTes; selisihMs: number } | null {
  try {
    const t = p.getItem(kunciPaket(jenis));
    if (!t) return null;
    const x = JSON.parse(t) as SimpananPaket;
    if (!x || x.v !== 1 || x.pemilik !== pemilik || !x.paket?.tersandi) return null;
    return { paket: x.paket, selisihMs: Number.isFinite(x.selisihMs) ? (x.selisihMs as number) : 0 };
  } catch {
    return null;
  }
}

export const bacaPaket = (p: Penyimpan, jenis: string, pemilik: string): PaketTes | null => bacaPaketLengkap(p, jenis, pemilik)?.paket ?? null;

export function buangPaket(p: Penyimpan, jenis: string): void {
  try {
    p.removeItem(kunciPaket(jenis));
  } catch {
    /* abaikan */
  }
}

export type StatusPaket = "siap" | "belum" | "tidak_perlu";

/** siap = paket ada di HP dan masih berlaku (jadwal tutup paket belum lewat); belum = tidak ada / kedaluwarsa; tidak_perlu = tes sudah ditutup. */
export function statusPaket(paket: PaketTes | null, tutupAt: string, sekarangMs: number): StatusPaket {
  const t = Date.parse(tutupAt);
  if (Number.isFinite(t) && sekarangMs >= t) return "tidak_perlu";
  if (!paket) return "belum";
  const tp = Date.parse(paket.tutup_at);
  if (Number.isFinite(tp) && sekarangMs >= tp) return "belum";
  return "siap";
}

/** Perbarui selisih jam (jawaban `sama` dari server membawa jam server) tanpa mengubah paket. */
export function perbaruiSelisih(p: Penyimpan, jenis: string, pemilik: string, selisihMs: number): void {
  const x = bacaPaketLengkap(p, jenis, pemilik);
  if (x) simpanPaket(p, jenis, pemilik, x.paket, selisihMs);
}
