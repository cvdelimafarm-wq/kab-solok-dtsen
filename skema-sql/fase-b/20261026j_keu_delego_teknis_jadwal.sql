-- =====================================================================
-- 20261026j_keu_delego_teknis_jadwal.sql
-- SIGAP - Delego tahap 39: jadwal pg_cron untuk pekerjaan teknis. Bergantung pada 20261026i. Aman diulang (jadwal bernama ditimpa).
--
--  1. delego-rutin-0600      : setiap hari 23:00 UTC = 06:00 WIB -> keu_dlg_rutin_jalan()  (membuat delegasi dari templat berulang yang jatuh hari ini)
--  2. delego-tenggat-15m     : setiap 15 menit                   -> keu_dlg_pengingat_tenggat() (2 jam sebelum tenggat jam -> penerima; lewat tenggat -> pemberi)
--
-- Keduanya idempoten (rutin: indeks unik per templat+penerima+periode; tenggat: kolom pengingat_tenggat_at / telat_diberi_at), jadi aman bila dijalankan dua kali.
-- Bila pg_cron tidak terpasang, bagian jadwal dilewati dengan peringatan; fungsi tetap dapat dipanggil manual.
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('delego-rutin-0600', '0 23 * * *', 'select public.keu_dlg_rutin_jalan()');
    perform cron.schedule('delego-tenggat-15m', '*/15 * * * *', 'select public.keu_dlg_pengingat_tenggat()');
  else
    raise warning 'pg_cron belum terpasang: jadwal rutin 06:00 dan pengingat tenggat jam tidak dibuat. Aktifkan ekstensi pg_cron lalu jalankan berkas ini lagi.';
  end if;
end $$;
