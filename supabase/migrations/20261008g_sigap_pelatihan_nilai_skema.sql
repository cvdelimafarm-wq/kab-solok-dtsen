-- (8 Okt 2026) SIGAP > Pelatihan: skema nilai akhir peserta (Pretest + Posttest + Kuis Adu Sigap).
-- Satu baris per kegiatan; komponen yang dicentang (pakai_*) dihitung dengan bobot (bobot_*, total komponen terpilih = 100).
-- Dipakai bersama oleh Kelola Pelatihan (Soal & Jadwal, Monitoring), tab Administrasi, dan Laporan Pelatihan.
-- Tanpa baris = skema bawaan aplikasi (pretest 20 / posttest 50 / kuis 30, kuis dari % jawaban benar).
create table if not exists public.sigap_pelatihan_nilai_skema (
  kegiatan_id    bigint      primary key references public.sigap_kegiatan(id) on delete cascade,
  pakai_pretest  boolean     not null default true,
  pakai_posttest boolean     not null default true,
  pakai_kuis     boolean     not null default true,
  bobot_pretest  integer     not null default 20 check (bobot_pretest between 0 and 100),
  bobot_posttest integer     not null default 50 check (bobot_posttest between 0 and 100),
  bobot_kuis     integer     not null default 30 check (bobot_kuis between 0 and 100),
  dasar_kuis     text        not null default 'benar' check (dasar_kuis in ('benar', 'poin')),
  diubah_at      timestamptz not null default now(),
  diubah_oleh    bigint
);
alter table public.sigap_pelatihan_nilai_skema enable row level security; -- akses hanya lewat service role (API)
