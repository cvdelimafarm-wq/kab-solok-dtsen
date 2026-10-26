-- 20261026d  Cek kesehatan Delego (HANYA MEMBACA; jalankan sesudah 20261026c).
-- Semua baris dengan "p0" harus 0. Baris "info" hanya keterangan.
with
tabel as (select unnest(array['keu_dlg_delegasi','keu_dlg_laporan','keu_dlg_tanggapan','keu_dlg_pembinaan','keu_dlg_penghargaan','keu_dlg_penilaian']) n),
fungsi as (select unnest(array['keu_dlg_buat','keu_dlg_ubah','keu_dlg_terima','keu_dlg_lapor','keu_dlg_tanggapi','keu_dlg_bina','keu_dlg_bina_tutup','keu_dlg_hargai','keu_dlg_nilai',
                               'keu_dlg_hak','keu_dlg_saya','keu_dlg_bahan','keu_dlg_calon','keu_dlg_hari_ini','keu_dlg_beri','keu_dlg_lihat','keu_dlg_pml','keu_dlg_hk','keu_dlg_notif','keu_dlg_lingkup']) n)
select 'p0' as jenis, 'tabel tidak ada' as cek, count(*)::text as nilai from tabel t where to_regclass('public.'||t.n) is null
union all select 'p0', 'RLS belum aktif', count(*)::text from tabel t join pg_class c on c.oid = to_regclass('public.'||t.n) where not c.relrowsecurity
union all select 'p0', 'anon/authenticated punya akses tabel', count(*)::text from tabel x
   where has_table_privilege('anon', 'public.'||x.n, 'select') or has_table_privilege('authenticated', 'public.'||x.n, 'select')
      or has_table_privilege('anon', 'public.'||x.n, 'insert,update,delete') or has_table_privilege('authenticated', 'public.'||x.n, 'insert,update,delete')
union all select 'p0', 'service_role tak bisa membaca tabel', count(*)::text from tabel x where not has_table_privilege('service_role', 'public.'||x.n, 'select')
union all select 'p0', 'fungsi tidak ada', count(*)::text from fungsi f where not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = f.n)
union all select 'p0', 'fungsi dengan lebih dari satu bentuk (overload)', count(*)::text from (
   select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in (select n from fungsi) group by p.proname having count(*) > 1) z
union all select 'p0', 'fungsi bisa dipanggil anon/authenticated', count(*)::text
   from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in (select n from fungsi)
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'p0', 'fungsi gerbang belum ada di daftar izin keu_jalankan', count(*)::text
   from (select unnest(array['keu_dlg_buat','keu_dlg_ubah','keu_dlg_terima','keu_dlg_lapor','keu_dlg_tanggapi','keu_dlg_bina','keu_dlg_bina_tutup','keu_dlg_hargai','keu_dlg_nilai','keu_dlg_hak','keu_dlg_saya','keu_dlg_bahan','keu_dlg_calon']) n) f
   where position(f.n in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'keu_jalankan' limit 1)) = 0
union all select 'p0', 'penjaga tulis atau jejak belum terpasang', (12 - count(*))::text from pg_trigger
   where not tgisinternal and tgname in ('keu_t1_jaga','keu_t9_jejak')
     and tgrelid in (select to_regclass('public.'||n) from tabel)
