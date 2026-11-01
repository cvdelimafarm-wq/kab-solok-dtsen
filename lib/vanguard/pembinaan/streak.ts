// lib/vanguard/pembinaan/streak.ts  (murni)
//
// (1 Nov 2026) VANGUARD V8a: rangkaian hari beruntun (streak) Latihan Harian. TIDAK MENGHUKUM: Sabtu dan Minggu (WIB) tidak memutus rangkaian (boleh dilewati tanpa latihan),
// dan hari ini yang belum berlatih tidak memutus (rangkaian baru putus bila kemarin hari kerja terlewat). Hanya latihan harian yang SELESAI dihitung.

import { hariWibNomor } from "../sertifikasi/jeda";

/** 0 = Minggu ... 6 = Sabtu, untuk nomor hari WIB (1 Jan 1970 = Kamis). */
export const hariPekan = (nomor: number): number => (((nomor + 4) % 7) + 7) % 7;
export const akhirPekan = (nomor: number): boolean => hariPekan(nomor) === 0 || hariPekan(nomor) === 6;

export type Streak = { sekarang: number; terpanjang: number; selesaiHariIni: boolean };

export function hitungStreak(selesaiIso: (string | null | undefined)[], sekarang: Date): Streak {
  const hari = new Set<number>();
  for (const s of selesaiIso) if (s) hari.add(hariWibNomor(s));
  const hariIni = hariWibNomor(sekarang);
  const selesaiHariIni = hari.has(hariIni);
  if (hari.size === 0) return { sekarang: 0, terpanjang: 0, selesaiHariIni: false };
  const awal = Math.min(...hari);

  let n = 0;
  for (let d = selesaiHariIni ? hariIni : hariIni - 1; d >= awal - 1; d--) {
    if (hari.has(d)) n += 1;
    else if (akhirPekan(d)) continue;
    else break;
  }

  const urut = [...hari].sort((a, b) => a - b);
  let terpanjang = 0, run = 0, sebelum: number | null = null;
  for (const d of urut) {
    if (sebelum !== null) {
      let putus = false;
      for (let x = sebelum + 1; x < d; x++) if (!akhirPekan(x)) { putus = true; break; }
      run = putus ? 1 : run + 1;
    } else run = 1;
    terpanjang = Math.max(terpanjang, run);
    sebelum = d;
  }
  return { sekarang: n, terpanjang, selesaiHariIni };
}
