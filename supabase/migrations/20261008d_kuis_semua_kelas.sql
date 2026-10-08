-- (8 Okt 2026) Adu Sigap: mode "Semua Kelas" (kelas 0 = satu ruang gabungan utk seluruh peserta) -- permintaan user.
-- Jalankan di Supabase SQL Editor (DROP CONSTRAINT tidak dijalankan lewat MCP). Tidak menghapus data apa pun:
-- hanya melonggarkan batas kolom kelas dari 1..4 menjadi 0..4.
begin;
alter table sigap_kuis_ruang drop constraint if exists sigap_kuis_ruang_kelas_check;
alter table sigap_kuis_ruang add constraint sigap_kuis_ruang_kelas_check check (kelas between 0 and 4);
alter table sigap_kuis_kelas drop constraint if exists sigap_kuis_kelas_kelas_check;
alter table sigap_kuis_kelas add constraint sigap_kuis_kelas_kelas_check check (kelas between 0 and 4);
commit;

-- Cek (harus 2 baris, keduanya "kelas >= 0"):
select conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint
where conname in ('sigap_kuis_ruang_kelas_check','sigap_kuis_kelas_kelas_check');
