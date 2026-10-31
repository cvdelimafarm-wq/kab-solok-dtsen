-- =====================================================================
-- 20261031d_push_pengaturan.sql
-- SIGAP - Pengaturan notifikasi otomatis PER KEGIATAN (31 Okt 2026)
--
-- Tab "3 · Notifikasi" di Kelola Pendataan. Empat tabel kecil + satu fungsi. Tidak mengubah tabel/fungsi yang ada; tanpa baris pengaturan,
-- perilaku = bawaan di kode (lib/pushPengaturan.ts): pengingat Translok 13.00/17.00/21.00 menyala, notifikasi alur FASIH menyala.
-- Aman diulang (if not exists / create or replace). Dijalankan oleh user (DDL produksi). Akses hanya service_role (RLS menyala, tanpa kebijakan).
--
--  1. sigap_push_pengaturan  (kegiatan_id, kunci) -> aktif + nilai jsonb          pengaturan yang diubah admin
--  2. sigap_push_denyut      kunci -> terakhir jalan + ringkasan                   "kesehatan" cron (pengingat, qc)
--  3. sigap_push_klaim       (tanggal, kegiatan_id, kunci) -> sekali per tahap     mencegah pengingat ganda saat cron 5 menit tumpang tindih
--  4. sigap_push_hitung      (tanggal, akun_id) -> jumlah push hari itu            batas total per petugas per hari (pesan penyemangat dsb.)
--     + sigap_push_hitung_tambah(tanggal, akun[])                                  menambah 1 untuk tiap akun yang menerima
-- =====================================================================

create table if not exists public.sigap_push_pengaturan (
  kegiatan_id bigint      not null references public.sigap_kegiatan(id) on delete cascade,
  kunci       text        not null,
  aktif       boolean     not null,
  nilai       jsonb       not null default '{}'::jsonb,
  diubah_oleh bigint,
  diubah_at   timestamptz not null default now(),
  primary key (kegiatan_id, kunci),
  constraint sigap_push_pengaturan_kunci_cek check (kunci in ('translok','umum','fasih_minta','fasih_kolam','fasih_batal','fasih_keluar','fasih_tolak','fasih_tugas'))
);

create table if not exists public.sigap_push_denyut (
  kunci      text        primary key,
  terakhir   timestamptz not null default now(),
  ringkasan  jsonb       not null default '{}'::jsonb
);

create table if not exists public.sigap_push_klaim (
  tanggal     date        not null,
  kegiatan_id bigint      not null references public.sigap_kegiatan(id) on delete cascade,
  kunci       text        not null,
  dibuat_at   timestamptz not null default now(),
  selesai_at  timestamptz,
  primary key (tanggal, kegiatan_id, kunci)
);

create table if not exists public.sigap_push_hitung (
  tanggal  date   not null,
  akun_id  bigint not null,
  jumlah   int    not null default 0,
  primary key (tanggal, akun_id)
);

alter table public.sigap_push_pengaturan enable row level security;
alter table public.sigap_push_denyut     enable row level security;
alter table public.sigap_push_klaim      enable row level security;
alter table public.sigap_push_hitung     enable row level security;

create or replace function public.sigap_push_hitung_tambah(p_tanggal date, p_akun bigint[])
returns void language sql as $$
  insert into public.sigap_push_hitung (tanggal, akun_id, jumlah)
  select p_tanggal, a, 1 from unnest(p_akun) as a
  on conflict (tanggal, akun_id) do update set jumlah = public.sigap_push_hitung.jumlah + 1;
$$;

revoke all on function public.sigap_push_hitung_tambah(date, bigint[]) from public, anon, authenticated;
grant execute on function public.sigap_push_hitung_tambah(date, bigint[]) to service_role;

-- Pemeriksaan (opsional): select kunci, count(*) from public.sigap_push_pengaturan group by 1;  -- kosong = semua bawaan
