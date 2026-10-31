-- 20261031e_mitra_pool.sql
-- (31 Okt 2026) Fondasi arus kegiatan: pool Mitra Kepka per tahun.
-- Mitra Kepka = Mitra yang disahkan Keputusan Kepala BPS; hanya mereka yang boleh dipekerjakan.
-- Satu baris = satu akun pada satu tahun. Akun jenis 'mitra' yang tidak punya baris tahun itu = "belum masuk pool".
-- Dijalankan Iqbal sendiri (Supabase SQL editor). Aman diulang (IF NOT EXISTS / ON CONFLICT DO NOTHING).

create table if not exists public.sigap_mitra_pool (
  akun_id    bigint      not null references public.sigap_akun(id) on delete cascade,
  tahun      integer     not null check (tahun between 2020 and 2100),
  status     text        not null default 'aktif' check (status in ('aktif', 'nonaktif')),
  no_kepka   text,
  catatan    text,
  diubah_oleh bigint     references public.sigap_akun(id) on delete set null,
  diubah_at  timestamptz not null default now(),
  primary key (akun_id, tahun)
);

create index if not exists sigap_mitra_pool_tahun_status_idx on public.sigap_mitra_pool (tahun, status);

-- Hanya diakses lewat API server (service role); tanpa kebijakan = klien anon/auth tidak bisa membaca.
alter table public.sigap_mitra_pool enable row level security;

-- ---------------------------------------------------------------------------------------------------------------
-- LANGKAH OPSIONAL (jalankan terpisah setelah memeriksa daftar di layar Pengguna):
-- Tandai semua akun Mitra AKTIF sebagai anggota pool 2026 sebagai titik awal. Daftar Mitra Kepka sudah ada di sistem
-- (761 akun Mitra, 759 aktif, 774 tertaut ke ekspor Kepka 4 Okt); yang tidak sah dinonaktifkan lewat layar.
--
-- insert into public.sigap_mitra_pool (akun_id, tahun, status, catatan)
-- select id, 2026, 'aktif', 'Awal: akun Mitra aktif per 31 Okt 2026'
-- from public.sigap_akun
-- where jenis = 'mitra' and aktif
-- on conflict (akun_id, tahun) do nothing;
