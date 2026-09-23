-- supabase/migrations/20260923_spj_dokumen_per_set_hari_tugas.sql
--
-- PERUBAHAN BESAR (permintaan user 23 Sep 2026): Kwitansi, Visum, & Surat
-- Pernyataan Tidak Pakai Kendaraan Dinas TIDAK LAGI "1 baris per Surat
-- Tugas mencakup SELURUH rentang tanggal ST" -- sekarang "1 baris per SET
-- tanggal", di mana SET dihitung dari tanggal yg ditag petugas di kartu
-- 🗓 Identifikasi Hari Tugas (tabel penyisiran_alokasi_hari_tugas, tab
-- Perencanaan Lapangan), dgn 2 mode yg BISA DIPILIH PENGELOLA tiap kali
-- membuat dokumen (lihat app/api/penyisiran/spj/buat-otomatis/route.ts):
--   - "per_hari"   : SETIAP tanggal yg ditag jadi 1 SET tersendiri (1 hari).
--   - "per_rentang": tanggal yg ditag DIGABUNG selama BERURUTAN (tanpa
--     jeda kalender) -- begitu ada lompatan tanggal, jadi SET baru. Contoh
--     tanggal ditag 2,3,4,6,7 -> 2 SET: [2-4] & [6-7] (persis permintaan
--     user, contoh katanya sendiri).
-- Alasan: sebelumnya nominal Kwitansi/tanggal Visum/tanggal Surat
-- Pernyataan cuma bisa mewakili SATU rentang utuh per ST (kadang 2 minggu),
-- padahal 🗓 Identifikasi Hari Tugas & 📋 Identifikasi Wilayah Sampel SLS
-- (kecamatan tujuan, lihat lib/spjWilayahTugas.ts) SUDAH ADA di sistem &
-- seharusnya bisa langsung dipakai bikin dokumen SPJ tanpa isi manual lagi
-- (kecuali nominal Kwitansi, yg cuma dpt DEFAULT dari tarif tetap di bawah,
-- tetap boleh diganti manual).
--
-- Surat Tugas (file upload) & Laporan/Dokumentasi (SUDAH per-tanggal sejak
-- awal) TIDAK berubah sama sekali -- ini CUMA soal Kwitansi/Visum/Surat
-- Pernyataan.

-- ============================================================
-- 1. Kolom SET baru di 3 tabel (nullable dulu, diisi backfill di bawah,
--    BARU di-NOT NULL di langkah terakhir supaya migrasi data lama aman).
-- ============================================================
alter table spj_kwitansi
  add column if not exists tanggal_mulai_set date,
  add column if not exists tanggal_selesai_set date,
  -- Tarif/hari & jumlah hari DISIMPAN (bukan cuma dihitung on-the-fly) supaya
  -- kwitansi lama tetap py jejak audit "kenapa nominalnya segini" walau
  -- TARIF_TRANSLOK_PER_HARI di bawah berubah suatu saat nanti.
  add column if not exists nominal_per_hari numeric,
  add column if not exists jumlah_hari integer;

alter table spj_visum
  add column if not exists tanggal_mulai_set date,
  add column if not exists tanggal_selesai_set date;

alter table spj_surat_pernyataan_kendaraan
  add column if not exists tanggal_mulai_set date,
  add column if not exists tanggal_selesai_set date;

