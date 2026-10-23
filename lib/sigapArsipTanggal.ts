// lib/sigapArsipTanggal.ts
//
// (23 Okt 2026) Tab Arsip halaman kerja Transport Lokal: arsip dokumen PER TANGGAL (surat tugas, laporan, dokumentasi, kwitansi, visum, surat
// pernyataan) yang bisa digeser antartanggal, supaya petugas melihat kembali apa yang sudah/ belum lengkap, mengunduhnya, dan memperbaikinya.
// Murni (tanpa React/DOM) supaya mudah diuji; page.tsx hanya menggambar.

export type KunciHariArsip = "hari_ini" | "izin" | "terlewat" | "akan_datang";
export type HariArsip = { tanggal: string; kunci: KunciHariArsip; lengkap: boolean; laporan: boolean; laporanDianggap: boolean; jumlahFoto: number };
export type AturanArsip = { wajibLaporan: boolean; jumlahFoto: number };
export type NadaArsip = "hijau" | "kuning" | "merah" | "abu";

export type NilaiHariArsip = {
  nada: NadaArsip;
  /** label pendek status hari: "Lengkap", "Belum lengkap", "Terlewat", "Rencana" */
  label: string;
  /** hari ini/ lampau yang masih perlu dilengkapi atau diperbaiki (dasar filter "Belum lengkap saja") */
  kurang: boolean;
  laporan: "ok" | "dianggap" | "kurang" | "tidak_wajib";
  foto: { ada: number; total: number; ok: boolean };
};

/** Penilaian satu hari. `lengkap` dari server dipercaya; rincian laporan/foto hanya untuk keterangan. */
export function nilaiHariArsip(h: HariArsip, aturan: AturanArsip): NilaiHariArsip {
  const laporan = !aturan.wajibLaporan ? "tidak_wajib" : h.laporan ? "ok" : h.laporanDianggap ? "dianggap" : "kurang";
  const foto = { ada: h.jumlahFoto, total: aturan.jumlahFoto, ok: h.jumlahFoto >= aturan.jumlahFoto };
  if (h.kunci === "akan_datang") return { nada: "abu", label: "Rencana", kurang: false, laporan, foto };
  if (h.lengkap) return { nada: "hijau", label: "Lengkap", kurang: false, laporan, foto };
  if (h.kunci === "terlewat") return { nada: "merah", label: "Terlewat", kurang: true, laporan, foto };
  return { nada: "kuning", label: "Belum lengkap", kurang: true, laporan, foto };
}

/** Tanggal yang dibuka pertama kali: hari ini bila hari kerja; kalau tidak, hari kerja terakhir sebelum hari ini; kalau tidak ada, yang pertama. */
export function tanggalAwalArsip(tanggal: string[], hariIni: string): string | null {
  if (tanggal.length === 0) return null;
  const urut = [...tanggal].sort();
  if (urut.includes(hariIni)) return hariIni;
  const lampau = urut.filter((t) => t < hariIni);
  return lampau.length ? lampau[lampau.length - 1] : urut[0];
}

/** Tanggal sebelum/ sesudah `sekarang` dalam daftar (sudah terurut di dalam fungsi). Di ujung daftar tetap di tempat. */
export function geserTanggal(tanggal: string[], sekarang: string, arah: -1 | 1): string {
  const urut = [...tanggal].sort();
  const i = urut.indexOf(sekarang);
  if (i < 0) return urut[0] ?? sekarang;
  const j = Math.min(urut.length - 1, Math.max(0, i + arah));
  return urut[j];
}

export type KelompokArsip = { mulai: string; selesai: string; tanggal: string[]; nominal: number };
/** Kelompok tanggal (dasar Kwitansi/Visum/Surat Pernyataan) yang memuat tanggal itu; null bila hari tidak masuk kelompok mana pun. */
export function kelompokDariTanggal<K extends KelompokArsip>(kelompok: K[], tgl: string): K | null {
  return kelompok.find((k) => k.tanggal.includes(tgl)) ?? null;
}

/**
 * Geser dengan sapuan jari: dx negatif (ke kiri) = tanggal berikutnya, dx positif = sebelumnya. Hanya sapuan mendatar yang jelas (jarak minimal
 * `ambang` dan dua kali lebih besar daripada geseran tegak) yang dihitung, supaya menggulir halaman tidak memindah tanggal. 0 = abaikan.
 */
export function arahSapuan(dx: number, dy: number, ambang = 60): -1 | 0 | 1 {
  if (Math.abs(dx) < ambang || Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? 1 : -1;
}
