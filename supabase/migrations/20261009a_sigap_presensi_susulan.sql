-- (9 Okt 2026) Presensi susulan: sesi yang sudah ditutup boleh disusul dari mana saja sampai batas waktu, dicatat berstatus terlambat.
-- SUDAH diterapkan ke database lewat MCP (sigap_presensi_susulan).
alter table public.sigap_pelatihan_pengaturan add column if not exists presensi_susulan_sampai timestamptz;
alter table public.sigap_pelatihan_presensi add column if not exists terlambat boolean not null default false;
update public.sigap_pelatihan_pengaturan set presensi_susulan_sampai = timestamptz '2026-10-09 22:00:00+07' where kegiatan_id = 3;
