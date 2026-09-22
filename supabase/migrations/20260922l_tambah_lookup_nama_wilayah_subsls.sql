-- RPC penyisiran_wilayah_nama_lookup(): daftar SEMUA kombinasi kec/nagari/
-- sls/subsls yang PERNAH muncul di penyisiran_usaha (TIDAK difilter aktif,
-- beda dari kebanyakan RPC lain di app ini -- sengaja, supaya kode wilayah
-- yang sudah tidak aktif pun tetap bisa ditampilkan namanya) berikut nama
-- displaynya -- dipakai fitur BARU "Monitoring Assignment FASIH" (tab
-- Perencanaan Lapangan, permintaan user: bandingkan data
-- "📋 Identifikasi Wilayah Sampel SLS" yang sudah masuk sistem vs data hasil
-- assignment yang sudah berhasil diproses di aplikasi eksternal "FASIH")
-- utk menampilkan nama Kecamatan/Nagari/SLS pada baris hasil upload file
-- FASIH yang KODE wilayahnya sudah TIDAK ADA lagi di
-- penyisiran_alokasi_pilihan (jadi tidak bisa ikut nama dari situ, beda dari
-- penyisiran_alokasi_export_subsls yang JOIN ke pilihan aktif) -- lihat
-- app/api/penyisiran/alokasi/fasih-compare/route.ts.
create or replace function public.penyisiran_wilayah_nama_lookup()
 returns table(kec_kode text, nagari_kode text, sls_kode text, subsls_kode text, kec_nama text, nagari_nama text, sls_nama text)
 language sql
 stable
as $function$
  select distinct
    u.kec_kode, u.nagari_kode, u.sls_kode, u.subsls_kode,
    u.kec_nama, u.nagari_nama, u.sls_nama
  from public.penyisiran_usaha u
  where u.subsls_kode is not null and u.subsls_kode <> '';
$function$;
