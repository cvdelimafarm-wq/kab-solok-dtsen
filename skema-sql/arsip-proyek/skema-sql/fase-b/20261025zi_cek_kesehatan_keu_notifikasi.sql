-- 20261025zi  Cek kesehatan Notifikasi, keputusan KPA/pengecualian, dan pintu hilir (HANYA MEMBACA; jalankan sesudah zh).
-- Semua baris dengan "p0" harus 0. Baris "info" hanya keterangan.
with
tabel as (select unnest(array['keu_notifikasi','keu_pengecualian']) n),
tampilan as (select unnest(array['keu_v_pengecualian','keu_v_ident_acuan']) n),
fungsi as (select unnest(array['keu_penerima','keu_notif_kirim','keu_lanjutan_versi_notif','keu_lembar_menunggu_notif','keu_pengecualian_ajukan','keu_pengecualian_putus','keu_pengecualian_tarik','keu_notifikasi_saya','keu_notifikasi_tandai']) n)
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
   from (select unnest(array['keu_notifikasi_saya','keu_notifikasi_tandai','keu_pengecualian_ajukan','keu_pengecualian_putus','keu_pengecualian_tarik']) n) f
   where position(f.n in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'keu_jalankan' limit 1)) = 0
union all select 'p0', 'pemicu notifikasi belum terpasang', (2 - count(*))::text from pg_trigger where tgname = 'keu_t5_notif' and tgrelid in ('public.keu_ident_lanjutan_versi'::regclass, 'public.keu_kebijakan_lembar'::regclass)
union all select 'p0', 'keputusan diputus tanpa pemutus', count(*)::text from keu_pengecualian where (status in ('disetujui','ditolak')) <> (diputus_oleh is not null)
union all select 'p0', 'keputusan sesudah H-15 ganda untuk satu versi', count(*)::text from (select 1 from keu_pengecualian where jenis = 'perubahan_h15' group by ident_id, lanjutan_ver having count(*) > 1) z
union all select 'p0', 'versi lanjutan sesudah H-15 tanpa keputusan KPA', count(*)::text from keu_ident_lanjutan_versi v where v.pasca_h15 and not exists (select 1 from keu_pengecualian x where x.ident_id = v.ident_id and x.jenis = 'perubahan_h15' and x.lanjutan_ver = v.ver)
union all select 'p0', 'notifikasi untuk akun yang tidak ada', count(*)::text from keu_notifikasi n where not exists (select 1 from sigap_akun a where a.id = n.akun_id)
union all select 'info', 'peran Bendahara (BEND) aktif', count(distinct akun_id)::text from keu_penugasan where peran_kode = 'BEND' and dibatalkan_at is null and masa @> current_date
union all select 'info', 'RO yang punya PBJ aktif', count(distinct ro_kode)::text from keu_penugasan where peran_kode = 'PBJ' and dibatalkan_at is null and masa @> current_date
union all select 'info', 'notifikasi belum dibaca', count(*)::text from keu_notifikasi where dibaca_at is null
union all select 'info', 'keputusan KPA menunggu', count(*)::text from keu_pengecualian where status = 'diajukan'
union all select 'info', 'identifikasi di pintu hilir', count(*)::text from keu_v_ident_acuan
order by 1, 2;