union all select 'p0', 'kewenangan delegasi belum ada', (2 - count(*))::text from keu_master_kewenangan where kode in ('delegasi_beri','delegasi_lihat') and aktif
union all select 'p0', 'peran kewenangan delegasi belum lengkap', (7 - count(*))::text from keu_master_kewenangan_peran where kewenangan_kode in ('delegasi_beri','delegasi_lihat')
union all select 'p0', 'jenis notifikasi delegasi belum diizinkan', case when exists (select 1 from pg_constraint c where c.conrelid = 'public.keu_notifikasi'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%delegasi_baru%' and pg_get_constraintdef(c.oid) like '%delegasi_penghargaan%') then '0' else '1' end
union all select 'p0', 'mitra berperan selain PML/PPL', count(*)::text from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun where a.jenis = 'mitra' and d.peran_penerima not in ('pml','ppl')
union all select 'p0', 'tenggat sebelum mulai', count(*)::text from keu_dlg_delegasi where tenggat < mulai
union all select 'p0', 'delegasi batal/ditunda tanpa alasan', count(*)::text from keu_dlg_delegasi where status in ('batal','ditunda') and char_length(btrim(alasan)) < 5
union all select 'p0', 'laporan di luar masa delegasi', count(*)::text from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id where l.tanggal < d.mulai or l.tanggal > d.tenggat
union all select 'p0', 'laporan untuk tanggal mendatang', count(*)::text from keu_dlg_laporan where tanggal > keu_dlg_hari_ini()
union all select 'p0', 'laporan pada delegasi yang pelapornya tidak berhak (bukan penerima, PML, atau pemberi)', count(*)::text
   from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id
   where l.dikirim_oleh is not null and l.dikirim_oleh <> d.penerima_akun and not keu_dlg_beri(l.dikirim_oleh, d.ro_kode)
     and not exists (select 1 from keu_dlg_delegasi x where x.penerima_akun = l.dikirim_oleh and x.peran_penerima = 'pml' and x.ro_kode = d.ro_kode)
union all select 'p0', 'penanda mewakili tidak cocok dengan pengirim', count(*)::text from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id
   where l.dikirim_oleh is not null and ((l.dikirim_oleh = d.penerima_akun) = l.mewakili)
union all select 'p0', 'tanggapan menunjuk laporan milik delegasi lain', count(*)::text from keu_dlg_tanggapan t join keu_dlg_laporan l on l.id = t.laporan_id where l.delegasi_id <> t.delegasi_id
union all select 'p0', 'pembinaan/penghargaan menunjuk delegasi milik orang atau RO lain', (
   (select count(*) from keu_dlg_pembinaan b join keu_dlg_delegasi d on d.id = b.delegasi_id where d.penerima_akun <> b.penerima_akun or d.ro_kode <> b.ro_kode)
 + (select count(*) from keu_dlg_penghargaan h join keu_dlg_delegasi d on d.id = h.delegasi_id where d.penerima_akun <> h.penerima_akun or d.ro_kode <> h.ro_kode))::text
union all select 'p0', 'penerima pembinaan/penghargaan/penilaian sama dengan pencatatnya', (
   (select count(*) from keu_dlg_pembinaan where penerima_akun = dicatat_oleh) + (select count(*) from keu_dlg_penghargaan where penerima_akun = dicatat_oleh)
 + (select count(*) from keu_dlg_penilaian where penerima_akun = dinilai_oleh))::text
union all select 'p0', 'pembinaan ditutup tanpa catatan padahal dibatalkan', count(*)::text from keu_dlg_pembinaan where status = 'dibatalkan' and char_length(btrim(catatan_tutup)) < 5
union all select 'info', 'delegasi (seluruh status)', count(*)::text from keu_dlg_delegasi
union all select 'info', 'delegasi berjalan', count(*)::text from keu_dlg_delegasi where status in ('baru','berjalan')
union all select 'info', 'laporan harian tersimpan', count(*)::text from keu_dlg_laporan
union all select 'info', 'laporan terlambat', count(*)::text from keu_dlg_laporan where terlambat
union all select 'info', 'laporan diwakili', count(*)::text from keu_dlg_laporan where mewakili
union all select 'info', 'pembinaan berjalan', count(*)::text from keu_dlg_pembinaan where status = 'berjalan'
union all select 'info', 'pembinaan langkah 5 (rujukan)', count(*)::text from keu_dlg_pembinaan where langkah = 5
union all select 'info', 'penghargaan dan penilaian', ((select count(*) from keu_dlg_penghargaan) || ' dan ' || (select count(*) from keu_dlg_penilaian))
union all select 'info', 'notifikasi delegasi belum dibaca', count(*)::text from keu_notifikasi where jenis like 'delegasi\_%' and dibaca_at is null
order by 1, 2;
