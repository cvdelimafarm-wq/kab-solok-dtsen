-- 20261101z_vanguard_sertifikasi.sql
--
-- (1 Nov 2026) VANGUARD V7d: Ujian Sertifikasi kemampuan petugas. AMAN DIULANG (create if not exists). Dijalankan Iqbal sendiri di Supabase SQL Editor.
-- Sertifikasi BELUM berdampak ke mana pun (kepemilikan saja): tabel berdiri sendiri, tidak terhubung ke penilaian mitra, seleksi, kelulusan pelatihan, atau kegiatan.
-- Soal tidak disimpan: yang dicatat hanya kode kasus dan BENIH angka acak (soal dan kunci dibangun ulang di server dari benih). Isian petugas atas kasus fiktif disimpan.
-- Hanya server (service role) yang menulis dan membaca: RLS aktif tanpa kebijakan.

create table if not exists sigap_vanguard_ujian (
  id            bigserial primary key,
  akun_id       bigint      not null references sigap_akun(id),
  jenis         text        not null check (jenis in ('sertifikasi','latihan')),
  versi         smallint    not null default 1 check (versi >= 1),
  benih         integer     not null check (benih >= 0),
  jumlah        smallint    not null check (jumlah between 1 and 50),
  mulai_at      timestamptz not null default now(),
  selesai_at    timestamptz,
  skor          numeric(5,2) check (skor between 0 and 100),
  tingkat       smallint    check (tingkat between 1 and 5),
  butir_fatal   smallint    check (butir_fatal >= 0)
);

create index if not exists sigap_vanguard_ujian_akun_idx on sigap_vanguard_ujian (akun_id, mulai_at desc);

create table if not exists sigap_vanguard_ujian_butir (
  id          bigserial primary key,
  ujian_id    bigint      not null references sigap_vanguard_ujian(id) on delete cascade,
  urut        smallint    not null check (urut >= 1),
  kasus       text        not null check (kasus ~ '^[A-Z][0-9]{2}$'),
  jenis       text        not null check (jenis in ('k','v1')),
  benih       integer     not null check (benih >= 1),
  jawab_at    timestamptz,
  benar       boolean,
  poin        smallint    check (poin between 0 and 100),
  jml_fatal   smallint    check (jml_fatal >= 0),
  jml_berat   smallint    check (jml_berat >= 0),
  jml_ringan  smallint    check (jml_ringan >= 0),
  rincian     jsonb       not null default '[]'::jsonb,
  isian       jsonb       not null default '{}'::jsonb,
  durasi_dtk  integer     not null default 0 check (durasi_dtk between 0 and 86400),
  unique (ujian_id, urut)
);

create index if not exists sigap_vanguard_ujian_butir_ujian_idx on sigap_vanguard_ujian_butir (ujian_id);
create index if not exists sigap_vanguard_ujian_butir_kasus_idx on sigap_vanguard_ujian_butir (kasus);

alter table sigap_vanguard_ujian enable row level security;
alter table sigap_vanguard_ujian_butir enable row level security;

-- Cek cepat (harus 2):
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sigap_vanguard_ujian','sigap_vanguard_ujian_butir');
