-- 20261101v_vanguard.sql
--
-- (1 Nov 2026) VANGUARD V2a: rekaman percobaan dan kesalahan petugas. AMAN DIULANG (create if not exists). Dijalankan Iqbal sendiri.
-- Prinsip: tidak ada data responden nyata; yang disimpan hanya isian petugas atas kasus FIKTIF. Kasus tidak disimpan di database (berkas JSON di repo);
-- yang dicatat kode kasus (stabil) dan versinya. Hanya server (service role) yang menulis dan membaca: RLS aktif tanpa kebijakan.
-- Simulasi bebas dari kartu promosi di Beranda TIDAK menulis apa pun ke sini (tidak ada kegiatan).

create table if not exists sigap_vanguard_percobaan (
  id            bigserial primary key,
  kegiatan_id   bigint      not null references sigap_kegiatan(id) on delete cascade,
  akun_id       bigint      not null references sigap_akun(id),
  kasus         text        not null check (kasus ~ '^[A-Z][0-9]{2}$'),
  versi         smallint    not null default 1 check (versi >= 1),
  mode          text        not null default 'latihan' check (mode in ('latihan','uji')),
  nomor         smallint    not null check (nomor >= 1),
  petunjuk      smallint    not null default 0 check (petunjuk between 0 and 3),
  lihat_jawaban boolean     not null default false,
  benar         boolean     not null,
  bintang       smallint    not null default 0 check (bintang between 0 and 3),
  jml_salah     smallint    not null default 0 check (jml_salah >= 0),
  jml_fatal     smallint    not null default 0 check (jml_fatal >= 0),
  durasi_dtk    integer     not null default 0 check (durasi_dtk between 0 and 86400),
  isian         jsonb       not null default '{}'::jsonb,
  dibuat_at     timestamptz not null default now(),
  unique (kegiatan_id, akun_id, kasus, nomor)
);

create index if not exists sigap_vanguard_percobaan_akun_idx on sigap_vanguard_percobaan (kegiatan_id, akun_id, kasus);
create index if not exists sigap_vanguard_percobaan_waktu_idx on sigap_vanguard_percobaan (kegiatan_id, dibuat_at desc);

create table if not exists sigap_vanguard_kesalahan (
  id            bigserial primary key,
  percobaan_id  bigint      not null references sigap_vanguard_percobaan(id) on delete cascade,
  kegiatan_id   bigint      not null,
  akun_id       bigint      not null,
  kasus         text        not null,
  sel           text,
  jenis         text        not null check (jenis in ('konversi_seminggu','konversi_sebulan','salah_letak','harus_kosong','belum_diisi','jebakan','alternatif','angka_meleset','kontrol_vii','diskrepansi')),
  tingkat       text        not null check (tingkat in ('fatal','berat','ringan')),
  nilai_petugas numeric,
  nilai_benar   numeric
);

create index if not exists sigap_vanguard_kesalahan_jenis_idx on sigap_vanguard_kesalahan (kegiatan_id, jenis, tingkat);
create index if not exists sigap_vanguard_kesalahan_perc_idx on sigap_vanguard_kesalahan (percobaan_id);
create index if not exists sigap_vanguard_kesalahan_akun_idx on sigap_vanguard_kesalahan (kegiatan_id, akun_id);

alter table sigap_vanguard_percobaan enable row level security;
alter table sigap_vanguard_kesalahan enable row level security;

-- Cek cepat (semua harus 2):
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sigap_vanguard_percobaan','sigap_vanguard_kesalahan');
