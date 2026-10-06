// lib/portal/periode.ts
//
// (7 Okt 2026) Status periode kegiatan utk portal satu login -- permintaan user:
// "translok harusnya dia akan otomatis non aktif jika kegiatannya selesai, namun admin atau pj anggaran
// mungkin tetap bisa mengakses". Keputusan user: ditutup pada "tgl selesai kegiatan + 7" (hari_tenggang,
// dapat diedit admin anggaran); sesudah itu petugas melihat ARSIP BACA-SAJA.
// Admin anggaran dapat "Buka ulang" s.d. tanggal tertentu (kolom dibuka_sampai).

export type StatusPeriode = "belum_diatur" | "akan_datang" | "aktif" | "tenggang" | "arsip";

export type KegiatanPeriode = {
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  hari_tenggang?: number | null;
  dibuka_sampai?: string | null;
};

export const TENGGANG_BAWAAN = 7;

function tambahHari(t: string, n: number): string {
  const d = new Date(`${t}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Tanggal terakhir petugas masih boleh mengisi (inklusif), null bila tanggal selesai belum diatur. */
export function tanggalDitutup(k: KegiatanPeriode): string | null {
  if (!k.tanggal_selesai) return null;
  const tenggang = k.hari_tenggang ?? TENGGANG_BAWAAN;
  return tambahHari(k.tanggal_selesai, Math.max(0, tenggang));
}

/** Hitung status periode pada tanggal `hariIni` (YYYY-MM-DD, WIB). */
export function statusPeriode(k: KegiatanPeriode, hariIni: string): { status: StatusPeriode; ditutup: string | null; sisa_hari: number | null; dibuka_ulang: boolean } {
  const ditutup = tanggalDitutup(k);
  const dibukaUlang = !!k.dibuka_sampai && k.dibuka_sampai >= hariIni;
  const selisih = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
  if (dibukaUlang) return { status: "aktif", ditutup: k.dibuka_sampai!, sisa_hari: selisih(k.dibuka_sampai!, hariIni), dibuka_ulang: true };
  if (!k.tanggal_selesai || !ditutup) return { status: "belum_diatur", ditutup: null, sisa_hari: null, dibuka_ulang: false };
  if (k.tanggal_mulai && hariIni < k.tanggal_mulai) return { status: "akan_datang", ditutup, sisa_hari: selisih(ditutup, hariIni), dibuka_ulang: false };
  if (hariIni <= k.tanggal_selesai) return { status: "aktif", ditutup, sisa_hari: selisih(ditutup, hariIni), dibuka_ulang: false };
  if (hariIni <= ditutup) return { status: "tenggang", ditutup, sisa_hari: selisih(ditutup, hariIni), dibuka_ulang: false };
  return { status: "arsip", ditutup, sisa_hari: 0, dibuka_ulang: false };
}

/** Petugas masih boleh menulis (isi hari kerja, laporan, foto)? */
export function bolehTulisPetugas(status: StatusPeriode): boolean {
  return status !== "arsip";
}

export const PESAN_ARSIP =
  "Kegiatan ini sudah ditutup (melewati tanggal selesai + masa tenggang) dan kini menjadi arsip baca-saja. Bila perlu koreksi, hubungi PJ kegiatan atau admin anggaran untuk membuka ulang.";
