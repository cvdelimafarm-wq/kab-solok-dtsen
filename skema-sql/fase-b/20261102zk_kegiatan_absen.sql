-- 20261102zk_kegiatan_absen.sql
--
-- (2 Nov 2026) Pelatihan 5 tab, tahap E: mesin ABSEN PESERTA (kedatangan hari pertama memakai presensi yang sudah ada; di sini hanya presensi SESI).
-- AMAN DIULANG. Dijalankan Iqbal sendiri. Hanya server (service role) yang membaca dan menulis: RLS aktif tanpa kebijakan.
-- Nama berawalan netral `sigap_kegiatan_*` supaya dapat dipakai rapat lapangan dan Cekatan. TIDAK mengubah tabel presensi lama
-- (`sigap_pelatihan_presensi` tetap dasar presensi DATANG), jadi laporan kehadiran, Administrasi, dan Monitoring lama tidak terpengaruh.
-- Tanpa tabel ini kode tetap jalan: tab Absen peserta menampilkan catatan "SQL belum dijalankan".

-- Pengaturan sesi per kegiatan (opsional; tanpa baris dipakai bawaan kode: Sesi 1-4 pukul 08.00, 10.00, 13.30, 16.30; jendela 30 menit; radius radar 25 m).
create table if not exists sigap_kegiatan_absen_atur (
  kegiatan_id    bigint      primary key references sigap_kegiatan(id) on delete cascade,
  sesi           jsonb       not null default '[]'::jsonb,       -- [{no,label,jam}], jam "HH:MM" hanya rencana
  jendela_menit  integer     not null default 30 check (jendela_menit between 5 and 240),
  radius_m       integer     not null default 25 check (radius_m between 10 and 500),
  diubah_oleh    text,
  diubah_at      timestamptz not null default now(),
  check (jsonb_typeof(sesi) = 'array')
);

-- Satu baris = satu sesi absen pada satu hari (per kelas; kelas NULL = semua kelas). Dibuka pengelola, habis otomatis setelah jendela.
create table if not exists sigap_kegiatan_absen_sesi (
  id             bigserial   primary key,
  kegiatan_id    bigint      not null references sigap_kegiatan(id) on delete cascade,
  tanggal        date        not null,
  no             smallint    not null check (no between 1 and 12),
  label          text        not null,
  jam_rencana    text,
  kelas          integer,
  metode         text[]      not null default '{centang}',        -- subset dari centang, kode, radar
  kode           text,                                            -- tetap selama sesi (tidak berputar)
  radius_m       integer     not null default 25 check (radius_m between 10 and 500),
  jendela_menit  integer     not null default 30 check (jendela_menit between 5 and 240),
  status         text        not null default 'dibuka' check (status in ('dibuka','ditutup')),
  dibuka_oleh    text,
  dibuka_at      timestamptz not null default now(),
  tutup_at       timestamptz not null,                            -- dibuka_at + jendela_menit, dihitung di server
  ditutup_at     timestamptz,
  check (metode <@ array['centang','kode','radar']::text[])
);
create unique index if not exists sigap_kegiatan_absen_sesi_uniq on sigap_kegiatan_absen_sesi (kegiatan_id, tanggal, no, coalesce(kelas, 0));
create index if not exists sigap_kegiatan_absen_sesi_hari_idx on sigap_kegiatan_absen_sesi (kegiatan_id, tanggal);

-- Kehadiran sesi. diterima = false berarti percobaan radar di luar radius (dicatat untuk daftar "di luar radar"), bukan hadir.
create table if not exists sigap_kegiatan_absen_hadir (
  absen_sesi_id  bigint      not null references sigap_kegiatan_absen_sesi(id) on delete cascade,
  akun_id        bigint      not null references sigap_akun(id) on delete cascade,
  metode         text        not null check (metode in ('centang','kode','radar')),
  diterima       boolean     not null default true,
  manual         boolean     not null default false,              -- dicentang pengelola
  alasan         text,
  lat            double precision,
  lng            double precision,
  akurasi_m      double precision,
  jarak_m        double precision,
  dicatat_oleh   text,
  at             timestamptz not null default now(),
  primary key (absen_sesi_id, akun_id)
);

-- Posisi terbaru pengelola selama radar terbuka (satu baris per sesi, diperbarui berkala).
create table if not exists sigap_kegiatan_absen_posisi (
  absen_sesi_id  bigint      primary key references sigap_kegiatan_absen_sesi(id) on delete cascade,
  akun_id        bigint      not null references sigap_akun(id) on delete cascade,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  akurasi_m      double precision,
  at             timestamptz not null default now()
);

-- Percobaan salah ketik kode (batas 5x lalu tunggu 1 menit).
create table if not exists sigap_kegiatan_absen_salah (
  absen_sesi_id  bigint      not null references sigap_kegiatan_absen_sesi(id) on delete cascade,
  akun_id        bigint      not null references sigap_akun(id) on delete cascade,
  jumlah         integer     not null default 0,
  terakhir_at    timestamptz not null default now(),
  primary key (absen_sesi_id, akun_id)
);

-- Riwayat pembukaan sesi (termasuk pembukaan kembali).
create table if not exists sigap_kegiatan_absen_buka (
  id             bigserial   primary key,
  absen_sesi_id  bigint      not null references sigap_kegiatan_absen_sesi(id) on delete cascade,
  dibuka_oleh    text,
  dibuka_at      timestamptz not null default now(),
  tutup_at       timestamptz not null,
  disarankan_no  smallint,
  dipilih_no     smallint
);

alter table sigap_kegiatan_absen_atur   enable row level security;
alter table sigap_kegiatan_absen_sesi   enable row level security;
alter table sigap_kegiatan_absen_hadir  enable row level security;
alter table sigap_kegiatan_absen_posisi enable row level security;
alter table sigap_kegiatan_absen_salah  enable row level security;
alter table sigap_kegiatan_absen_buka   enable row level security;

-- Cek cepat (harus 6):
--   select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'sigap_kegiatan_absen_%';
