-- skema-sql/20261114y_arsip_tes_waktu_per_soal.sql
-- (14 Nov 2026) Monitoring pemahaman langkah 3: waktu per soal percobaan yang diarsipkan saat "Kerjakan ulang" ikut disimpan,
-- supaya lama per soal percobaan PERTAMA tetap terbaca setelah peserta mengulang. Hanya menambah kolom.
alter table sigap_tes_sesi_arsip add column if not exists jawaban_waktu jsonb not null default '{}'::jsonb;
