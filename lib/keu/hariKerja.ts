// lib/keu/hariKerja.ts
//
// (28 Okt 2026) Hitungan hari kerja untuk identifikasi dan RAB: hari kerja pendataan (batas hari dibayar translok), serta tenggat SPJ (paling lambat 5 hari kerja
// sesudah hari terakhir kegiatan) dan pembayaran (paling lambat 10 hari kerja sesudah hari terakhir kegiatan). Keputusan pengguna 28 Okt 2026; angka 5 dan 10
// adalah bawaan dan bersumber dari parameter lembar kebijakan (hari_spj_maks, hari_bayar_maks) bila ada. (cek aturan)
//
// Hari kerja = Senin sampai Jumat yang bukan hari libur. Daftar libur dioper oleh pemanggil (satu sumber: kalender libur Delego, keu_dlg_libur, yang memuat libur
// nasional, cuti bersama, dan libur tambahan akibat kebijakan pemerintah di tengah tahun). Berkas ini MURNI: tidak menyimpan keadaan global.

export type Libur = ReadonlySet<string>;
export const HARI_SPJ_BAWAAN = 5;
export const HARI_BAYAR_BAWAAN = 10;
const MS = 86_400_000;
const BATAS_LOOP = 800;
const TGL = /^\d{4}-\d{2}-\d{2}$/;

const keMs = (t: string): number => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));
const dariMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const tambah = (t: string, n: number): string => dariMs(keMs(t) + n * MS);
const sah = (t: string): boolean => TGL.test(t) && dariMs(keMs(t)) === t;

/** Himpunan tanggal libur dari daftar baris (hanya yang aktif; `aktif` kosong dianggap aktif). */
export function bangunLibur(daftar: { tanggal: string; aktif?: boolean }[] | null | undefined): Libur {
  return new Set((daftar ?? []).filter((l) => l.aktif !== false && sah(l.tanggal.slice(0, 10))).map((l) => l.tanggal.slice(0, 10)));
}

/** Senin sampai Jumat dan bukan libur. Tanggal tidak sah = bukan hari kerja. */
export function hariKerja(t: string, libur: Libur = new Set()): boolean {
  if (!sah(t)) return false;
  const w = new Date(keMs(t)).getUTCDay();
  return w >= 1 && w <= 5 && !libur.has(t);
}

/** Tanggal hari kerja pada rentang tertutup [mulai, selesai] (kosong bila terbalik atau tidak sah; paling banyak 800 hari diperiksa). */
export function daftarHariKerja(mulai: string, selesai: string, libur: Libur = new Set()): string[] {
  if (!sah(mulai) || !sah(selesai) || selesai < mulai) return [];
  const n = Math.min(Math.round((keMs(selesai) - keMs(mulai)) / MS), BATAS_LOOP);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) { const t = tambah(mulai, i); if (hariKerja(t, libur)) out.push(t); }
  return out;
}

export const hariKerjaAntara = (mulai: string, selesai: string, libur: Libur = new Set()): number => daftarHariKerja(mulai, selesai, libur).length;

/** Hari kerja ke-n sesudah tanggal t (t sendiri tidak dihitung; n = 0 memberi t). Kosong bila t tidak sah. */
export function tambahHariKerja(t: string, n: number, libur: Libur = new Set()): string {
  if (!sah(t) || !Number.isInteger(n) || n < 0 || n > 400) return "";
  let cur = t; let sisa = n; let langkah = 0;
  while (sisa > 0 && langkah < BATAS_LOOP * 2) { cur = tambah(cur, 1); langkah++; if (hariKerja(cur, libur)) sisa--; }
  return cur;
}

/** Tenggat SPJ masuk: `hari` hari kerja sesudah hari terakhir kegiatan. */
export const tenggatSpj = (selesai: string, libur: Libur = new Set(), hari: number = HARI_SPJ_BAWAAN): string => tambahHariKerja(selesai, hari, libur);
/** Tenggat pembayaran: `hari` hari kerja sesudah hari terakhir kegiatan (keputusan pengguna: dihitung dari hari terakhir kegiatan, bukan dari SPJ masuk). */
export const tenggatBayar = (selesai: string, libur: Libur = new Set(), hari: number = HARI_BAYAR_BAWAAN): string => tambahHariKerja(selesai, hari, libur);

/** Sisa hari kerja dari `hariIni` sampai `tenggat` (negatif = lewat; hariIni tidak dihitung). Null bila tanggal tidak sah. */
export function sisaHariKerja(hariIni: string, tenggat: string, libur: Libur = new Set()): number | null {
  if (!sah(hariIni) || !sah(tenggat)) return null;
  if (tenggat >= hariIni) return hariKerjaAntara(tambah(hariIni, 1), tenggat, libur);
  return -hariKerjaAntara(tambah(tenggat, 1), hariIni, libur);
}
