// lib/saringKolom.ts  (logika murni, tanpa DB/React)
//
// (31 Okt 2026) Saringan dan urutan di JUDUL KOLOM ala spreadsheet (Daftar Mitra Kepka dan Daftar pegawai organik di tab Pengguna).
// Tiap kolom punya daftar nilai bercentang (nilai yang dicentang tampil), urut naik/turun, dan pencarian di dalam daftar nilai.
// Yang disimpan adalah nilai yang DISEMBUNYIKAN per kolom, jadi nilai baru yang muncul setelah data dimuat ulang otomatis tampil.
// Daftar nilai sebuah kolom mengikuti saringan kolom lain (seperti filter bertingkat pada spreadsheet).

export type Arah = "naik" | "turun";

export type DefKolom<T> = {
  id: string;
  label: string;
  /** Nilai teks untuk daftar saringan; null/kosong dikelompokkan sebagai "(Kosong)". */
  nilai: (r: T) => string | null;
  /** Kunci urut (angka atau teks); bila tidak ada dipakai `nilai`. null selalu di akhir. */
  urut?: (r: T) => string | number | null;
};

export type StatusKolom = {
  sembunyi: Record<string, string[]>;
  urut: { id: string; arah: Arah } | null;
};

export const STATUS_AWAL: StatusKolom = { sembunyi: {}, urut: null };
/** Kunci untuk nilai kosong di daftar saringan. */
export const KOSONG = "";
export const LABEL_KOSONG = "(Kosong)";

const kunci = (v: string | null | undefined): string => (v === null || v === undefined || v.trim() === "" ? KOSONG : v);

function bandingkan(a: string | number | null, b: string | number | null): number {
  const aKosong = a === null || a === "";
  const bKosong = b === null || b === "";
  if (aKosong || bKosong) return aKosong === bKosong ? 0 : aKosong ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "id", { numeric: true, sensitivity: "base" });
}

function lolos<T>(r: T, kolom: DefKolom<T>[], st: StatusKolom, kecuali?: string): boolean {
  for (const k of kolom) {
    if (k.id === kecuali) continue;
    const h = st.sembunyi[k.id];
    if (h && h.length > 0 && h.includes(kunci(k.nilai(r)))) return false;
  }
  return true;
}

/** Baris yang lolos semua saringan kolom (kecuali kolom `kecuali`) lalu diurutkan (urutan hanya bila `kecuali` tidak diisi). */
export function terapkan<T>(rows: T[], kolom: DefKolom<T>[], st: StatusKolom, kecuali?: string): T[] {
  const hasil = rows.filter((r) => lolos(r, kolom, st, kecuali));
  const u = kecuali === undefined ? st.urut : null;
  const k = u ? kolom.find((x) => x.id === u.id) : undefined;
  if (!u || !k) return hasil;
  const kuncinya = (r: T) => (k.urut ? k.urut(r) : k.nilai(r));
  const tanda = u.arah === "naik" ? 1 : -1;
  return hasil
    .map((r, i) => ({ r, i, v: kuncinya(r) }))
    .sort((a, b) => {
      // nilai kosong tetap di akhir pada kedua arah
      const aK = a.v === null || a.v === "";
      const bK = b.v === null || b.v === "";
      if (aK || bK) return aK === bK ? a.i - b.i : aK ? 1 : -1;
      return tanda * bandingkan(a.v, b.v) || a.i - b.i;
    })
    .map((x) => x.r);
}

export type NilaiUnik = { nilai: string; jumlah: number };

/** Daftar nilai unik sebuah kolom, dari baris yang lolos saringan KOLOM LAIN; terurut menurut kunci urut kolom itu, kosong di akhir. */
export function nilaiUnik<T>(rows: T[], kolom: DefKolom<T>[], st: StatusKolom, id: string): NilaiUnik[] {
  const k = kolom.find((x) => x.id === id);
  if (!k) return [];
  const peta = new Map<string, { jumlah: number; kunciUrut: string | number | null }>();
  for (const r of rows) {
    if (!lolos(r, kolom, st, id)) continue;
    const n = kunci(k.nilai(r));
    const ada = peta.get(n);
    if (ada) ada.jumlah++;
    else peta.set(n, { jumlah: 1, kunciUrut: k.urut ? k.urut(r) : n === KOSONG ? null : n });
  }
  return [...peta.entries()]
    .sort((a, b) => (a[0] === KOSONG ? 1 : b[0] === KOSONG ? -1 : bandingkan(a[1].kunciUrut, b[1].kunciUrut)))
    .map(([nilai, v]) => ({ nilai, jumlah: v.jumlah }));
}

const tanpa = (arr: string[], buang: string[]) => arr.filter((x) => !buang.includes(x));

function setSembunyi(st: StatusKolom, id: string, daftar: string[]): StatusKolom {
  const sembunyi = { ...st.sembunyi };
  if (daftar.length === 0) delete sembunyi[id];
  else sembunyi[id] = daftar;
  return { ...st, sembunyi };
}

/** Centang/lepas satu nilai. */
export function alihNilai(st: StatusKolom, id: string, nilai: string): StatusKolom {
  const h = st.sembunyi[id] ?? [];
  return setSembunyi(st, id, h.includes(nilai) ? tanpa(h, [nilai]) : [...h, nilai]);
}

/** Centang (tampil=true) atau lepas (tampil=false) semua nilai pada `daftar` (mis. hasil pencarian di popover). */
export function setBanyakNilai(st: StatusKolom, id: string, daftar: string[], tampil: boolean): StatusKolom {
  const h = st.sembunyi[id] ?? [];
  return setSembunyi(st, id, tampil ? tanpa(h, daftar) : [...h, ...tanpa(daftar, h)]);
}

/** Urut kolom (arah null = hapus urutan). */
export function setUrut(st: StatusKolom, id: string, arah: Arah | null): StatusKolom {
  return { ...st, urut: arah ? { id, arah } : null };
}

export function bersihkanKolom(st: StatusKolom, id: string): StatusKolom {
  return setSembunyi(st, id, []);
}

/** Banyak kolom yang sedang disaring. */
export function jumlahSaringan(st: StatusKolom): number {
  return Object.values(st.sembunyi).filter((h) => h.length > 0).length;
}
