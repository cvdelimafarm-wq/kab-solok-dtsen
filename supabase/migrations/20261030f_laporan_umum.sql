-- 30 Okt 2026 -- Tab "8 · Laporan" untuk kegiatan selain Pascabencana (mis. SPDT NTP): fungsi pembaca data Laporan Sementara umum.
-- HANYA-BACA (stable): tidak menulis apa pun. Satu panggilan mengembalikan seluruh angka laporan sebagai jsonb, SEMUA dibatasi p_kegiatan:
-- penugasan per peran dan surat tugas, sasaran lembar bantu (sigap_spdt_kk + sigap_spdt_buka: KK, per kecamatan, KK yang koordinatnya dibuka, per hari),
-- realisasi harian (sigap_realisasi), dokumentasi nomor foto 1-5 (sigap_dokumentasi), QC Pemahaman, dokumen pemeriksaan PML, dan capaian per petugas.
-- Hanya service_role (dipanggil dari API server setelah pemeriksaan izin bencana.admin pada kegiatan itu). Aman dijalankan ulang (create or replace).

create or replace function public.sigap_laporan_umum(p_kegiatan bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
with
pen as (
  select p.id, p.akun_id, p.peran, p.surat_tugas_id, a.nama
  from public.sigap_penugasan p join public.sigap_akun a on a.id = p.akun_id
  where p.kegiatan_id = p_kegiatan and p.aktif
),
kk as (select * from public.sigap_spdt_kk where kegiatan_id = p_kegiatan),
bk as (select b.* from public.sigap_spdt_buka b join kk on kk.id = b.kk_id),
re as (
  select r.penugasan_id, r.tanggal, r.jumlah_realisasi
  from public.sigap_realisasi r
  where r.kegiatan_id = p_kegiatan and r.nonaktif_at is null
),
dk as (
  select d.id, d.slot, d.tanggal, d.penugasan_id
  from public.sigap_dokumentasi d
  where d.kegiatan_id = p_kegiatan and d.nonaktif_at is null
),
qc as (select * from public.sigap_qc_percobaan where kegiatan_id = p_kegiatan),
kec as (
  select kk.kecamatan,
         count(*) as kk,
         count(*) filter (where exists (select 1 from bk where bk.kk_id = kk.id)) as dibuka,
         count(distinct kk.nagari) as nagari,
         count(distinct kk.ppl_akun_id) as ppl,
         count(distinct kk.pml_akun_id) as pml
  from kk group by kk.kecamatan
),
real_hari as (
  select tanggal as tgl, coalesce(sum(jumlah_realisasi), 0) as n, count(distinct penugasan_id) as petugas
  from re group by tanggal
),
buka_hari as (select tanggal as tgl, count(distinct kk_id) as n from bk group by tanggal),
qc_hari as (
  select tanggal as tgl, count(*) as percobaan, count(distinct akun_id) as peserta,
         round(avg(skor) filter (where ke = 1)::numeric, 1) as rata
  from qc group by tanggal
),
dok_pml as (
  select a.nama, count(*) as n
  from public.sigap_spdt_dokumen d join public.sigap_akun a on a.id = d.pml_akun_id
  where d.kegiatan_id = p_kegiatan and d.dihapus_at is null
  group by a.nama
),
pn as (
  select p.akun_id, p.nama, p.peran,
         (select count(distinct h.tanggal) from public.sigap_hari_kerja h where h.penugasan_id = p.id and h.batal_at is null) as hari_kerja,
         (select coalesce(sum(r.jumlah_realisasi), 0) from re r where r.penugasan_id = p.id) as realisasi,
         (select count(*) from dk where dk.penugasan_id = p.id) as foto,
         (select count(distinct b.kk_id) from bk b where b.akun_id = p.akun_id) as dibuka,
         (select round(avg(q.skor)::numeric, 1) from qc q where q.akun_id = p.akun_id and q.ke = 1) as qc_rata,
         (select count(*) from qc q where q.akun_id = p.akun_id) as qc_percobaan
  from pen p where p.peran in ('pml', 'ppl')
)
select jsonb_build_object(
  'dibuat_at', now(),
  'kegiatan', (select to_jsonb(g) from (select id, nama, tanggal_mulai, tanggal_selesai, satuan_realisasi, jenis from public.sigap_kegiatan where id = p_kegiatan) g),
  'petugas', (select coalesce(jsonb_object_agg(peran, n), '{}'::jsonb) from (select peran, count(*) n from pen group by peran) x),
  'surat_tugas', jsonb_build_object(
    'n', (select count(*) from public.sigap_surat_tugas where kegiatan_id = p_kegiatan),
    'penugasan_ber_st', (select count(*) from pen where surat_tugas_id is not null)
  ),
  'sasaran', jsonb_build_object(
    'kk', (select count(*) from kk),
    'kecamatan', (select count(distinct kecamatan) from kk),
    'nagari', (select count(distinct (kecamatan, nagari)) from kk),
    'jorong', (select count(distinct (kecamatan, nagari, jorong)) from kk),
    'dibuka', (select count(distinct kk_id) from bk),
    'pembuka', (select count(distinct akun_id) from bk),
    'ppl', (select count(distinct ppl_akun_id) from kk),
    'pml', (select count(distinct pml_akun_id) from kk),
    'per_kecamatan', (select coalesce(jsonb_agg(to_jsonb(k) order by k.kk desc, k.kecamatan), '[]'::jsonb) from kec k),
    'harian', (select coalesce(jsonb_agg(jsonb_build_object('tgl', tgl, 'n', n) order by tgl), '[]'::jsonb) from buka_hari)
  ),
  'realisasi', jsonb_build_object(
    'satuan', (select satuan_realisasi from public.sigap_kegiatan where id = p_kegiatan),
    'total', (select coalesce(sum(jumlah_realisasi), 0) from re),
    'baris', (select count(*) from re),
    'hari', (select count(distinct tanggal) from re),
    'petugas', (select count(distinct penugasan_id) from re),
    'harian', (select coalesce(jsonb_agg(jsonb_build_object('tgl', tgl, 'n', n, 'petugas', petugas) order by tgl), '[]'::jsonb) from real_hari)
  ),
  'dokumentasi', jsonb_build_object(
    'foto', (select count(*) from dk),
    'petugas', (select count(distinct penugasan_id) from dk),
    'per_slot', (select coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'n', n) order by slot), '[]'::jsonb) from (select slot, count(*) n from dk group by slot) x),
    'per_peran', (select coalesce(jsonb_agg(jsonb_build_object('peran', peran, 'n', n) order by peran), '[]'::jsonb)
                  from (select p.peran, count(*) n from dk join pen p on p.id = dk.penugasan_id group by p.peran) x)
  ),
  'qc', jsonb_build_object(
    'percobaan', (select count(*) from qc),
    'petugas', (select count(distinct akun_id) from qc),
    'rata_pertama', (select round(avg(skor)::numeric, 1) from qc where ke = 1),
    'harian', (select coalesce(jsonb_agg(to_jsonb(h) order by h.tgl), '[]'::jsonb) from qc_hari h)
  ),
  'dokumen_pml', jsonb_build_object(
    'n', (select coalesce(sum(n), 0) from dok_pml),
    'pml', (select count(*) from dok_pml),
    'per_pml', (select coalesce(jsonb_agg(to_jsonb(d) order by d.n desc, d.nama), '[]'::jsonb) from dok_pml d)
  ),
  'petugas_nilai', (select coalesce(jsonb_agg(to_jsonb(x) order by x.peran, x.nama), '[]'::jsonb) from pn x)
);
$fn$;

revoke all on function public.sigap_laporan_umum(bigint) from public, anon, authenticated;
grant execute on function public.sigap_laporan_umum(bigint) to service_role;

comment on function public.sigap_laporan_umum(bigint) is
  'Angka Laporan Sementara umum (tab Laporan Kelola Pendataan untuk kegiatan non-Pascabencana). Semua dibatasi p_kegiatan. Hanya-baca.';
