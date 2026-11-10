-- 20261110a_penilaian_360.sql
-- (10 Nov 2026) Penilaian 360 antaranggota tim Pendataan Bencana. Aturan: lib/penilaian360.ts. Hanya DDL baru, tanpa mengubah data lama; aman dijalankan ulang.
-- Akses HANYA lewat server (service role): RLS aktif tanpa kebijakan, jadi klien tidak bisa membaca nilai siapa pun.

create table if not exists sigap_penilaian360 (
  id bigserial primary key,
  kegiatan_id bigint not null,
  penilai_akun_id bigint not null references sigap_akun(id) on delete cascade,
  dinilai_akun_id bigint not null references sigap_akun(id) on delete cascade,
  kinerja smallint not null check (kinerja between 1 and 5),
  kedisiplinan smallint not null check (kedisiplinan between 1 and 5),
  tim smallint not null check (tim between 1 and 5),
  kerjasama smallint not null check (kerjasama between 1 and 5),
  komunikasi smallint not null check (komunikasi between 1 and 5),
  catatan text check (catatan is null or char_length(catatan) <= 300),
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now(),
  constraint sigap_penilaian360_bukan_diri check (penilai_akun_id <> dinilai_akun_id),
  constraint sigap_penilaian360_unik unique (kegiatan_id, penilai_akun_id, dinilai_akun_id)
);

create index if not exists sigap_penilaian360_dinilai_idx on sigap_penilaian360 (kegiatan_id, dinilai_akun_id);

alter table sigap_penilaian360 enable row level security;

-- Pemeriksaan sesudah dijalankan: select count(*) from sigap_penilaian360;  -- 0 baris, RLS aktif
