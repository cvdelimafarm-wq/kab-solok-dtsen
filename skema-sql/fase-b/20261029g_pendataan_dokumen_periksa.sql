-- =====================================================================
-- 20261029g_pendataan_dokumen_periksa.sql
-- SIGAP - Dokumen hasil pemeriksaan (PDF scan) dari PML (29 Okt 2026)
--
-- PML mengunggah PDF scan hasil pemeriksaan dari Lembar Pendataan; admin/supervisor mengunduhnya di Kelola Pendataan > QC > Dokumen pemeriksaan.
--  * berkas di penyimpanan sigap-files (pemeriksaan/<kegiatan>/<pml>/<hash>.pdf); tabel ini hanya mencatat metadata;
--  * tidak ada penghapusan permanen: PML "menarik" dokumen lewat dihapus_at, berkas dan baris tetap tersimpan;
--  * isi yang sama (sha256) dari PML yang sama tidak tercatat dua kali selama belum ditarik (unggah ulang aman);
--  * semua akses lewat API server (service_role); tabel tanpa kebijakan RLS.
--
-- Aman diulang (create if not exists).
-- =====================================================================
create table if not exists public.bencana_dokumen_periksa (
  id              bigserial primary key,
  kegiatan_id     bigint  not null default 1 references public.sigap_kegiatan(id),
  pml_id          bigint  not null references public.bencana_petugas(id),
  akun_id         bigint  not null references public.sigap_akun(id),
  judul           text    not null check (length(btrim(judul)) between 1 and 120),
  keterangan      text    check (keterangan is null or length(keterangan) <= 500),
  idsubsls        text,
  tanggal_periksa date,
  file_path       text    not null,
  nama_asli       text,
  ukuran_byte     integer not null check (ukuran_byte > 0),
  sha256          text    not null check (length(sha256) = 64),
  diunggah_at     timestamptz not null default now(),
  dihapus_at      timestamptz,
  dihapus_oleh    bigint  references public.sigap_akun(id)
);

-- satu isi yang sama dari PML yang sama hanya satu catatan aktif
create unique index if not exists bencana_dokumen_periksa_unik_aktif
  on public.bencana_dokumen_periksa (kegiatan_id, pml_id, sha256) where dihapus_at is null;
create index if not exists bencana_dokumen_periksa_kegiatan
  on public.bencana_dokumen_periksa (kegiatan_id, diunggah_at desc) where dihapus_at is null;
create index if not exists bencana_dokumen_periksa_pml
  on public.bencana_dokumen_periksa (pml_id, diunggah_at desc) where dihapus_at is null;

alter table public.bencana_dokumen_periksa enable row level security;
revoke all on public.bencana_dokumen_periksa from anon, authenticated;
