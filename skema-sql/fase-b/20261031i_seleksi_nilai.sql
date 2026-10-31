-- 20261031i_seleksi_nilai.sql  (31 Okt 2026)  Paket 4: tes seleksi, kertas kerja penilaian, peringkat, pengumuman, konfirmasi.
-- Syarat: 20261031f dan 20261031g sudah dijalankan. Aman dijalankan ulang.

-- 1) Kolom tambahan seleksi: tes, pengumuman, konfirmasi
alter table sigap_seleksi
  add column if not exists tes_aktif          boolean     not null default false,
  add column if not exists tes_buka_at        timestamptz,
  add column if not exists tes_tutup_at       timestamptz,
  add column if not exists tes_durasi_menit   int         not null default 30 check (tes_durasi_menit between 1 and 240),
  add column if not exists info_pelatihan     text,
  add column if not exists ditetapkan_at      timestamptz,
  add column if not exists diumumkan_at       timestamptz,
  add column if not exists konfirmasi_batas   timestamptz;

-- 2) Hasil per pendaftar
alter table sigap_seleksi_peserta
  add column if not exists skor_akhir     numeric(6,2),
  add column if not exists peringkat      int,
  add column if not exists grup           text,
  add column if not exists hasil          text check (hasil in ('lulus','cadangan','tidak')),
  add column if not exists konfirmasi     text check (konfirmasi in ('bersedia','menolak')),
  add column if not exists konfirmasi_at  timestamptz,
  add column if not exists ditugaskan_at  timestamptz;

-- 3) Kertas kerja penilaian: variabel berbobot
create table if not exists sigap_seleksi_variabel (
  id         bigint generated always as identity primary key,
  seleksi_id bigint not null references sigap_seleksi(id) on delete cascade,
  kode       text   not null,
  nama       text   not null,
  sumber     text   not null check (sumber in ('tes','rekam_jejak','jarak','manual')),
  bobot      numeric(6,2) not null check (bobot > 0 and bobot <= 100),
  urutan     int    not null default 0,
  unique (seleksi_id, kode)
);
alter table sigap_seleksi_variabel enable row level security;

-- nilai variabel manual per pendaftar (variabel otomatis dihitung saat dibaca, tidak disimpan)
create table if not exists sigap_seleksi_nilai (
  variabel_id bigint not null references sigap_seleksi_variabel(id) on delete cascade,
  akun_id     bigint not null references sigap_akun(id),
  nilai       numeric(5,1) not null check (nilai >= 0 and nilai <= 100),
  diisi_oleh  bigint references sigap_akun(id),
  diubah_at   timestamptz not null default now(),
  primary key (variabel_id, akun_id)
);
alter table sigap_seleksi_nilai enable row level security;

-- 4) Tes seleksi: soal dan sesi pengerjaan (satu kali per pendaftar)
create table if not exists sigap_seleksi_soal (
  seleksi_id bigint  not null references sigap_seleksi(id) on delete cascade,
  nomor      int     not null,
  teks       text    not null,
  opsi       jsonb   not null,
  kunci      text    not null,
  bobot      numeric not null default 1,
  primary key (seleksi_id, nomor)
);
alter table sigap_seleksi_soal enable row level security;

create table if not exists sigap_seleksi_sesi (
  seleksi_id bigint not null references sigap_seleksi(id) on delete cascade,
  akun_id    bigint not null references sigap_akun(id),
  mulai_at   timestamptz not null default now(),
  batas_at   timestamptz not null,
  selesai_at timestamptz,
  jawaban    jsonb  not null default '{}'::jsonb,
  skor       numeric(6,2),
  benar      int,
  total      int,
  primary key (seleksi_id, akun_id)
);
alter table sigap_seleksi_sesi enable row level security;
