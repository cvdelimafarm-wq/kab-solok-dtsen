// lib/sigapPintasan.ts
//
// (30 Okt 2026) Beranda bagian atas = pintasan ikon yang DIPILIH PETUGAS (permintaan user). Logika murni: memilih, mengurutkan, menyimpan/membaca pilihan.
// Pilihan disimpan per akun di perangkat (localStorage); belum pernah memilih -> bawaan = beberapa menu pertama yang boleh diakses akun itu.

export const MAKS_PINTASAN = 12;
export const PINTASAN_BAWAAN = 8;
export const KUNCI_PINTASAN = "sigap_pintasan_v1";

export type Kandidat = { kode: string };

/** Pilihan tersimpan (JSON) -> daftar kode; null = belum pernah memilih / rusak. */
export function bacaPintasan(mentah: string | null | undefined): string[] | null {
  if (!mentah) return null;
  try {
    const x = JSON.parse(mentah) as unknown;
    if (!Array.isArray(x)) return null;
    const bersih = x.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 80);
    return Array.from(new Set(bersih)).slice(0, MAKS_PINTASAN);
  } catch {
    return null;
  }
}

/** Pintasan yang tampil: urutan pilihan petugas (kode yang sudah tak boleh diakses dibuang); tanpa pilihan -> PINTASAN_BAWAAN menu pertama. */
export function susunPintasan<T extends Kandidat>(kandidat: readonly T[], pilihan: readonly string[] | null): T[] {
  if (pilihan === null) return kandidat.slice(0, PINTASAN_BAWAAN);
  const peta = new Map(kandidat.map((k) => [k.kode, k]));
  return pilihan.flatMap((kode) => {
    const k = peta.get(kode);
    return k ? [k] : [];
  });
}

/** Daftar kode yang sedang tampil (titik awal saat petugas mulai mengubah). */
export const kodeTampil = (kandidat: readonly Kandidat[], pilihan: readonly string[] | null): string[] => susunPintasan(kandidat, pilihan).map((k) => k.kode);

/** Nyalakan/matikan satu menu di pintasan. Menu baru ditambah di akhir; di atas MAKS_PINTASAN ditolak (null). */
export function ubahPintasan(sekarang: readonly string[], kode: string, nyala: boolean): string[] | null {
  const ada = sekarang.includes(kode);
  if (nyala) {
    if (ada) return [...sekarang];
    if (sekarang.length >= MAKS_PINTASAN) return null;
    return [...sekarang, kode];
  }
  return sekarang.filter((x) => x !== kode);
}

/** Geser satu pintasan ke atas (-1) atau ke bawah (+1). */
export function geserPintasan(sekarang: readonly string[], kode: string, arah: -1 | 1): string[] {
  const i = sekarang.indexOf(kode);
  const j = i + arah;
  if (i < 0 || j < 0 || j >= sekarang.length) return [...sekarang];
  const hasil = [...sekarang];
  [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  return hasil;
}
