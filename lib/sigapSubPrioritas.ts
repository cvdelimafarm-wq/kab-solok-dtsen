// lib/sigapSubPrioritas.ts
//
// (15 Okt 2026) Sub SLS yang dibuka langsung bila petugas menekan "Buka Lembar Pendataan" dari pengingat (alamat /sigap/pendataan?utama=1).
// Murni (tanpa React/DB). Aturan: hanya Sub SLS tim yang MASIH ADA KK belum didata; bila Sub SLS yang terakhir dibuka petugas masih punya sisa,
// lanjutkan di situ (tidak berpindah-pindah); selain itu yang sisanya paling banyak; seri = urutan data (kecamatan, nagari, SLS).

export type SisaSub = { belum: number; total: number };

export function pilihSubPrioritas(urutan: string[], perSub: Record<string, SisaSub | undefined>, terakhir: string | null): string | null {
  const sisa = (id: string) => perSub[id]?.belum ?? 0;
  const calon = urutan.filter((id) => sisa(id) > 0);
  if (calon.length === 0) return null;
  if (terakhir && calon.includes(terakhir)) return terakhir;
  return calon.reduce((a, b) => (sisa(b) > sisa(a) ? b : a), calon[0]);
}

/** Alamat lembar yang membuka Sub SLS prioritas (pendataan) atau daftar "Belum" (identifikasi). */
export const alamatLembarUtama = (dasar: string): string => `${dasar}?utama=1`;
