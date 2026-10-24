// lib/sigapFotoPutar.ts  (murni; dipakai KameraSigap.potret)
//
// (24 Okt 2026) Memutar bingkai kamera (tegak, lebar < tinggi) menjadi foto landscape yang ATASNYA BENAR, ketika HP dipegang miring tetapi layar
// terkunci tegak. Perbaikan bug foto landscape terbalik 180 derajat: sebelumnya arah putar tertukar.
//
// Acuan sensor (lihat KameraSigap, `miring`): tegak = 0; HP diputar ke KIRI (atas HP ke kiri) = 1; ke KANAN (atas HP ke kanan) = -1.
//  - HP ke kiri : atas-dunia = sisi KANAN bingkai  -> bingkai diputar 90 derajat BERLAWANAN arah jarum jam (sisi kanan menjadi atas);
//  - HP ke kanan: atas-dunia = sisi KIRI bingkai   -> bingkai diputar 90 derajat SEARAH jarum jam (sisi kiri menjadi atas).
// Kanvas hasil berukuran (tinggi bingkai) x (lebar bingkai).

/** Matriks untuk ctx.setTransform(a, b, c, d, e, f): x' = a*x + c*y + e ; y' = b*x + d*y + f. */
export type MatriksKanvas = [number, number, number, number, number, number];

export function matriksPutarBingkai(putar: 1 | -1, lebarBingkai: number, tinggiBingkai: number): MatriksKanvas {
  if (putar === 1) {
    // berlawanan arah jarum jam: (x, y) -> (y, lebar - x)
    return [0, -1, 1, 0, 0, lebarBingkai];
  }
  // searah jarum jam: (x, y) -> (tinggi - y, x)
  return [0, 1, -1, 0, tinggiBingkai, 0];
}

/** Titik pada bingkai -> titik pada kanvas hasil (untuk uji). */
export function petakTitik(m: MatriksKanvas, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
