-- (10 Okt 2026) Modul "identifikasi" (Lembar Identifikasi SLS, khusus PML) ditambahkan ke tahap Pendataan kegiatan Pendataan Pascabencana,
-- di antara Wilayah tugas per tim dan Transport Lokal. Bagi akun non-PML modul ini otomatis tidak tampil.
update public.sigap_tahap
   set isi = array['wilayah_tim','identifikasi','translok:1']
 where induk_kode = 'pascabencana' and kode = 'pendataan' and isi = array['wilayah_tim','translok:1'];
