-- (7 Okt 2026) ROLLBACK SIGAP PEDIA -- JANGAN dijalankan kecuali benar-benar ingin membatalkan modul.
-- PERINGATAN: menghapus SEMUA entri, file-metadata & audit SIGAP PEDIA secara permanen. File di bucket
-- sigap-pedia TIDAK ikut terhapus (hapus manual dari Dashboard Storage bila memang diinginkan).
-- Jalankan sendiri di SQL Editor setelah membuat cadangan (mis. ekspor buku register + Paket Bukti).

drop trigger if exists pedia_storage_jaga_ud on storage.objects;
drop function if exists public.pedia_storage_jaga();

drop table if exists pedia_cari, pedia_audit, pedia_statistik, pedia_verifikasi, pedia_file, pedia_tautan,
  pedia_entri_regulasi, pedia_regulasi, pedia_entri_tag, pedia_tag, pedia_entri, pedia_nomor, pedia_kategori cascade;

drop function if exists pedia_entri_baru(jsonb), pedia_cari_entri(text, integer), pedia_cari_picu(), pedia_segarkan_cari(bigint),
  pedia_audit_cek_rantai(), pedia_audit_cek_insert(), pedia_audit_jaga(), pedia_audit_tambah(bigint, text, text, text, bigint, bigint, jsonb),
  pedia_audit_hash(text, bigint, timestamptz, bigint, text, text, text, bigint, bigint, jsonb), pedia_file_jaga(), pedia_regulasi_status(),
  pedia_relasi_jaga(), pedia_kategori_jaga(), pedia_entri_jaga(), pedia_entri_sebelum_insert(), pedia_nomor_baru(integer);

delete from sigap_peran_izin where menu_kode in ('pedia.baca', 'pedia.kelola');
delete from sigap_menu where kode in ('pedia.baca', 'pedia.kelola');
