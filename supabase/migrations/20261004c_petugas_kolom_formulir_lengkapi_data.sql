-- (4 Okt 2026) Formulir "Daftar / Lengkapi Data" di halaman Undangan Konfirmasi Bersama.
-- Kolom tambahan utk analisis wilayah tugas & kesetaraan data dgn petugas lain.
-- Semua nullable (fill-only); tidak mengubah baris lama.
alter table public.bencana_petugas
  add column if not exists punya_hp_android boolean,
  add column if not exists pernah_capi boolean,
  add column if not exists alamat_detail text,
  add column if not exists pendaftaran_mandiri_at timestamptz,
  add column if not exists data_dilengkapi_at timestamptz;

comment on column public.bencana_petugas.alamat_detail is 'Jorong / alamat rumah sesuai isian petugas sendiri (formulir Lengkapi Data).';
comment on column public.bencana_petugas.pendaftaran_mandiri_at is 'Terisi bila petugas mendaftar sendiri lewat formulir (bukan dari daftar admin).';
