-- skema-sql/20261114w_waktu_per_soal_dan_topik.sql
--
-- (14 Nov 2026) Putusan Ketua Tim: rekam waktu per soal dan tambah atribut topik untuk soal tes (templat monitoring pemahaman).
--  - sigap_tes_sesi.jawaban_waktu: { "<nomor>": { t: jam pertama dipilih, u: jam terakhir diubah, n: kali diubah } }, diisi server tiap autosave.
--  - sigap_qc_percobaan.mulai_at + jawaban_waktu: dikirim HP saat jawaban QC dikirim (jam HP, dibersihkan server; jam di luar batas dibuang).
--  - sigap_tes_soal.topik: topik/blok soal pretest-posttest (boleh kosong); kosong = kartu "topik terlemah" tidak tampil.
-- Hanya menambah kolom; baris lama tetap (waktu kosong).

begin;
alter table sigap_tes_sesi add column if not exists jawaban_waktu jsonb not null default '{}'::jsonb;
alter table sigap_qc_percobaan add column if not exists mulai_at timestamptz;
alter table sigap_qc_percobaan add column if not exists jawaban_waktu jsonb not null default '{}'::jsonb;
alter table sigap_tes_soal add column if not exists topik text;
comment on column sigap_tes_sesi.jawaban_waktu is 'Waktu per soal {nomor:{t,u,n}}; diisi server tiap autosave (lib/waktuJawaban.ts).';
comment on column sigap_qc_percobaan.jawaban_waktu is 'Waktu per soal {soal_id:{t,u,n}} dari HP saat kirim, dibersihkan server.';
comment on column sigap_tes_soal.topik is 'Topik atau blok soal (boleh kosong) untuk monitoring pemahaman.';
commit;
