-- 20261025zb  Cek kesehatan Identifikasi survei (HANYA MEMBACA; jalankan sesudah za dan zc).
-- Semua baris dengan "p0" harus 0. Baris "info" hanya keterangan.
with
tabel as (select unnest(array['keu_ident','keu_ident_versi','keu_ident_riwayat','keu_ident_paket']) n),
tampilan as (select unnest(array['keu_v_ident','keu_v_ident_sah','keu_v_ident_versi','keu_v_ident_riwayat','keu_v_ident_paket']) n),
fungsi as (select unnest(array['keu_ident_buat','keu_ident_simpan','keu_ident_aksi','keu_ident_h15','keu_ident_hak','keu_ident_paket_atur','keu_ident_jendela']) n)
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
   where s.nspname = 'public' and p.proname in ('keu_ident_buat','keu_ident_simpan','keu_ident_aksi','keu_ident_h15','keu_ident_paket_atur')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'p0', 'fungsi alur belum ada di daftar izin keu_jalankan', count(*)::text
   from (select unnest(array['keu_ident_buat','keu_ident_simpan','keu_ident_aksi','keu_ident_h15','keu_ident_hak','keu_ident_paket_atur']) n) f
   where position(f.n in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'keu_jalankan' limit 1)) = 0
union all select 'p0', 'kewenangan ident_susun/ident_setuju belum ada', (2 - count(*))::text from keu_master_kewenangan where kode in ('ident_susun','ident_setuju')
union all select 'p0', 'peran ident_setuju tidak tepat 3 (PPK, TU, KPA)', abs(3 - count(*))::text from keu_master_kewenangan_peran where kewenangan_kode = 'ident_setuju'
union all select 'p0', 'versi sah tanpa salinan versi', count(*)::text from keu_ident i where i.ver > 0 and not exists (select 1 from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver)
union all select 'p0', 'status sah/revisi tetapi ver = 0', count(*)::text from keu_ident where status in ('sah','revisi') and ver = 0
union all select 'p0', 'menunggu_setuju dengan langkah di luar 0..2', count(*)::text from keu_ident where status = 'menunggu_setuju' and langkah not between 0 and 2
union all select 'p0', 'menunggu_setuju: langkah tidak sama dengan jumlah persetujuan PPK dan TU (zc)', count(*)::text from keu_ident where status = 'menunggu_setuju' and langkah <> (ok_ppk::int + ok_tu::int)
union all select 'p0', 'kolom persetujuan paralel (zc) belum ada', (3 - count(*))::text from information_schema.columns where table_schema = 'public' and table_name = 'keu_ident' and column_name in ('ok_ppk','ok_tu','pasca_h15')
union all select 'p0', 'nama survei kembar (aktif) pada RO yang sama', count(*)::text from (select 1 from keu_ident where status <> 'dibatalkan' group by tahun, ro_kode, lower(btrim(nama)) having count(*) > 1) z
union all select 'info', 'jumlah survei', count(*)::text from keu_ident
union all select 'info', 'survei sah', count(*)::text from keu_ident where status in ('sah','revisi')
union all select 'info', 'menunggu persetujuan', count(*)::text from keu_ident where status in ('menunggu_ketua','menunggu_setuju')
order by 1, 2;
