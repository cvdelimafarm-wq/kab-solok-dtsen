-- 20261102zq_vanguard_tenggat.sql
--
-- (2 Nov 2026) Tenggat latihan Vanguard yang eksplisit untuk pelatihan: "hari TERAKHIR sesi Vanguard masih dihitung".
-- Contoh Seruti TW IV: ketentuan "mulai 2 November s.d. 8 November" -> vanguard_tenggat = '2026-11-08'.
-- Kosong (NULL) = cara lama: tenggat = sehari sebelum Pretest dibuka.
--
-- ADITIF dan AMAN DIULANG (add column if not exists). Tidak mengubah data yang ada. Jalankan SETELAH 20261102zp_vanguard_aturan_pelatihan.sql.
-- Sebelum SQL ini dijalankan, aplikasi tetap bekerja (tenggat dari tanggal buka Pretest); hanya menyimpan tenggat eksplisit yang ditolak dengan pesan.

alter table sigap_pelatihan_aturan
  add column if not exists vanguard_tenggat date;

comment on column sigap_pelatihan_aturan.vanguard_tenggat is
  'Hari terakhir sesi Vanguard dihitung untuk aturan N hari berturut-turut (WIB, inklusif). NULL = sehari sebelum Pretest dibuka.';
