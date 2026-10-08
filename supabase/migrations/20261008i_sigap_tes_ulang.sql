-- (8 Okt 2026) SIGAP > Pelatihan > Tes: kesempatan mengulang (dipakai untuk Posttest).
-- sigap_tes.ulang_maks = jumlah percobaan maksimal per peserta (1 = tidak boleh mengulang; diatur di Kelola Pelatihan > Soal & Jadwal).
-- Saat peserta mengulang, baris sesi lama DIARSIPKAN ke sigap_tes_sesi_arsip (tidak dihapus), lalu baris sesi di-reset untuk percobaan baru.
-- Nilai resmi = skor tertinggi dari semua percobaan: max(skor percobaan berjalan yang selesai, skor_terbaik percobaan sebelumnya).
alter table public.sigap_tes add column if not exists ulang_maks smallint not null default 1 check (ulang_maks between 1 and 5);
alter table public.sigap_tes_sesi add column if not exists percobaan smallint not null default 1, add column if not exists skor_terbaik numeric;

create table if not exists public.sigap_tes_sesi_arsip (
  id bigserial primary key,
  sesi_id bigint not null references public.sigap_tes_sesi(id) on delete cascade,
  tes_id bigint not null,
  akun_id bigint not null,
  percobaan smallint not null,
  mulai_at timestamptz not null,
  batas_at timestamptz not null,
  selesai_at timestamptz,
  jawaban jsonb not null default '{}'::jsonb,
  skor numeric,
  benar integer,
  total integer,
  diarsipkan_at timestamptz not null default now(),
  unique (sesi_id, percobaan)
);
alter table public.sigap_tes_sesi_arsip enable row level security; -- akses hanya lewat service role (API)
