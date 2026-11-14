-- skema-sql/20261114h_sigap_absen_hadir_luring.sql
--
-- (14 Nov 2026, luring 3d) Absen sesi dengan kode yang diketik TANPA SINYAL: cap waktu HP + catatan kewajaran. Hanya menambah kolom.
-- Juga (rancangan luring, penjagaan butir 6) batasan isi untuk cap waktu luring tes: sesi bertanda luring wajib punya luring_cap berisi jam HP.

begin;

alter table sigap_kegiatan_absen_hadir add column if not exists luring_cap jsonb;
comment on column sigap_kegiatan_absen_hadir.luring_cap is '(14 Nov 2026) Absen kode tanpa sinyal: {hp_ms, selisih_ms, kirim_hp_ms, catatan[], diterima_at}. Kosong = absen bersinyal/manual.';

alter table sigap_tes_sesi drop constraint if exists sigap_tes_sesi_luring_cap_wajib;
alter table sigap_tes_sesi add constraint sigap_tes_sesi_luring_cap_wajib
  check (not luring or (luring_cap is not null and luring_cap ? 'mulai_hp_ms' and luring_cap ? 'selisih_ms' and luring_cap ? 'diterima_at')) not valid;
alter table sigap_tes_sesi validate constraint sigap_tes_sesi_luring_cap_wajib;

alter table sigap_kegiatan_absen_hadir drop constraint if exists sigap_absen_hadir_luring_cap_isi;
alter table sigap_kegiatan_absen_hadir add constraint sigap_absen_hadir_luring_cap_isi
  check (luring_cap is null or (luring_cap ? 'hp_ms' and luring_cap ? 'selisih_ms' and luring_cap ? 'diterima_at')) not valid;
alter table sigap_kegiatan_absen_hadir validate constraint sigap_absen_hadir_luring_cap_isi;

commit;
