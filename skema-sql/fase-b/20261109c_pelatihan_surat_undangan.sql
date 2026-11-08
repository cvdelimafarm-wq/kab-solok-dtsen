-- 20261109c_pelatihan_surat_undangan.sql
-- (9 Nov 2026) Surat undangan pelatihan per kelas (jalur "unggah": PDF yang terbit di luar SIGAP + nomor, tanggal, perihal).
-- Satu surat AKTIF per (kegiatan, kelas); surat lama tidak dihapus, hanya dinonaktifkan dengan alasan (riwayat).
-- Hanya server (service role) yang membaca/menulis: RLS aktif tanpa kebijakan. AMAN DIULANG. Dijalankan Iqbal sendiri.
-- Tanpa tabel ini kode tetap jalan (kartu menampilkan "belum tersedia", laporan tanpa lampiran undangan).
-- Berkas PDF disimpan di bucket sigap-files: pelatihan-undangan/<kegiatan>/<kelas>/<berkas>.pdf

create table if not exists sigap_pelatihan_surat_undangan (
  id            bigserial   primary key,
  kegiatan_id   bigint      not null references sigap_kegiatan(id) on delete cascade,
  kelas         integer     not null check (kelas between 1 and 20),
  jalur         text        not null default 'unggah' check (jalur in ('unggah','sigap')),
  nomor         text        not null check (length(btrim(nomor)) > 0),
  tanggal       date        not null,
  perihal       text        not null check (length(btrim(perihal)) > 0),
  file_path     text        not null,
  aktif         boolean     not null default true,
  alasan_ganti  text,
  dibuat_oleh   text,
  dibuat_at     timestamptz not null default now(),
  diganti_at    timestamptz
);

-- paling banyak satu surat aktif per kegiatan+kelas
create unique index if not exists sigap_pelatihan_surat_undangan_aktif_uq
  on sigap_pelatihan_surat_undangan (kegiatan_id, kelas) where aktif;
create index if not exists sigap_pelatihan_surat_undangan_kegiatan_idx
  on sigap_pelatihan_surat_undangan (kegiatan_id, kelas, dibuat_at desc);

alter table sigap_pelatihan_surat_undangan enable row level security;

-- Cek cepat (harus 1):
--   select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'sigap_pelatihan_surat_undangan';
