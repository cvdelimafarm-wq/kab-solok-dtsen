-- supabase/tests/83_uji_fase0_pembetulan.sql
-- (13 Nov 2026) Uji sesudah skema-sql/20261113a_fase0_pembetulan_data.sql. Hanya membaca; tiap baris harus bernilai true.

-- 1. Realisasi RO 2906.BMA.006: seluruh realisasi terpetakan ke item POK berlaku (ruang RO = daftar RO).
select 'realisasi_2906_BMA_006_terpetakan' uji,
       (select sum(real_sd) from keu_v_realisasi_terbaru where ro_kode = '2906.BMA.006')
     = (select sum(r.real_sd) from keu_v_realisasi_terbaru r join keu_v_adm_lembar l using (detail_id) where r.ro_kode = '2906.BMA.006') lulus;

-- 5. Identifikasi 7 tertaut ke kegiatan 6 (pendataan) dan 7 (pelatihan); kegiatan 6 mulai 10 Nov.
select 'ident7_tertaut_kegiatan6' uji, exists (select 1 from keu_ident_kegiatan where ident_id = 7 and kegiatan_id = 6 and fungsi = 'pendataan' and dilepas_at is null) lulus
union all
select 'ident7_tertaut_kegiatan7', exists (select 1 from keu_ident_kegiatan where ident_id = 7 and kegiatan_id = 7 and fungsi = 'pelatihan' and dilepas_at is null)
union all
select 'kegiatan6_mulai_10nov', (select tanggal_mulai = date '2026-11-10' from sigap_kegiatan where id = 6);
