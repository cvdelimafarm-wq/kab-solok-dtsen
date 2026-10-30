-- 20261025zg  Cek kesehatan Identifikasi lanjutan (HANYA MEMBACA; jalankan sesudah zf).
-- Semua baris dengan "p0" harus 0. Baris "info" hanya keterangan.
with
tabel as (select unnest(array['keu_ident_lanjutan','keu_ident_lanjutan_versi','keu_ident_dokumen']) n),
tampilan as (select unnest(array['keu_v_ident_lanjutan','keu_v_ident_lanjutan_versi','keu_v_ident_petugas','keu_v_ident_dokumen','keu_v_ident_ttd']) n),
fungsi as (select unnest(array['keu_lanjutan_tgl','keu_lanjutan_teks','keu_lanjutan_periksa','keu_lanjutan_status','keu_lanjutan_simpan','keu_ident_dokumen_simpan']) n)
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
   from (select unnest(array['keu_lanjutan_simpan','keu_ident_dokumen_simpan']) n) f
   where position(f.n in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'keu_jalankan' limit 1)) = 0
union all select 'p0', 'lanjutan dengan isi tidak lolos pemeriksa', count(*)::text from keu_ident_lanjutan where status = 'final' and cardinality(keu_lanjutan_periksa(isi)) > 0
union all select 'p0', 'status lanjutan tidak sesuai penentu status', count(*)::text from keu_ident_lanjutan where status <> keu_lanjutan_status(isi)
union all select 'p0', 'lanjutan tanpa salinan versi terakhir', count(*)::text from keu_ident_lanjutan l where not exists (select 1 from keu_ident_lanjutan_versi v where v.ident_id = l.ident_id and v.ver = l.ver)
union all select 'p0', 'salinan versi tidak sama dengan isi terkini', count(*)::text from keu_ident_lanjutan l join keu_ident_lanjutan_versi v on v.ident_id = l.ident_id and v.ver = l.ver where v.isi is distinct from l.isi
union all select 'p0', 'nomor versi lanjutan berlubang', count(*)::text from (select ident_id from keu_ident_lanjutan_versi group by ident_id having max(ver) <> count(*)) z
union all select 'p0', 'dokumen terbit tanpa nomor/tanggal/penandatangan/jabatan', count(*)::text from keu_ident_dokumen where status = 'terbit' and (char_length(nomor) < 3 or tanggal is null or ttd_akun is null or char_length(ttd_jabatan) < 2 or terbit_at is null)
union all select 'p0', 'dokumen terbit tanpa versi lanjutan', count(*)::text from keu_ident_dokumen where status = 'terbit' and lanjutan_ver is null
union all select 'p0', 'dokumen tanpa lanjutan induk', count(*)::text from keu_ident_dokumen d where not exists (select 1 from keu_ident_lanjutan l where l.ident_id = d.ident_id)
union all select 'info', 'jumlah lanjutan', count(*)::text from keu_ident_lanjutan
union all select 'info', 'lanjutan berstatus final', count(*)::text from keu_ident_lanjutan where status = 'final'
union all select 'info', 'lanjutan diubah sesudah H-15', count(*)::text from keu_ident_lanjutan where pasca_h15
union all select 'info', 'dokumen konsep', count(*)::text from keu_ident_dokumen where status = 'konsep'
union all select 'info', 'dokumen terbit', count(*)::text from keu_ident_dokumen where status = 'terbit'
order by 1, 2;
