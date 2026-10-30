-- =====================================================================
-- 20261030a_spdt_dokumen_periksa.sql
-- SIGAP - SPDT NTP: Dokumen hasil pemeriksaan (PDF scan) dari PML (30 Okt 2026)
--
-- PML SPDT NTP mengunggah PDF scan hasil pemeriksaan dari tab "Dokumen" di Lembar Pendataan SPDT NTP; Supervisor SPDT NTP mengunduhnya di tab yang sama.
-- (Menggantikan rancangan awal 20261029g yang salah tempat di Pendataan Pascabencana; tabel bencana_dokumen_periksa tidak dipakai lagi.)
--  * berkas di penyimpanan sigap-files (pemeriksaan/<kegiatan>/<akun PML>/<hash>.pdf); tabel ini hanya mencatat metadata;
--  * pml_akun_id = sigap_akun.id PML (sama dengan sigap_spdt_kk.pml_akun_id);
--  * wilayah = kunci "NAGARI|JORONG" dari KK milik PML (opsional);
--  * tidak ada penghapusan permanen: PML "menarik" dokumen lewat dihapus_at, berkas dan baris tetap tersimpan;
--  * isi yang sama (sha256) dari PML yang sama tidak tercatat dua kali selama belum ditarik (unggah ulang aman);
--  * semua akses lewat API server (service_role); RLS aktif tanpa kebijakan.
--
-- Aman diulang (create if not exists).
-- =====================================================================
create table if not exists public.sigap_spdt_dokumen (
  id              bigserial primary key,
  kegiatan_id     bigint  not null default 2 references public.sigap_kegiatan(id),
  pml_akun_id     bigint  not null references public.sigap_akun(id),
  judul           text    not null check (length(btrim(judul)) between 1 and 120),
  keterangan      text    check (keterangan is null or length(keterangan) <= 500),
  wilayah         text    check (wilayah is null or length(wilayah) <= 120),
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
create unique index if not exists sigap_spdt_dokumen_unik_aktif
  on public.sigap_spdt_dokumen (kegiatan_id, pml_akun_id, sha256) where dihapus_at is null;
create index if not exists sigap_spdt_dokumen_kegiatan
  on public.sigap_spdt_dokumen (kegiatan_id, diunggah_at desc) where dihapus_at is null;
create index if not exists sigap_spdt_dokumen_pml
  on public.sigap_spdt_dokumen (pml_akun_id, diunggah_at desc) where dihapus_at is null;

alter table public.sigap_spdt_dokumen enable row level security;
revoke all on public.sigap_spdt_dokumen from anon, authenticated;
