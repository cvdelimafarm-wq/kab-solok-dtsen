-- 20261102zo_pindah_berkas_seruti_ke_kegiatan7.sql
-- Berkas instrumen yang diunggah untuk Pelatihan Petugas Seruti TW IV (kegiatan 7) sempat tersimpan di kegiatan 3 (PSP) karena unggahan
-- tidak membawa penanda ?kegiatan= (sudah diperbaiki di push 98). Jalankan sekali; aman diulang.
-- Berkas id 3 (kuesioner) dan id 4 (pedoman) dipindah ke kegiatan 7; id 2 (duplikat) disembunyikan. Id 1 (kuesioner PSP dari repo) TIDAK disentuh.
-- Jalur penyimpanan (pelatihan/3/...) tetap valid, tidak perlu memindah berkasnya.

-- 0) Lihat dulu (tidak mengubah apa pun)
SELECT id, kegiatan_id, jenis, judul, nama_file, aktif
FROM sigap_pelatihan_berkas
WHERE id IN (1, 2, 3, 4)
ORDER BY id;

BEGIN;

UPDATE sigap_pelatihan_berkas
SET kegiatan_id = 7
WHERE id IN (3, 4) AND kegiatan_id IS DISTINCT FROM 7;

UPDATE sigap_pelatihan_berkas
SET aktif = false
WHERE id = 2 AND aktif IS DISTINCT FROM false;

COMMIT;

-- 1) Verifikasi: id 3 dan 4 di kegiatan 7 (aktif), id 2 tidak aktif
SELECT id, kegiatan_id, jenis, judul, nama_file, aktif
FROM sigap_pelatihan_berkas
WHERE id IN (1, 2, 3, 4)
ORDER BY id;
