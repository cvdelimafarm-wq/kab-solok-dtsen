// lib/paketLuringSimpan.ts
//
// (14 Nov 2026, luring 3b-1) Penyimpanan paket soal TERSANDI di HP (lib/sigapTesLuring.ts). Paket diunduh di belakang sejak H-1 tanpa tombol;
// halaman memakai `statusPaket` untuk tanda "Siap tanpa sinyal". Paket tidak bertanda `kotor`, jadi ikut dibuang saat keluar akun
// (bersihkanSaatKeluar) dan diunduh lagi ketika masuk: isinya tersandi dan tanpa kunci jawaban, jadi aman disimpan, tetapi tidak perlu tertinggal.
// Murni kecuali adaptor penyimpanan (disuntik di tes).

import { AWALAN_LURING, type Penyimpan } from "./luringSimpan";
import type { PaketTes } from "./sigapTesLuring";

export const kunciPaket = (jenis: string): string => `${AWALAN_LURING}paket:${jenis}`;

type SimpananPaket = { v: 1; pemilik: string; paket: PaketTes };

export function simpanPaket(p: Penyimpan, jenis: string, pemilik: string, paket: PaketTes): boolean {
  try {
    p.setItem(kunciPaket(jenis), JSON.stringify({ v: 1, pemilik, paket } satisfies SimpananPaket));
    return true;
  } catch {
    return false; // penyimpanan penuh: tanda "belum siap" tetap tampil
  }
}

export function bacaPaket(p: Penyimpan, jenis: string, pemilik: string): PaketTes | null {
  try {
    const t = p.getItem(kunciPaket(jenis));
    if (!t) return null;
    const x = JSON.parse(t) as SimpananPaket;
    if (!x || x.v !== 1 || x.pemilik !== pemilik || !x.paket?.tersandi) return null;
    return x.paket;
  } catch {
    return null;
  }
}

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
