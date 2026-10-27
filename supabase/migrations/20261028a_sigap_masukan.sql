-- =====================================================================
-- 20261028a_sigap_masukan.sql
-- (28 Okt 2026, permintaan user) Tombol "Masukan" melayang di SIGAP + menu "Usulan perbaikan" di SIGAP Kelola.
--  - Tabel sigap_masukan: satu baris per masukan (galat / saran / pertanyaan) dari akun mana pun yang masuk.
--  - Status ditangani admin (izin portal.kelola): baru -> dibaca -> diproses -> selesai | ditolak. Tidak ada penghapusan permanen (tak ada DELETE di API).
--  - Foto layar opsional disimpan di bucket sigap-files, jalur masukan/<akun>/<kode>.<ekstensi> (kolom gambar_path).
-- Hanya DDL baru (tabel + indeks); tidak menyentuh tabel lain. Jalankan oleh user (DDL produksi). Aman dijalankan sebelum deploy kode.
-- Akses hanya lewat service_role (API Next.js): RLS aktif tanpa kebijakan, hak anon/authenticated dicabut.
-- =====================================================================
create table if not exists public.sigap_masukan (
  id           bigint generated always as identity primary key,
  akun_id      bigint not null references public.sigap_akun(id),
  jenis        text   not null check (jenis in ('galat', 'saran', 'pertanyaan')),
  isi          text   not null check (char_length(isi) between 5 and 2000),
  halaman      text   check (halaman is null or char_length(halaman) <= 120),
  peran        text   check (peran is null or char_length(peran) <= 60),
  versi        text   check (versi is null or char_length(versi) <= 40),
  perangkat    text   check (perangkat is null or char_length(perangkat) <= 160),
  gambar_path  text,
  status       text   not null default 'baru' check (status in ('baru', 'dibaca', 'diproses', 'selesai', 'ditolak')),
  catatan_admin text  check (catatan_admin is null or char_length(catatan_admin) <= 1000),
  diubah_oleh  bigint references public.sigap_akun(id),
  dibuat_at    timestamptz not null default now(),
  diubah_at    timestamptz not null default now()
);

create index if not exists sigap_masukan_status_idx on public.sigap_masukan (status, dibuat_at desc);
create index if not exists sigap_masukan_akun_idx   on public.sigap_masukan (akun_id, dibuat_at desc);

alter table public.sigap_masukan enable row level security;
revoke all on table public.sigap_masukan from anon, authenticated;
grant all on table public.sigap_masukan to service_role;

comment on table public.sigap_masukan is 'Masukan/usulan perbaikan dari pengguna SIGAP (tombol Masukan). Dibaca & ditangani admin di SIGAP Kelola > Usulan perbaikan.';
