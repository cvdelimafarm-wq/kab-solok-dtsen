-- (7 Okt 2026) SIGAP > Pelatihan > Langkah Pelatihan: catatan langkah yg tidak bisa diturunkan dari data lain
-- (undangan sudah dibuka, instrumen sudah diunduh). Satu baris per akun per langkah.
create table if not exists sigap_pelatihan_langkah (
  akun_id bigint not null references sigap_akun(id) on delete cascade,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  kode text not null check (kode in ('undangan','instrumen')),
  at timestamptz not null default now(),
  primary key (akun_id, kegiatan_id, kode)
);
alter table sigap_pelatihan_langkah enable row level security;
