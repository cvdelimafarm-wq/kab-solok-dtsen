-- skema-sql/20261114e_sigap_tes_luring.sql
--
-- (14 Nov 2026, luring 3b) Pretest/posttest tanpa sinyal: SANDI A per tes (dibuat sistem, dibacakan instruktur) untuk membuka paket soal tersandi di HP.
-- Hanya menambah kolom. Sandi dibuat aplikasi saat pertama dibutuhkan (lib/sigapTesLuring.ts: buatSandi).

begin;

alter table sigap_tes add column if not exists luring_sandi text;
alter table sigap_tes add column if not exists luring_sandi_at timestamptz;

comment on column sigap_tes.luring_sandi is '(14 Nov 2026) Sandi A pembuka paket soal luring; hanya untuk instruktur/panitia. Kosong = belum dibuat.';

commit;
