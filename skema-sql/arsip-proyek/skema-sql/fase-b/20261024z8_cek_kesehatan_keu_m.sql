-- =====================================================================
-- 20261024z8_cek_kesehatan_keu_m.sql  (HANYA MEMBACA; jalankan sesudah migrasi m)
-- Baris P0 harus 0.
-- =====================================================================
with cek(urut, nama, hasil) as (
  select 1, 'P0 tampilan keu_v_penugasan_ro belum ada (harus 0)',
    (select case when to_regclass('public.keu_v_penugasan_ro') is null then 1 else 0 end)::text
  union all select 2, 'P0 keu_v_penugasan_ro bukan security_invoker (harus 0)',
    (select count(*) from pg_class c where c.relname = 'keu_v_penugasan_ro' and c.relnamespace = 'public'::regnamespace
       and not coalesce('security_invoker=true' = any (c.reloptions), false))::text
  union all select 3, 'P0 keu_v_penugasan_ro terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_class c where c.relname = 'keu_v_penugasan_ro' and c.relnamespace = 'public'::regnamespace
       and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT')))::text
  union all select 4, 'P0 service_role tidak boleh membaca keu_v_penugasan_ro (harus 0)',
    (select count(*) from pg_class c where c.relname = 'keu_v_penugasan_ro' and c.relnamespace = 'public'::regnamespace
       and not has_table_privilege('service_role', c.oid, 'SELECT'))::text
  union all select 5, 'info jumlah penugasan aktif hari ini pada tampilan',
    (select count(*) from keu_v_penugasan_ro where aktif_hari_ini)::text
  union all select 6, 'info jumlah RO aktif tanpa ketua tim aktif',
    (select count(*) from keu_ro r where r.aktif and not exists (select 1 from keu_v_penugasan_ro v where v.ro_kode = r.kode and v.peran_kode = 'KETUA' and v.aktif_hari_ini))::text
)
select urut, nama, hasil from cek order by urut;
