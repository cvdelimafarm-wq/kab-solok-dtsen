// lib/spjLaporanAturan.ts
//
// Aturan kelayakan SIMPAN "Laporan" mode Template (tab Administrasi/SPJ,
// app/api/penyisiran/spj/laporan/route.ts POST) -- permintaan user:
//  - SEBELUM tanggal TANGGAL_WAJIB_PENYISIRAN: aturan LAMA, petugas TETAP
//    bisa submit Laporan asal ADA aktivitas pada tanggal itu, di SALAH SATU
//    (OR) dari 2 tab -- "Penyisiran Usaha" (status_kunjungan, ditarik dari
//    penyisiran_riwayat) ATAU "Identifikasi Jorong/Tetangga"
//    (identifikasi_ppl_at di penyisiran_usaha).
//  - SEJAK tanggal TANGGAL_WAJIB_PENYISIRAN (WIB): aktivitas tab
//    "Penyisiran Usaha" jadi WAJIB (tidak lagi opsional) -- aktivitas
//    Identifikasi jadi BOLEH ADA BOLEH TIDAK (opsional, TIDAK LAGI cukup
//    sendirian utk meloloskan Laporan). Latar belakang: tab Identifikasi
//    PPL sendiri sudah ditutup sejak tanggal yg sama (lihat
//    IDENTIFIKASI_PPL_AKTIF di app/penyisiran/identifikasi-ppl.tsx & tenggat
//    di PESAN_PENUTUPAN-nya), jadi wajar aktivitas lapangan yg
//    dipertanggungjawabkan bergeser ke Penyisiran Usaha.
//
// Dipisah ke file lib/ ini (bukan const lokal di route.ts) supaya SATU
// sumber kebenaran dipakai BERSAMA oleh backend (gerbang simpan yg
// SEBENARNYA) & frontend (kartu preview "Data Hasil Penyisiran" di
// app/penyisiran/administrasi-spj.tsx, supaya bisa kasih peringatan lebih
// awal SEBELUM petugas menekan Simpan) -- & krn Next.js App Router MELARANG
// route.ts mengekspor const/fungsi lain selain handler HTTP & konfigurasi
// resmi (runtime/dynamic/dst).
export const TANGGAL_WAJIB_PENYISIRAN = "2026-09-20";

/**
 * true kalau Laporan mode Template BOLEH disimpan utk kombinasi
 * (tanggal, ada aktivitas Penyisiran, ada aktivitas Identifikasi) ini.
 * Perbandingan tanggal aman dilakukan sbg string krn keduanya SELALU
 * format "YYYY-MM-DD" (ISO date, urut leksikografis = urut kalender).
 */
export function laporanTemplateBolehDisimpan(
  tanggal: string,
  adaAktivitasPenyisiran: boolean,
  adaAktivitasIdentifikasi: boolean
): boolean {
  if (tanggal >= TANGGAL_WAJIB_PENYISIRAN) return adaAktivitasPenyisiran;
  return adaAktivitasPenyisiran || adaAktivitasIdentifikasi;
}