-- ============================================================
-- 2. Backfill 13 Kwitansi + 16 Visum + 13 Surat Pernyataan LAMA yg sudah
--    ada di produksi (per 23 Sep 2026) -- DIHITUNG MANUAL & DIPERIKSA SATU
--    PER SATU (bukan skrip generik) krn ini menyangkut dokumen keuangan
--    riil, TIDAK boleh diserahkan ke formula tanpa pengecekan. Kesimpulan
--    pengecekan (lihat percakapan 23 Sep 2026, sudah dikonfirmasi data
--    aktual dari penyisiran_alokasi_hari_tugas):
--      - 15 dari 16 petugas yg py dokumen lama TERNYATA cuma py SATU
--        rentang tanggal ditag yg BERURUTAN (tanpa jeda) -- jadi migrasinya
--        MURNI ganti "cakupan ST penuh" jadi "cakupan tanggal ditag",
--        TANPA perlu pecah baris / pecah nominal sama sekali.
--      - HANYA petugas_id=13 (M. Iqbal Hadi, akun yg dipakai sesi ini
--        sendiri) py tanggal ditag TIDAK berurutan (23-25 lalu 28-29,
--        loncat 26-27) -- SATU-SATUNYA kasus yg baris lamanya (kwitansi
--        id=1, visum id=1, surat_pernyataan id=1) dipecah jadi 2 SET.
--        Nominal kwitansi id=1 = Rp 0 (bukan tarif translok riil), jadi
--        pemecahannya TIDAK melibatkan pembagian uang sama sekali (0/2=0).
--      - petugas_id=72 (Velmarniati, kwitansi id=10/visum id=8/surat
--        pernyataan id=5) TIDAK PERNAH menandai 🗓 Identifikasi Hari Tugas
--        sama sekali -- utk baris ini SET diambil dari tanggal yg SUDAH
--        tersimpan di baris itu sendiri (bukan tebakan baru), dijadikan SET
--        1 hari (tanggal_mulai_set = tanggal_selesai_set = tanggal lama).
-- ============================================================

-- ---------- 2a. Kwitansi: 12 petugas dgn 1 rentang berurutan (UPDATE saja,
--            tetap 1 baris) ----------
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30', jumlah_hari=13, nominal_per_hari = nominal/13 where id=2;  -- petugas 41
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30', jumlah_hari=13, nominal_per_hari = nominal/13 where id=6;  -- petugas 42
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30', jumlah_hari=13, nominal_per_hari = nominal/13 where id=15; -- petugas 69
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30', jumlah_hari=13, nominal_per_hari = nominal/13 where id=13; -- petugas 39
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-27', jumlah_hari=10, nominal_per_hari = nominal/10 where id=24; -- petugas 29
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30', jumlah_hari=13, nominal_per_hari = nominal/13 where id=27; -- petugas 71
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30', jumlah_hari=13, nominal_per_hari = nominal/13 where id=32; -- petugas 46
update spj_kwitansi set tanggal_mulai_set='2026-09-22', tanggal_selesai_set='2026-09-30', jumlah_hari=9,  nominal_per_hari = nominal/9  where id=34; -- petugas 103
update spj_kwitansi set tanggal_mulai_set='2026-09-23', tanggal_selesai_set='2026-09-30', jumlah_hari=8,  nominal_per_hari = nominal/8  where id=37; -- petugas 53
update spj_kwitansi set tanggal_mulai_set='2026-09-22', tanggal_selesai_set='2026-09-30', jumlah_hari=9,  nominal_per_hari = nominal/9  where id=39; -- petugas 62
update spj_kwitansi set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30', jumlah_hari=13, nominal_per_hari = nominal/13 where id=10; -- petugas 72 -- lihat 2b, override lagi di bawah

-- 2b. petugas 72 -- TIDAK PERNAH menandai Hari Tugas -- pakai tanggal lama
-- baris itu sendiri sbg SET 1 hari (menimpa nilai sementara di atas).
update spj_kwitansi set tanggal_mulai_set='2026-09-20', tanggal_selesai_set='2026-09-20', jumlah_hari=1, nominal_per_hari = nominal where id=10;

-- 2c. petugas 13 (M. Iqbal Hadi) -- SATU-SATUNYA yg dipecah jadi 2 SET
-- (23-25 & 28-29, tanggal ditag tidak berurutan). Nominal lama = 0, jadi
-- kedua SET hasil pecahan juga 0 (bukan estimasi/pembagian sembarang).
update spj_kwitansi
  set tanggal_mulai_set='2026-09-23', tanggal_selesai_set='2026-09-25', jumlah_hari=3, nominal_per_hari=0
  where id=1;
