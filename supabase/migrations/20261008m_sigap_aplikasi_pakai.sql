-- (8 Okt 2026) Pemantauan pemasangan aplikasi SIGAP (PWA): satu baris per akun.
-- "terpasang" = akun itu pernah membuka SIGAP dalam mode aplikasi (layar penuh dari ikon layar utama), bukan sekadar tab browser.
-- Diisi oleh /api/sigap/ping (otomatis saat SIGAP dibuka, dibatasi tiap 30 menit). Hanya diakses server (service role).
create table if not exists public.sigap_aplikasi_pakai (
  akun_id bigint primary key references public.sigap_akun(id),
  terpasang boolean not null default false,
  pertama_aplikasi_at timestamptz,
  terakhir_aplikasi_at timestamptz,
  terakhir_browser_at timestamptz,
  platform text,
  dibuat_at timestamptz not null default now(),
  diperbarui_at timestamptz not null default now()
);
alter table public.sigap_aplikasi_pakai enable row level security;
