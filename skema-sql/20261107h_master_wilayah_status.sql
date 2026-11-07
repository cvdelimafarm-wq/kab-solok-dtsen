-- 20261107h_master_wilayah_status.sql
-- Tahap C1 rancangan "sampel lintas survei": menu Master > Wilayah dan Peta (kolom status per sub SLS).
--
--  1. Izin baru `master.wilayah` (sigap_menu) dan peran `admin_master`. Keputusan Iqbal: admin Master hanya Ketua. Peran ini TIDAK diberikan ke siapa pun
--     di sini; berikan lewat Peran dan akses ke akun Ketua. Level 'lihat' = melihat, 'kelola' = mengelola (tahap berikutnya: ubah/unggah).
--  2. Tampilan `master_v_subsls_status`: satu baris per sub SLS dengan jumlah KK master + tanggal pembaruan terakhir, jumlah gambar peta SLS di Storage
--     (bucket peta-wilayah, objek sls/<kode16>_n_dari_m.jpg), dan daftar survei tahun berjalan yang memakai sub SLS itu (alokasi aktif).
--     Status batas (shapefile) dibaca server dari berkas public/peta/batas, bukan dari basis data.
--
-- Hanya service_role yang boleh membaca tampilan (server). Tidak mengubah tabel/fungsi yang ada. Aman dijalankan ulang.

begin;

-- 1. izin dan peran ----------------------------------------------------------------------------------------------------------------
insert into public.sigap_menu (kode, portal, nama, keterangan, urutan, aktif)
values ('master.wilayah', 'Master data', 'Master wilayah, peta, dan keluarga', 'Wilayah dan peta (status per sub SLS), daftar keluarga (KK) master, usulan pembaruan dari lapangan. Khusus Ketua.', 450, true)
on conflict (kode) do nothing;

insert into public.sigap_peran (kode, nama)
select 'admin_master', 'Admin Master (wilayah, peta, KK)'
where not exists (select 1 from public.sigap_peran where kode = 'admin_master');

insert into public.sigap_peran_izin (peran_id, menu_kode, level)
select p.id, 'master.wilayah', 'kelola' from public.sigap_peran p where p.kode = 'admin_master'
on conflict (peran_id, menu_kode) do nothing;

-- 2. tampilan status ---------------------------------------------------------------------------------------------------------------
create or replace view public.master_v_subsls_status as
with kk as (
  select idsubsls, count(*)::int as jumlah_kk, max(diubah_at) as kk_terbaru
  from public.master_kk
  where aktif
  group by idsubsls
),
gambar as (
  select substring(name from 5 for 16) as idsubsls, count(*)::int as n
  from storage.objects
  where bucket_id = 'peta-wilayah' and name ~ '^sls/[0-9]{16}_'
  group by 1
),
survei as (
  select a.idsubsls,
         count(*)::int as jumlah_survei,
         jsonb_agg(jsonb_build_object(
           'kegiatan_id', k.id,
           'kegiatan', k.nama,
           'nks', a.nks,
           'target', a.target_sampel,
           'ppl', ppl.nama,
           'pml', pml.nama
         ) order by k.id) as daftar_survei
  from public.sigap_alokasi_wilayah a
  join public.sigap_kegiatan k on k.id = a.kegiatan_id
  left join public.sigap_akun ppl on ppl.id = a.ppl_akun_id
  left join public.sigap_akun pml on pml.id = a.pml_akun_id
  where a.nonaktif_at is null
    and extract(year from k.tanggal_mulai) = extract(year from (now() at time zone 'Asia/Jakarta'))
  group by a.idsubsls
)
select w.idsubsls,
       w.kd_kec,
       w.kecamatan,
       w.nagari,
       w.sls,
       w.sub_sls,
       w.aktif,
       coalesce(kk.jumlah_kk, 0) as jumlah_kk,
       kk.kk_terbaru,
       coalesce(g.n, 0) as gambar_peta,
       coalesce(s.jumlah_survei, 0) as jumlah_survei,
       coalesce(s.daftar_survei, '[]'::jsonb) as daftar_survei
from public.master_wilayah w
left join kk on kk.idsubsls = w.idsubsls
left join gambar g on g.idsubsls = w.idsubsls
left join survei s on s.idsubsls = w.idsubsls;

revoke all on public.master_v_subsls_status from anon, authenticated;
grant select on public.master_v_subsls_status to service_role;
comment on view public.master_v_subsls_status is 'Master > Wilayah dan Peta: status KK, gambar peta, dan survei tahun berjalan per sub SLS (hanya server).';

commit;

-- Verifikasi (harus: menu 1, peran 1, izin 1, baris_tampilan = jumlah sub SLS master, tampilan_tertutup true)
select
  (select count(*) from public.sigap_menu where kode = 'master.wilayah') as menu,
  (select count(*) from public.sigap_peran where kode = 'admin_master') as peran,
  (select count(*) from public.sigap_peran_izin i join public.sigap_peran p on p.id = i.peran_id where p.kode = 'admin_master' and i.menu_kode = 'master.wilayah') as izin,
  (select count(*) from public.master_v_subsls_status) as baris_tampilan,
  (select count(*) from public.master_wilayah) as sub_sls_master,
  not has_table_privilege('anon', 'public.master_v_subsls_status', 'select') as tampilan_tertutup;
