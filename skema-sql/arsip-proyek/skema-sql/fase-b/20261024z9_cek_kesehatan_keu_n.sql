-- =====================================================================
-- 20261024z9_cek_kesehatan_keu_n.sql  (HANYA MEMBACA; jalankan sesudah migrasi n)
-- Baris P0 harus 0.
-- =====================================================================
with t(nama) as (values ('keu_v_rab_baris'), ('keu_v_rab_jejak')),
cek(urut, nama, hasil) as (
  select 1, 'P0 tampilan n belum ada (harus 0)', (select count(*) from t where to_regclass('public.' || t.nama) is null)::text
  union all select 2, 'P0 tampilan n bukan security_invoker (harus 0)',
    (select count(*) from t join pg_class c on c.relname = t.nama and c.relnamespace = 'public'::regnamespace
       where not coalesce('security_invoker=true' = any (c.reloptions), false))::text
  union all select 3, 'P0 tampilan n terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from t join pg_class c on c.relname = t.nama and c.relnamespace = 'public'::regnamespace
       where has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))::text
  union all select 4, 'P0 service_role tidak boleh membaca tampilan n (harus 0)',
    (select count(*) from t join pg_class c on c.relname = t.nama and c.relnamespace = 'public'::regnamespace
       where not has_table_privilege('service_role', c.oid, 'SELECT'))::text
  union all select 5, 'info jumlah RAB / rincian / jejak',
    (select count(*) from keu_rab)::text || ' / ' || (select count(*) from keu_v_rab_baris)::text || ' / ' || (select count(*) from keu_v_rab_jejak)::text
)
select urut, nama, hasil from cek order by urut;
