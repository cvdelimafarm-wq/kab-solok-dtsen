// lib/absenLuringHp.ts
//
// (14 Nov 2026, luring 3d) Antrean ABSEN KODE tanpa sinyal di HP. Tiap kode yang diketik dicatat dengan jam HP dan selisih jam server terakhir;
// bertanda kotor (tidak dibuang saat keluar akun) sampai diterima atau ditolak server. Batas 3 kode berbeda per hari di HP (penebakan dicegah juga
// di server lewat batas salah ketik). Murni kecuali adaptor penyimpanan.

import { AWALAN_LURING, type Penyimpan } from "./luringSimpan";

export const kunciAbsenLuring = (pemilik: string): string => `${AWALAN_LURING}absen:${pemilik}`;
export const MAKS_KODE_PER_HARI = 3;

export type AbsenLuring = { id: string; kode: string; hp_ms: number; selisih_ms: number; status: "menunggu" | "diterima" | "ditolak"; pesan?: string };
type Simpanan = { v: 1; pemilik: string; kotor: boolean; item: AbsenLuring[] };

export function bacaAbsenLuring(p: Penyimpan, pemilik: string): AbsenLuring[] {
  try {
    const x = JSON.parse(p.getItem(kunciAbsenLuring(pemilik)) ?? "null") as Simpanan | null;
    return x && x.v === 1 && x.pemilik === pemilik && Array.isArray(x.item) ? x.item : [];
  } catch {
    return [];
  }
}

export function tulisAbsenLuring(p: Penyimpan, pemilik: string, item: AbsenLuring[], sekarangMs = Date.now()): void {
  // yang sudah selesai (diterima/ditolak) disimpan 2 hari untuk ditampilkan, lalu dibuang
  const sisa = item.filter((x) => x.status === "menunggu" || sekarangMs - x.hp_ms < 2 * 24 * 3_600_000);
  try {
    if (sisa.length === 0) p.removeItem(kunciAbsenLuring(pemilik));
    else p.setItem(kunciAbsenLuring(pemilik), JSON.stringify({ v: 1, pemilik, kotor: sisa.some((x) => x.status === "menunggu"), item: sisa } satisfies Simpanan));
  } catch {
    /* penuh */
  }
}

const hariWib = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** Tambah kode. null + alasan bila ditolak di HP (kode kosong/panjang salah, sama dengan yang menunggu, atau melewati batas per hari). */
export function tambahAbsenLuring(p: Penyimpan, pemilik: string, kode: string, panjang: number, selisihMs: number, hpMs = Date.now()): { ok: true; item: AbsenLuring } | { ok: false; alasan: string } {
  const k = kode.replace(/\s+/g, "");
  if (k.length !== panjang || !/^\d+$/.test(k)) return { ok: false, alasan: `Kode terdiri dari ${panjang} angka.` };
  const ada = bacaAbsenLuring(p, pemilik);
  if (ada.some((x) => x.kode === k && x.status !== "ditolak")) return { ok: false, alasan: "Kode ini sudah tersimpan." };
  if (ada.filter((x) => hariWib(x.hp_ms) === hariWib(hpMs)).length >= MAKS_KODE_PER_HARI) return { ok: false, alasan: `Paling banyak ${MAKS_KODE_PER_HARI} kode per hari tanpa sinyal. Tunggu sinyal untuk memeriksa kode.` };
  const item: AbsenLuring = { id: `${hpMs.toString(36)}${Math.random().toString(36).slice(2, 6)}`, kode: k, hp_ms: hpMs, selisih_ms: selisihMs, status: "menunggu" };
  tulisAbsenLuring(p, pemilik, [...ada, item], hpMs);
  return { ok: true, item };
}
