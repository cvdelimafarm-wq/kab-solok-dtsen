-- (8 Okt 2026) Notifikasi push SIGAP (web push / PWA).
-- sigap_push_langganan: satu baris per perangkat/browser yang mengizinkan notifikasi (endpoint unik).
-- sigap_push_log: riwayat pengiriman dari panitia (isi + jumlah terkirim). Kedua tabel hanya diakses server (service role).
create table if not exists public.sigap_push_langganan (
  id bigserial primary key,
  akun_id bigint not null references public.sigap_akun(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  perangkat text,
  aktif boolean not null default true,
  gagal integer not null default 0,
  dibuat_at timestamptz not null default now(),
  diperbarui_at timestamptz not null default now(),
  terakhir_ok_at timestamptz
);
create index if not exists sigap_push_langganan_akun_idx on public.sigap_push_langganan (akun_id) where aktif;
alter table public.sigap_push_langganan enable row level security;

create table if not exists public.sigap_push_log (
  id bigserial primary key,
  kegiatan_id bigint references public.sigap_kegiatan(id),
  oleh_akun_id bigint references public.sigap_akun(id),
  jenis text not null default 'panitia',
  judul text not null,
  isi text not null,
  url text,
  jumlah_akun integer not null default 0,
  jumlah_perangkat integer not null default 0,
  terkirim integer not null default 0,
  gagal integer not null default 0,
  dibuat_at timestamptz not null default now()
);
create index if not exists sigap_push_log_dibuat_idx on public.sigap_push_log (dibuat_at desc);
alter table public.sigap_push_log enable row level security;
