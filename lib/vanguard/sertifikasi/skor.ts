// lib/vanguard/sertifikasi/skor.ts  (murni)
//
// (1 Nov 2026) VANGUARD V7d: penilaian Ujian Sertifikasi. Tiap butir (satu kasus dengan angka acak) bernilai 0–100: 100 dikurangi bobot kesalahan (fatal 40, berat 20, ringan 8).
// Skor ujian = rata-rata nilai butir (butir tak terjawab = 0). Tingkat 1–5 bintang ditentukan skor DAN jumlah butir yang memuat kesalahan fatal (agar skor tinggi tidak
// menutupi kesalahan fatal berulang):
//   5 Expert        : skor >= 90 dan butir berkesalahan fatal <= 1
//   4 Profesional   : skor >= 80 dan butir berkesalahan fatal <= 3
//   3 Intermediate  : skor >= 65
//   2 Dasar         : skor >= 45
//   1 Pemula        : selain itu
// Sertifikasi tidak berdampak ke mana pun (kepemilikan saja); angka ini hanya disimpan dan ditampilkan.

export const BOBOT_KESALAHAN = { fatal: 40, berat: 20, ringan: 8 } as const;
export const NAMA_TINGKAT: Record<number, string> = { 1: "Pemula", 2: "Dasar", 3: "Intermediate", 4: "Profesional", 5: "Expert" };
export const JUMLAH_BUTIR_UJIAN = 15;
export const VERSI_UJIAN = 1;

export type CacahKesalahan = { fatal: number; berat: number; ringan: number };

export const poinButir = (c: CacahKesalahan): number => Math.max(0, 100 - c.fatal * BOBOT_KESALAHAN.fatal - c.berat * BOBOT_KESALAHAN.berat - c.ringan * BOBOT_KESALAHAN.ringan);

export function cacahKesalahan(daftar: { tingkat: "fatal" | "berat" | "ringan" }[]): CacahKesalahan {
  const c: CacahKesalahan = { fatal: 0, berat: 0, ringan: 0 };
  for (const x of daftar) c[x.tingkat] += 1;
  return c;
}

export type ButirNilai = { poin: number | null; fatal: number };
export type HasilUjian = { skor: number; butirFatal: number; tingkat: number; nama: string };

export function tingkatDari(skor: number, butirFatal: number): number {
  if (skor >= 90 && butirFatal <= 1) return 5;
  if (skor >= 80 && butirFatal <= 3) return 4;
  if (skor >= 65) return 3;
  if (skor >= 45) return 2;
  return 1;
}

/** `jumlah` = banyaknya butir ujian (butir tak terjawab dihitung 0). Skor dibulatkan 2 desimal. */
export function hitungUjian(butir: ButirNilai[], jumlah: number = butir.length): HasilUjian {
  const n = Math.max(1, jumlah);
  const total = butir.reduce((a, b) => a + (b.poin ?? 0), 0);
  const skor = Math.round((total / n) * 100) / 100;
  const butirFatal = butir.filter((b) => b.fatal > 0).length;
  const tingkat = tingkatDari(skor, butirFatal);
  return { skor, butirFatal, tingkat, nama: NAMA_TINGKAT[tingkat] };
}
