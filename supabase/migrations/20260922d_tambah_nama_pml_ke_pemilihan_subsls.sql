-- Menambahkan nama PML (pengawas) ke RPC penyisiran_pemilihan_subsls()
-- utk kartu "Monitoring Status Pemilihan Sub-SLS" (tab Perencanaan
-- Lapangan) -- permintaan user: kolom "Nama Petugas" diganti jadi
-- "Nama PPL", di sebelah kanannya ditambahkan kolom "Nama PML".
--
-- pengawas_nama diambil dari self-join ke petugas_penyisiran_akun via
-- pengawas_id (konvensi yg sama dipakai di master-petugas.tsx utk kolom
-- "Pengawas") -- BUKAN difilter jabatan='pml', supaya konsisten dgn
-- makna pengawas_id yg sudah ada di aplikasi.

create or replace function public.penyisiran_pemilihan_subsls()
returns jsonb
language sql
stable
as $function$
  with cakupan as (
    select a.petugas_id, u.idsubsls, u.status_kunjungan
    from penyisiran_alokasi_pilihan a
    join penyisiran_usaha u
      on u.kec_kode = a.kec_kode
     and u.nagari_kode = a.nagari_kode
     and u.sls_kode = a.sls_kode
     and (a.subsls_kode_list is null or u.subsls_kode = any(a.subsls_kode_list))
     and u.aktif
  ),
  per_petugas as (
    select petugas_id,
           count(distinct idsubsls) as jumlah_subsls_ditag,
           count(*) as jumlah_kk,
           count(*) filter (where status_kunjungan <> 'belum') as jumlah_ditemukan,
           count(*) filter (where status_kunjungan = 'belum') as jumlah_sisa
    from cakupan
    group by petugas_id
  )
  select jsonb_build_object(
    'per_petugas', (
      select coalesce(jsonb_agg(x order by x.jumlah_subsls_ditag desc, x.nama), '[]'::jsonb) from (
        select p.id, p.nama,
               p.alamat_kecamatan as kec_domisili,
               p.alamat_nagari as nagari_domisili,
               pml.nama as pengawas_nama,
               (
                 select string_agg(distinct a2.kec_nama, ', ' order by a2.kec_nama)
                 from penyisiran_alokasi_pilihan a2
                 where a2.petugas_id = p.id
               ) as kec_tugas,
               coalesce(pp.jumlah_subsls_ditag, 0) as jumlah_subsls_ditag,
               coalesce(pp.jumlah_kk, 0) as jumlah_kk,
               coalesce(pp.jumlah_ditemukan, 0) as jumlah_ditemukan,
               coalesce(pp.jumlah_sisa, 0) as jumlah_sisa
        from petugas_penyisiran_akun p
        left join petugas_penyisiran_akun pml on pml.id = p.pengawas_id
        left join per_petugas pp on pp.petugas_id = p.id
        where p.aktif
      ) x
    ),
    'total_subsls_belum_ditag', (
      select count(distinct u.idsubsls)
      from penyisiran_usaha u
      where u.aktif
        and not exists (
          select 1 from penyisiran_alokasi_pilihan ax
          where ax.kec_kode = u.kec_kode and ax.nagari_kode = u.nagari_kode and ax.sls_kode = u.sls_kode
            and (ax.subsls_kode_list is null or u.subsls_kode = any(ax.subsls_kode_list))
        )
    )
  );
$function$;
