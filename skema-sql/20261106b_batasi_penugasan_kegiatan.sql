-- 20261106b_batasi_penugasan_kegiatan.sql
-- (6 Nov 2026, P3 audit Kelola K05b-A1) keu_ident_kegiatan_tautkan dan keu_usulan_terapkan hanya memeriksa hak anggaran (ident_susun per RO),
-- belum memeriksa apakah pelakunya berwenang mengelola penugasan KEGIATAN tujuan. Migrasi ini menambah satu pemeriksaan: pelaku harus
-- memegang izin menu `translok.penugasan` level `kelola` untuk kegiatan itu (peran tanpa batas kegiatan = semua kegiatan).
-- Aplikasi (lib/keu/gerbang.ts) sudah memeriksa hal yang sama di sisi server; ini lapisan kedua di basis data.
-- Dijalankan Iqbal di SQL Editor Supabase (satu kali). Aman diulang (idempoten). Tidak mengubah ACL kedua fungsi.

BEGIN;

-- 1. Fungsi bantu (hanya dipanggil dari dalam fungsi SECURITY DEFINER lain; tidak untuk anon/authenticated)
CREATE OR REPLACE FUNCTION public.keu_boleh_penugasan_kegiatan(p_akun bigint, p_kegiatan bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sigap_akun_peran ap
    JOIN sigap_peran_izin pi ON pi.peran_id = ap.peran_id
    WHERE ap.akun_id = p_akun
      AND pi.menu_kode = 'translok.penugasan'
      AND pi.level = 'kelola'
      AND (ap.kegiatan_id IS NULL OR ap.kegiatan_id = p_kegiatan)
  );
$$;
REVOKE ALL ON FUNCTION public.keu_boleh_penugasan_kegiatan(bigint, bigint) FROM PUBLIC, anon, authenticated;

-- 2. Sisipkan pemeriksaan ke kedua fungsi tanpa menyalin ulang badannya: ambil definisi aktual, sisipkan satu baris, jalankan ulang.
DO $$
DECLARE
  v_def text;
  v_baru text;
  v_nama text;
  v_pesan text;
  v_jangkar constant text := '  if i.status = ''dibatalkan'' then raise exception ''Identifikasi dibatalkan''';
BEGIN
  FOREACH v_nama IN ARRAY ARRAY['keu_ident_kegiatan_tautkan','keu_usulan_terapkan'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_nama;
    IF v_def IS NULL THEN RAISE EXCEPTION 'Fungsi % tidak ditemukan', v_nama; END IF;
    IF position('keu_boleh_penugasan_kegiatan' in v_def) > 0 THEN CONTINUE; END IF;  -- sudah dipasang
    IF (length(v_def) - length(replace(v_def, v_jangkar, ''))) / length(v_jangkar) <> 1 THEN
      RAISE EXCEPTION 'Titik sisip pada % tidak unik atau tidak ada; dibatalkan', v_nama;
    END IF;
    v_pesan := CASE v_nama WHEN 'keu_ident_kegiatan_tautkan' THEN 'menautkan kegiatan' ELSE 'menerapkan penugasan' END;
    v_baru := replace(v_def, v_jangkar,
      '  if not keu_boleh_penugasan_kegiatan(p_akun, p_kegiatan) then raise exception ''Akun % tidak berwenang ' || v_pesan ||
      ' pada kegiatan % (perlu izin Kelola Penugasan untuk kegiatan itu)'', p_akun, p_kegiatan using errcode = ''42501''; end if;' || E'\r\n' || v_jangkar);
    EXECUTE v_baru;
  END LOOP;
END $$;

-- 3. Verifikasi: keduanya kini memuat pemeriksaan, ACL tidak berubah (postgres dan service_role saja)
SELECT p.proname,
       position('keu_boleh_penugasan_kegiatan' in pg_get_functiondef(p.oid)) > 0 AS memuat_pemeriksaan,
       p.proacl::text AS acl
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('keu_ident_kegiatan_tautkan','keu_usulan_terapkan','keu_boleh_penugasan_kegiatan')
ORDER BY 1;

-- 4. Akun yang lolos pemeriksaan (harus memuat akun 354 Iqbal dan pemegang Kelola Penugasan lain yang sah)
SELECT ap.akun_id, a.nama, ap.kegiatan_id
FROM sigap_akun_peran ap
JOIN sigap_peran_izin pi ON pi.peran_id = ap.peran_id AND pi.menu_kode = 'translok.penugasan' AND pi.level = 'kelola'
JOIN sigap_akun a ON a.id = ap.akun_id
GROUP BY ap.akun_id, a.nama, ap.kegiatan_id
ORDER BY ap.akun_id;

COMMIT;
