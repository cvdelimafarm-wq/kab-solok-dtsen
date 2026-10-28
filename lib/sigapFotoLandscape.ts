// lib/sigapFotoLandscape.ts
//
// (28 Okt 2026) Foto nomor 3 pada kegiatan PENDATAAN ("Saat mendata") wajib landscape (permintaan user).
// Fungsi murni, aman dipakai di klien dan server. Pelatihan tidak dikenai aturan ini.
// Dipakai: app/sigap/foto/KameraSigap.tsx (modal "miringkan HP", catatan kecil, penahan Kirim).

/** Nomor foto yang wajib landscape pada kegiatan pendataan. */
export const NOMOR_WAJIB_LANDSCAPE = 3;

/** Apakah foto bernomor ini wajib landscape? `jenis` kegiatan "pelatihan" tidak dikenai aturan. */
export function fotoWajibLandscape(nomor: number | null | undefined, jenis?: string | null): boolean {
  return nomor === NOMOR_WAJIB_LANDSCAPE && jenis !== "pelatihan";
}

/** Foto dikatakan landscape bila lebarnya tidak lebih kecil dari tingginya. Ukuran tak valid = dianggap landscape (tidak menahan). */
export function fotoLandscape(lebar: number, tinggi: number): boolean {
  if (!(lebar > 0) || !(tinggi > 0)) return true;
  return lebar >= tinggi;
}

/**
 * Perlu menampilkan modal "miringkan HP"? Hanya bila nomor tujuan wajib landscape, sensor arah HP tersedia (tanpa sensor tidak bisa diketahui,
 * jadi tidak diblokir di kamera; hasil foto tetap diperiksa sesudah memotret), layar sendiri belum landscape, dan HP masih tegak/terbalik.
 * arah: 0 tegak, 1 diputar ke kiri, -1 diputar ke kanan, 2 terbalik.
 */
export function perluMiringkanHp(o: { nomor: number | null | undefined; jenis?: string | null; sensorAda: boolean; layarLebar: boolean; arah: number }): boolean {
  if (!fotoWajibLandscape(o.nomor, o.jenis)) return false;
  if (!o.sensorAda || o.layarLebar) return false;
  return o.arah === 0 || o.arah === 2;
}

/** Foto hasil potret tertahan (belum boleh dikirim): nomornya wajib landscape tetapi hasilnya tegak. */
export function fotoTertahanTegak(o: { nomor: number | null | undefined; jenis?: string | null; lebar: number; tinggi: number }): boolean {
  return fotoWajibLandscape(o.nomor, o.jenis) && !fotoLandscape(o.lebar, o.tinggi);
}

/** Redaksi (sopan dan simpel). */
export const TEKS_LANDSCAPE = {
  judulModal: "Mohon miringkan HP Anda",
  isiModal: (nomor: number, label?: string | null) => `Foto ${nomor}${label ? ` (${label})` : ""} wajib landscape. Silakan miringkan HP ke kiri atau ke kanan.`,
  tombolUbahNomor: "Pilih nomor foto lain",
  catatan: "Wajib landscape. Mohon miringkan HP saat memotret.",
  catatanPendek: "Wajib landscape",
  galatTegak: (nomor: number) => `Foto ${nomor} harus landscape. Mohon ambil ulang dengan HP dimiringkan.`,
} as const;
