-- Uji 67 (27 Okt 2026): fungsi cepat harus menghasilkan isi yang SAMA PERSIS dengan fungsi lama.
-- Jalankan SETELAH 20261027f_monitoring_lapangan_cepat.sql dan SEBELUM 20261027g_monitoring_lapangan_ganti.sql.
-- Hanya membaca (SELECT). Hasil yang diharapkan: semua kolom "selisih_*" = 0 pada setiap baris.

with kombinasi(nama, dari, sampai, kegiatan) as (
  values
    ('bawaan (tanpa tanggal)',      null::date, null::date, 1::bigint),
    ('sejak 20 Okt',                date '2026-10-20', null::date, 1::bigint),
    ('20 sampai 26 Okt (sebelum QC korwil)', date '2026-10-20', date '2026-10-26', 1::bigint),
    ('hanya 27 Okt',                date '2026-10-27', date '2026-10-27', 1::bigint),
    ('jendela lama (Sep 2026)',     date '2026-09-01', date '2026-09-30', 1::bigint)
),
hasil as (
  select k.nama,
         (select count(*) from (
            select * from public.bencana_monitoring_lapangan(k.dari, k.sampai, k.kegiatan)
            except
            select * from public.bencana_monitoring_lapangan_cepat(k.dari, k.sampai, k.kegiatan)) a) as selisih_lama_minus_cepat,
         (select count(*) from (
            select * from public.bencana_monitoring_lapangan_cepat(k.dari, k.sampai, k.kegiatan)
            except
            select * from public.bencana_monitoring_lapangan(k.dari, k.sampai, k.kegiatan)) b) as selisih_cepat_minus_lama,
         (select count(*) from public.bencana_monitoring_lapangan(k.dari, k.sampai, k.kegiatan)) as baris_lama,
         (select count(*) from public.bencana_monitoring_lapangan_cepat(k.dari, k.sampai, k.kegiatan)) as baris_cepat
    from kombinasi k
)
select nama, baris_lama, baris_cepat, selisih_lama_minus_cepat, selisih_cepat_minus_lama,
       case when baris_lama = baris_cepat and selisih_lama_minus_cepat = 0 and selisih_cepat_minus_lama = 0
            then 'OK' else 'BEDA' end as status
  from hasil
 order by nama;
