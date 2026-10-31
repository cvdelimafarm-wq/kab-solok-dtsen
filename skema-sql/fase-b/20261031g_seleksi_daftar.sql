-- 20261031g_seleksi_daftar.sql
-- (31 Okt 2026) Paket 3 arus kegiatan: pendaftaran Mitra pada seleksi (buka/tutup, ajakan, daftar/mundur).
-- Bergantung pada 20261031f_seleksi.sql. Dijalankan Iqbal sendiri. Aman diulang. Tes, nilai, dan peringkat menyusul (paket berikutnya).

alter table public.sigap_seleksi add column if not exists dibuka_at  timestamptz;
alter table public.sigap_seleksi add column if not exists ditutup_at timestamptz;
alter table public.sigap_seleksi add column if not exists ajakan_at  timestamptz;   -- terakhir push ajakan dikirim
alter table public.sigap_seleksi add column if not exists ajakan_jumlah integer not null default 0;

create table if not exists public.sigap_seleksi_peserta (
  seleksi_id   bigint      not null references public.sigap_seleksi(id) on delete cascade,
  akun_id      bigint      not null references public.sigap_akun(id)   on delete cascade,
  peran        text        not null check (peran in ('ppl', 'pml')),
  status       text        not null default 'terdaftar' check (status in ('terdaftar', 'mundur')),
  mendaftar_at timestamptz not null default now(),
  diubah_at    timestamptz not null default now(),
  primary key (seleksi_id, akun_id)
);
create index if not exists sigap_seleksi_peserta_akun_idx on public.sigap_seleksi_peserta (akun_id);

-- Hanya diakses lewat API server (service role).
alter table public.sigap_seleksi_peserta enable row level security;
