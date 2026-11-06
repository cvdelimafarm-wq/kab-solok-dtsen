-- 20261106c_rapikan_identitas_tahap0.sql
-- (6 Nov 2026) Tahap 0 "satu identitas petugas": hanya merapikan data dan membuat definisi baku, TANPA mengubah struktur tabel dan tanpa menghapus baris.
-- Putusan Iqbal: id petugas = sigap_akun.id (satu); penugasan hanya lewat sigap_penugasan; "petugas PSP" = penugasan kegiatan 1 aktif.
-- Dijalankan Iqbal di SQL Editor Supabase (sekali). Aman diulang. Semua langkah bisa dibalik (hanya mengubah kolom aktif / tautan kosong).

BEGIN;

-- 1. Definisi baku "petugas PSP" (satu sumber untuk hitungan di dasbor/laporan). Tidak untuk anon/authenticated.
CREATE OR REPLACE VIEW public.v_petugas_psp WITH (security_invoker = true) AS
SELECT a.id AS akun_id, a.nama, a.jenis, pn.peran, a.petugas_bencana_id
FROM sigap_penugasan pn
JOIN sigap_akun a ON a.id = pn.akun_id
WHERE pn.kegiatan_id = 1 AND pn.aktif AND a.aktif;
REVOKE ALL ON public.v_petugas_psp FROM PUBLIC, anon, authenticated;

-- 2. Tautkan akun 781 ke baris master mitra 605 (nama dan nomor HP cocok; baris 605 belum punya akun, akun 781 belum punya mitra_id)
UPDATE sigap_akun SET mitra_id = 605
WHERE id = 781 AND mitra_id IS NULL
  AND EXISTS (SELECT 1 FROM bencana_mitra m WHERE m.id = 605 AND lower(m.nama) = lower(sigap_akun.nama))
  AND NOT EXISTS (SELECT 1 FROM sigap_akun x WHERE x.mitra_id = 605);

-- 3. Nonaktifkan dua baris roster organik "hantu" (bencana_petugas 1 dan 2): tanpa akun, tanpa peran, kembar dengan 459 dan 458.
--    Hanya bila tidak ada baris lain yang menunjuknya.
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT id FROM bencana_petugas WHERE id IN (1, 2) AND peran IS NULL AND aktif AND NOT EXISTS (SELECT 1 FROM sigap_akun a WHERE a.petugas_bencana_id = bencana_petugas.id) LOOP
    SELECT (SELECT count(*) FROM bencana_alokasi_subsls WHERE ppl_id = r.id OR pml_id = r.id)
         + (SELECT count(*) FROM bencana_identifikasi_alokasi WHERE pml_pendamping_id = r.id OR pml_pelaksana_id = r.id)
         + (SELECT count(*) FROM bencana_identifikasi_subsls WHERE pml_id = r.id)
         + (SELECT count(*) FROM bencana_pendataan_permintaan WHERE pml_id = r.id)
         + (SELECT count(*) FROM bencana_undangan WHERE petugas_id = r.id)
         + (SELECT count(*) FROM sigap_realisasi WHERE petugas_id = r.id)
         + (SELECT count(*) FROM sigap_dokumentasi WHERE petugas_id = r.id)
         + (SELECT count(*) FROM sigap_izin_susulan WHERE petugas_id = r.id) INTO n;
    IF n = 0 THEN UPDATE bencana_petugas SET aktif = false WHERE id = r.id; END IF;
  END LOOP;
END $$;

-- 4. Akun uji "UJI SUSULAN ..." dan kegiatan uji dinonaktifkan (bukan dihapus). Kegiatan 4 sudah nonaktif.
UPDATE sigap_penugasan SET aktif = false WHERE aktif AND akun_id IN (SELECT id FROM sigap_akun WHERE nama LIKE 'UJI SUSULAN%');
UPDATE sigap_akun SET aktif = false WHERE aktif AND nama LIKE 'UJI SUSULAN%';
UPDATE sigap_kegiatan SET aktif = false WHERE aktif AND id IN (5, 8) AND (nama LIKE 'UJI%');

-- 5. Verifikasi
SELECT 'petugas PSP (v_petugas_psp)' AS cek, count(*) AS n FROM v_petugas_psp
UNION ALL SELECT '  ...ber-tautan bencana_petugas', count(*) FROM v_petugas_psp WHERE petugas_bencana_id IS NOT NULL
UNION ALL SELECT 'akun 781 mitra_id', mitra_id FROM sigap_akun WHERE id = 781
UNION ALL SELECT 'bencana_petugas 1,2 aktif (harus 0)', count(*) FROM bencana_petugas WHERE id IN (1,2) AND aktif
UNION ALL SELECT 'akun UJI SUSULAN aktif (harus 0)', count(*) FROM sigap_akun WHERE nama LIKE 'UJI SUSULAN%' AND aktif
UNION ALL SELECT 'kegiatan UJI aktif (harus 0)', count(*) FROM sigap_kegiatan WHERE nama LIKE 'UJI%' AND aktif;

COMMIT;
