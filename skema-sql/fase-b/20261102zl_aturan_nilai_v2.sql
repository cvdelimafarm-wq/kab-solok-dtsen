-- 20261102zl_aturan_nilai_v2.sql
-- (2 Nov 2026) Tahap F pelatihan: aturan nilai versi 2 (nilai percobaan pertama, lulus bila > ambang), "wajib 100", dan tabel dasar blokir tahapan / buka kunci.
-- Idempoten (aman dijalankan ulang). Dijalankan Iqbal sendiri. Tidak mengubah nilai atau perilaku kegiatan PSP Pascabencana (tanpa baris aturan = versi 1).

-- 1) Aturan per kegiatan pelatihan. Tanpa baris: PSP Pascabencana = versi 1, kegiatan lain = versi 2 (diputuskan di kode).
create table if not exists public.sigap_pelatihan_aturan (
  kegiatan_id   bigint primary key,
  aturan_versi  smallint not null default 2 check (aturan_versi in (1, 2)),
  blokir_tahap  boolean  not null default false,
  izin_ajukan   boolean  not null default false,
  diubah_oleh   text,
  diubah_at     timestamptz not null default now()
);
alter table public.sigap_pelatihan_aturan enable row level security;

-- 2) "Wajib 100" per tes (pretest / posttest): mengulang tanpa batas sampai skor 100 selama tes dibuka.
alter table public.sigap_tes add column if not exists wajib_100 boolean not null default false;

-- 3) Skor percobaan PERTAMA per sesi tes.
alter table public.sigap_tes_sesi add column if not exists skor_awal numeric;

-- Isi data yang sudah ada: percobaan 1 yang sudah selesai = skor sesi; sesi yang sudah mengulang = skor percobaan 1 di arsip.
update public.sigap_tes_sesi s
   set skor_awal = s.skor
 where s.skor_awal is null and s.percobaan = 1 and s.selesai_at is not null and s.skor is not null;

update public.sigap_tes_sesi s
   set skor_awal = a.skor
  from public.sigap_tes_sesi_arsip a
 where s.skor_awal is null and s.percobaan > 1 and a.sesi_id = s.id and a.percobaan = 1 and a.skor is not null;

-- 4) Izin buka kunci (dipakai tahap F2: blokir tahapan). Dibuat sekarang agar cukup satu kali menjalankan SQL.
create table if not exists public.sigap_pelatihan_izin_buka (
  id             bigserial primary key,
  kegiatan_id    bigint not null,
  akun_id        bigint not null,
  tahap          text   not null,
  alasan         text,
  asal           text   not null default 'pengelola' check (asal in ('petugas', 'pengelola')),
  status         text   not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak')),
  diputuskan_oleh text,
  berlaku_sampai timestamptz,
  dibuat_at      timestamptz not null default now(),
  diputuskan_at  timestamptz
);
create index if not exists sigap_pelatihan_izin_buka_keg_akun on public.sigap_pelatihan_izin_buka (kegiatan_id, akun_id);
create index if not exists sigap_pelatihan_izin_buka_status on public.sigap_pelatihan_izin_buka (kegiatan_id, status);
alter table public.sigap_pelatihan_izin_buka enable row level security;

-- Pemeriksaan (harus: 2 tabel, kolom wajib_100 dan skor_awal ada)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sigap_pelatihan_aturan', 'sigap_pelatihan_izin_buka')) as tabel_baru,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sigap_tes' and column_name = 'wajib_100') as kolom_wajib_100,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sigap_tes_sesi' and column_name = 'skor_awal') as kolom_skor_awal,
  (select count(*) from public.sigap_tes_sesi where skor_awal is not null) as sesi_skor_awal_terisi;
