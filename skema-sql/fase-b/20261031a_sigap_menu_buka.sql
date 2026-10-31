-- 20261031a_sigap_menu_buka.sql
-- (31 Okt 2026) Catatan "sudah membuka menu hari ini" (menu Pengawasan PML / Supervisi Supervisor pada kegiatan bermenu rutin).
-- Hanya terlihat oleh akun yang bersangkutan (diambil lewat API dengan sesi akunnya; service role).
-- Aman dijalankan ulang. Kode aplikasi tetap jalan tanpa tabel ini (baris pengingat "sudah/belum dibuka" disembunyikan).

create table if not exists public.sigap_menu_buka (
  id           bigint generated always as identity primary key,
  akun_id      bigint      not null,
  kegiatan_kode text       not null,
  menu         text        not null check (menu in ('pengawasan')),
  tanggal      date        not null,
  pertama_at   timestamptz not null default now(),
  terakhir_at  timestamptz not null default now(),
  jumlah       integer     not null default 1,
  unique (akun_id, kegiatan_kode, menu, tanggal)
);

create index if not exists sigap_menu_buka_tgl_idx on public.sigap_menu_buka (tanggal, kegiatan_kode, menu);

alter table public.sigap_menu_buka enable row level security;
revoke all on public.sigap_menu_buka from anon, authenticated;
