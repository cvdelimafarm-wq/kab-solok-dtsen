// lib/petaTampil.ts
//
// (17 Okt 2026) Hitungan murni untuk tab "Wilayah" di Lembar Pendataan (penampil gambar peta Sub SLS / nagari): kode berkas dan geser-zoom gambar.
// Tanpa DOM supaya bisa diuji.

export type JenisPeta = "sls" | "wa";
export type Transform = { x: number; y: number; k: number };

export const K_MIN = 1;
export const K_MAKS = 8;

/** Kode berkas peta di bucket "peta-wilayah": peta SLS = idsubsls (16 digit); peta WA (nagari) = 10 digit pertama idsubsls. */
export function kodePeta(jenis: JenisPeta, idsubsls: string): string {
  return jenis === "wa" ? idsubsls.slice(0, 10) : idsubsls;
}

export const jepit = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, n));

/** Gambar mengisi wadah W x H pada skala 1; setelah diperbesar k kali, geseran dijaga agar gambar tidak lepas dari wadah. */
export function jagaBatas(t: Transform, w: number, h: number): Transform {
  const k = jepit(t.k, K_MIN, K_MAKS);
  return { k, x: jepit(t.x, w - w * k, 0), y: jepit(t.y, h - h * k, 0) };
}

/** Ubah skala menjadi k2 dengan titik (px, py) di wadah tetap berada di bawah jari. */
export function zoomDi(t: Transform, k2: number, px: number, py: number, w: number, h: number): Transform {
  const k = jepit(k2, K_MIN, K_MAKS);
  const r = k / t.k;
  return jagaBatas({ k, x: px - (px - t.x) * r, y: py - (py - t.y) * r }, w, h);
}

/** Ketukan dua kali: bila sudah diperbesar kembali ke 1, bila belum perbesar ke 2,5x di titik ketukan. */
export function ketukDua(t: Transform, px: number, py: number, w: number, h: number): Transform {
  return t.k > 1.05 ? { x: 0, y: 0, k: 1 } : zoomDi(t, 2.5, px, py, w, h);
}
