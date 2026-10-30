-- 20261025zm  Cek kesehatan Gap (peringatan pelaksanaan dan laporan Gap) (HANYA MEMBACA; jalankan sesudah zl).
-- Semua baris dengan "p0" harus 0. Baris "info" hanya keterangan.
with
tabel as (select unnest(array['keu_gap','keu_gap_tanggapan']) n),
tampilan as (select unnest(array['keu_v_gap','keu_v_gap_tanggapan','keu_v_gap_terbaru']) n),
fungsi as (select unnest(array['keu_gap_simpan','keu_gap_tanggapi','keu_gap_periksa','keu_gap_sidik','keu_gap_tetap']) n)
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
union all select 'p0', 'fungsi tulis belum ada di daftar izin keu_jalankan', count(*)::text
   from (select unnest(array['keu_gap_simpan','keu_gap_tanggapi']) n) f
   where position(f.n in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'keu_jalankan' limit 1)) = 0
union all select 'p0', 'penjaga tulis atau penjaga versi belum terpasang', (3 - count(*))::text from pg_trigger where not tgisinternal and tgrelid in ('public.keu_gap'::regclass, 'public.keu_gap_tanggapan'::regclass) and tgname in ('keu_t1_jaga','keu_t2_tetap')
union all select 'p0', 'jenis notifikasi gap belum diizinkan', case when exists (select 1 from pg_constraint c where c.conrelid = 'public.keu_notifikasi'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%gap_keras%' and pg_get_constraintdef(c.oid) like '%gap_akhir%') then '0' else '1' end
union all select 'p0', 'hitungan tingkat tidak cocok dengan isi temuan', count(*)::text from keu_gap g
   where g.n_keras <> (select count(*) from jsonb_array_elements(g.temuan) e where e ->> 'tingkat' = 'keras')
      or g.n_sedang <> (select count(*) from jsonb_array_elements(g.temuan) e where e ->> 'tingkat' = 'sedang')
      or g.n_info <> (select count(*) from jsonb_array_elements(g.temuan) e where e ->> 'tingkat' = 'info')
union all select 'p0', 'nomor versi Gap tidak berurutan', count(*)::text from (select ident_id, count(*) n, max(ver) m from keu_gap group by ident_id) z where z.n <> z.m
union all select 'p0', 'kunci temuan ganda dalam satu versi', count(*)::text from keu_gap g where (select count(distinct e ->> 'kunci') from jsonb_array_elements(g.temuan) e) <> jsonb_array_length(g.temuan)
union all select 'p0', 'tanggapan untuk temuan yang tidak ada', count(*)::text from keu_gap_tanggapan t join keu_gap g on g.id = t.gap_id
   where not exists (select 1 from jsonb_array_elements(g.temuan) e where e ->> 'kunci' = t.kunci)
union all select 'p0', 'tanggapan beralasan tanpa catatan', count(*)::text from keu_gap_tanggapan where status in ('dijelaskan','ditindaklanjuti') and char_length(btrim(catatan)) < 10
union all select 'p0', 'laporan akhir pada identifikasi tanpa lanjutan', count(*)::text from keu_gap g where g.jenis = 'akhir' and not exists (select 1 from keu_ident_lanjutan l where l.ident_id = g.ident_id)
union all select 'info', 'versi Gap tersimpan', count(*)::text from keu_gap
union all select 'info', 'laporan Gap akhir', count(*)::text from keu_gap where jenis = 'akhir'
union all select 'info', 'identifikasi yang versi terbarunya punya temuan keras', count(*)::text from keu_v_gap_terbaru where n_keras > 0
union all select 'info', 'temuan yang sudah ditanggapi', count(*)::text from keu_gap_tanggapan
union all select 'info', 'notifikasi gap belum dibaca', count(*)::text from keu_notifikasi where jenis in ('gap_keras','gap_akhir') and dibaca_at is null
order by 1, 2;
