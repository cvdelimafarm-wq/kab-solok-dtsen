-- =====================================================================
-- 20261029f_tim_administrasi_spdt_sementara.sql
-- (29 Okt 2026) Alex Kandria (#23) dan Oryza Maria Ulva (#478) = TIM ADMINISTRASI SPDT NTP. Untuk sementara diperlakukan seperti Supervisor:
-- diberi peran akun `supervisor_spdt_ntp` (lingkup kegiatan 2), sehingga (a) tidak menjadi peserta QC Pemahaman SPDT NTP (aturan di 20261029e),
-- (b) dapat melihat Monitoring, QC (baca saja), Peta, dan Daftar KK. Kewenangan khusus tim administrasi diatur kemudian (peran sendiri); saat itu
-- baris ini diganti, bukan ditambah. Penugasan PPL lama mereka di kegiatan 2 tidak diubah. Jalankan SETELAH 20261029e. Aman diulang.
-- =====================================================================
insert into sigap_akun_peran (akun_id, peran_id, kegiatan_id, diberi_oleh)
select a.id, r.id, 2, 'claude (permintaan M. Iqbal Hadi, 29 Okt 2026: tim administrasi, sementara seperti supervisor)'
  from sigap_akun a
  join sigap_peran r on r.kode = 'supervisor_spdt_ntp'
 where a.id in (23, 478)
   and not exists (select 1 from sigap_akun_peran x where x.akun_id = a.id and x.peran_id = r.id and x.kegiatan_id = 2);
