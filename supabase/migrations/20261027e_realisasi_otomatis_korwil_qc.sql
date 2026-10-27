-- =====================================================================
-- 20261027e_realisasi_otomatis_korwil_qc.sql
-- (27 Okt 2026, permintaan user) Laporan realisasi KORWIL terisi otomatis dari Lembar Quality Check
-- (sigap_qc_lembar: lembar yang disimpan korwil sebagai pemeriksa), bukan lagi dari Lembar Pendataan KK.
--  - korwil, tanggal >= 2026-10-27 : n = jumlah lembar QC per tanggal; idsubsls dari KK (objek 'kk'), NULL untuk objek 'petugas'; sumber 'qc'.
--  - korwil, tanggal <  2026-10-27 : tetap dari pendataan (agar hari lampau yang sudah "dianggap" tidak hilang); sumber 'pendataan'.
--  - PML (identifikasi) dan PPL (pendataan): TIDAK berubah.
-- Tanda tangan fungsi sama (CREATE OR REPLACE); hak akses tetap (hanya service_role). Tanpa hapus data.
-- Jalankan oleh user (DDL produksi). Aman dijalankan sebelum/sesudah deploy kode: kode lama melewati baris tanpa Sub SLS (lembar objek petugas) dan membaca sisanya apa adanya.
-- =====================================================================
create or replace function public.bencana_realisasi_otomatis(p_akun bigint, p_peran text)
 returns table(tanggal date, idsubsls text, n integer, sumber text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select (i.diisi_at at time zone 'Asia/Jakarta')::date, i.idsubsls, 1, 'identifikasi'::text
    from public.bencana_identifikasi_subsls i
   where p_peran = 'pml' and i.diisi_oleh_akun = p_akun and i.diisi_at is not null
  union all
  select x.d, x.idsubsls, (count(*))::int, 'pendataan'::text
    from (
      select distinct on (l.kk_id, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date)
             (l.waktu_kejadian at time zone 'Asia/Jakarta')::date as d, k.idsubsls, l.hasil
        from public.bencana_pendataan_log l
        join public.bencana_pendataan_kk k on k.id = l.kk_id and k.aktif
       where p_peran <> 'pml' and l.akun_id = p_akun
         and (p_peran <> 'korwil' or (l.waktu_kejadian at time zone 'Asia/Jakarta')::date < date '2026-10-27')
       order by l.kk_id, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date, l.waktu_kejadian desc, l.id desc
    ) x
   where x.hasil in ('terdampak', 'tidak_terdampak')
   group by x.d, x.idsubsls
  union all
  select q.tanggal, k.idsubsls, (count(*))::int, 'qc'::text
    from public.sigap_qc_lembar q
    left join public.bencana_pendataan_kk k on k.id = q.kk_id
   where p_peran = 'korwil' and q.pemeriksa_akun_id = p_akun and q.tanggal >= date '2026-10-27'
   group by q.tanggal, k.idsubsls
$function$;
