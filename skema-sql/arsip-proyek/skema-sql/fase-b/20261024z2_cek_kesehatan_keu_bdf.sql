-- =====================================================================
-- 20261024z2_cek_kesehatan_keu_bdf.sql  (HANYA MEMBACA; jalankan sesudah migrasi d, e, f)
-- Baris P0 harus 0. Baris "info" hanya informasi.
-- =====================================================================
with daftar(nama) as (values
  ('keu_rab'),('keu_rab_item'),('keu_rab_baris'),('keu_rab_jadwal'),('keu_rab_riwayat'),
  ('keu_revisi_jadwal'),('keu_revisi_usulan'),('keu_revisi_usulan_riwayat'),('keu_revisi_sah'),('keu_laporan_kpa'),
  ('keu_kk_baris'),('keu_kk_geseran'),('keu_kk_keputusan_kro'),('keu_master_param')
), cek(urut, nama, hasil) as (
  select 1, 'P0 tabel d/e/f yang belum ada (harus 0)',
    (select count(*) from daftar where to_regclass('public.' || nama) is null)::text
  union all select 2, 'P0 tabel d/e/f tanpa trigger penjaga (harus 0)',
    (select count(*) from daftar d where to_regclass('public.' || d.nama) is not null
       and not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.' || d.nama) and not t.tgisinternal))::text
  union all select 3, 'P0 view keu_v_ terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'keu\_v\_%'
       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')))::text
  union all select 4, 'P0 view keu_v_ tanpa security_invoker (harus 0)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'keu\_v\_%'
       and coalesce(c.reloptions::text, '') not like '%security_invoker=true%')::text
  union all select 5, 'P0 RAB disetujui lebih dari satu per RO (harus 0)',
    (select count(*) from (select ro_kode from keu_rab where status = 'disetujui' group by ro_kode having count(*) > 1) x)::text
  union all select 6, 'P0 usulan disetujui tanpa pengesah (harus 0)',
    (select count(*) from keu_revisi_usulan where status = 'disetujui' and (disahkan_oleh is null or disahkan_at is null))::text
  union all select 7, 'P0 jadwal berstatus sah tanpa catatan nomor dokumen (harus 0)',
    (select count(*) from keu_revisi_jadwal j where j.status = 'sah' and not exists (select 1 from keu_revisi_sah s where s.jadwal_id = j.id))::text
  union all select 8, 'P0 baris kertas kerja yang kolom Semula-nya beda dari POK (harus 0)',
    (select count(*) from keu_kk_baris b join keu_pok_detail d on d.id = b.detail_id
     where b.vol_semula <> d.volume or b.harga_semula <> d.harga_satuan or b.jumlah_semula <> d.jumlah or b.uraian_semula <> d.uraian)::text
  union all select 9, 'P0 jadwal diterapkan/sah yang masih punya pemeriksaan merah (harus 0)',
    (select count(distinct p.jadwal_id) from keu_v_kk_periksa p join keu_revisi_jadwal j on j.id = p.jadwal_id
     where p.tingkat = 'merah' and j.status in ('diterapkan','sah'))::text
  union all select 10, 'info: jadwal berstatus dibuka saat ini (biasanya 0 atau 1)',
    (select count(*) from keu_revisi_jadwal where status = 'dibuka')::text
  union all select 11, 'parameter Master kertas kerja (faktor_kebutuhan / toleransi_cukup)',
    (select string_agg(kode || '=' || nilai::text, ' / ' order by kode) from keu_master_param)
  union all select 12, 'info: laporan KPA antre', (select count(*) from keu_laporan_kpa where status = 'antre')::text
  union all select 13, 'info: rincian RAB yang jadwalnya tidak sama dengan jumlah', (select count(*) from keu_v_rab_jadwal_beda)::text
)
select urut, nama, hasil from cek order by urut;
