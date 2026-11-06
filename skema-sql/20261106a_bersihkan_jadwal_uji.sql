-- 20261106a_bersihkan_jadwal_uji.sql
-- (6 Nov 2026, P3 audit Kelola K07) Membersihkan HANYA jadwal revisi uji #4, #7, #8 beserta turunannya.
-- Jadwal asli #1, #2, #3 tidak disentuh. Dijalankan Iqbal di SQL Editor Supabase (satu kali). Tabel dijaga pemicu "tanpa hapus",
-- jadi pemicu dinonaktifkan sementara DI DALAM transaksi lalu diaktifkan lagi sebelum COMMIT. Bila ada pemeriksaan yang gagal, transaksi dibatalkan semua.
-- Sequence tidak di-reset. Baris sigap_audit tidak dihapus (log).

BEGIN;

-- 0. Pengaman: pastikan sasaran memang jadwal uji.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM keu_revisi_jadwal WHERE id IN (4,7,8) AND judul LIKE 'UJI%';
  IF n <> 3 THEN RAISE EXCEPTION 'Sasaran tidak sesuai: ditemukan % jadwal uji (seharusnya 3). Dibatalkan.', n; END IF;
  -- tabel lain yang menunjuk jadwal ini harus kosong (kalau tidak, hapus akan gagal; lebih baik berhenti dengan pesan jelas)
  SELECT (SELECT count(*) FROM keu_kk_geseran WHERE jadwal_id IN (4,7,8)) + (SELECT count(*) FROM keu_kk_keputusan_kro WHERE jadwal_id IN (4,7,8))
       + (SELECT count(*) FROM keu_kk_lampiran WHERE jadwal_id IN (4,7,8)) + (SELECT count(*) FROM keu_pok_unggah WHERE jadwal_id IN (4,7,8))
       + (SELECT count(*) FROM keu_struktur_usulan WHERE jadwal_id IN (4,7,8)) + (SELECT count(*) FROM keu_tambahan_pagu WHERE jadwal_id IN (4,7,8)) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'Ada % baris di tabel lain yang menunjuk jadwal uji. Dibatalkan; hubungi Claude.', n; END IF;
END $$;

-- 1. Sebelum
SELECT 'sebelum' AS tahap,
  (SELECT count(*) FROM keu_revisi_jadwal WHERE id IN (4,7,8)) AS jadwal,
  (SELECT count(*) FROM keu_jadwal_riwayat WHERE jadwal_id IN (4,7,8)) AS riwayat,
  (SELECT count(*) FROM keu_kk_baris WHERE jadwal_id IN (4,7,8)) AS kk_baris,
  (SELECT count(*) FROM keu_revisi_sah WHERE jadwal_id IN (4,7,8)) AS sah,
  (SELECT count(*) FROM keu_revisi_usulan WHERE jadwal_id IN (4,7,8)) AS usulan;

-- 2. Nonaktifkan pemicu penjaga sementara
ALTER TABLE keu_revisi_usulan_riwayat DISABLE TRIGGER USER;
ALTER TABLE keu_revisi_usulan         DISABLE TRIGGER USER;
ALTER TABLE keu_revisi_sah            DISABLE TRIGGER USER;
ALTER TABLE keu_kk_baris              DISABLE TRIGGER USER;
ALTER TABLE keu_jadwal_riwayat        DISABLE TRIGGER USER;
ALTER TABLE keu_revisi_jadwal         DISABLE TRIGGER USER;

-- 3. Hapus dari turunan ke induk
DELETE FROM keu_revisi_usulan_riwayat WHERE usulan_id IN (SELECT id FROM keu_revisi_usulan WHERE jadwal_id IN (4,7,8));
DELETE FROM keu_revisi_usulan WHERE jadwal_id IN (4,7,8);
DELETE FROM keu_revisi_sah WHERE jadwal_id IN (4,7,8);
UPDATE keu_kk_baris SET pindah_dari = NULL WHERE jadwal_id IN (4,7,8) AND pindah_dari IS NOT NULL;
DELETE FROM keu_kk_baris WHERE jadwal_id IN (4,7,8);
DELETE FROM keu_jadwal_riwayat WHERE jadwal_id IN (4,7,8);
DELETE FROM keu_revisi_jadwal WHERE id IN (4,7,8);

-- 4. Aktifkan lagi pemicu
ALTER TABLE keu_revisi_jadwal         ENABLE TRIGGER USER;
ALTER TABLE keu_jadwal_riwayat        ENABLE TRIGGER USER;
ALTER TABLE keu_kk_baris              ENABLE TRIGGER USER;
ALTER TABLE keu_revisi_sah            ENABLE TRIGGER USER;
ALTER TABLE keu_revisi_usulan         ENABLE TRIGGER USER;
ALTER TABLE keu_revisi_usulan_riwayat ENABLE TRIGGER USER;

-- 5. Sesudah (harus 0 semua) dan jadwal yang tersisa (harus 1, 2, 3)
SELECT 'sesudah' AS tahap,
  (SELECT count(*) FROM keu_revisi_jadwal WHERE id IN (4,7,8)) AS jadwal,
  (SELECT count(*) FROM keu_jadwal_riwayat WHERE jadwal_id IN (4,7,8)) AS riwayat,
  (SELECT count(*) FROM keu_kk_baris WHERE jadwal_id IN (4,7,8)) AS kk_baris,
  (SELECT count(*) FROM keu_revisi_sah WHERE jadwal_id IN (4,7,8)) AS sah,
  (SELECT count(*) FROM keu_revisi_usulan WHERE jadwal_id IN (4,7,8)) AS usulan;
SELECT id, judul, status FROM keu_revisi_jadwal ORDER BY id;

-- 6. Pastikan tidak ada pemicu yang tertinggal nonaktif (semua harus 'O' = aktif)
SELECT c.relname, t.tgname, t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal AND c.relname IN ('keu_revisi_usulan_riwayat','keu_revisi_usulan','keu_revisi_sah','keu_kk_baris','keu_jadwal_riwayat','keu_revisi_jadwal') AND t.tgenabled <> 'O';

COMMIT;
