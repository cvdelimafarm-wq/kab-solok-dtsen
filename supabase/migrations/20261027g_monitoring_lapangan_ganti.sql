-- 27 Okt 2026 - Monitoring Lapangan dipercepat (tahap 2 dari 2).
-- Jalankan HANYA setelah 67_uji_monitoring_lapangan_cepat.sql menunjukkan status OK di semua baris.
-- bencana_monitoring_lapangan (nama lama, dipakai aplikasi) kini meneruskan ke versi cepat.
-- Tanda tangan dan kolom tidak berubah, jadi kode aplikasi tidak perlu diubah.
-- Untuk membatalkan: jalankan 20261027g_monitoring_lapangan_kembalikan.sql.

create or replace function public.bencana_monitoring_lapangan(p_dari date, p_sampai date, p_kegiatan bigint default 1)
 returns table(akun_id bigint, nama text, peran text, pml_id bigint, pml_nama text, tanggal date, sub_idf integer, kk_berhasil integer, kk_tdk_ditemukan integer, agg_sub integer, agg_kk integer, hari_kerja boolean, ada_laporan boolean, jumlah_foto integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select * from public.bencana_monitoring_lapangan_cepat(p_dari, p_sampai, p_kegiatan)
$function$;
