-- Target per petugas (tabel petugas_penyisiran_akun) utk tab baru
-- "Manajemen Target" -- HANYA bisa diakses 4 nama tertentu (Bambang
-- Suryanggono, Deswaty, M. Iqbal Hadi, Wisnu Dwi Jayanto), dicek di
-- lib/manajemenTargetAkses.ts, BUKAN lewat RLS/role token baru (mereka
-- tetap pakai role token "penyisiran_petugas" yg sama dgn tab Penyisiran
-- Usaha, krn memang sudah punya akun personal di tabel ini).
--
-- Satu baris per petugas (bukan per jenis tugas) krn satu orang bisa
-- punya target utk KEDUA jenis tugas sekaligus (Identifikasi Jorong &
-- Pendataan/Penyisiran Usaha, dua-duanya lewat akun yg sama):
--  - target_identifikasi_jumlah + target_identifikasi_satuan: target
--    WAJIB DIKUNJUNGI utk tugas Identifikasi (Jorong) -- satuannya bisa
--    KK, atau malah per wilayah (SLS/Nagari/Kecamatan) sesuai kebutuhan
--    manajemen (mis. "wajib menyisir 3 Nagari", bukan hitung KK).
--  - target_kunjungan_kk: target jumlah KK yg WAJIB DIKUNJUNGI utk tugas
--    Pendataan (Penyisiran Usaha), satuannya SELALU KK.
--  - target_berhasil_kk: target jumlah KK yg WAJIB BERHASIL DIDATA (subset
--    dari kunjungan, status_kunjungan = 'ditemukan'), SELALU KK.
--
-- SEMUA kolom nullable -- petugas yg belum diberi target sama sekali
-- tidak perlu baris di tabel ini (baris dibuat on-demand saat pengelola
-- pertama kali mengisi salah satu targetnya).
create table if not exists petugas_target (
  petugas_id bigint primary key references petugas_penyisiran_akun(id) on delete cascade,
  target_identifikasi_jumlah integer check (target_identifikasi_jumlah is null or target_identifikasi_jumlah >= 0),
  target_identifikasi_satuan text check (target_identifikasi_satuan in ('kk', 'sls', 'nagari', 'kecamatan')),
  target_kunjungan_kk integer check (target_kunjungan_kk is null or target_kunjungan_kk >= 0),
  target_berhasil_kk integer check (target_berhasil_kk is null or target_berhasil_kk >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table petugas_target enable row level security;
-- Sengaja TIDAK ada policy publik -- akses hanya lewat SUPABASE_SERVICE_ROLE_KEY
-- dari API routes (pola sama dgn seluruh tabel penyisiran/akun lainnya di
-- proyek ini), dgn pengecekan nama pengelola di lib/manajemenTargetAkses.ts.

-- Rekap identifikasi (identifikasi_ppl: belum/ada/tidak_ada/ragu)
-- dikelompokkan per level wilayah pilihan (kecamatan/nagari/sub SLS) --
-- dipakai panel "Ringkasan Hasil Identifikasi" di tab Manajemen Target.
create or replace function public.penyisiran_ringkasan_identifikasi(p_level text)
returns table(kode text, nama text, belum bigint, ada bigint, tidak_ada bigint, ragu bigint, total bigint)
language sql
stable
as $function$
  select
    case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end as kode,
    case p_level
      when 'nagari' then max(nagari_nama)
      when 'subsls' then max(sls_nama) || '-' || max(subsls_kode)
      else max(kec_nama)
    end as nama,
    count(*) filter (where identifikasi_ppl = 'belum') as belum,
    count(*) filter (where identifikasi_ppl = 'ada') as ada,
    count(*) filter (where identifikasi_ppl = 'tidak_ada') as tidak_ada,
    count(*) filter (where identifikasi_ppl = 'ragu') as ragu,
    count(*) as total
  from penyisiran_usaha
  where (case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end) is not null
    and (case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end) <> ''
  group by 1
  order by 2;
$function$;
