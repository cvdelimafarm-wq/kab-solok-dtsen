// lib/vanguard/pembinaan/tantangan.ts  (murni)
//
// (1 Nov 2026) VANGUARD V8a: Tantangan Mingguan. Satu tantangan (5 butir) per minggu (Senin–Minggu WIB), SAMA untuk semua petugas pada minggu itu (soal dan angka), disusun sekali pada
// permintaan pertama minggu itu lalu disimpan. Isinya mengikuti TEMUAN minggu terakhir di Vanguard: butir dengan rata-rata poin terendah (jawaban >= 2) dalam 7 hari terakhir masuk lebih dulu,
// sisanya diisi acak berimbang. "Dari lapangan" di sini = dari kesalahan petugas pada latihan dan ujian di Vanguard; bila data anomali lapangan nyata tersambung, sumbernya bisa diganti.

import { acak, MAKS_BENIH } from "../kuesioner/templat";
import { hariWibNomor } from "../sertifikasi/jeda";
import { susunUjian, type ButirKolam, type ButirUjian } from "../sertifikasi/ujian";

export const JUMLAH_BUTIR_TANTANGAN = 5;
export const MINIMAL_JAWABAN = 2;

/** Nomor minggu WIB (minggu dimulai Senin; 5 Jan 1970 = Senin = minggu 0). */
export const nomorMinggu = (d: Date | string | number): number => Math.floor((hariWibNomor(d) - 4) / 7);
export const benihMinggu = (minggu: number): number => 1 + Math.floor(acak(minggu * 7919 + 13)() * (MAKS_BENIH - 1));
/** Benih tetap untuk Latihan Harian seorang petugas pada satu hari (soal hari itu sama bila dimuat ulang). */
export const benihHarian = (akun: number, hari: number): number => 1 + Math.floor(acak(akun * 100003 + hari * 31 + 7)() * (MAKS_BENIH - 1));

export type JawabanButir = { kasus: string; poin: number | null; jawab_at: string | null };

export function pilihTantangan(jawaban: JawabanButir[], kolam: ButirKolam[], minggu: number, sekarang: Date, jumlah: number = JUMLAH_BUTIR_TANTANGAN): ButirUjian[] {
  const batas = sekarang.getTime() - 7 * 86_400_000;
  const per = new Map<string, { n: number; poin: number }>();
  for (const j of jawaban) {
    if (!j.jawab_at || new Date(j.jawab_at).getTime() < batas) continue;
    const v = per.get(j.kasus) ?? { n: 0, poin: 0 };
    v.n += 1; v.poin += j.poin ?? 0; per.set(j.kasus, v);
  }
  const sulit = [...per].filter(([k, v]) => v.n >= MINIMAL_JAWABAN && v.poin / v.n < 100 && kolam.some((b) => b.kode === k))
    .sort((a, b) => a[1].poin / a[1].n - b[1].poin / b[1].n || b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, Math.min(3, jumlah)).map(([k]) => k);
  const benih = benihMinggu(minggu);
  const r = acak(benih);
  const terpilih: ButirKolam[] = sulit.map((k) => kolam.find((b) => b.kode === k) as ButirKolam);
  const sisa = kolam.filter((b) => !sulit.includes(b.kode));
  const isi = susunUjian(benih, sisa, jumlah - terpilih.length);
  const semua = [...terpilih, ...isi.map((x) => ({ kode: x.kode, jenis: x.jenis, area: "" }))];
  return semua.map((b, i) => ({ urut: i + 1, kode: b.kode, jenis: b.jenis, benih: 1 + Math.floor(r() * (MAKS_BENIH - 1)) }));
}
