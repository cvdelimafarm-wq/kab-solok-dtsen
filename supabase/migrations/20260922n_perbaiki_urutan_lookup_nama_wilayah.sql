-- Perbaikan BUG (dilaporkan user: baris "❓ Sudah Tidak Ada di Sistem" di
-- panel "Monitoring Assignment FASIH" menampilkan KODE WILAYAH MENTAH
-- ("140"/"001"/"0004"/"00") padahal seharusnya nama Kecamatan/Nagari/SLS
-- -- root cause TERNYATA BUKAN di logika pencocokan, tapi di
-- penyisiran_wilayah_nama_lookup() (migrasi 20260922l) yang punya 1031
-- baris (SELURUH kombinasi wilayah unik Kab. Solok) TANPA "order by" --
-- lebih dari 1000 baris = kena batas default "Max Rows" API Supabase/
-- PostgREST per request (env ini TIDAK override angkanya, jadi pakai
-- default platform), sehingga app/api/penyisiran/alokasi/fasih-compare/
-- route.ts (yg dipanggil lewat supabase-js .rpc(), BUKAN lewat MCP
-- execute_sql yg execute_sql SQL langsung & tidak kena batas ini -- makanya
-- bug ini TIDAK kelihatan waktu dicek manual lewat SQL) diam-diam cuma
-- dapat 1000 dari 1031 baris, & baris yg "kepotong" jatuh balik ke fallback
-- kode mentah (nama?.kec_nama ?? f.kec_kode dst).
--
-- Perbaikan LENGKAP ada 2 bagian:
--  1. Migrasi ini -- tambah "order by" EKSPLISIT & DETERMINISTIK (wajib
--     utk paginasi .range() yg BENAR/konsisten antar-request -- tanpa ORDER
--     BY, urutan hasil PostgreSQL tidak dijamin sama persis di panggilan
--     berikutnya).
--  2. app/api/penyisiran/alokasi/fasih-compare/route.ts -- SEKARANG
--     mem-paginasi SEMUA 3 sumber data (bukan cuma yg ini) pakai .range()
--     berulang sampai habis, bukan 1 kali panggil polos -- supaya aman
--     walau salah satu tabel/RPC di masa depan tumbuh lewat 1000 baris lagi
--     (mis. penyisiran_fasih_assignment kalau nanti diupload utk SELURUH
--     kabupaten, atau penyisiran_alokasi_export_subsls kalau makin banyak
--     petugas submit pilihan wilayah).
create or replace function public.penyisiran_wilayah_nama_lookup()
 returns table(kec_kode text, nagari_kode text, sls_kode text, subsls_kode text, kec_nama text, nagari_nama text, sls_nama text)
 language sql
 stable
as $function$
  select distinct
    u.kec_kode, u.nagari_kode, u.sls_kode, u.subsls_kode,
    u.kec_nama, u.nagari_nama, u.sls_nama
  from public.penyisiran_usaha u
  where u.subsls_kode is not null and u.subsls_kode <> ''
  order by u.kec_kode, u.nagari_kode, u.sls_kode, u.subsls_kode;
$function$;
