-- skema-sql/20261114za_tes_soal_bahas.sql
-- (14 Nov 2026) Monitoring pemahaman, lembar rincian soal (K4): tombol "Tandai bahas di kelas" oleh panitia / instruktur.
-- Hanya penanda tampilan; tidak memengaruhi nilai. Hanya menambah kolom.
alter table sigap_tes_soal add column if not exists bahas_at timestamptz;
alter table sigap_tes_soal add column if not exists bahas_oleh text;
