-- (8 Okt 2026) SIGAP > Pelatihan: nomor HP untuk pengisian pulsa (Transport Lokal pelatihan).
-- Petugas melihat nomor HP asli (dari data bencana/penyisiran), lalu mengonfirmasi atau menggantinya dengan
-- nomor lain KHUSUS untuk pengisian pulsa. Nomor HP asli di tabel sumber TIDAK diubah.
create table if not exists public.sigap_pelatihan_pulsa (
  kegiatan_id    bigint      not null references public.sigap_kegiatan(id) on delete cascade,
  akun_id        bigint      not null references public.sigap_akun(id) on delete cascade,
  no_hp_asli     text,                       -- nomor asli saat dikonfirmasi (jejak; bisa kosong bila belum tercatat)
  no_pulsa       text        not null,       -- nomor tujuan pengisian pulsa (format 08xxxxxxxxxx)
  diubah         boolean     not null default false, -- true bila berbeda dari nomor asli
  dikonfirmasi_at timestamptz not null default now(),
  primary key (kegiatan_id, akun_id)
);
alter table public.sigap_pelatihan_pulsa enable row level security; -- akses hanya lewat service role (API)
