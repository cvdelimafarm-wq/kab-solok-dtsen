-- supabase/tests/86_uji_belajar_aturan.sql
-- (13 Nov 2026, B) Uji sumber tunggal aturan belajar (skema-sql/20261113e + e2 + f). SELALU rollback.
-- Harapan: 6 baris Seruti TW IV; cermin kegiatan 7 = vanguard wajib, tenggat 9 Nov, fitur vanguard aktif, roleplay mati (dibatalkan beralasan);
--          layar lama menyalakan roleplay -> sumber aktif dan catatan batal terhapus; sumber jadi tidak wajib -> cermin 'opsional'.
begin;
create temp table hasil(uji text, nilai jsonb) on commit drop;
insert into hasil select 'baris', to_jsonb((select count(*) from sigap_belajar_aturan where kegiatan_id in (6, 7)));
insert into hasil select 'cermin7', jsonb_build_object('mode', (select vanguard_mode from sigap_pelatihan_aturan where kegiatan_id = 7), 'tenggat', (select vanguard_tenggat from sigap_pelatihan_aturan where kegiatan_id = 7),
  'vanguard', (select aktif from sigap_kegiatan_fitur where kegiatan_id = 7 and fitur = 'vanguard'), 'roleplay', (select aktif from sigap_kegiatan_fitur where kegiatan_id = 7 and fitur = 'vanguard_roleplay'));
insert into hasil select 'batal_tercatat', (select jsonb_build_object('alasan', batal_alasan, 'oleh', batal_oleh, 'at', batal_at) from sigap_belajar_aturan where kegiatan_id = 7 and butir = 'vanguard_roleplay');
update sigap_kegiatan_fitur set aktif = true, diubah_oleh = 'uji' where kegiatan_id = 7 and fitur = 'vanguard_roleplay';
insert into hasil select 'balik_roleplay', (select jsonb_build_object('aktif', aktif, 'batal_hilang', batal_at is null) from sigap_belajar_aturan where kegiatan_id = 7 and butir = 'vanguard_roleplay');
update sigap_belajar_aturan set wajib = false, diubah_oleh = 'uji' where kegiatan_id = 7 and waktu = 'pra_pelatihan' and butir = 'vanguard_latihan';
insert into hasil select 'cermin_opsional', to_jsonb((select vanguard_mode from sigap_pelatihan_aturan where kegiatan_id = 7));
select * from hasil;
rollback;
