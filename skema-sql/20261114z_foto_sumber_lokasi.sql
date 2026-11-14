-- skema-sql/20261114z_foto_sumber_lokasi.sql
-- (14 Nov 2026) Putusan Ketua Tim: catat sumber lokasi tiap foto SIGAP, GPS atau jaringan (Wi-Fi/seluler), supaya PML/admin dapat melihatnya
-- saat memeriksa. Foto lama: kosong (tidak diketahui). Hanya menambah kolom.
alter table sigap_foto add column if not exists sumber_lokasi text;
alter table sigap_foto drop constraint if exists sigap_foto_sumber_lokasi_check;
alter table sigap_foto add constraint sigap_foto_sumber_lokasi_check check (sumber_lokasi is null or sumber_lokasi in ('gps', 'jaringan'));
