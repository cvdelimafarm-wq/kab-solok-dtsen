-- =====================================================================
-- 20261024z5_cek_kesehatan_keu_j.sql  (HANYA MEMBACA; jalankan sesudah migrasi j)
-- Baris P0 harus 0. Baris "info" hanya informasi.
-- =====================================================================
with daftar(nama) as (values ('keu_tambahan_pagu'),('keu_kekurangan'),('keu_kekurangan_putus')),
cek(urut, nama, hasil) as (
  select 1, 'P0 tabel j yang belum ada (harus 0)',
    (select count(*) from daftar where to_regclass('public.' || nama) is null)::text
  union all select 2, 'P0 tabel j tanpa RLS atau terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from daftar d join pg_class c on c.oid = to_regclass('public.' || d.nama)
     where not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))::text
  union all select 3, 'P0 tabel j tanpa trigger penjaga (harus 0)',
    (select count(*) from daftar d where to_regclass('public.' || d.nama) is not null
       and not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.' || d.nama) and not t.tgisinternal))::text
  union all select 4, 'P0 view kekurangan terbuka bagi anon/authenticated atau tanpa security_invoker (harus 0)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and (c.relname like 'keu\_v\_kekurangan%' or c.relname = 'keu_v_tambahan_pagu')
       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
            or coalesce(c.reloptions::text, '') not like '%security_invoker=true%'))::text
  union all select 5, 'P0 fungsi kekurangan terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'keu\_kekurangan\_%' or p.proname like 'keu\_tambahan\_%' or p.proname like 'keu\_kek\_%')
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))::text
  union all select 6, 'P0 tambahan diputus yang total dipenuhinya tidak sama dengan jumlah catatan dipenuhi (harus 0)',
    (select count(*) from keu_tambahan_pagu t
     where t.status = 'diputus'
       and t.dipenuhi_total <> coalesce((select sum(k.jumlah) from keu_kekurangan k where k.tambahan_id = t.id and k.status = 'dipenuhi'), 0))::text
  union all select 7, 'P0 catatan dipenuhi atau ditolak tanpa baris keputusan yang sesuai (harus 0)',
    (select count(*) from keu_kekurangan k
     where k.status in ('dipenuhi','ditolak')
       and not exists (select 1 from keu_kekurangan_putus x where x.kekurangan_id = k.id and x.tambahan_id = k.tambahan_id
                       and x.keputusan = case k.status when 'dipenuhi' then 'penuhi' else 'tolak' end))::text
  union all select 8, 'P0 catatan terbuka padahal tambahan RO-nya sudah diputus dan mencakupnya (harus 0)',
    (select count(*) from keu_kekurangan k join keu_kekurangan_putus x on x.kekurangan_id = k.id
     join keu_tambahan_pagu t on t.id = x.tambahan_id
     where k.status = 'tercatat' and x.keputusan <> 'tunda' and t.status = 'diputus')::text
  union all select 9, 'P0 catatan ditautkan ke item RAB di RO atau akun yang berbeda (harus 0)',
    (select count(*) from keu_kekurangan k join keu_rab_item i on i.id = k.rab_item_id join keu_rab r on r.id = i.rab_id
     where r.ro_kode <> k.ro_kode or i.akun_kode <> k.akun_kode)::text
  union all select 10, 'info: catatan terbuka / jumlah (Rp)',
    (select count(*) || ' / ' || coalesce(sum(jumlah), 0) from keu_kekurangan where status in ('tercatat','ditunda'))
  union all select 11, 'info: catatan ditunda / dipenuhi / ditolak / ditarik',
    (select count(*) filter (where status = 'ditunda') || ' / ' || count(*) filter (where status = 'dipenuhi') || ' / '
         || count(*) filter (where status = 'ditolak') || ' / ' || count(*) filter (where status = 'ditarik') from keu_kekurangan)
  union all select 12, 'info: tambahan pagu terbuka (menunggu keputusan ketua tim) / jumlah (Rp)',
    (select count(*) || ' / ' || coalesce(sum(jumlah), 0) from keu_tambahan_pagu where status = 'terbuka')
  union all select 13, 'info: catatan dipenuhi yang belum ditautkan ke item RAB',
    (select count(*) from keu_kekurangan where status = 'dipenuhi' and rab_item_id is null)::text
  union all select 14, 'info: jumlah tabel keu_ (harus 51 sesudah a-f, h, i, j)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'keu\_%')::text
)
select urut, nama, hasil from cek order by urut;
