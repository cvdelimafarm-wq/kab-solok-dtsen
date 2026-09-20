-- Fitur "Jadwalkan Besok" (Penyisiran Usaha):
--  - Kolom baru tanggal_rencana_kunjungan (date) -- tanggal target
--    kunjungan besok, diisi otomatis oleh backend (/api/penyisiran/update)
--    saat status_kunjungan diubah jadi 'jadwalkan_besok'. Dipakai hitung
--    kuota "8 kunjungan/hari" per petugas & kartu "Dijadwalkan Besok".
--  - Kolom baru ditemukan_at (timestamptz) -- kapan status_kunjungan
--    TERAKHIR KALI berubah MENJADI 'ditemukan' (bukan tiap kali baris
--    diedit) -- dasar hitungan "Usaha Ditemukan HARI INI" (scoped harian,
--    beda dari summary.ditemukan yg akumulatif dari awal).
--  - Status baru 'jadwalkan_besok' ditambah ke CHECK constraint status.
--    Status lama ('tidak_ditemukan'/'tidak_bisa') SENGAJA TETAP diizinkan
--    di constraint (data lama & histori jangan sampai gagal tervalidasi
--    saat baris itu diedit lagi) -- cuma sudah tidak lagi ditawarkan di
--    dropdown edit FE (lihat komentar app/seruti/penyisiran-usaha.tsx).

alter table penyisiran_usaha
  add column if not exists tanggal_rencana_kunjungan date,
  add column if not exists ditemukan_at timestamptz;

alter table penyisiran_usaha drop constraint if exists penyisiran_usaha_status_check;
alter table penyisiran_usaha add constraint penyisiran_usaha_status_check
  check (status_kunjungan = any (array[
    'belum', 'ditemukan', 'tidak_ditemukan', 'tidak_bisa', 'sudah_didata_se2026', 'jadwalkan_besok'
  ]));

create index if not exists idx_penyisiran_usaha_rencana_besok
  on penyisiran_usaha (tanggal_rencana_kunjungan)
  where status_kunjungan = 'jadwalkan_besok';

-- Backfill ditemukan_at utk baris yg SUDAH 'ditemukan' sebelum migrasi ini
-- (pakai updated_at sbg perkiraan terbaik -- histori pasti kapan status
-- itu SPESIFIK berubah tidak tercatat sebelum ada kolom ini) supaya kartu
-- "Riwayat Perubahan" & histori lama tidak mendadak hilang dari hitungan
-- kalau baris itu kebetulan diedit lagi hari ini (ditemukan_at TIDAK ikut
-- diperbarui backend kalau status TIDAK berubah dari 'ditemukan', jadi
-- backfill ini cuma dipakai SEKALI di sini).
update penyisiran_usaha
set ditemukan_at = updated_at
where status_kunjungan = 'ditemukan' and ditemukan_at is null;

-- Tambahkan 'ditemukan_hari_ini' (scoped tanggal WIB/Asia Jakarta) &
-- 'direncanakan_besok' (jumlah KK berstatus jadwalkan_besok dgn
-- tanggal_rencana_kunjungan = besok, WIB) ke KEDUA fungsi summary --
-- field lama TIDAK dihapus/diubah supaya tab lain (Identifikasi PPL/
-- Jorong/Tetangga) yg jg konsumsi RPC ini tidak terdampak.
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
        where kec_kode is not null and kec_kode <> ''
        group by kec_kode
      ) k
    )
  )
  from penyisiran_usaha;
$function$;

create or replace function public.penyisiran_summary_wilayah(p_wilayah jsonb)
 returns jsonb
 language sql
 stable
as $function$
  with cocok as (
    select u.*
    from public.penyisiran_usaha u
    where exists (
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