insert into spj_kwitansi (surat_tugas_id, petugas_jenis, petugas_id, nominal, terbilang, untuk_perjalanan_dinas_pada, tanggal_spd, tanggal_kwitansi, created_by, tanggal_mulai_set, tanggal_selesai_set, nominal_per_hari, jumlah_hari)
select surat_tugas_id, petugas_jenis, petugas_id, 0, 'nol rupiah', untuk_perjalanan_dinas_pada, '2026-09-28', '2026-09-29', created_by, '2026-09-28', '2026-09-29', 0, 2
from spj_kwitansi where id=1;

-- ---------- 2d. Visum (16 baris: 15 rentang berurutan + petugas 13 dipecah) ----------
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=2;  -- petugas 41
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=6;  -- petugas 42
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=7;  -- petugas 69
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=14; -- petugas 39
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-27' where id=31; -- petugas 29
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=32; -- petugas 71
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=37; -- petugas 20
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=39; -- petugas 35
update spj_visum set tanggal_mulai_set='2026-09-22', tanggal_selesai_set='2026-09-30' where id=44; -- petugas 106
update spj_visum set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=16; -- petugas 46
update spj_visum set tanggal_mulai_set='2026-09-22', tanggal_selesai_set='2026-09-30' where id=45; -- petugas 103
update spj_visum set tanggal_mulai_set='2026-09-23', tanggal_selesai_set='2026-09-30' where id=46; -- petugas 53
update spj_visum set tanggal_mulai_set='2026-09-22', tanggal_selesai_set='2026-09-30' where id=47; -- petugas 62
-- petugas 72 -- tidak pernah tag Hari Tugas -- pakai tanggal lama baris sendiri
update spj_visum set tanggal_mulai_set='2026-09-20', tanggal_selesai_set='2026-09-20' where id=8;  -- petugas 72

-- petugas 13 -- dipecah jadi 2 SET
update spj_visum
  set tanggal_mulai_set='2026-09-23', tanggal_selesai_set='2026-09-25',
      tanggal_berangkat='2026-09-23', tanggal_tiba_tujuan='2026-09-23',
      tanggal_berangkat_kembali='2026-09-25', tanggal_tiba_kembali='2026-09-25'
  where id=1;
insert into spj_visum (surat_tugas_id, petugas_jenis, petugas_id, rencana_tujuan, rencana_kec_kode, rencana_kec_nama, rencana_nagari_kode, rencana_nagari_nama, tempat_kedudukan, tanggal_berangkat, tanggal_tiba_tujuan, tanggal_berangkat_kembali, tanggal_tiba_kembali, tanggal_mulai_set, tanggal_selesai_set)
select surat_tugas_id, petugas_jenis, petugas_id, rencana_tujuan, rencana_kec_kode, rencana_kec_nama, rencana_nagari_kode, rencana_nagari_nama, tempat_kedudukan, '2026-09-28', '2026-09-28', '2026-09-29', '2026-09-29', '2026-09-28', '2026-09-29'
from spj_visum where id=1;

-- ---------- 2e. Surat Pernyataan Kendaraan (13 baris: 12 rentang berurutan + petugas 13 dipecah) ----------
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=2;  -- petugas 41
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=3;  -- petugas 42
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=6;  -- petugas 39
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=7;  -- petugas 69
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-27' where id=12; -- petugas 29
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=14; -- petugas 71
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=15; -- petugas 70
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-30' where id=16; -- petugas 46
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-22', tanggal_selesai_set='2026-09-30' where id=18; -- petugas 103
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-23', tanggal_selesai_set='2026-09-30' where id=19; -- petugas 53
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-22', tanggal_selesai_set='2026-09-30' where id=20; -- petugas 62
-- petugas 72 -- tidak pernah tag Hari Tugas -- pakai tanggal lama baris sendiri
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set='2026-09-18', tanggal_selesai_set='2026-09-18' where id=5;  -- petugas 72

-- petugas 13 -- dipecah jadi 2 SET
update spj_surat_pernyataan_kendaraan
  set tanggal_mulai_set='2026-09-23', tanggal_selesai_set='2026-09-25', tanggal_pelaksanaan='2026-09-25'
  where id=1;
