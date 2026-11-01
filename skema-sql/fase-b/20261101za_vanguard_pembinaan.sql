-- 20261101za_vanguard_pembinaan.sql
--
-- (1 Nov 2026) VANGUARD V8: pembinaan berkelanjutan. AMAN DIULANG. Dijalankan Iqbal sendiri di Supabase SQL Editor. Tidak mengubah data yang ada.
--   1) sigap_vanguard_ujian.jenis diperluas: 'sertifikasi','latihan' + 'harian' (Latihan Harian) dan 'tantangan' (Tantangan Mingguan).
--   2) sigap_vanguard_tantangan: satu baris per minggu (nomor minggu WIB, Senin awal minggu) berisi butir tantangan yang SAMA untuk semua petugas.
--   3) sigap_vanguard_usulan: Usul Kasus oleh petugas dan tinjauan admin (tanpa data responden asli).
-- Streak dan kesegaran sertifikat dihitung dari tabel ujian (tidak butuh tabel baru). Hanya server (service role) yang menulis dan membaca: RLS aktif tanpa kebijakan.

do $$
declare
  nama text;
begin
  for nama in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.sigap_vanguard_ujian'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%sertifikasi%' and pg_get_constraintdef(c.oid) ilike '%latihan%'
  loop
    execute format('alter table public.sigap_vanguard_ujian drop constraint %I', nama);
  end loop;
  alter table public.sigap_vanguard_ujian
    add constraint sigap_vanguard_ujian_jenis_cek check (jenis in ('sertifikasi','latihan','harian','tantangan'));
exception when duplicate_object then
  null;
end $$;

create table if not exists sigap_vanguard_tantangan (
  minggu     integer     primary key,
  butir      jsonb       not null,
  dibuat_at  timestamptz not null default now()
);

create table if not exists sigap_vanguard_usulan (
  id             bigserial primary key,
  akun_id        bigint      not null references sigap_akun(id),
  judul          text        not null check (char_length(judul) between 5 and 120),
  cerita         text        not null check (char_length(cerita) between 30 and 1500),
  jawaban        text        check (jawaban is null or char_length(jawaban) <= 1500),
  blok           text        check (blok is null or char_length(blok) <= 60),
  status         text        not null default 'baru' check (status in ('baru','diterima','ditolak','dikerjakan')),
  catatan_admin  text        check (catatan_admin is null or char_length(catatan_admin) <= 600),
  dibuat_at      timestamptz not null default now(),
  ditinjau_at    timestamptz,
  ditinjau_oleh  bigint      references sigap_akun(id)
);

create index if not exists sigap_vanguard_usulan_akun_idx on sigap_vanguard_usulan (akun_id, id desc);
create index if not exists sigap_vanguard_usulan_status_idx on sigap_vanguard_usulan (status, id desc);

alter table sigap_vanguard_tantangan enable row level security;
alter table sigap_vanguard_usulan enable row level security;

-- Cek cepat (3 baris: tabel tantangan, tabel usulan, dan constraint jenis memuat 'harian'):
-- select count(*) from information_schema.tables where table_schema='public' and table_name in ('sigap_vanguard_tantangan','sigap_vanguard_usulan');  -- harus 2
-- select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.sigap_vanguard_ujian'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%harian%';  -- 1 baris
