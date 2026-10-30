-- =====================================================================
-- 20261024z6_cek_kesehatan_keu_k.sql  (HANYA MEMBACA; jalankan sesudah migrasi k)
-- Baris P0 harus 0. Baris "info" hanya informasi.
-- =====================================================================
with daftar(nama) as (values ('keu_struktur_usulan'),('keu_struktur_usulan_riwayat')),
cek(urut, nama, hasil) as (
  select 1, 'P0 tabel k yang belum ada (harus 0)',
    (select count(*) from daftar where to_regclass('public.' || nama) is null)::text
  union all select 2, 'P0 tabel k tanpa RLS atau terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from daftar d join pg_class c on c.oid = to_regclass('public.' || d.nama)
     where not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))::text
  union all select 3, 'P0 tabel k tanpa trigger penjaga (harus 0)',
    (select count(*) from daftar d where to_regclass('public.' || d.nama) is not null
       and not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.' || d.nama) and not t.tgisinternal))::text
  union all select 4, 'P0 view struktur terbuka bagi anon/authenticated atau tanpa security_invoker (harus 0)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v' and (c.relname like 'keu\_v\_struktur%' or c.relname in ('keu_v_pok_jalur_node','keu_v_ro_sementara'))
       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
            or coalesce(c.reloptions::text, '') not like '%security_invoker=true%'))::text
  union all select 5, 'P0 fungsi struktur terbuka bagi anon/authenticated (harus 0)',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'keu\_struktur\_%' or p.proname like 'keu\_str\_%')
       and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))::text
  union all select 6, 'P0 usulan aktif tanpa kode resmi / cara padan, atau bukan aktif tetapi berkode resmi (harus 0)',
    (select count(*) from keu_struktur_usulan u
     where (u.status = 'aktif') <> (u.kode_resmi is not null and u.cara_padan is not null))::text
  union all select 7, 'P0 usulan berinduk usulan yang sudah dibatalkan/ditolak padahal usulan itu masih berjalan (harus 0)',
    (select count(*) from keu_struktur_usulan u join keu_struktur_usulan p on p.id = u.induk_usulan_id
     where p.status in ('dibatalkan','ditolak_pusat') and u.status not in ('dibatalkan','ditolak_pusat'))::text
  union all select 8, 'P0 RO sementara T-nnn aktif tanpa usulan RO yang sah/diusulkan/aktif/perlu dipadankan, kecuali RO lama (harus 0)',
    (select count(*) from keu_ro r join keu_struktur_usulan u on u.kode_sementara = r.kode and u.level = 'ro'
     where r.aktif and u.status in ('draf','dikembalikan','menunggu_ketua','menunggu_ppk','dibatalkan','ditolak_pusat'))::text
  union all select 9, 'info: usulan per status (draf / menunggu / sah / diusulkan / perlu dipadankan / aktif / ditutup)',
    (select count(*) filter (where status in ('draf','dikembalikan')) || ' / '
         || count(*) filter (where status in ('menunggu_ketua','menunggu_ppk')) || ' / '
         || count(*) filter (where status = 'sah') || ' / ' || count(*) filter (where status = 'diusulkan') || ' / '
         || count(*) filter (where status = 'perlu_dipadankan') || ' / ' || count(*) filter (where status = 'aktif') || ' / '
         || count(*) filter (where status in ('dibatalkan','ditolak_pusat')) from keu_struktur_usulan)
  union all select 10, 'info: usulan perlu dipadankan (PPK harus memadankan atau mencatat penolakan pusat)',
    (select count(*) from keu_struktur_usulan where status = 'perlu_dipadankan')::text
  union all select 11, 'info: RO sementara T-nnn aktif yang sudah dipakai RAB / penugasan',
    (select count(*) from keu_v_ro_sementara where aktif and (n_rab + n_penugasan + n_baris_kertas_kerja) > 0)::text
  union all select 12, 'info: jumlah tabel keu_ (harus 53 sesudah a-f, h, i, j, k)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'keu\_%')::text
)
select urut, nama, hasil from cek order by urut;
