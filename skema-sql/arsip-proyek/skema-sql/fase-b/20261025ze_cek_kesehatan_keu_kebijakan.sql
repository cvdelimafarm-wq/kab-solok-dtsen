-- 20261025ze  Cek kesehatan Lembar kebijakan manajemen tim (HANYA MEMBACA; jalankan sesudah zd).
-- Semua baris dengan "p0" harus 0. Baris "info" hanya keterangan.
with
tabel as (select unnest(array['keu_kebijakan_lembar','keu_kebijakan_pengesah','keu_kebijakan_riwayat']) n),
tampilan as (select unnest(array['keu_v_kebijakan','keu_v_kebijakan_berlaku','keu_v_kebijakan_pengesah','keu_v_kebijakan_riwayat']) n),
fungsi as (select unnest(array['keu_kebijakan_buat','keu_kebijakan_simpan','keu_kebijakan_aksi','keu_kebijakan_hak','keu_kebijakan_periksa','keu_kebijakan_lengkap']) n)
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
union all select 'p0', 'fungsi alur bisa dipanggil anon/authenticated', count(*)::text
   from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('keu_kebijakan_buat','keu_kebijakan_simpan','keu_kebijakan_aksi','keu_kebijakan_hak','keu_kebijakan_lengkap','keu_kebijakan_periksa')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'p0', 'fungsi alur belum ada di daftar izin keu_jalankan', count(*)::text
   from (select unnest(array['keu_kebijakan_buat','keu_kebijakan_simpan','keu_kebijakan_aksi','keu_kebijakan_hak']) n) f
   where position(f.n in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'keu_jalankan' limit 1)) = 0
union all select 'p0', 'kewenangan kebijakan_susun/kebijakan_setuju belum ada', (2 - count(*))::text from keu_master_kewenangan where kode in ('kebijakan_susun','kebijakan_setuju')
union all select 'p0', 'peran kebijakan_susun tidak tepat 3 (PPK, RENC, ADMIN)', abs(3 - count(*))::text from keu_master_kewenangan_peran where kewenangan_kode = 'kebijakan_susun'
union all select 'p0', 'lebih dari satu lembar berlaku pada satu tahun', count(*)::text from (select 1 from keu_kebijakan_lembar where status = 'berlaku' group by tahun having count(*) > 1) z
union all select 'p0', 'lebih dari satu lembar terbuka (draf/menunggu) pada satu tahun', count(*)::text from (select 1 from keu_kebijakan_lembar where status in ('draf','menunggu') group by tahun having count(*) > 1) z
union all select 'p0', 'lembar berlaku/arsip/menunggu yang isinya tidak lolos pemeriksa', count(*)::text from keu_kebijakan_lembar where status in ('berlaku','arsip','menunggu') and cardinality(keu_kebijakan_periksa(isi)) > 0
union all select 'p0', 'lembar berlaku tanpa metadata rapat (tanggal, nomor, tujuan)', count(*)::text from keu_kebijakan_lembar where status in ('berlaku','arsip') and (tanggal_rapat is null or char_length(nomor_notulen) < 3 or char_length(tujuan) < 10)
union all select 'p0', 'lembar berlaku tetapi pengesahnya belum lengkap', count(*)::text from keu_kebijakan_lembar l where status = 'berlaku' and not keu_kebijakan_lengkap(l.id)
union all select 'p0', 'lembar menunggu tanpa daftar pengesah', count(*)::text from keu_kebijakan_lembar l where status = 'menunggu' and not exists (select 1 from keu_kebijakan_pengesah p where p.lembar_id = l.id and p.aktif)
union all select 'info', 'jumlah lembar', count(*)::text from keu_kebijakan_lembar
union all select 'info', 'lembar berlaku', count(*)::text from keu_kebijakan_lembar where status = 'berlaku'
union all select 'info', 'lembar menunggu pengesahan', count(*)::text from keu_kebijakan_lembar where status = 'menunggu'
order by 1, 2;
