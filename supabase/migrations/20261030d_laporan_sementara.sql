-- 30 Okt 2026 -- Tab "8 · Laporan" di Kelola Pendataan: fungsi pembaca data untuk Laporan Sementara.
-- HANYA-BACA (stable): tidak menulis apa pun. Satu panggilan mengembalikan seluruh angka laporan sebagai jsonb:
-- identifikasi (jorong + Sub SLS PML), petugas, wilayah kerja, pendataan (total, per kecamatan, per hari), pelatihan (kelas, pretest/posttest),
-- dokumentasi foto, QC Pemahaman, dan nilai per petugas (pretest, posttest, QC, kehadiran) untuk lampiran. Hanya service_role (dipanggil dari API server setelah pemeriksaan izin bencana.admin kegiatan PSP).
-- Aman dijalankan ulang (create or replace).

create or replace function public.sigap_laporan_sementara(p_kegiatan bigint default 1, p_pelatihan bigint default 3)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
with
alo as (select distinct idsubsls from public.bencana_alokasi_subsls),
kk as (
  select k.idsubsls, k.hasil, (k.status_at at time zone 'Asia/Jakarta')::date as tgl
  from public.bencana_pendataan_kk k join alo a on a.idsubsls = k.idsubsls
  where k.kegiatan_id = p_kegiatan and k.aktif
),
kk_kec as (
  select w.kecamatan,
         count(distinct kk.idsubsls) as sub_sls,
         count(*) as sasaran,
         count(*) filter (where kk.hasil is not null) as didata,
         count(*) filter (where kk.hasil = 'terdampak') as terdampak,
         count(*) filter (where kk.hasil = 'tidak_terdampak') as tidak_terdampak,
         count(*) filter (where kk.hasil = 'tidak_ditemukan') as tidak_ditemukan
  from kk join public.bencana_wilayah w on w.idsubsls = kk.idsubsls
  group by w.kecamatan
),
idn_kec as (
  select w.kecamatan,
         count(*) as sub_sls_diisi,
         count(*) filter (where not coalesce(i.tidak_terdampak, false)) as sub_sls_terdampak,
         coalesce(sum(i.kk_terdampak), 0) as kk_terdampak
  from public.bencana_identifikasi_subsls i
  join public.bencana_wilayah w on w.idsubsls = i.idsubsls
  where i.diisi_at is not null
  group by w.kecamatan
),
kec as (
  select coalesce(a.kecamatan, b.kecamatan) as kecamatan,
         coalesce(b.sub_sls_diisi, 0) as idn_sub_sls, coalesce(b.sub_sls_terdampak, 0) as idn_terdampak, coalesce(b.kk_terdampak, 0) as idn_kk,
         coalesce(a.sub_sls, 0) as sub_sls, coalesce(a.sasaran, 0) as sasaran, coalesce(a.didata, 0) as didata,
         coalesce(a.terdampak, 0) as terdampak, coalesce(a.tidak_terdampak, 0) as tidak_terdampak, coalesce(a.tidak_ditemukan, 0) as tidak_ditemukan
  from kk_kec a full join idn_kec b on b.kecamatan = a.kecamatan
),
harian as (
  select tgl, count(*) as n from kk where hasil is not null and tgl is not null group by tgl
),
tes as (
  select t.jenis, count(s.id) as peserta, round(avg(s.skor)::numeric, 1) as rata,
         count(*) filter (where s.skor >= 80) as ge80, count(*) filter (where s.skor < 60) as lt60
  from public.sigap_tes t join public.sigap_tes_sesi s on s.tes_id = t.id and s.selesai_at is not null
  where t.kegiatan_id = p_pelatihan group by t.jenis
),
pn as (
  select a.id as akun_id, a.nama, p.peran,
         (select pl.kelas from public.sigap_penugasan pl where pl.kegiatan_id = p_pelatihan and pl.akun_id = p.akun_id and pl.aktif order by pl.id limit 1) as kelas,
         exists (select 1 from public.sigap_pelatihan_presensi r where r.kegiatan_id = p_pelatihan and r.akun_id = p.akun_id and r.diterima) as hadir,
         (select round(max(s.skor)::numeric, 1) from public.sigap_tes_sesi s join public.sigap_tes t on t.id = s.tes_id
           where t.kegiatan_id = p_pelatihan and t.jenis = 'pretest' and s.akun_id = p.akun_id and s.selesai_at is not null) as pretest,
         (select round(max(s.skor)::numeric, 1) from public.sigap_tes_sesi s join public.sigap_tes t on t.id = s.tes_id
           where t.kegiatan_id = p_pelatihan and t.jenis = 'posttest' and s.akun_id = p.akun_id and s.selesai_at is not null) as posttest,
         (select round(avg(q.skor)::numeric, 1) from public.sigap_qc_percobaan q where q.kegiatan_id = p_kegiatan and q.akun_id = p.akun_id and q.ke = 1) as qc_rata,
         (select count(*) from public.sigap_qc_percobaan q where q.kegiatan_id = p_kegiatan and q.akun_id = p.akun_id) as qc_percobaan
  from public.sigap_penugasan p join public.sigap_akun a on a.id = p.akun_id
  where p.kegiatan_id = p_kegiatan and p.aktif and p.peran in ('pml', 'ppl')
),
kelas as (
  select p.kelas,
         count(*) filter (where p.peran = 'pml') as pml, count(*) filter (where p.peran = 'ppl') as ppl,
         count(*) as peserta,
         count(*) filter (where exists (select 1 from public.sigap_pelatihan_presensi r where r.kegiatan_id = p_pelatihan and r.akun_id = p.akun_id and r.diterima)) as hadir
  from public.sigap_penugasan p
  where p.kegiatan_id = p_pelatihan and p.aktif and p.kelas is not null and p.peran in ('pml', 'ppl')
  group by p.kelas
)
select jsonb_build_object(
  'dibuat_at', now(),
  'kegiatan', (select to_jsonb(g) from (select id, nama, tanggal_mulai, tanggal_selesai from public.sigap_kegiatan where id = p_kegiatan) g),
  'identifikasi', jsonb_build_object(
    'isian_jorong', (select count(*) from public.bencana_identifikasi_jorong),
    'mitra', (select count(distinct coalesce(mitra_id::text, nama_mitra)) from public.bencana_identifikasi_jorong),
    'nagari', (select count(distinct (kecamatan, nagari)) from public.bencana_identifikasi_jorong),
    'kecamatan', (select count(distinct kecamatan) from public.bencana_identifikasi_jorong),
    'sub_sls_diisi', (select count(*) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'sub_sls_tidak_terdampak', (select count(*) from public.bencana_identifikasi_subsls where diisi_at is not null and coalesce(tidak_terdampak, false)),
    'pml_pengisi', (select count(distinct pml_id) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'kk_terdampak', (select coalesce(sum(kk_terdampak), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'rusak_berat', (select coalesce(sum(rusak_berat), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'rusak_sedang', (select coalesce(sum(rusak_sedang), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'rusak_ringan', (select coalesce(sum(rusak_ringan), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'lahan_tertimbun', (select coalesce(sum(lahan_tertimbun), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'kekeringan', (select coalesce(sum(kekeringan), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'aset_usaha', (select coalesce(sum(aset_usaha), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'lahan_ternak', (select coalesce(sum(lahan_ternak), 0) from public.bencana_identifikasi_subsls where diisi_at is not null),
    'korban', (select coalesce(sum(korban), 0) from public.bencana_identifikasi_subsls where diisi_at is not null)
  ),
  'petugas', (select coalesce(jsonb_object_agg(peran, n), '{}'::jsonb) from (select peran, count(*) n from public.sigap_penugasan where kegiatan_id = p_kegiatan and aktif group by peran) x),
  'wilayah_kerja', jsonb_build_object(
    'sub_sls', (select count(*) from alo),
    'keluarga_daftar', (select count(*) from public.bencana_pendataan_kk where kegiatan_id = p_kegiatan and aktif),
    'keluarga_tambahan', (select count(*) from public.bencana_pendataan_kk where kegiatan_id = p_kegiatan and aktif and ditambah_oleh_akun is not null)
  ),
  'pendataan', jsonb_build_object(
    'sasaran', (select count(*) from kk),
    'didata', (select count(*) from kk where hasil is not null),
    'terdampak', (select count(*) from kk where hasil = 'terdampak'),
    'tidak_terdampak', (select count(*) from kk where hasil = 'tidak_terdampak'),
    'tidak_ditemukan', (select count(*) from kk where hasil = 'tidak_ditemukan'),
    'hari_pertama', (select min(tgl) from harian),
    'harian', (select coalesce(jsonb_agg(jsonb_build_object('tgl', tgl, 'n', n) order by tgl), '[]'::jsonb) from harian)
  ),
  'kecamatan', (select coalesce(jsonb_agg(to_jsonb(k) order by k.sasaran desc, k.kecamatan), '[]'::jsonb) from kec k),
  'pelatihan', jsonb_build_object(
    'tes', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from tes t),
    'kelas', (select coalesce(jsonb_agg(to_jsonb(c) order by c.kelas), '[]'::jsonb) from kelas c),
    'hadir', (select count(distinct akun_id) from public.sigap_pelatihan_presensi where kegiatan_id = p_pelatihan and diterima)
  ),
  'dokumentasi', jsonb_build_object(
    'foto', (select count(*) from public.sigap_foto where kegiatan_id = p_kegiatan and file_dihapus_at is null),
    'petugas', (select count(distinct akun_pengambil) from public.sigap_foto where kegiatan_id = p_kegiatan and file_dihapus_at is null)
  ),
  'petugas_nilai', (select coalesce(jsonb_agg(to_jsonb(x) order by x.peran, x.nama), '[]'::jsonb) from pn x),
  'qc', jsonb_build_object(
    'percobaan', (select count(*) from public.sigap_qc_percobaan where kegiatan_id = p_kegiatan),
    'petugas', (select count(distinct akun_id) from public.sigap_qc_percobaan where kegiatan_id = p_kegiatan),
    'rata_pertama', (select round(avg(skor)::numeric, 1) from public.sigap_qc_percobaan where kegiatan_id = p_kegiatan and ke = 1)
  )
);
$fn$;

revoke all on function public.sigap_laporan_sementara(bigint, bigint) from public, anon, authenticated;
grant execute on function public.sigap_laporan_sementara(bigint, bigint) to service_role;

comment on function public.sigap_laporan_sementara(bigint, bigint) is
  'Angka Laporan Sementara PSP (tab Laporan Kelola Pendataan). p_kegiatan = kegiatan pendataan, p_pelatihan = kegiatan pelatihannya. Hanya-baca.';
