// app/sigap/kegiatan/format.ts
//
// (9 Okt 2026) Pembantu tampilan halaman tahap: nama orang & wilayah (data di DB kapital/campur) dan angka gaya Indonesia.

/** "DARA muhaima febriana" -> "Dara Muhaima Febriana"; singkatan berakhir titik ("M.") dipertahankan. */
export function judulKata(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (/^[A-Za-z]\.$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Nama singkat untuk chip anggota: dua kata pertama ("M. Hafizh Dinu Aulia" -> "M. Hafizh"). */
export function namaSingkat(s: string): string {
  return judulKata(s).split(" ").slice(0, 2).join(" ");
}

const FORMAT = new Intl.NumberFormat("id-ID");
export const angkaId = (n: number): string => FORMAT.format(Math.round(n));
