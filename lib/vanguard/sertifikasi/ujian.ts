// lib/vanguard/sertifikasi/ujian.ts  (murni)
//
// (1 Nov 2026) VANGUARD V7d: pengundi butir Ujian Sertifikasi. Dari "benih ujian" dipilih `jumlah` butir secara acak dan BERIMBANG: butir dikelompokkan per area, lalu
// diambil bergiliran antar area (urutan area diacak) sampai jumlah terpenuhi. Bila kolam lebih kecil dari `jumlah`, semua butir dipakai (tanpa pengulangan).
// Tiap butir mendapat benih angka sendiri (kasus yang sama = angka berbeda tiap ujian). Hasil deterministik untuk benih yang sama.

import { acak, MAKS_BENIH } from "../kuesioner/templat";

export type ButirKolam = { kode: string; jenis: "k" | "v1"; area: string };
export type ButirUjian = { urut: number; kode: string; jenis: "k" | "v1"; benih: number };

function kocok<T>(daftar: T[], r: () => number): T[] {
  const a = [...daftar];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function susunUjian(benihUjian: number, kolam: ButirKolam[], jumlah: number): ButirUjian[] {
  const r = acak(benihUjian);
  const peta = new Map<string, ButirKolam[]>();
  for (const b of [...kolam].sort((x, y) => x.kode.localeCompare(y.kode))) peta.set(b.area, [...(peta.get(b.area) ?? []), b]);
  const area = kocok([...peta.keys()].sort(), r);
  const antre = new Map(area.map((a) => [a, kocok(peta.get(a) as ButirKolam[], r)]));
  const dipilih: ButirKolam[] = [];
  while (dipilih.length < jumlah && [...antre.values()].some((q) => q.length > 0)) {
    for (const a of area) { const q = antre.get(a) as ButirKolam[]; if (q.length > 0 && dipilih.length < jumlah) dipilih.push(q.shift() as ButirKolam); }
  }
  return kocok(dipilih, r).map((b, i) => ({ urut: i + 1, kode: b.kode, jenis: b.jenis, benih: 1 + Math.floor(r() * (MAKS_BENIH - 1)) }));
}
