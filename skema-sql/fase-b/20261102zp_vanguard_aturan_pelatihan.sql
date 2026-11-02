-- 20261102zp_vanguard_aturan_pelatihan.sql
-- Aturan Vanguard di pelatihan (rancangan-vanguard-di-pelatihan-2nov): berlatih N hari berturut-turut sebelum Pretest.
-- Menambah kolom pada sigap_pelatihan_aturan. BAWAAN = tidak_ada (tidak mengubah perilaku apa pun); PJ menyalakan sendiri di Kelola Pelatihan > Persiapan > Vanguard.
-- Aman diulang. Tanpa data yang diubah.

ALTER TABLE sigap_pelatihan_aturan ADD COLUMN IF NOT EXISTS vanguard_mode text NOT NULL DEFAULT 'tidak_ada';
ALTER TABLE sigap_pelatihan_aturan ADD COLUMN IF NOT EXISTS vanguard_hari_berturut smallint NOT NULL DEFAULT 3;
ALTER TABLE sigap_pelatihan_aturan ADD COLUMN IF NOT EXISTS vanguard_sesi_min_per_hari smallint NOT NULL DEFAULT 1;
ALTER TABLE sigap_pelatihan_aturan ADD COLUMN IF NOT EXISTS vanguard_nilai_minimal smallint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sigap_pelatihan_aturan_vanguard_mode_chk') THEN
    ALTER TABLE sigap_pelatihan_aturan ADD CONSTRAINT sigap_pelatihan_aturan_vanguard_mode_chk CHECK (vanguard_mode IN ('tidak_ada', 'opsional', 'wajib'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sigap_pelatihan_aturan_vanguard_angka_chk') THEN
    ALTER TABLE sigap_pelatihan_aturan ADD CONSTRAINT sigap_pelatihan_aturan_vanguard_angka_chk
      CHECK (vanguard_hari_berturut BETWEEN 1 AND 14 AND vanguard_sesi_min_per_hari BETWEEN 1 AND 10 AND vanguard_nilai_minimal BETWEEN 0 AND 100);
  END IF;
END $$;

-- Verifikasi
SELECT kegiatan_id, blokir_tahap, vanguard_mode, vanguard_hari_berturut, vanguard_sesi_min_per_hari, vanguard_nilai_minimal FROM sigap_pelatihan_aturan ORDER BY kegiatan_id;
