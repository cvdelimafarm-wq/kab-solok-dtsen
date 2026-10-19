-- 20261019b_tahap_modul_monitoring_korwil.sql
-- (19 Okt 2026) Memasang modul "monitoring_korwil" sebagai langkah pertama tahap Pendataan Pascabencana.
-- Modul hanya tampil bagi akun kortim (korwil) kelompok; akun lain tidak melihat perubahan apa pun.
-- Aman dijalankan sebelum atau sesudah deploy kode: kode lama mengabaikan modul yang tidak dikenal.
-- Idempoten (tidak menambah dua kali). Tidak menghapus data. Pulihkan dengan:
--   update sigap_tahap set isi = array_remove(isi,'monitoring_korwil') where induk_kode='pascabencana' and kode='pendataan';
-- Prasyarat bagi korwil Faisal/Muzahar: jalankan 20261019a_korwil_kelompok_hierarki.sql lebih dulu.

update sigap_tahap
   set isi = array_prepend('monitoring_korwil', isi),
       diubah_at = now()
 where induk_kode = 'pascabencana'
   and kode = 'pendataan'
   and not ('monitoring_korwil' = any(isi));

-- Pemeriksaan:
select induk_kode, kode, isi from sigap_tahap where induk_kode = 'pascabencana' and kode = 'pendataan';
