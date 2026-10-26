// lib/sigapFotoPutar.ts  (murni; dipakai KameraSigap)
//
// (24 Okt 2026) Memutar bingkai kamera (tegak, lebar < tinggi) menjadi foto yang ATASNYA BENAR, ketika HP dipegang miring tetapi layar
// terkunci tegak. Perbaikan bug foto landscape terbalik 180 derajat: sebelumnya arah putar tertukar.
// (26 Okt 2026) Lengkap seperti kamera biasa: empat arah (tegak, kiri, kanan, TERBALIK), putar manual pada pratinjau (kelipatan 90 derajat),
// dan belajar dari koreksi petugas (bila arah sensor di sebuah HP ternyata terbalik, arah putar otomatis dibalik di HP itu).
//
// Acuan sensor (lihat KameraSigap, `miring`): tegak = 0; HP diputar ke KIRI (atas HP ke kiri) = 1; ke KANAN (atas HP ke kanan) = -1;
// HP TERBALIK (atas HP ke bawah) = 2.
//  - HP ke kiri : atas-dunia = sisi KANAN bingkai  -> bingkai diputar 90 derajat BERLAWANAN arah jarum jam (sisi kanan menjadi atas);
//  - HP ke kanan: atas-dunia = sisi KIRI bingkai   -> bingkai diputar 90 derajat SEARAH jarum jam (sisi kiri menjadi atas);
//  - HP terbalik: atas-dunia = sisi BAWAH bingkai  -> bingkai diputar 180 derajat.

/** Matriks untuk ctx.setTransform(a, b, c, d, e, f): x' = a*x + c*y + e ; y' = b*x + d*y + f. */
export type MatriksKanvas = [number, number, number, number, number, number];

/** Arah HP: 0 tegak, 1 diputar ke kiri, -1 diputar ke kanan, 2 terbalik. */
export type ArahHp = 0 | 1 | -1 | 2;

/** Putaran SEARAH jarum jam sebanyak k x 90 derajat atas bingkai lebar x tinggi. Kanvas hasil: lebar x tinggi (k genap) atau tinggi x lebar (k ganjil). */
export function matriksKuartal(k: 1 | 2 | 3, lebar: number, tinggi: number): { m: MatriksKanvas; lebar: number; tinggi: number } {
  if (k === 1) return { m: [0, 1, -1, 0, tinggi, 0], lebar: tinggi, tinggi: lebar }; // (x, y) -> (tinggi - y, x)
  if (k === 2) return { m: [-1, 0, 0, -1, lebar, tinggi], lebar, tinggi }; // (x, y) -> (lebar - x, tinggi - y)
  return { m: [0, -1, 1, 0, 0, lebar], lebar: tinggi, tinggi: lebar }; // (x, y) -> (y, lebar - x)  (= berlawanan arah jarum jam)
}

/** Putaran searah jarum jam (dalam kelipatan 90 derajat) yang dibutuhkan agar atas-dunia menjadi atas foto. 0 = tidak perlu diputar. */
export function kuartalDariArah(arah: ArahHp): 0 | 1 | 2 | 3 {
  if (arah === 1) return 3; // HP ke kiri: berlawanan arah jarum jam
  if (arah === -1) return 1; // HP ke kanan: searah jarum jam
  if (arah === 2) return 2;
  return 0;
}

/** Kompatibel dengan versi 24 Okt: matriks putar bingkai untuk arah 1 (kiri), -1 (kanan), atau 2 (terbalik). */
export function matriksPutarBingkai(putar: 1 | -1 | 2, lebarBingkai: number, tinggiBingkai: number): MatriksKanvas {
  return matriksKuartal(kuartalDariArah(putar) as 1 | 2 | 3, lebarBingkai, tinggiBingkai).m;
}

