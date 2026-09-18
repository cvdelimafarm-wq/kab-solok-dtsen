-- Riwayat perubahan (audit log) per keluarga di penyisiran_usaha -- dipakai
-- panel "Riwayat Perubahan" di tab Penyisiran Usaha (app/seruti/penyisiran-usaha.tsx)
-- supaya bisa ditelusuri siapa mengubah apa, kapan, dan dari akun/peran
-- mana (utk QC/audit). HANYA mencatat field yg BENAR2 berubah nilainya
-- (dicek di kode API sebelum insert -- lihat app/api/penyisiran/update
-- dan app/api/penyisiran/identifikasi), bukan tiap kali tombol Simpan
-- ditekan walau nilainya sama seperti sebelumnya.
--
-- `jenis` dibatasi ke 5 nilai yg SAAT INI dicatat -- SENGAJA tidak
-- mencatat catatan_petugas/prioritas_pasti (di luar cakupan permintaan
-- "Riwayat Pendataan" timeline, dan supaya tabel ini tidak membengkak).
-- `oleh_role` menyimpan kode role token APA ADANYA (mis.
-- "identifikasi_jorong"), pemetaan ke label yang enak dibaca ("Identifikasi
-- Jorong") dilakukan di frontend (SUMBER_LABEL di penyisiran-usaha.tsx),
-- sama pola dgn STATUS_META/IDENTIFIKASI_META yang sudah ada.
create table if not exists penyisiran_riwayat (
  id bigserial primary key,
  kode_identitas text not null references penyisiran_usaha(kode_identitas) on delete cascade,
  jenis text not null check (jenis in ('status_kunjungan', 'info_ppl', 'info_jorong', 'info_tetangga', 'identifikasi_ppl')),
  nilai_lama text,
  nilai_baru text,
  oleh_nama text,
  oleh_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_penyisiran_riwayat_kode on penyisiran_riwayat (kode_identitas, created_at desc);

alter table penyisiran_riwayat enable row level security;
-- Sengaja TIDAK ada policy publik -- akses hanya lewat SUPABASE_SERVICE_ROLE_KEY
-- dari API routes (pola sama dgn seluruh tabel penyisiran/akun lainnya di
-- proyek ini). Tidak ada data seed di migrasi ini (tabel kosong di awal,
-- terisi otomatis lewat pemakaian aplikasi).
