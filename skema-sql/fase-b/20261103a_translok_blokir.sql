-- =====================================================================
-- 20261103a_translok_blokir.sql
-- SIGAP - Blokir sementara translok petugas + "Ajukan unblock" (3 Nov 2026)
--
-- Permintaan user: petugas tertentu (mula-mula Jahar Nas) diblokir sementara dari translok. Halamannya tertutup modal; untuk membuka, petugas menekan
-- "Ajukan unblock", permintaannya muncul di tab Hari ini milik PML / Korwil / Supervisor (dan admin translok) untuk disetujui atau ditolak.
--
-- Satu baris per (kegiatan, akun). status: 'blokir' (diblokir, belum mengajukan atau ditolak) | 'diajukan' (menunggu persetujuan) | 'dibuka' (disetujui).
-- Hanya 'blokir' dan 'diajukan' yang memblokir. Riwayat keputusan terakhir tersimpan di baris; jejak lengkap ada di sigap_audit.
-- Hanya service role (API) yang membaca / menulis. Tidak ada data lama yang diubah atau dihapus. Aman diulang. Dijalankan oleh user (DDL produksi).
-- =====================================================================

create table if not exists public.sigap_translok_blokir (
  id               bigserial primary key,
  kegiatan_id      bigint      not null references public.sigap_kegiatan(id),
  akun_id          bigint      not null references public.sigap_akun(id),
  status           text        not null default 'blokir' check (status in ('blokir', 'diajukan', 'dibuka')),
  alasan_blokir    text,
  diblokir_oleh    text,
  diblokir_at      timestamptz not null default now(),
  alasan_unblock   text,
  diajukan_at      timestamptz,
  keputusan_oleh   text,
  keputusan_at     timestamptz,
  keputusan_catatan text,
  constraint sigap_translok_blokir_unik unique (kegiatan_id, akun_id)
);

create index if not exists sigap_translok_blokir_aktif_idx on public.sigap_translok_blokir (kegiatan_id, status) where status in ('blokir', 'diajukan');

alter table public.sigap_translok_blokir enable row level security;
revoke all on table public.sigap_translok_blokir from anon, authenticated;
grant all on table public.sigap_translok_blokir to service_role;
grant usage, select on sequence public.sigap_translok_blokir_id_seq to service_role;
