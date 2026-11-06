-- 20261106d_satukan_identitas_tahap0b.sql
-- (6 Nov 2026) Tahap 0b "satu identitas petugas" -- putusan Iqbal pukul 10.37:
--  1. Lima pegawai PNS yang akunnya tercatat sebagai MITRA diubah menjadi ORGANIK dan ditautkan ke profil pegawai; keluar dari pool mitra.
--  2. Akun 780 (Roza Novrika Sari) ditautkan ke master mitra 779 (nama dan nomor HP cocok dengan bencana_petugas 467).
--  3. Dibuatkan akun mitra untuk master mitra 413 (Fitri Yani), 666 (Silvia), 205 (Sri Wahyuni) + masuk pool 2026.
--  4. Akun 299 (mitra BPS yang rangkap pegawai magang) dijadikan jenis mitra + masuk pool 2026 (satu akun, bukan dua).
--  Akun 788-792 (pegawai magang) TIDAK diubah.
-- Dijalankan Iqbal di SQL Editor Supabase (sekali, setelah 20261106c). Aman diulang. Tidak ada baris dihapus.

BEGIN;

-- 0. Pengaman: data harus persis seperti saat diperiksa
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (VALUES (18,18,'Akbari'),(49,21,'Anggun'),(188,28,'Elvini'),(462,6,'Novriady'),(745,14,'Yudi')) v(akun, profil, awal)
    JOIN sigap_akun a ON a.id = v.akun AND a.nama LIKE v.awal || '%'
    JOIN sigap_pegawai_profil p ON p.id = v.profil AND p.nama_lengkap LIKE v.awal || '%';
  IF n <> 5 THEN RAISE EXCEPTION 'Pasangan akun-profil PNS tidak cocok (% dari 5). Dibatalkan.', n; END IF;
END $$;

-- 1. Lima PNS: jenis organik, nip = nip_lama profil, profil tertaut, keluar dari pool mitra (status nonaktif, riwayat tetap ada)
UPDATE sigap_pegawai_profil p SET akun_id = v.akun
FROM (VALUES (18,18),(49,21),(188,28),(462,6),(745,14)) v(akun, profil)
WHERE p.id = v.profil AND p.akun_id IS NULL;

UPDATE sigap_akun a SET jenis = 'organik', nip = p.nip_lama
FROM sigap_pegawai_profil p
WHERE p.akun_id = a.id AND a.id IN (18, 49, 188, 462, 745) AND (a.jenis <> 'organik' OR a.nip IS NULL);

UPDATE sigap_mitra_pool SET status = 'nonaktif', catatan = 'Pegawai organik (PNS), bukan mitra -- 6 Nov 2026', diubah_at = now()
WHERE tahun = 2026 AND akun_id IN (18, 49, 188, 462, 745) AND status <> 'nonaktif';

-- 2. Roza Novrika Sari: akun 780 <-> master mitra 779 (+ NIK dari master bila akun belum punya)
UPDATE sigap_akun a SET mitra_id = 779, nik = COALESCE(a.nik, m.nik)
FROM bencana_mitra m
WHERE a.id = 780 AND a.mitra_id IS NULL AND m.id = 779 AND lower(m.nama) = lower(a.nama)
  AND NOT EXISTS (SELECT 1 FROM sigap_akun x WHERE x.mitra_id = 779);

-- 3. Akun mitra baru untuk 413, 666, 205 (orang berbeda dari akun bernama sama; PIN diatur sendiri saat pertama masuk)
INSERT INTO sigap_akun (mitra_id, nama, jenis, nik, alamat_kecamatan, aktif)
SELECT m.id, m.nama, 'mitra', m.nik, regexp_replace(m.alamat_kecamatan, '^\(\d+\)\s*', ''), true
FROM bencana_mitra m
WHERE m.id IN (413, 666, 205) AND NOT EXISTS (SELECT 1 FROM sigap_akun a WHERE a.mitra_id = m.id);

-- 4. Akun 299: satu identitas, jenis mitra (master mitra 717), tetap tercatat pegawai magang di bencana_pegawai_magang
UPDATE sigap_akun SET jenis = 'mitra' WHERE id = 299 AND mitra_id = 717 AND jenis <> 'mitra';

-- 5. Pool mitra 2026 untuk akun baru dan 299
INSERT INTO sigap_mitra_pool (akun_id, tahun, status, catatan)
SELECT a.id, 2026, 'aktif', 'Ditambahkan 6 Nov 2026 (penyatuan identitas)'
FROM sigap_akun a
WHERE a.mitra_id IN (413, 666, 205) OR a.id = 299
ON CONFLICT (akun_id, tahun) DO UPDATE SET status = 'aktif', catatan = EXCLUDED.catatan, diubah_at = now();

-- 6. Verifikasi
SELECT 'PNS organik bertaut profil (harus 5)' AS cek, count(*)::text AS nilai FROM sigap_akun a JOIN sigap_pegawai_profil p ON p.akun_id = a.id WHERE a.id IN (18,49,188,462,745) AND a.jenis = 'organik'
UNION ALL SELECT 'profil PNS/PPPK tanpa akun (harus 0)', count(*)::text FROM sigap_pegawai_profil WHERE akun_id IS NULL
UNION ALL SELECT 'pool 2026 aktif (harus 759-5+4=758)', count(*)::text FROM sigap_mitra_pool WHERE tahun = 2026 AND status = 'aktif'
UNION ALL SELECT 'akun 780 mitra_id (779)', mitra_id::text FROM sigap_akun WHERE id = 780
UNION ALL SELECT 'master mitra tanpa akun (harus 0)', count(*)::text FROM bencana_mitra m WHERE NOT EXISTS (SELECT 1 FROM sigap_akun a WHERE a.mitra_id = m.id)
UNION ALL SELECT 'akun baru 413/666/205', string_agg(a.id::text || ':' || a.nama, ', ') FROM sigap_akun a WHERE a.mitra_id IN (413, 666, 205)
UNION ALL SELECT 'akun 299 jenis', jenis FROM sigap_akun WHERE id = 299
UNION ALL SELECT 'akun mitra aktif di luar pool aktif (harus 0)', count(*)::text FROM sigap_akun a WHERE a.aktif AND a.jenis = 'mitra' AND NOT EXISTS (SELECT 1 FROM sigap_mitra_pool mp WHERE mp.akun_id = a.id AND mp.tahun = 2026 AND mp.status = 'aktif');

COMMIT;
