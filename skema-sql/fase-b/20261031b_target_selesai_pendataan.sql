-- skema-sql/fase-b/20261031b_target_selesai_pendataan.sql
-- (31 Okt 2026) TARGET SELESAI PENDATAAN per kegiatan. Beranda membandingkan realisasi KK dengan sisa hari kerja sampai tanggal ini
-- (bukan sampai akhir masa lapangan). Kosong = Beranda memakai tanggal selesai periode. Diisi di Admin > Data kegiatan > "Target selesai pendataan".
-- Aman dijalankan berulang; tidak mengubah data yang ada. Dijalankan MANUAL oleh Iqbal di Supabase SQL Editor.

alter table public.sigap_kegiatan add column if not exists target_selesai date;
comment on column public.sigap_kegiatan.target_selesai is 'Target selesai pendataan (batas realisasi di Beranda); kosong = tanggal_selesai periode';

-- Pemeriksaan (opsional): kolom ada dan masih kosong untuk semua kegiatan
select id, kode, tanggal_mulai, tanggal_selesai, target_selesai from public.sigap_kegiatan order by id;
