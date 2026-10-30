-- 20261025zk  Cek kesehatan Tautan kegiatan, usulan penugasan, bahan pelaksanaan (HANYA MEMBACA; jalankan sesudah zj).
-- Semua baris dengan "p0" harus 0. Baris "info" hanya keterangan.
with
tabel as (select unnest(array['keu_ident_kegiatan']) n),
tampilan as (select unnest(array['keu_v_ident_kegiatan','keu_v_kegiatan_calon']) n),
fungsi as (select unnest(array['keu_ident_lihat','keu_norm_nama','keu_ident_kegiatan_tautkan','keu_ident_kegiatan_lepas','keu_usulan_penugasan','keu_usulan_terapkan','keu_pelaksanaan_bahan']) n)
select 'p0' as jenis, 'tabel tidak ada' as cek, count(*)::text as nilai from tabel t where to_regclass('public.'||t.n) is null
union all select 'p0', 'RLS belum aktif', count(*)::text from tabel t join pg_class c on c.oid = to_regclass('public.'||t.n) where not c.relrowsecurity
union all select 'p0', 'tampilan tidak ada', count(*)::text from tampilan t where to_regclass('public.'||t.n) is null
union all select 'p0', 'tampilan bukan security_invoker', count(*)::text from tampilan t join pg_class c on c.oid = to_regclass('public.'||t.n)
   where not coalesce((select 'security_invoker=true' = any(c.reloptions)), false)
union all select 'p0', 'anon/authenticated punya akses tabel/tampilan', count(*)::text
   from (select n from tabel union all select n from tampilan) x
   where has_table_privilege('anon', 'public.'||x.n, 'select') or has_table_privilege('authenticated', 'public.'||x.n, 'select')
      or has_table_privilege('anon', 'public.'||x.n, 'insert,update,delete') or has_table_privilege('authenticated', 'public.'||x.n, 'insert,update,delete')
union all select 'p0', 'service_role tak bisa membaca tampilan', count(*)::text from tampilan x where not has_table_privilege('service_role', 'public.'||x.n, 'select')
union all select 'p0', 'fungsi tidak ada', count(*)::text from fungsi f where not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = f.n)
union all select 'p0', 'fungsi bisa dipanggil anon/authenticated', count(*)::text
   from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in (select n from fungsi)
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'p0', 'fungsi tulis/baca belum ada di daftar izin keu_jalankan', count(*)::text
   from (select unnest(array['keu_ident_kegiatan_tautkan','keu_ident_kegiatan_lepas','keu_usulan_penugasan','keu_usulan_terapkan','keu_pelaksanaan_bahan']) n) f
   where position(f.n in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'keu_jalankan' limit 1)) = 0
union all select 'p0', 'jenis notifikasi penugasan_diterapkan belum diizinkan', (1 - count(*))::text
   from pg_constraint c where c.conrelid = 'public.keu_notifikasi'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%penugasan_diterapkan%'
union all select 'p0', 'penjaga tulis tabel tautan belum terpasang', (1 - count(*))::text from pg_trigger where tgrelid = 'public.keu_ident_kegiatan'::regclass and tgname = 'keu_t1_jaga'
union all select 'p0', 'indeks unik tautan aktif belum ada', (1 - count(*))::text from pg_indexes where schemaname = 'public' and indexname = 'keu_ident_kegiatan_aktif_uq'
union all select 'p0', 'tautan aktif ganda untuk satu pasangan', count(*)::text from (select 1 from keu_ident_kegiatan where dilepas_at is null group by ident_id, kegiatan_id having count(*) > 1) z
union all select 'p0', 'tautan ke identifikasi yang belum sah', count(*)::text from keu_ident_kegiatan t join keu_ident i on i.id = t.ident_id where i.ver < 1
union all select 'info', 'tautan aktif', count(*)::text from keu_ident_kegiatan where dilepas_at is null
union all select 'info', 'tautan yang dilepas', count(*)::text from keu_ident_kegiatan where dilepas_at is not null
union all select 'info', 'tautan aktif yang tidak disarankan (kode RO beda)', count(*)::text from keu_ident_kegiatan where dilepas_at is null and not disarankan
union all select 'info', 'identifikasi sah tanpa tautan kegiatan', count(*)::text from keu_ident i where i.ver >= 1 and i.status <> 'dibatalkan' and not exists (select 1 from keu_ident_kegiatan t where t.ident_id = i.id and t.dilepas_at is null)
union all select 'info', 'penugasan bersumber lanjutan', count(*)::text from sigap_penugasan where sumber like 'lanjutan:%'
order by 1, 2;
