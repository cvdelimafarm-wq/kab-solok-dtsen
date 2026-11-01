-- 20261101s_seleksi_kelas_pilihan.sql
--
-- (1 Nov 2026) Mitra yang lulus seleksi memilih KELAS pelatihan saat menyatakan bersedia (bila perannya punya lebih dari satu kelas pada perencanaan).
-- Nomor kelas = urutan kelas pada identifikasi lanjutan yang tertaut ke kegiatan (sama dengan sigap_penugasan.kelas). Dipakai saat penugasan otomatis dibuat
-- (lib/portal/seleksiPenugasan.ts). Aman dijalankan berulang; kode tetap berjalan bila SQL ini belum dijalankan (pilihan dianggap kosong).

alter table public.sigap_seleksi_peserta
  add column if not exists kelas_pilihan smallint check (kelas_pilihan is null or kelas_pilihan >= 1);

comment on column public.sigap_seleksi_peserta.kelas_pilihan is
  'Nomor kelas pelatihan yang dipilih Mitra saat konfirmasi bersedia (urutan kelas pada identifikasi lanjutan tertaut); null = tidak memilih / hanya satu kelas.';
