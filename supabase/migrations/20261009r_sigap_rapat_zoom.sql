-- (9 Okt 2026) SIGAP -- presensi rapat Zoom: modal di aplikasi petugas, hadir sah bila mengetik token (permintaan user).
-- Akses hanya lewat server (service role). RLS aktif tanpa kebijakan = klien anon/auth tidak bisa membaca token.
create table if not exists public.sigap_rapat (
  id bigserial primary key,
  judul text not null,
  aktif boolean not null default false,
  mulai_at timestamptz not null,
  selesai_at timestamptz not null,
  tautan text,
  meeting_id text,
  passcode text,
  token text not null,
  buka_menit integer not null default 15 check (buka_menit between 0 and 720),
  tutup_menit integer not null default 30 check (tutup_menit between 0 and 720),
  sasaran_peran text not null default 'semua' check (sasaran_peran in ('semua','ppl','pml')),
  sasaran_kegiatan_id bigint not null default 1,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now(),
  check (selesai_at > mulai_at)
);

create table if not exists public.sigap_rapat_hadir (
  id bigserial primary key,
  rapat_id bigint not null references public.sigap_rapat(id) on delete cascade,
  akun_id bigint not null,
  hadir_at timestamptz not null default now(),
  sumber text not null default 'mandiri' check (sumber in ('mandiri','manual')),
  alasan text,
  unique (rapat_id, akun_id)
);
create index if not exists sigap_rapat_hadir_rapat on public.sigap_rapat_hadir(rapat_id);

create table if not exists public.sigap_rapat_coba (
  id bigserial primary key,
  rapat_id bigint not null,
  akun_id bigint not null,
  at timestamptz not null default now(),
  ok boolean not null default false
);
create index if not exists sigap_rapat_coba_cari on public.sigap_rapat_coba(rapat_id, akun_id, at desc);

alter table public.sigap_rapat enable row level security;
alter table public.sigap_rapat_hadir enable row level security;
alter table public.sigap_rapat_coba enable row level security;