insert into spj_surat_pernyataan_kendaraan (surat_tugas_id, petugas_jenis, petugas_id, tanggal_pelaksanaan, tanggal_mulai_set, tanggal_selesai_set)
select surat_tugas_id, petugas_jenis, petugas_id, '2026-09-29', '2026-09-28', '2026-09-29'
from spj_surat_pernyataan_kendaraan where id=1;

-- ---------- 2f. Pastikan SEMUA baris (termasuk kalau ada baris baru yg
--            masuk di antara waktu analisis & migrasi dijalankan) punya
--            kolom SET terisi -- fallback generik: pakai tanggal/rentang
--            yg SUDAH ada di baris itu sendiri (BUKAN tebakan baru),
--            supaya constraint NOT NULL di langkah 3 tidak gagal. ----------
update spj_kwitansi set tanggal_mulai_set = tanggal_spd, tanggal_selesai_set = tanggal_spd, jumlah_hari = coalesce(jumlah_hari, 1), nominal_per_hari = coalesce(nominal_per_hari, nominal)
  where tanggal_mulai_set is null;
update spj_visum set tanggal_mulai_set = tanggal_berangkat, tanggal_selesai_set = coalesce(tanggal_tiba_kembali, tanggal_berangkat)
  where tanggal_mulai_set is null;
update spj_surat_pernyataan_kendaraan set tanggal_mulai_set = tanggal_pelaksanaan, tanggal_selesai_set = tanggal_pelaksanaan
  where tanggal_mulai_set is null;

-- ============================================================
-- 3. Kunci kolom SET jadi NOT NULL & ganti unique constraint -- 1 petugas
--    boleh py BANYAK baris per Surat Tugas sekarang (beda SET), asal
--    tanggal_mulai_set-nya beda (2 SET tidak boleh mulai di tanggal yg
--    sama utk 1 petugas+ST yg sama -- cukup utk mencegah duplikat SET
--    tanpa perlu exclusion-constraint rentang yg lebih rumit).
-- ============================================================
alter table spj_kwitansi
  alter column tanggal_mulai_set set not null,
  alter column tanggal_selesai_set set not null,
  drop constraint if exists spj_kwitansi_surat_tugas_id_petugas_jenis_petugas_id_key,
  add constraint spj_kwitansi_st_petugas_set_key unique (surat_tugas_id, petugas_jenis, petugas_id, tanggal_mulai_set),
  add constraint spj_kwitansi_set_valid check (tanggal_selesai_set >= tanggal_mulai_set);

alter table spj_visum
  alter column tanggal_mulai_set set not null,
  alter column tanggal_selesai_set set not null,
  drop constraint if exists spj_visum_surat_tugas_id_petugas_jenis_petugas_id_key,
  add constraint spj_visum_st_petugas_set_key unique (surat_tugas_id, petugas_jenis, petugas_id, tanggal_mulai_set),
  add constraint spj_visum_set_valid check (tanggal_selesai_set >= tanggal_mulai_set);

alter table spj_surat_pernyataan_kendaraan
  alter column tanggal_mulai_set set not null,
  alter column tanggal_selesai_set set not null,
  drop constraint if exists spj_surat_pernyataan_kendaraa_surat_tugas_id_petugas_jenis__key,
  add constraint spj_surat_pernyataan_st_petugas_set_key unique (surat_tugas_id, petugas_jenis, petugas_id, tanggal_mulai_set),
  add constraint spj_surat_pernyataan_set_valid check (tanggal_selesai_set >= tanggal_mulai_set);

comment on column spj_kwitansi.tanggal_mulai_set is 'Awal SET tanggal yg diwakili baris ini (dari 🗓 Identifikasi Hari Tugas, mode per_hari/per_rentang -- lihat lib/spjSetHariTugas.ts). Utk baris lama/manual tanpa Hari Tugas ditag, = tanggal_spd.';
comment on column spj_kwitansi.tanggal_selesai_set is 'Akhir SET tanggal (inklusif). = tanggal_mulai_set kalau SET cuma 1 hari.';
comment on column spj_kwitansi.jumlah_hari is 'tanggal_selesai_set - tanggal_mulai_set + 1 -- disimpan (bukan cuma dihitung) utk jejak audit nominal = nominal_per_hari x jumlah_hari.';
comment on column spj_kwitansi.nominal_per_hari is 'Tarif per hari yg dipakai saat baris ini dibuat (lihat TARIF_TRANSLOK_PER_HARI_DEFAULT di lib/spjSetHariTugas.ts) -- disimpan terpisah dari `nominal` (total) supaya histori tarif lama tidak berubah kalau tarif default diubah di masa depan.';

