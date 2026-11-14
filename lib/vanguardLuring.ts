// lib/vanguardLuring.ts
//
// (14 Nov 2026, luring 3c) VANGUARD LATIHAN tanpa sinyal (rancangan luring: "Vanguard latihan interaktif" tingkat 3).
//  * Bagian rahasia kasus LATIHAN (kunci, petunjuk, pembahasan) yang pernah diambil bersinyal disimpan di HP, sehingga kasus bisa diperiksa tanpa sinyal.
//    Mode UJI tidak pernah memakai simpanan ini (server yang menilai; kunci tidak boleh ada di HP saat diujikan).
//  * Status pencatatan terakhir (boleh dicatat, riwayat) disimpan, sehingga percobaan tanpa sinyal tetap tercatat.
//  * Percobaan yang gagal dikirim karena sinyal masuk ANTREAN (bertanda kotor -> tidak dibuang saat keluar akun), dikirim urut saat tersambung.
//    Server menilai ulang seperti biasa; cap waktu HP ikut dikirim (dibuat_hp_ms, selisih tidak diketahui -> hanya catatan).
// Murni kecuali adaptor penyimpanan.

import { AWALAN_LURING, type Penyimpan } from "./luringSimpan";

export const kunciRahasiaVg = (kode: string): string => `${AWALAN_LURING}vgr:${kode}`;
export const kunciStatusVg = (kegiatan: number): string => `${AWALAN_LURING}vgs:${kegiatan}`;
export const kunciAntreVg = (pemilik: string): string => `${AWALAN_LURING}vga:${pemilik}`;
/** rahasia latihan yang lebih tua dari ini diambil ulang saat bersinyal (kasus bisa diperbaiki pengelola) */
export const UMUR_RAHASIA_MS = 3 * 24 * 3_600_000;
export const MAKS_ANTRE = 200;

type Bungkus<T> = { v: 1; pemilik: string; at: number; isi: T };

function tulisJson(p: Penyimpan, k: string, x: unknown): void {
  try {
    p.setItem(k, JSON.stringify(x));
  } catch {
    /* penuh */
  }
}
function bacaBungkus<T>(p: Penyimpan, k: string, pemilik: string): Bungkus<T> | null {
  try {
    const x = JSON.parse(p.getItem(k) ?? "null") as Bungkus<T> | null;
    return x && x.v === 1 && x.pemilik === pemilik ? x : null;
  } catch {
    return null;
  }
}

export const simpanRahasiaVg = <T>(p: Penyimpan, pemilik: string, kode: string, isi: T, at = Date.now()): void => tulisJson(p, kunciRahasiaVg(kode), { v: 1, pemilik, at, isi });
export const bacaRahasiaVg = <T>(p: Penyimpan, pemilik: string, kode: string): { isi: T; at: number } | null => {
  const b = bacaBungkus<T>(p, kunciRahasiaVg(kode), pemilik);
  return b ? { isi: b.isi, at: b.at } : null;
};
export const perluRahasiaBaru = (simpan: { at: number } | null, now = Date.now()): boolean => !simpan || now - simpan.at > UMUR_RAHASIA_MS;

export const simpanStatusVg = <T>(p: Penyimpan, pemilik: string, kegiatan: number, isi: T, at = Date.now()): void => tulisJson(p, kunciStatusVg(kegiatan), { v: 1, pemilik, at, isi });
export const bacaStatusVg = <T>(p: Penyimpan, pemilik: string, kegiatan: number): { isi: T; at: number } | null => {
  const b = bacaBungkus<T>(p, kunciStatusVg(kegiatan), pemilik);
  return b ? { isi: b.isi, at: b.at } : null;
};

export type PercobaanVg = { id: string; body: Record<string, unknown>; dibuat_hp_ms: number; coba: number; ditolak?: string };
type Antrean = { v: 1; pemilik: string; kotor: boolean; item: PercobaanVg[] };

export function bacaAntreVg(p: Penyimpan, pemilik: string): PercobaanVg[] {
  try {
    const x = JSON.parse(p.getItem(kunciAntreVg(pemilik)) ?? "null") as Antrean | null;
    return x && x.v === 1 && x.pemilik === pemilik && Array.isArray(x.item) ? x.item : [];
  } catch {
    return [];
  }
}
export function tulisAntreVg(p: Penyimpan, pemilik: string, item: PercobaanVg[]): void {
  if (item.length === 0) {
    try {
      p.removeItem(kunciAntreVg(pemilik));
    } catch {
      /* abaikan */
    }
    return;
  }
  // kotor selama ada yang belum diterima (termasuk yang ditolak: disimpan agar bisa dilaporkan, tidak hilang diam-diam)
  tulisJson(p, kunciAntreVg(pemilik), { v: 1, pemilik, kotor: true, item: item.slice(-MAKS_ANTRE) } satisfies Antrean);
}
export function tambahAntreVg(p: Penyimpan, pemilik: string, body: Record<string, unknown>, now = Date.now()): PercobaanVg {
  const it: PercobaanVg = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, body: { ...body, luring: { dibuat_hp_ms: now } }, dibuat_hp_ms: now, coba: 0 };
  tulisAntreVg(p, pemilik, [...bacaAntreVg(p, pemilik), it]);
  return it;
}

/** Penolakan server (jadwal, batas percobaan, level belum dibuka): tidak dicoba ulang otomatis. */
export const ditolakVg = (pesan: string): boolean => /jadwal|ditutup|dibuka|batas percobaan|level|tidak boleh|masuk sebagai|ditolak|tidak terdaftar/i.test(pesan);
