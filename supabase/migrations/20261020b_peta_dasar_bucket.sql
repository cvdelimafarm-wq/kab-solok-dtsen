-- 20261020b_peta_dasar_bucket.sql
--
-- (20 Okt 2026) Bucket Storage "peta-dasar": berkas peta jalan (.pmtiles) per tim PML + manifest.json, dibaca aplikasi (tab Peta Lembar Pendataan).
-- Publik BACA (isinya hanya peta OpenStreetMap, tanpa data pribadi); TULIS hanya lewat kunci service (scripts/peta/potong-peta.mjs --unggah),
-- sehingga tidak ada kebijakan RLS untuk tulis. Aman diulang.
--
-- Batas per berkas 50 MB = batas paket gratis Supabase (batas global proyek di Storage settings tetap berlaku; bila lebih kecil, unggahan ditolak).

insert into storage.buckets (id, name, public, file_size_limit)
values ('peta-dasar', 'peta-dasar', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

-- Pemeriksaan: harus 1 baris, public = true.
select id, name, public, file_size_limit from storage.buckets where id = 'peta-dasar';

-- PEMBATALAN (komentar; hanya bila perlu): kosongkan dulu isinya lewat dashboard Storage, lalu
--   delete from storage.buckets where id = 'peta-dasar';
