-- =====================================================================
-- 20261103c_translok_susulan.sql
-- SIGAP - "Ajukan susulan" translok (3 Nov 2026)
--
-- Petugas mengajukan melengkapi foto/laporan sebuah hari lampau, atau menambah hari kerja yang terlewat dipilih lalu melengkapinya lewat unggah.
-- Disetujui salah satu dari 2 atasan terdekat (PML -> Korwil -> Supervisor -> PJ kegiatan; tingkat kosong dilewati) atau admin translok.
-- Saat disetujui, API membuat (bila belum ada) baris sigap_hari_kerja dan baris sigap_izin_susulan berlaku 24 jam; tabel ini hanya menyimpan pengajuan,
-- keputusan, dan batas izin sebagai jejak. Jejak lengkap juga ada di sigap_audit dan sigap_hari_kerja_riwayat.
--
-- Satu pengajuan terbuka ('diajukan') per (penugasan, tanggal): dijaga indeks unik parsial.
-- Hanya service role (API) yang membaca / menulis. Tidak ada data lama yang diubah atau dihapus. Aman diulang. Dijalankan oleh user (DDL produksi).
-- =====================================================================

create table if not exists public.sigap_translok_susulan (
  id                bigserial primary key,
  kegiatan_id       bigint      not null references public.sigap_kegiatan(id),
  penugasan_id      bigint      not null references public.sigap_penugasan(id),
  akun_id           bigint      not null references public.sigap_akun(id),
  tanggal           date        not null,
  alasan            text        not null,
  status            text        not null default 'diajukan' check (status in ('diajukan', 'disetujui', 'ditolak', 'dibatalkan')),
  mode              text        check (mode in ('tambah', 'lengkapi')),
  diajukan_at       timestamptz not null default now(),
  keputusan_oleh    text,
  keputusan_akun_id bigint      references public.sigap_akun(id),
  keputusan_at      timestamptz,
  keputusan_catatan text,
  izin_sampai       timestamptz
);

create unique index if not exists sigap_translok_susulan_terbuka_unik
  on public.sigap_translok_susulan (penugasan_id, tanggal) where status = 'diajukan';
create index if not exists sigap_translok_susulan_kegiatan_idx on public.sigap_translok_susulan (kegiatan_id, status);
create index if not exists sigap_translok_susulan_akun_idx on public.sigap_translok_susulan (akun_id, diajukan_at desc);

alter table public.sigap_translok_susulan enable row level security;
revoke all on table public.sigap_translok_susulan from anon, authenticated;
grant all on table public.sigap_translok_susulan to service_role;
grant usage, select on sequence public.sigap_translok_susulan_id_seq to service_role;
