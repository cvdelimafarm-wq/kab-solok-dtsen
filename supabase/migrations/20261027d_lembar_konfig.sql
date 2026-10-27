-- 20261027d_lembar_konfig.sql
-- (27 Okt 2026) Pengaturan Lembar Pendataan PER KEGIATAN (permintaan user): nama/warna/bentuk/alasan tombol hasil dan variabel radar sekitar,
-- agar kegiatan berbeda (mis. Pendataan Pascabencana dan Updating) memakai Lembar Pendataan yang sama dengan istilah berbeda.
-- Kategori hasil di database TETAP tiga (terdampak / tidak_terdampak / tidak_ditemukan); yang berganti hanya tampilan di layar.
-- Satu baris per kegiatan; kegiatan tanpa baris memakai tampilan bawaan di aplikasi (lib/lembarKonfig.ts: KONFIG_BAWAAN) = tampilan Pascabencana sekarang.
-- Semua akses lewat API server (service_role); RLS aktif tanpa kebijakan. Tidak ada data lain yang diubah. Aman dijalankan ulang.

create table if not exists public.sigap_lembar_konfig (
  kegiatan_id bigint primary key references public.sigap_kegiatan(id),
  konfig      jsonb not null check (jsonb_typeof(konfig) = 'object' and jsonb_typeof(konfig -> 'hasil') = 'object' and jsonb_typeof(konfig -> 'radar') = 'object'),
  diubah_oleh text,
  diubah_at   timestamptz not null default now()
);
alter table public.sigap_lembar_konfig enable row level security;
