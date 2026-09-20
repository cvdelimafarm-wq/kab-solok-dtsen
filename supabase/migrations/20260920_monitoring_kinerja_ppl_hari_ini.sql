-- Fitur "Monitoring Kinerja PPL Hari Ini" (seksi baru #1 di tab Monitoring):
--  - Kolom baru tidak_bisa_at & sudah_didata_at (timestamptz), POLA SAMA
--    dgn ditemukan_at (migrasi 20260920_penyisiran_jadwalkan_besok.sql) --
--    kapan status_kunjungan TERAKHIR KALI berubah MENJADI 'tidak_bisa' /
--    'sudah_didata_se2026' (bukan tiap kali baris diedit) -- dasar hitungan
--    "Usaha Dikunjungi HARI INI" (tidak_bisa + sudah_didata_se2026) di RPC
--    baru di bawah. TIDAK menambah kolom utk 'tidak_ditemukan' krn status
--    itu (spt 'tidak_bisa') sudah tidak lagi ditawarkan di dropdown edit FE
--    sejak migrasi 20260920_penyisiran_jadwalkan_besok.sql -- kolom
--    tidak_bisa_at di sini TETAP dibuat krn 'tidak_bisa' eksplisit diminta
--    user utk komponen "Usaha Dikunjungi", walau ke depan datanya cuma dari
--    histori/legacy (jarang bertambah lagi).
alter table penyisiran_usaha
  add column if not exists tidak_bisa_at timestamptz,
  add column if not exists sudah_didata_at timestamptz;

update penyisiran_usaha set tidak_bisa_at = updated_at
  where status_kunjungan = 'tidak_bisa' and tidak_bisa_at is null;
update penyisiran_usaha set sudah_didata_at = updated_at
  where status_kunjungan = 'sudah_didata_se2026' and sudah_didata_at is null;

-- RPC gabungan utk seksi "Monitoring Kinerja PPL Hari Ini" -- SATU baris
-- per petugas penyisiran AKTIF (roster petugas_penyisiran_akun), gabungan
-- dari 3 sumber:
--  1. penyisiran_usaha (via penyisiran_oleh_id) -- ditemukan/dikunjungi hari
--     ini, + dasar hitungan akurasi identifikasi (lihat komentar kolom di
--     bawah).
--  2. petugas_penyisiran_akun.pengawas_id (self-join) -- nama PML.
--  3. spj_matriks_kelengkapan() (RPC yg SUDAH ADA, lihat app/api/penyisiran/
--     spj/monitoring/route.ts) -- status Laporan & Dokumentasi (ambang 3
--     foto/hari, SAMA dgn AMBANG_DOKUMENTASI_HARIAN di lib/spjMatriks.ts)
--     utk tanggal HARI INI, cuma kalau petugas itu punya Surat Tugas yg
--     mencakup hari ini (kalau tidak ada ST hari ini, ada_st_hari_ini=false
--     & laporan_ok/dokumentasi_ok NULL -- beda dari "belum lengkap" krn
--     memang tidak ada kewajiban SPJ hari itu).
--
-- akurasi_benar/akurasi_dasar (bukan langsung persentase, dihitung di FE) --
-- "Akurasi Identifikasi" = ketepatan jawaban Identifikasi ("Ada usaha")
-- dibanding hasil kunjungan HARI INI ("Ditemukan"): akurasi_dasar = jumlah
-- kartu ber-identifikasi_ppl='ada' yg statusnya berubah HARI INI (ke
-- ditemukan/tidak_bisa/sudah_didata_se2026 -- "sudah dikunjungi apa pun
-- hasilnya"), akurasi_benar = subset yg hasilnya PERSIS 'ditemukan'.
-- Dikirim sbg 2 angka mentah (bukan 1 field persen) spy FE bisa tampilkan
-- "-" saat akurasi_dasar=0 (belum ada kartu 'ada' yg dikunjungi hari ini)
-- tanpa pembagian 0/0 di database.
create or replace function public.penyisiran_monitoring_kinerja_hari_ini()
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
    select (now() at time zone 'Asia/Jakarta')::date as tgl
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
