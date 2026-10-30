-- =====================================================================
-- 20261030e_kegiatan_fitur.sql
-- SIGAP - PROFIL FITUR KEGIATAN (30 Okt 2026)
--
-- Permintaan user: fitur yang ada di Pendataan Pascabencana dan SPDT NTP tersedia untuk kedua kegiatan; bila tidak cocok untuk satu kegiatan ada mekanisme
-- centang yang mengikuti STRATEGI dan jenis kegiatan, supaya SIGAP bisa dipakai untuk banyak jenis kegiatan dan tetap bisa disesuaikan.
--
--  1. sigap_kegiatan.strategi: status_per_sasaran | lembar_bantu | sampel_sls | pelatihan | umum (bawaan 'umum').
--     Kegiatan yang sudah ada diisi sesuai cara kerjanya sekarang: Pascabencana = status_per_sasaran, SPDT NTP = lembar_bantu, Pelatihan PSP = pelatihan.
--  2. sigap_kegiatan_fitur: centang fitur per kegiatan (hanya yang BERBEDA dari paket bawaan strategi). Daftar fitur ada di kode (lib/sigapFitur.ts);
--     kode fitur tidak diperiksa di basis data supaya fitur baru tidak memerlukan migrasi.
--
-- Perilaku Pascabencana, SPDT NTP, dan Pelatihan tidak berubah. Tidak ada data dihapus. Aman diulang (add column if not exists / create table if not exists).
-- Jalankan oleh user (DDL produksi); lalu supabase/tests/80_uji_kegiatan_fitur.sql.
-- =====================================================================

alter table public.sigap_kegiatan add column if not exists strategi text not null default 'umum';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sigap_kegiatan'::regclass and conname = 'sigap_kegiatan_strategi_cek') then
    alter table public.sigap_kegiatan add constraint sigap_kegiatan_strategi_cek check (strategi in ('status_per_sasaran', 'lembar_bantu', 'sampel_sls', 'pelatihan', 'umum'));
  end if;
end $$;

-- isi awal hanya bila masih bawaan ('umum'), jadi pilihan yang sudah diubah tidak tertimpa bila migrasi diulang
update public.sigap_kegiatan set strategi = 'status_per_sasaran' where kode = 'pascabencana_2026' and strategi = 'umum';
update public.sigap_kegiatan set strategi = 'lembar_bantu'       where kode = 'spdt_ntp_2026'      and strategi = 'umum';
update public.sigap_kegiatan set strategi = 'pelatihan'          where jenis = 'pelatihan'         and strategi = 'umum';

create table if not exists public.sigap_kegiatan_fitur (
  kegiatan_id bigint  not null references public.sigap_kegiatan(id) on delete cascade,
  fitur       text    not null check (char_length(fitur) between 1 and 60),
  aktif       boolean not null,
  diubah_oleh text,
  diubah_at   timestamptz not null default now(),
  primary key (kegiatan_id, fitur)
);
alter table public.sigap_kegiatan_fitur enable row level security;
revoke all on public.sigap_kegiatan_fitur from anon, authenticated;
grant select, insert, update, delete on public.sigap_kegiatan_fitur to service_role;

comment on column public.sigap_kegiatan.strategi is 'Strategi kegiatan: memilih paket fitur bawaan Kelola Pendataan (lib/sigapFitur.ts).';
comment on table public.sigap_kegiatan_fitur is 'Centang fitur per kegiatan yang berbeda dari paket bawaan strategi (lib/sigapFitur.ts). Hanya service role.';
