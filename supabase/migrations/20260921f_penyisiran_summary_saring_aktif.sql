-- Setelah penambahan kolom `aktif` (lihat migrasi
-- 20260921e_penyisiran_usaha_kolom_aktif.sql), StatTile "Penyisiran Usaha"
-- (total/belum/ditemukan/dst, dipakai tab Penyisiran Usaha & Identifikasi
-- PPL/Jorong/Tetangga lewat /api/penyisiran/summary) HARUS ikut menghitung
-- HANYA baris aktif = true -- kalau tidak, angka total di StatTile akan
-- tetap menghitung baris yg sudah dinonaktifkan, membingungkan petugas di
-- lapangan. Field lama TIDAK dihapus/diubah, cuma sumber datanya disaring.
create or replace function public.penyisiran_summary()
 returns jsonb
 language sql
 stable
as $function$
  select jsonb_build_object(
    'total', count(*),
    'belum', count(*) filter (where status_kunjungan = 'belum'),
    'ditemukan', count(*) filter (where status_kunjungan = 'ditemukan'),
    'ditemukan_hari_ini', count(*) filter (
      where ditemukan_at is not null
        and (ditemukan_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
    ),
    'tidak_ditemukan', count(*) filter (where status_kunjungan = 'tidak_ditemukan'),
    'tidak_bisa', count(*) filter (where status_kunjungan = 'tidak_bisa'),
    'sudah_didata_se2026', count(*) filter (where status_kunjungan = 'sudah_didata_se2026'),
    'direncanakan_besok', count(*) filter (
      where status_kunjungan = 'jadwalkan_besok'
        and tanggal_rencana_kunjungan = (now() at time zone 'Asia/Jakarta')::date + 1
    ),
    'kecamatan', (
      select coalesce(jsonb_agg(jsonb_build_object('kode', kec_kode, 'nama', kec_nama, 'jumlah', jumlah) order by kec_nama), '[]'::jsonb)
      from (
        select kec_kode, max(kec_nama) as kec_nama, count(*) as jumlah
        from penyisiran_usaha
        where kec_kode is not null and kec_kode <> '' and aktif
        group by kec_kode
      ) k
    )
  )
  from penyisiran_usaha
  where aktif;
$function$;

create or replace function public.penyisiran_summary_wilayah(p_wilayah jsonb)
 returns jsonb
 language sql
 stable
as $function$
  with cocok as (
    select u.*
    from public.penyisiran_usaha u
    where u.aktif
      and exists (
      select 1
      from jsonb_array_elements(coalesce(p_wilayah, '[]'::jsonb)) w
      where w->>'kec_kode' = u.kec_kode
        and w->>'nagari_kode' = u.nagari_kode
        and w->>'sls_kode' = u.sls_kode
        and (
          w->'subsls_kode' is null
          or jsonb_typeof(w->'subsls_kode') = 'null'
          or u.subsls_kode = any (select jsonb_array_elements_text(w->'subsls_kode'))
        )
    )
  )
  select jsonb_build_object(
    'total', count(*),
    'belum', count(*) filter (where status_kunjungan = 'belum'),
    'ditemukan', count(*) filter (where status_kunjungan = 'ditemukan'),
    'ditemukan_hari_ini', count(*) filter (
      where ditemukan_at is not null
        and (ditemukan_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
    ),
    'tidak_ditemukan', count(*) filter (where status_kunjungan = 'tidak_ditemukan'),
    'tidak_bisa', count(*) filter (where status_kunjungan = 'tidak_bisa'),
    'sudah_didata_se2026', count(*) filter (where status_kunjungan = 'sudah_didata_se2026'),
    'direncanakan_besok', count(*) filter (
      where status_kunjungan = 'jadwalkan_besok'
        and tanggal_rencana_kunjungan = (now() at time zone 'Asia/Jakarta')::date + 1
    ),
    'kecamatan', (
      select coalesce(jsonb_agg(jsonb_build_object('kode', kec_kode, 'nama', kec_nama, 'jumlah', jumlah) order by kec_nama), '[]'::jsonb)
      from (
        select kec_kode, max(kec_nama) as kec_nama, count(*) as jumlah
        from cocok
        where kec_kode is not null and kec_kode <> ''
        group by kec_kode
      ) k
    )
  )
  from cocok;
$function$;
