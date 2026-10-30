-- =====================================================================
-- 20261024z7_cek_kesehatan_keu_l.sql  (HANYA MEMBACA; jalankan sesudah migrasi l)
-- Baris P0 harus 0.
-- =====================================================================
with cek(urut, nama, hasil) as (
  select 1, 'P0 fungsi keu_tulis belum ada (harus 0)',
    (select case when to_regprocedure('public.keu_tulis(bigint,text,text,jsonb,jsonb)') is null then 1 else 0 end)::text
  union all select 2, 'P0 keu_tulis terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_proc p where p.proname = 'keu_tulis'
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))::text
  union all select 3, 'P0 keu_tulis bukan security definer atau tanpa search_path tetap (harus 0)',
    (select count(*) from pg_proc p where p.proname = 'keu_tulis' and (not p.prosecdef or coalesce(p.proconfig::text, '') not like '%search_path%'))::text
  union all select 4, 'P0 tabel keu_ tanpa penjaga trigger sama sekali (gerbang tulis bergantung pada penjaga; harus 0)',
    (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'keu\_%' and c.relname not like '%\_riwayat'
       and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal))::text
  union all select 5, 'P0 keu_jalankan belum ada, terbuka bagi anon/authenticated, atau bukan security definer (harus 0)',
    (select case when to_regprocedure('public.keu_jalankan(bigint,text,jsonb)') is null then 1 else
       (select count(*) from pg_proc p where p.proname = 'keu_jalankan'
          and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE') or not p.prosecdef)) end)::text
)
select urut, nama, hasil from cek order by urut;
