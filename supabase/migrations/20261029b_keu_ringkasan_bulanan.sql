-- 20261029b: Ringkasan bulanan ukuran keberhasilan (manajemen, pembinaan, kemudahan kerja) + rincian per pegawai.
-- Hanya BACA. Dipanggil lewat service role; tidak ada data baru yang ditulis.
-- Pemakaian: select * from keu_ringkasan_bulanan('2026-10-01'); select * from keu_ringkasan_pegawai('2026-10-01');
-- Aplikasi memanggilnya lewat /api/sigap/delego/ringkasan (hanya akun pemberi delegasi semua RO).
create or replace function public.keu_ringkasan_bulanan(p_bulan date)
returns table(urut int, bidang text, kode text, ukuran text, nilai numeric, satuan text, keterangan text)
language sql stable security definer set search_path = public
as $fn$
with b as (select date_trunc('month', p_bulan::date)::date as awal, (date_trunc('month', p_bulan::date) + interval '1 month - 1 day')::date as akhir),
dl as (select d.* from keu_dlg_delegasi d, b where d.tenggat between b.awal and b.akhir),
lp as (select l.* from keu_dlg_laporan l, b where l.tanggal between b.awal and b.akhir),
hs as (select h.* from keu_dlg_hasil h, b where h.ditinjau_at >= b.awal and h.ditinjau_at < b.akhir + 1),
pn as (select p.* from keu_dlg_penilaian p, b where p.periode between b.awal and b.akhir),
pb as (select p.* from keu_dlg_pembinaan p, b where p.dibuat_at >= b.awal and p.dibuat_at < b.akhir + 1),
pr as (select r.* from sigap_pelatihan_presensi r, b where r.at >= b.awal and r.at < b.akhir + 1 and r.diterima)
select * from (
 select 1 urut,'Manajemen & strategi' bidang,'M1' kode,'Delegasi jatuh tempo bulan ini (tanpa yang batal)' ukuran,(select count(*) from dl where status<>'batal')::numeric nilai,'delegasi' satuan,'' keterangan
 union all select 2,'Manajemen & strategi','M2','Selesai tanpa pernah telat',(select round(100.0*count(*) filter (where status='selesai' and telat_diberi_at is null)/nullif(count(*),0),1) from dl where status<>'batal'),'%','Dari delegasi M1; telat dilihat dari penanda telat (cek aturan)'
 union all select 3,'Manajemen & strategi','M3','Laporan harian terlambat',(select round(100.0*count(*) filter (where terlambat)/nullif(count(*),0),1) from lp),'%','Dari seluruh laporan harian bulan ini'
 union all select 4,'Manajemen & strategi','M4','Total poin terlapor',(select coalesce(sum(poin),0) from lp),'poin',''
 union all select 5,'Manajemen & strategi','M5','Pegawai yang melapor',(select count(distinct d.penerima_akun) from lp join keu_dlg_delegasi d on d.id=lp.delegasi_id),'orang','Minimal satu laporan dalam bulan'
 union all select 6,'Pembinaan pegawai','P1','Rata-rata nilai kualitas',(select round(avg(kualitas),2) from pn),'skor',(select count(*)||' penilaian' from pn)
 union all select 7,'Pembinaan pegawai','P2','Rata-rata nilai kepatuhan',(select round(avg(kepatuhan),2) from pn),'skor',''
 union all select 8,'Pembinaan pegawai','P3','Pembinaan dibuka',(select count(*) from pb),'kasus',(select count(*) filter (where status='selesai')||' sudah selesai' from pb)
 union all select 9,'Pembinaan pegawai','P4','Penghargaan dicatat',(select count(*) from keu_dlg_penghargaan g, b where g.dibuat_at >= b.awal and g.dibuat_at < b.akhir + 1),'catatan',''
 union all select 10,'Pembinaan pegawai','P5','Presensi pelatihan tepat waktu',(select round(100.0*count(*) filter (where not coalesce(terlambat,false))/nullif(count(*),0),1) from pr),'%',(select count(*)||' presensi diterima' from pr)
 union all select 11,'Kemudahan kerja','K1','Hasil kerja diminta revisi',(select round(100.0*count(*) filter (where status='revisi')/nullif(count(*) filter (where status in ('revisi','diterima')),0),1) from hs),'%','Dari hasil yang sudah ditinjau; makin kecil makin jelas penugasannya'
 union all select 12,'Kemudahan kerja','K2','Delegasi ditunda atau batal',(select round(100.0*count(*) filter (where status in ('ditunda','batal'))/nullif(count(*),0),1) from dl),'%','Dari delegasi jatuh tempo bulan ini'
 union all select 13,'Kemudahan kerja','K3','Laporan yang memuat kendala',(select round(100.0*count(*) filter (where nullif(btrim(kendala),'') is not null)/nullif(count(*),0),1) from lp),'%','Sinyal hambatan yang perlu dibenahi'
) x order by urut
$fn$;

revoke all on function public.keu_ringkasan_bulanan(date) from public, anon, authenticated;
grant execute on function public.keu_ringkasan_bulanan(date) to service_role;

create or replace function public.keu_ringkasan_pegawai(p_bulan date)
returns table(akun_id bigint, nama text, delegasi int, selesai int, laporan int, terlambat int, poin numeric, kualitas numeric, kepatuhan numeric)
language sql stable security definer set search_path = public
as $fn$
with b as (select date_trunc('month', p_bulan)::date as awal, (date_trunc('month', p_bulan) + interval '1 month - 1 day')::date as akhir),
dl as (select d.id, d.penerima_akun, d.status from keu_dlg_delegasi d, b where d.tenggat between b.awal and b.akhir),
lp as (select d.penerima_akun, l.poin, l.terlambat from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id, b where l.tanggal between b.awal and b.akhir),
pn as (select p.penerima_akun, p.kualitas, p.kepatuhan from keu_dlg_penilaian p, b where p.periode between b.awal and b.akhir),
orang as (select penerima_akun from dl union select penerima_akun from lp union select penerima_akun from pn)
select o.penerima_akun::bigint, a.nama::text,
 (select count(*) from dl where dl.penerima_akun = o.penerima_akun and dl.status <> 'batal')::int,
 (select count(*) from dl where dl.penerima_akun = o.penerima_akun and dl.status = 'selesai')::int,
 (select count(*) from lp where lp.penerima_akun = o.penerima_akun)::int,
 (select count(*) from lp where lp.penerima_akun = o.penerima_akun and lp.terlambat)::int,
 (select coalesce(sum(poin), 0) from lp where lp.penerima_akun = o.penerima_akun)::numeric,
 (select round(avg(kualitas), 2) from pn where pn.penerima_akun = o.penerima_akun)::numeric,
 (select round(avg(kepatuhan), 2) from pn where pn.penerima_akun = o.penerima_akun)::numeric
from orang o join sigap_akun a on a.id = o.penerima_akun
order by a.nama
$fn$;

revoke all on function public.keu_ringkasan_pegawai(date) from public, anon, authenticated;
grant execute on function public.keu_ringkasan_pegawai(date) to service_role;
