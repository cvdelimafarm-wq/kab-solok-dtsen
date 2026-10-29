/**
 * (29 Okt 2026) Jeda polling gerbang QC menyesuaikan keadaan, supaya tidak membebani server:
 * - sedang diwajibkan (modal tampil): tiap 1 menit
 * - QC aktif tetapi belum perlu (sudah lulus / belum dirilis): tiap 3 menit
 * - tidak ada QC untuk akun ini: tiap 5 menit
 * Pembaruan seketika tetap terjadi saat aplikasi dibuka kembali (visibilitychange, focus, online).
 */
export const POLA_DASAR_MS = 60_000;

export function jedaPolaQc(s: { aktif: boolean; perlu?: boolean } | null): number {
  if (!s) return POLA_DASAR_MS;
  if (s.aktif && s.perlu) return POLA_DASAR_MS;
  if (s.aktif) return 3 * POLA_DASAR_MS;
  return 5 * POLA_DASAR_MS;
}
