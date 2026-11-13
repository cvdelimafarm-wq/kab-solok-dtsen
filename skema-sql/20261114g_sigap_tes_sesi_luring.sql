-- skema-sql/20261114g_sigap_tes_sesi_luring.sql
--
-- (14 Nov 2026, luring 3b-3) Sesi tes yang dikerjakan TANPA SINYAL: tanda dan cap waktu dari HP (jam HP mulai/selesai/kirim, selisih jam,
-- jumlah ketukan, catatan kewajaran untuk panitia). Hanya menambah kolom.

begin;

alter table sigap_tes_sesi add column if not exists luring boolean not null default false;
alter table sigap_tes_sesi add column if not exists luring_cap jsonb;

comment on column sigap_tes_sesi.luring is '(14 Nov 2026) true = dikerjakan tanpa sinyal dan dikirim kemudian (lib/sigapTesLuringPeriksa.ts).';
comment on column sigap_tes_sesi.luring_cap is '(14 Nov 2026) Cap waktu HP + catatan kewajaran: {mulai_hp_ms, selesai_hp_ms, kirim_hp_ms, selisih_ms, ketukan, versi, versi_cocok, catatan[], diterima_at}.';

commit;
