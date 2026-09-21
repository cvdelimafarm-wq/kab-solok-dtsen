-- Status "sudah/belum kirim daftar rencana besok ke PML" per PPL per hari
-- (permintaan user, kolom baru paling kanan di kartu #1 "Monitoring
-- Penyisiran Sensus Ekonomi 2026", tab Monitoring) -- 1 baris per petugas
-- per HARI PENGIRIMAN (tanggal_kirim = WIB hari itu SAAT tombol "📤 Kirim
-- ke WA PML" ditekan di FloatBarRencanaBesok, app/penyisiran/page.tsx --
-- BUKAN tanggal_rencana/besok-nya). Upsert lewat /api/penyisiran/
-- rencana-besok-kirim supaya klik berulang di hari yg sama tidak bikin
-- baris ganda, cuma perbarui waktunya.
--
-- Dicatat begitu Web Share API (JALUR 1) BERHASIL ATAU gambar berhasil
-- disalin ke clipboard (JALUR 2 fallback) -- lihat komentar panjang di
-- kirimKeWaPml() (page.tsx). Ini SEKADAR sinyal terbaik yg BISA dideteksi
-- dari web (petugas benar2 melakukan aksi "kirim/salin gambar") -- TIDAK
-- bisa memastikan pesan itu benar2 sampai dikirim di WhatsApp (di luar
-- kendali web manapun, sama spt disebutkan di komentar kirimKeWaPml).
create table if not exists penyisiran_rencana_besok_kirim (
  petugas_id bigint not null references petugas_penyisiran_akun(id) on delete cascade,
  tanggal_kirim date not null,
  tanggal_rencana date,
  metode text not null default 'salin' check (metode in ('share', 'salin')),
  terkirim_at timestamptz not null default now(),
  primary key (petugas_id, tanggal_kirim)
);

create index if not exists idx_rencana_besok_kirim_tanggal
  on penyisiran_rencana_besok_kirim (tanggal_kirim);

-- RPC penyisiran_monitoring_kinerja_hari_ini() ditambah 1 kolom baru
-- rencana_besok_terkirim (boolean, tidak pernah null -- true kalau ADA
-- baris di tabel di atas utk (petugas_id, tanggal_kirim = tanggal yg
-- sedang dilihat/hari.tgl), false kalau tidak ada). Definisi CTE lain
-- TIDAK diubah (lihat migrasi 20260921b_monitoring_kinerja_hanya_ppl.sql
-- utk versi filter "hanya PPL"-nya).
--
-- Bentuk kolom hasil (RETURNS TABLE) berubah dari versi sebelumnya (nambah
-- 1 kolom) -- Postgres MELARANG "create or replace function" mengubah tipe
-- baris OUT parameter, jadi fungsi lama WAJIB di-drop dulu.
drop function if exists public.penyisiran_monitoring_kinerja_hari_ini(date);

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
  ada_st_hari_ini boolean,
  rencana_besok_terkirim boolean
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
      and not exists (
        select 1 from petugas_penyisiran_akun bawahan where bawahan.pengawas_id = p.id
      )
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
  ),
  kirim_besok as (
    select petugas_id
    from penyisiran_rencana_besok_kirim
    where tanggal_kirim = (select tgl from hari)
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
    (s.petugas_id is not null) as ada_st_hari_ini,
    (kb.petugas_id is not null) as rencana_besok_terkirim
  from petugas p
  left join kunjungan k on k.petugas_id = p.id
  left join spj_hari_ini s on s.petugas_id = p.id
  left join kirim_besok kb on kb.petugas_id = p.id
  order by p.nama;
$function$;
