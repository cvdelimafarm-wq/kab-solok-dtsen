// lib/sigapUnduh.ts  (murni, tanpa Supabase)
//
// (20 Okt 2026) Lembar "Unduh SPJ": permintaan user -- utamakan unduh TANGGAL HARI INI atau TANGGAL TERAKHIR YANG LENGKAP; rentang lain dipilih belakangan.
// Menentukan tanggal bawaan: hari ini bila sudah lengkap (laporan + foto), bila belum maka hari lengkap terakhir sampai hari ini; bila belum ada hari
// lengkap sama sekali, hari ini (bila hari kerja) agar tetap bisa mengunduh yang sudah ada.

export type HariUnduh = { tanggal: string; lengkap: boolean };

export type PilihanTanggalUnduh = {
  /** hari ini bila termasuk hari kerja penugasan; null bila bukan */
  hariIni: string | null;
  hariIniLengkap: boolean;
  /** hari lengkap terbaru yang <= hari ini; null bila belum ada */
  terakhirLengkap: string | null;
  /** tanggal yang dipilih sejak awal; null = tidak ada hari yang cocok (langsung tampilkan rentang) */
  bawaan: string | null;
};

export function pilihanTanggalUnduh(hari: HariUnduh[], hariIni: string): PilihanTanggalUnduh {
  const ini = hari.find((h) => h.tanggal === hariIni) ?? null;
  const lengkap = hari.filter((h) => h.lengkap && h.tanggal <= hariIni).map((h) => h.tanggal).sort();
  const terakhirLengkap = lengkap.length ? lengkap[lengkap.length - 1] : null;
  const bawaan = ini?.lengkap ? hariIni : (terakhirLengkap ?? (ini ? hariIni : null));
  return { hariIni: ini ? hariIni : null, hariIniLengkap: !!ini?.lengkap, terakhirLengkap, bawaan };
}

/** Jenis dokumen yang dibuat PER HARI (sisanya per rentang/kelompok tanggal). */
export const JENIS_PER_HARI = ["laporan", "dokumentasi"] as const;