-- ============================================================
-- 4. spj_matriks_kelengkapan() -- ganti EXISTS polos (dulu: "ADA baris
--    utk ST+petugas ini, titik") jadi EXISTS yg juga cocok TANGGAL hari
--    itu ke dalam salah satu SET tersimpan (dulu tdk perlu krn cuma ada 1
--    baris per ST yg otomatis "berlaku" ke semua tanggal ST; sekarang bisa
--    ada BANYAK baris/SET per ST, jadi harus dicek SET mana yg mencakup
--    tanggal h.tanggal_hari itu).
-- ============================================================
create or replace function spj_matriks_kelengkapan()
returns table(petugas_jenis text, petugas_id bigint, nama text, surat_tugas_id bigint, nomor_st text, tanggal date, ada_visum boolean, ada_kwitansi boolean, ada_laporan boolean, slot_dokumentasi_terisi integer, ada_surat_keterangan boolean)
language sql stable security definer
set search_path to 'public'
as $function$
  with pasangan as (
    select stp.surat_tugas_id, stp.petugas_jenis, stp.petugas_id,
           coalesce(pp.nama, tt.nama, 'ID ' || stp.petugas_id::text) as nama,
           st.nomor_st, st.tanggal_mulai, st.tanggal_selesai
    from spj_surat_tugas_petugas stp
    join spj_surat_tugas st on st.id = stp.surat_tugas_id
    left join petugas_penyisiran_akun pp on stp.petugas_jenis = 'penyisiran' and pp.id = stp.petugas_id
    left join tetangga_akun tt on stp.petugas_jenis = 'tetangga' and tt.id = stp.petugas_id
  ),
  harian as (
    select p.*, gs.tanggal::date as tanggal_hari
    from pasangan p
    cross join lateral generate_series(p.tanggal_mulai, p.tanggal_selesai, interval '1 day') as gs(tanggal)
  )
  select
    h.petugas_jenis,
    h.petugas_id,
    h.nama,
    h.surat_tugas_id,
    h.nomor_st,
    h.tanggal_hari as tanggal,
    exists(
      select 1 from spj_visum v
      where v.surat_tugas_id = h.surat_tugas_id and v.petugas_id = h.petugas_id and v.petugas_jenis = h.petugas_jenis
        and h.tanggal_hari between v.tanggal_mulai_set and v.tanggal_selesai_set
    ) as ada_visum,
    exists(
      select 1 from spj_kwitansi k
      where k.surat_tugas_id = h.surat_tugas_id and k.petugas_id = h.petugas_id and k.petugas_jenis = h.petugas_jenis
        and h.tanggal_hari between k.tanggal_mulai_set and k.tanggal_selesai_set
    ) as ada_kwitansi,
    exists(
      select 1 from spj_laporan l
      where l.surat_tugas_id = h.surat_tugas_id and l.petugas_id = h.petugas_id and l.petugas_jenis = h.petugas_jenis
        and l.tanggal = h.tanggal_hari
    ) as ada_laporan,
    (
      select count(*)::int from spj_dokumentasi_foto d
      where d.surat_tugas_id = h.surat_tugas_id and d.petugas_id = h.petugas_id and d.petugas_jenis = h.petugas_jenis
        and d.tanggal = h.tanggal_hari
    ) as slot_dokumentasi_terisi,
    exists(
      select 1 from spj_surat_pernyataan_kendaraan sk
      where sk.surat_tugas_id = h.surat_tugas_id and sk.petugas_id = h.petugas_id and sk.petugas_jenis = h.petugas_jenis
        and h.tanggal_hari between sk.tanggal_mulai_set and sk.tanggal_selesai_set
    ) as ada_surat_keterangan
  from harian h
  order by h.tanggal_hari, h.nama;
$function$;
