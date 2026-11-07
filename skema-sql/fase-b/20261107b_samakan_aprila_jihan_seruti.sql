-- skema-sql/fase-b/20261107b_samakan_aprila_jihan_seruti.sql
--
-- (7 Nov 2026) Menyamakan data Seruti TW IV dengan alokasi Stage 1 + keputusan Iqbal:
--   * Jihan Agustrya Ismail (akun 317) menolak di luar sistem -> tidak diikutkan; penugasan kegiatan 6 dan 7 DINONAKTIFKAN (riwayat tetap), baris hierarki kegiatan 7 dihapus.
--   * Aprila Insan Suci (akun 64) menggantikan posisi PPL itu -> penugasan kegiatan 7 menjadi PPL (kegiatan 6 sudah PPL); hierarki kegiatan 7: PPL di bawah Faisal Siddiq (200).
--   * Hierarki pelatihan (kegiatan 7) disamakan dengan Tim Stage 1 (kegiatan 6): Yola (736) -> Nurafiza (464); Wahyuni (691) -> M. Iqbal Hadi (354).
-- Aman dijalankan ulang (setiap pernyataan bersyarat). Jalankan sekaligus; blok terakhir hanya menampilkan hasil pemeriksaan.
-- CATATAN: sejak kode push 122 tombol "Samakan atasan dengan Tim" di Kelola Pelatihan > Hierarki melakukan butir terakhir lewat layar; SQL ini tetap aman bila dijalankan dulu.

begin;

-- 1) Aprila: PPL di kegiatan 7
update sigap_penugasan set peran = 'ppl'
 where kegiatan_id = 7 and akun_id = 64 and aktif and peran <> 'ppl';

-- 2) Jihan: nonaktifkan penugasan (bukan dihapus)
update sigap_penugasan set aktif = false
 where kegiatan_id in (6, 7) and akun_id = 317 and aktif;

-- 3) Hierarki pelatihan kegiatan 7
delete from sigap_pelatihan_hierarki where kegiatan_id = 7 and akun_id = 317;

update sigap_pelatihan_hierarki
   set peran_pelatihan = 'ppl', atasan_akun_id = 200, sumber = 'manual', diubah_oleh = 'SQL 7 Nov (alokasi Stage 1)', diubah_at = now()
 where kegiatan_id = 7 and akun_id = 64;

update sigap_pelatihan_hierarki
   set atasan_akun_id = 464, sumber = 'manual', diubah_oleh = 'SQL 7 Nov (alokasi Stage 1)', diubah_at = now()
 where kegiatan_id = 7 and akun_id = 736 and atasan_akun_id is distinct from 464;

update sigap_pelatihan_hierarki
   set atasan_akun_id = 354, sumber = 'manual', diubah_oleh = 'SQL 7 Nov (alokasi Stage 1)', diubah_at = now()
 where kegiatan_id = 7 and akun_id = 691 and atasan_akun_id is distinct from 354;

-- OPSIONAL (hapus tanda komentar bila disetujui): M. Iqbal Hadi di lanjutan dan Stage 1 adalah PML, tetapi di penugasan kegiatan 7 tercatat PPL tanpa atasan.
-- update sigap_penugasan set peran = 'pml' where kegiatan_id = 7 and akun_id = 354 and aktif;
-- update sigap_pelatihan_hierarki set peran_pelatihan = 'pml' where kegiatan_id = 7 and akun_id = 354;

commit;

-- Pemeriksaan: semua baris harus 'cocok'
select a.nama,
       (select peran from sigap_penugasan where kegiatan_id = 6 and akun_id = a.id and aktif) peran_k6,
       (select peran from sigap_penugasan where kegiatan_id = 7 and akun_id = a.id and aktif) peran_k7,
       (select n.nama from sigap_pelatihan_hierarki h join sigap_akun n on n.id = h.atasan_akun_id where h.kegiatan_id = 7 and h.akun_id = a.id) atasan_hierarki7,
       (select n.nama from sigap_tim t join sigap_akun n on n.id = t.atasan_akun_id where t.kegiatan_id = 6 and t.akun_id = a.id) atasan_tim6
  from sigap_akun a where a.id in (64, 317, 736, 691) order by a.id;
