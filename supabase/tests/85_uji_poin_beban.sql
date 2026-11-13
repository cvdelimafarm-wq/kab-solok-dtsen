-- supabase/tests/85_uji_poin_beban.sql
-- (13 Nov 2026, C) Uji mesin Poin beban kerja (skema-sql/20261113c + 20261113d). SELALU rollback.
-- Harapan:
--   rata_pencilan : [10,11,12,13,100] -> pencilan 1 (100), rata 11,5
--   usul_2        : 2 pengusul belum cukup (min 3) -> sumber tetap 'awal'
--   usul_3        : 3 pengusul (per hari 16, 15, 17 -> menit 28,125 / 30 / 26,47) -> kandidat ±6,25 dari 'usul'; perubahan 8,33 -> 6,25 (25%) = langsung berlaku
--   usul_4_besar  : tambah pengusul per hari 3 (pencilan? tidak, < 4 nilai sebelumnya) ... dicek: perubahan > 25% -> 'menunggu'
--   putus_sendiri : pengusul tidak boleh memutus usulannya sendiri (galat)
--   manual_timpa  : input manual menimpa dengan alasan -> sumber 'manual'
begin;
create temp table hasil(uji text, nilai jsonb) on commit drop;
insert into hasil select 'rata_pencilan', to_jsonb(r) from keu_poin_rata(array[10,11,12,13,100]::numeric[]) r;

create temp table sel on commit drop as
  select s.id from keu_poin_sel s join keu_dlg_jenis j on j.id = s.jenis_id join keu_poin_survei v on v.id = s.survei_id where j.kode = 'periksa_dokumen' and v.kode = 'susenas';
create temp table orang on commit drop as select id, row_number() over (order by id) n from sigap_akun where aktif order by id limit 5;

insert into keu_poin_usul(sel_id, akun_id, per_hari, triwulan) select (select id from sel), id, case n when 1 then 16 else 15 end, '2026-Q4' from orang where n <= 2;
insert into hasil select 'usul_2', jsonb_build_object('terapkan', keu_poin_terapkan((select id from sel), 354, 'uji'), 'hitung', keu_poin_hitung((select id from sel)));

insert into keu_poin_usul(sel_id, akun_id, per_hari, triwulan) select (select id from sel), id, 17, '2026-Q4' from orang where n = 3;
insert into hasil select 'usul_3', jsonb_build_object('terapkan', keu_poin_terapkan((select id from sel), 354, 'uji'), 'berlaku', (select poin_berlaku from keu_poin_sel where id = (select id from sel)), 'hitung', keu_poin_hitung((select id from sel)));

insert into keu_poin_usul(sel_id, akun_id, per_hari, triwulan) select (select id from sel), id, 6, '2026-Q4' from orang where n in (4, 5);
insert into hasil select 'usul_5_besar', jsonb_build_object('terapkan', keu_poin_terapkan((select id from sel), 354, 'uji'), 'berlaku', (select poin_berlaku from keu_poin_sel where id = (select id from sel)),
  'menunggu', (select poin_baru from keu_poin_riwayat where sel_id = (select id from sel) and status = 'menunggu'), 'hitung', keu_poin_hitung((select id from sel)));

do $$ begin
  perform keu_poin_putus((select id from keu_poin_riwayat where sel_id = (select id from sel) and status = 'menunggu'), true, '', 354);
  insert into hasil values ('putus_sendiri', '"TIDAK DITOLAK (salah)"');
exception when others then insert into hasil values ('putus_sendiri', to_jsonb('ditolak: ' || sqlerrm)); end $$;

insert into hasil select 'manual_timpa', keu_poin_manual_simpan((select jenis_id from keu_poin_sel where id = (select id from sel)), (select survei_id from keu_poin_sel where id = (select id from sel)), 9, true, 'uji timpa manual', 354);
insert into hasil select 'riwayat', jsonb_agg(jsonb_build_object('lama', poin_lama, 'baru', poin_baru, 'sumber', sumber, 'status', status) order by id) from keu_poin_riwayat where sel_id = (select id from sel);
select * from hasil;
rollback;
