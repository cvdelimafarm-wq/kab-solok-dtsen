-- supabase/tests/84_uji_picu_kegiatan.sql
-- (13 Nov 2026, keputusan A) Uji pemicu kegiatan dari identifikasi sah (skema-sql/20261113b_keu_ident_picu_kegiatan.sql). SELALU rollback.
-- Hasil yang diharapkan (13 Nov 2026):
--   rencana7     : pelatihan TW IV 9-9 Nov, pendataan TW IV 10-30 Nov
--   picu7        : sudah_tertaut x2 (kegiatan 7 pelatihan, 6 pendataan); tidak membuat apa pun
--   picu6        : dibuat x2 (pelatihan + pendataan IMK) ; picu6_ulang: sudah_tertaut x2 (idempoten)
--   versi baru 7 : pemicu jalan saat ver naik di dalam alur aplikasi; keu.via_fungsi tetap '1' sesudahnya (riwayat masih bisa ditulis);
--                  tanggal pendataan bergeser -> 1 usulan tanggal 'menunggu' untuk kegiatan 6, tanggal kegiatan TIDAK berubah
begin;
create temp table hasil(uji text, nilai jsonb) on commit drop;
create temp table awal on commit drop as select coalesce(max(id),0) m from keu_ident_riwayat;
insert into hasil select 'rencana7', jsonb_agg(to_jsonb(r)) from keu_ident_rencana_kegiatan((select form from keu_ident_versi where ident_id=7 and ver=1), 2026, '{}'::jsonb) r;
insert into hasil select 'picu7', keu_ident_picu_kegiatan(7, 354);
insert into hasil select 'picu6', keu_ident_picu_kegiatan(6, 354);
insert into hasil select 'picu6_ulang', keu_ident_picu_kegiatan(6, 354);
select set_config('app.akun_id', '354', true); select set_config('keu.via_fungsi', '1', true);
insert into keu_ident_versi(ident_id, ver, form, alasan, rev) select 7, 2, jsonb_set(form, '{jend,mn}', '12'), 'uji', true from keu_ident_versi where ident_id=7 and ver=1;
update keu_ident set ver = 2 where id = 7;
insert into hasil select 'via_sesudah_pemicu', to_jsonb(current_setting('keu.via_fungsi', true));
insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (7, 'uji', null, 'uji', 2, 354, 'uji riwayat sesudah pemicu');
insert into hasil select 'usul_tanggal', jsonb_agg(jsonb_build_object('keg',kegiatan_id,'lama',mulai_lama,'baru',mulai_baru,'status',status)) from keu_v_ident_kegiatan_tanggal where ident_id=7;
insert into hasil select 'kegiatan6_tidak_berubah', to_jsonb((select tanggal_mulai = date '2026-11-10' from sigap_kegiatan where id = 6));
insert into hasil select 'riwayat_baru', jsonb_agg(catatan order by id) from keu_ident_riwayat where id > (select m from awal);
select * from hasil;
rollback;
