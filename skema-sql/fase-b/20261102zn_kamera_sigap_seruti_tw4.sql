-- 20261102zn_kamera_sigap_seruti_tw4.sql
--
-- (2 Nov 2026) Tab "Kamera SIGAP" pada tampilan pelatihan kini membuka halaman Kamera SIGAP (/sigap/foto?kegiatan=ID), sama dengan Pendataan Pascabencana.
-- Halaman itu hanya memakai kegiatan bermode 'kamera'; bawaan sistem = 'unggah' (sigap_foto_pengaturan.mode_bawaan). AMAN DIULANG. Dijalankan Iqbal sendiri.
-- Mode 'ikuti' = mengikuti bawaan; 'unggah' = unggah manual lama.

-- Pelatihan Petugas Seruti Triwulan IV 2026 (kegiatan 7):
insert into sigap_foto_pengaturan_kegiatan (kegiatan_id, mode, diubah_at)
values (7, 'kamera', now())
on conflict (kegiatan_id) do update set mode = 'kamera', diubah_at = now();

-- OPSIONAL, hanya bila pendataan Seruti TW IV (kegiatan 6, mulai 10 Nov) juga memakai Kamera SIGAP seperti Pendataan Pascabencana:
--   insert into sigap_foto_pengaturan_kegiatan (kegiatan_id, mode, diubah_at) values (6, 'kamera', now())
--   on conflict (kegiatan_id) do update set mode = 'kamera', diubah_at = now();

-- Cek (harus: 7 | kamera):
--   select kegiatan_id, mode from sigap_foto_pengaturan_kegiatan where kegiatan_id in (6, 7) order by 1;
