// lib/penyisiranHari.ts
//
// Konstanta PERIODE "Identifikasi Hari Tugas" -- checklist per TANGGAL
// KALENDER (bukan hari dalam seminggu, dikoreksi user: ruang lingkup
// penyisiran SUDAH diperkirakan pasti 17-30 September 2026 / 14 hari,
// jadi checklist-nya per tanggal spt kalender). Dipakai bersama oleh
// app/api/penyisiran/alokasi/hari-tugas/route.ts &
// app/api/penyisiran/alokasi/oh-monitoring/batalkan/route.ts -- SENGAJA
// ditaruh di lib/ (bukan diekspor langsung dari salah satu file route.ts)
// krn Next.js App Router MELARANG route.ts mengekspor apa pun selain
// handler HTTP (GET/POST/PATCH/dst) & beberapa const konfigurasi resmi
// (runtime/dynamic/dst) -- export tambahan spt ini bikin build GAGAL dgn
// error "... is not a valid Route export field" (pernah kejadian).
//
// PERIODE HARDCODE -- kalau periode resmi berubah, ubah manual DUA
// tempat: konstanta di bawah INI, & CHECK CONSTRAINT di migrasi
// supabase/migrations/20260918_hari_tugas_jadi_tanggal_kalender.sql.
export const PERIODE_HARI_TUGAS_MULAI = "2026-09-17";
export const PERIODE_HARI_TUGAS_SELESAI = "2026-09-30";

export function tanggalDalamPeriodeHariTugas(tanggal: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(tanggal) &&
    tanggal >= PERIODE_HARI_TUGAS_MULAI &&
    tanggal <= PERIODE_HARI_TUGAS_SELESAI
  );
}

/**
 * Daftar SEMUA tanggal kalender dlm periode Hari Tugas (17-30 Sep 2026,
 * urut kronologis) -- dipakai endpoint .../alokasi/oh-monitoring utk
 * membentuk kolom grid kalender "Monitoring Alokasi Hari Tugas" (rekap
 * per petugas x tanggal, lihat app/penyisiran/perencanaan-lapangan.tsx).
 */
export function daftarTanggalPeriodeHariTugas(): string[] {
  const hasil: string[] = [];
  const cur = new Date(PERIODE_HARI_TUGAS_MULAI + "T00:00:00Z");
  const selesai = new Date(PERIODE_HARI_TUGAS_SELESAI + "T00:00:00Z");
  while (cur <= selesai) {
    hasil.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return hasil;
}
