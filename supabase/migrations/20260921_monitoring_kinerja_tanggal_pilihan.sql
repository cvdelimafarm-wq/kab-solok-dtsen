-- Tambah parameter tanggal (opsional) ke RPC
-- penyisiran_monitoring_kinerja_hari_ini() -- permintaan user: kartu #1
-- (Monitoring Kinerja PPL) & #2 (Monitoring PML) di tab "Monitoring" perlu
-- bisa DIGESER/DIGANTI tanggalnya (defaultnya tetap hari ini/"Asia/Jakarta"
-- kalau parameter tidak dikirim, jadi endpoint lain yg mungkin masih
-- memanggil tanpa argumen TETAP jalan spt sebelumnya).
--
-- Fungsi lama TIDAK punya parameter sama sekali -- di-drop dulu supaya
-- overload baru dgn 1 parameter opsional tidak bikin ambigu saat dipanggil
-- tanpa argumen (Postgres akan bingung ada 2 fungsi yg cocok kalau fungsi
-- lama tidak dihapus).
drop function if exists public.penyisiran_monitoring_kinerja_hari_ini();

create or replace function public.penyisiran_monitoring_kinerja_hari_ini(p_tanggal date default null)
returns table (
  petugas_id bigint,
  nama text,
  pml_nama text,
  ditemukan_hari_ini int,
  dikunjungi_hari_ini int,
  akurasi_benar int,
  akurasi_dasar int,
  laporan_ok boolean,
  dokumentasi_ok boolean,
  ada_st_hari_ini boolean
)
language sql
stable
as $function$
  with hari as (
    select coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date) as tgl
  ),
  petugas as (
    select p.id, p.nama, pml.nama as pml_nama
    from petugas_penyisiran_akun p
    left join petugas_penyisiran_akun pml on pml.id = p.pengawas_id
    where p.aktif
  ),
  kunjungan as (
    select
      u.penyisiran_oleh_id as petugas_id,
      count(*) filter (
        where u.status_kunjungan = 'ditemukan'
          and (u.ditemukan_at at time zone 'Asia/Jakarta')::date = (select tgl from hari)
      )::int as ditemukan_hari_ini,
      count(*) filter (
        where (u.status_kunjungan = 'tidak_bisa'
               and (u.tidak_bisa_at at time zone 'Asia/Jakarta')::date = (select tgl from hari))
           or (u.status_kunjungan = 'sudah_didata_se2026'
               and (u.sudah_didata_at at time zone 'Asia/Jakarta')::date = (select tgl from hari))
      )::int as dikunjungi_hari_ini,
      count(*) filter (
        where u.identifikasi_ppl = 'ada'
          and (
            (u.status_kunjungan = 'ditemukan'
             and (u.ditemukan_at at time zone 'Asia/Jakarta')::date = (select tgl from hari))
            or (u.status_kunjungan = 'tidak_bisa'
                and (u.tidak_bisa_at at time zone 'Asia/Jakarta')::date = (select tgl from hari))
            or (u.status_kunjungan = 'sudah_didata_se2026'
                and (u.sudah_didata_at at time zone 'Asia/Jakarta')::date = (select tgl from hari))
          )
      )::int as akurasi_dasar,
      count(*) filter (
        where u.identifikasi_ppl = 'ada'
          and u.status_kunjungan = 'ditemukan'
          and (u.ditemukan_at at time zone 'Asia/Jakarta')::date = (select tgl from hari)
      )::int as akurasi_benar
    from penyisiran_usaha u
    where u.penyisiran_oleh_id is not null
    group by u.penyisiran_oleh_id
  ),
  spj_hari_ini as (
    select
      m.petugas_id,
      bool_or(m.ada_laporan) as laporan_ok,
      bool_or(m.slot_dokumentasi_terisi >= 3) as dokumentasi_ok
    from spj_matriks_kelengkapan() m
    where m.petugas_jenis = 'penyisiran'
      and m.tanggal = (select tgl from hari)
    group by m.petugas_id
  )
  select
    p.id as petugas_id,
    p.nama,
    p.pml_nama,
    coalesce(k.ditemukan_hari_ini, 0) as ditemukan_hari_ini,
    coalesce(k.dikunjungi_hari_ini, 0) as dikunjungi_hari_ini,
    coalesce(k.akurasi_benar, 0) as akurasi_benar,
    coalesce(k.akurasi_dasar, 0) as akurasi_dasar,
    s.laporan_ok,
    s.dokumentasi_ok,
    (s.petugas_id is not null) as ada_st_hari_ini
  from petugas p
  left join kunjungan k on k.petugas_id = p.id
  left join spj_hari_ini s on s.petugas_id = p.id
  order by p.nama;
$function$;
