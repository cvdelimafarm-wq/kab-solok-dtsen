-- =====================================================================
-- 20261024z4_cek_kesehatan_keu_i.sql  (HANYA MEMBACA; jalankan sesudah migrasi i)
-- Baris P0 harus 0. Baris "info" hanya informasi.
-- =====================================================================
with daftar(nama) as (values ('keu_adm_peta'),('keu_adm_dok'),('keu_adm_riwayat')),
cek(urut, nama, hasil) as (
  select 1, 'P0 tabel i yang belum ada (harus 0)',
    (select count(*) from daftar where to_regclass('public.' || nama) is null)::text
  union all select 2, 'P0 tabel i tanpa RLS atau terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from daftar d join pg_class c on c.oid = to_regclass('public.' || d.nama)
     where not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))::text
  union all select 3, 'P0 tabel i tanpa trigger penjaga (harus 0)',
    (select count(*) from daftar d where to_regclass('public.' || d.nama) is not null
       and not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.' || d.nama) and not t.tgisinternal))::text
  union all select 4, 'P0 view administrasi terbuka bagi anon/authenticated atau tanpa security_invoker (harus 0)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'keu\_v\_adm\_%'
       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
            or coalesce(c.reloptions::text, '') not like '%security_invoker=true%'))::text
  union all select 5, 'P0 fungsi administrasi terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'keu\_adm\_%'
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))::text
  union all select 6, 'P0 dokumen terverifikasi oleh pengunggahnya sendiri tanpa menjadi PPK saat itu (harus 0)',
    (select count(*) from keu_adm_dok a
     where a.status = 'terverifikasi' and a.diverifikasi_oleh = a.diunggah_oleh
       and not exists (select 1 from keu_penugasan t where t.akun_id = a.diverifikasi_oleh and t.peran_kode = 'PPK'
                       and t.masa @> a.diverifikasi_at::date))::text
  union all select 7, 'P0 catatan administrasi tanpa riwayat (harus 0)',
    (select count(*) from keu_adm_dok a where not exists (select 1 from keu_adm_riwayat r where r.adm_id = a.id))::text
  union all select 8, 'P0 lebih dari satu pengaturan lembar aktif untuk satu kunci (harus 0)',
    (select count(*) from (select kunci_stabil from keu_adm_peta where dibatalkan_at is null group by 1 having count(*) > 1) x)::text
  union all select 9, 'info: item POK berlaku tanpa lembar dokumen (tambahkan pola/akun di Master)',
    (select count(*) from keu_v_adm_lembar where sumber is null)::text
  union all select 10, 'info: catatan administrasi yang kuncinya tidak ada lagi pada POK berlaku (yatim)',
    (select count(*) from keu_adm_dok a
     where not exists (select 1 from keu_pok_detail d join keu_pok_versi v on v.id = d.versi_id and v.status = 'berlaku'
                       where d.kunci_stabil = keu_kunci_resolusi(a.kunci_stabil)))::text
  union all select 11, 'info: catatan belum / draf / terunggah / terverifikasi',
    (select count(*) filter (where status = 'belum') || ' / ' || count(*) filter (where status = 'draf') || ' / '
         || count(*) filter (where status = 'terunggah') || ' / ' || count(*) filter (where status = 'terverifikasi') from keu_adm_dok)
  union all select 12, 'info: item POK berlaku / dokumen yang harus dilengkapi / terverifikasi',
    (select coalesce(sum(n_item), 0) || ' / ' || coalesce(sum(n_dok), 0) || ' / ' || coalesce(sum(n_terverifikasi), 0) from keu_v_adm_ringkas)
  union all select 13, 'info: jumlah tabel keu_ (harus 48 sesudah a-f, h, i)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'keu\_%')::text
)
select urut, nama, hasil from cek order by urut;
