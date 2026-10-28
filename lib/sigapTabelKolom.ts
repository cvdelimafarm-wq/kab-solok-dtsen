// lib/sigapTabelKolom.ts  (murni)
//
// (28 Okt 2026) Standar tabel SIGAP: tiap judul kolom punya tiga kontrol -- cari (mengandung), urut (siklus naik/turun/tanpa), dan filter nilai
// (pilih salah satu atau lebih nilai yang ada). Pola sama dengan Matriks kertas kerja revisi; di sini generik untuk baris apa pun.

export type SaringKolom = { q: string; pilih: string[] };
export type Saring<K extends string> = Partial<Record<K, SaringKolom>>;
export type Urut<K extends string> = { kolom: K; arah: "naik" | "turun" } | null;
/** Pengambil nilai sel sebuah kolom (angka untuk kolom angka, teks untuk lainnya). */
export type NilaiSel<T, K extends string> = (baris: T, kolom: K) => string | number;

const teks = (v: string | number): string => String(v).toLowerCase();

/** Lolos bila memenuhi SEMUA pencarian (mengandung, tanpa beda huruf) dan filter nilai (salah satu pilihan) tiap kolom. */
export function lolosSaring<T, K extends string>(baris: T, saring: Saring<K>, nilai: NilaiSel<T, K>): boolean {
  for (const [id, f] of Object.entries(saring) as [K, SaringKolom | undefined][]) {
    if (!f) continue;
    const v = nilai(baris, id);
    const q = f.q.trim().toLowerCase();
    if (q && !teks(v).includes(q)) return false;
    if (f.pilih.length > 0 && !f.pilih.includes(String(v))) return false;
  }
  return true;
}

export const adaSaring = <K extends string>(s: Saring<K>): boolean => Object.values(s).some((f) => !!f && ((f as SaringKolom).q.trim() !== "" || (f as SaringKolom).pilih.length > 0));

/** Nilai berbeda satu kolom untuk daftar filter: angka diurut numerik, selain itu abjad Indonesia. */
export function nilaiBeda<T, K extends string>(baris: T[], kolom: K, nilai: NilaiSel<T, K>, angka: boolean): string[] {
  const set = new Set(baris.map((b) => String(nilai(b, kolom))));
  const l = [...set];
  return angka ? l.sort((a, b) => Number(a) - Number(b)) : l.sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
}

export function bandingkan<T, K extends string>(a: T, b: T, u: NonNullable<Urut<K>>, nilai: NilaiSel<T, K>): number {
  const x = nilai(a, u.kolom);
  const y = nilai(b, u.kolom);
  const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "id", { sensitivity: "base" });
  return u.arah === "naik" ? c : -c;
}

/** Siklus urut satu kolom: naik -> turun -> tanpa urut -> naik. */
export function putarUrut<K extends string>(sekarang: Urut<K>, k: K): Urut<K> {
  if (!sekarang || sekarang.kolom !== k) return { kolom: k, arah: "naik" };
  return sekarang.arah === "naik" ? { kolom: k, arah: "turun" } : null;
}

/** Saring lalu urutkan (urut stabil; tanpa urut = urutan asal). Tidak mengubah array asal. */
export function terapkanTabel<T, K extends string>(baris: T[], saring: Saring<K>, urut: Urut<K>, nilai: NilaiSel<T, K>): T[] {
  const hasil = baris.filter((b) => lolosSaring(b, saring, nilai));
  if (!urut) return hasil;
  return hasil.map((b, i) => ({ b, i })).sort((p, q) => bandingkan(p.b, q.b, urut, nilai) || p.i - q.i).map((x) => x.b);
}