/** Titik pada bingkai -> titik pada kanvas hasil (untuk uji). */
export function petakTitik(m: MatriksKanvas, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

const PUSAT: { sudut: number; arah: ArahHp }[] = [
  { sudut: 0, arah: 0 },
  { sudut: 90, arah: 1 },
  { sudut: -90, arah: -1 },
  { sudut: 180, arah: 2 },
];
const selisihSudut = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Arah HP dari gravitasi pada sumbu x/y perangkat (Android: tegak y ~ +9,8; ke kiri x ~ +9,8; ke kanan x ~ -9,8; terbalik y ~ -9,8).
 * Histeresis: arah lama dipertahankan selama sudutnya masih dalam 40 derajat dari pusatnya; arah baru dipilih bila sudutnya dalam 25 derajat dari pusatnya.
 * HP rebah (komponen bidang < 6,5) atau di antara dua arah: arah lama dipertahankan.
 */
export function arahDariGravitasi(gx: number, gy: number, sebelumnya: ArahHp): ArahHp {
  if (Math.hypot(gx, gy) < 6.5) return sebelumnya;
  const sudut = (Math.atan2(gx, gy) * 180) / Math.PI;
  const lama = PUSAT.find((p) => p.arah === sebelumnya);
  if (lama && selisihSudut(sudut, lama.sudut) <= 40) return sebelumnya;
  const dekat = PUSAT.find((p) => selisihSudut(sudut, p.sudut) <= 25);
  return dekat ? dekat.arah : sebelumnya;
}

// ----- Belajar dari koreksi petugas (per HP, per kondisi) -----
// Kamera tiap merek HP bisa berbeda (arah sensor, arah bingkai kamera pada layar yang berputar, kamera depan/belakang). Bila pada satu KONDISI
// (mis. "HP miring ke kiri" atau "layar landscape 270") foto yang sudah diputar otomatis berkali-kali dikoreksi 180 derajat oleh petugas,
// kondisi itu diberi tambahan putaran 180 derajat di HP tersebut. Penghitung diulang dari nol setiap kali pengaturan berubah, jadi tidak bolak-balik sendiri.
export type BelajarArah = { balik: boolean; koreksi: number; benar: number };
export type BelajarPeta = Record<string, BelajarArah>;
export const BELAJAR_AWAL: BelajarArah = { balik: false, koreksi: 0, benar: 0 };
export const AMBANG_KOREKSI = 2;

/** Kunci kondisi: layar sendiri sudah landscape -> "l<sudut layar>"; selain itu -> "s<arah HP>" (s0, s1, s-1, s2). */
export function kunciKondisi(layarLebar: boolean, sudutLayar: number, arah: ArahHp): string {
  if (layarLebar) return `l${(((Math.round(sudutLayar) % 360) + 360) % 360)}`;
  return `s${arah}`;
}

/** Putaran searah jarum jam (kelipatan 90 derajat) yang akhirnya dipakai: dasar menurut sensor, ditambah 180 derajat bila kondisi itu sudah dipelajari terbalik. */
export function kuartalAkhir(dasar: 0 | 1 | 2 | 3, peta: BelajarPeta, kunci: string): 0 | 1 | 2 | 3 {
  return ((dasar + (peta[kunci]?.balik ? 2 : 0)) % 4) as 0 | 1 | 2 | 3;
}

/** Perbarui hasil belajar satu kondisi sesudah sebuah foto dikirim. `kuartalManual` = total putar manual petugas (searah jarum jam). */
export function perbaruiBelajar(b: BelajarArah, kuartalManual: number): BelajarArah {
  const k = ((kuartalManual % 4) + 4) % 4;
  if (k === 1 || k === 3) return b; // dikoreksi 90 derajat: bukan pola terbalik, tidak dihitung
  const n: BelajarArah = k === 2 ? { ...b, koreksi: b.koreksi + 1 } : { ...b, benar: b.benar + 1 };
  if (n.koreksi >= AMBANG_KOREKSI && n.koreksi >= n.benar + AMBANG_KOREKSI) return { balik: !b.balik, koreksi: 0, benar: 0 };
  return n;
}

export function catatKoreksi(peta: BelajarPeta, kunci: string, kuartalManual: number): BelajarPeta {
  const lama = peta[kunci] ?? BELAJAR_AWAL;
  const baru = perbaruiBelajar(lama, kuartalManual);
  return baru === lama ? peta : { ...peta, [kunci]: baru };
}

/** Membaca peta belajar dari teks simpanan; bentuk yang tidak sah diabaikan. */
export function bacaBelajarPeta(teks: string | null): BelajarPeta {
  try {
    const o = JSON.parse(teks ?? "null");
    if (!o || typeof o !== "object") return {};
    const out: BelajarPeta = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const b = v as Partial<BelajarArah> | null;
      if (b && typeof b.balik === "boolean" && Number.isInteger(b.koreksi) && Number.isInteger(b.benar)) out[k] = { balik: b.balik, koreksi: b.koreksi as number, benar: b.benar as number };
    }
    return out;
  } catch {
    return {};
  }
}
