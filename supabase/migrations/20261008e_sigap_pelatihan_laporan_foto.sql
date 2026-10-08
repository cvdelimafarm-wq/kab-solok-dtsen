-- (8 Okt 2026) Lampiran foto kegiatan pada Laporan Pelatihan & Laporan Pelatihan Instruktur (tab Administrasi).
-- Foto diunggah panitia per kelas (maks. 8 foto/kelas, dirapikan sharp -> JPEG maks 1600 px) ke bucket privat
-- sigap-files: pelatihan-laporan/<kegiatan>/<kelas>/<berkas>.jpg ; satu set foto dipakai kedua laporan kelas itu.
create table if not exists sigap_pelatihan_laporan_foto (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  kelas smallint not null check (kelas between 1 and 4),
  urut integer not null default 0,
  file_path text not null,
  keterangan text,
  dibuat_at timestamptz not null default now(),
  dibuat_oleh text
);
create index if not exists sigap_pelatihan_laporan_foto_kelas on sigap_pelatihan_laporan_foto (kegiatan_id, kelas, urut);
alter table sigap_pelatihan_laporan_foto enable row level security;
