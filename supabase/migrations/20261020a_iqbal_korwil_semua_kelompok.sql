-- 20261020a_iqbal_korwil_semua_kelompok.sql
--
-- Permintaan user (20 Okt 2026): "Jadikan iqbal sebagai korwil semua wilayah (semua) dan tambah hari kerja yang sama dengan ppl".
-- Akun: sigap_akun.id = 354 (M. Iqbal Hadi, SST., akun super, tanpa petugas_bencana_id, sebelumnya TANPA penugasan, kelompok, maupun hari kerja).
-- Kegiatan: id 1 = Pendataan Pascabencana 2026.
--
-- Yang dilakukan (hanya MENAMBAH baris; tidak mengubah dan tidak menghapus apa pun):
--   1. sigap_penugasan: satu penugasan peran 'korwil' di kegiatan 1 (pola sama dengan migrasi 20261019a: surat_tugas_id kosong, sumber diberi jejak admin).
--   2. bencana_kelompok_tim: akun 354 sebagai 'kortim' di kelompok 1-6 (urutan 3, sesudah dua kortim yang sudah ada di tiap kelompok).
--   3. sigap_hari_kerja: hari kerja yang sama dengan PPL = tanggal yang dipilih oleh minimal separuh PPL aktif kegiatan 1.
--      Per 20 Okt 2026 hasilnya 31 tanggal, 2026-10-11 s.d. 2026-11-10 (dipilih 65-66 dari 66 PPL). 10 Okt tidak ikut (hanya 7 PPL).
--      Tanggal diambil dari data saat SQL dijalankan, jadi mengikuti pilihan PPL yang berlaku saat itu.
--   4. sigap_hari_kerja_riwayat: satu baris 'tambah' per tanggal (jejak yang sama dengan penambahan lewat aplikasi).
--
-- Idempoten: dijalankan ulang tidak menambah baris ganda (ON CONFLICT DO NOTHING).
-- Cabut: lihat bagian PEMBATALAN di bawah (bukan hapus massal; dijalankan hanya bila Anda mau membatalkan).

begin;

-- 1. Penugasan korwil
insert into public.sigap_penugasan (kegiatan_id, akun_id, peran, aktif, sumber)
values (1, 354, 'korwil', true, 'admin:354 (20261020a korwil semua kelompok)')
on conflict (kegiatan_id, akun_id) do nothing;

-- 2. Kortim di semua kelompok (1-6) kegiatan 1
insert into public.bencana_kelompok_tim (kegiatan_id, kelompok, peran, akun_id, urutan, aktif)
select 1, k, 'kortim', 354, 3, true
from generate_series(1, 6) as k
on conflict (kegiatan_id, kelompok, peran, akun_id) do nothing;

-- 3. Hari kerja = tanggal yang dipilih minimal separuh PPL aktif
with ppl as (
  select id from public.sigap_penugasan where kegiatan_id = 1 and peran = 'ppl' and aktif
),
tgl as (
  select h.tanggal
  from public.sigap_hari_kerja h
  join ppl on ppl.id = h.penugasan_id
  group by h.tanggal
  having count(distinct h.penugasan_id) * 2 >= (select count(*) from ppl)
),
baru as (
  insert into public.sigap_hari_kerja (penugasan_id, akun_id, tanggal, dipilih_at)
  select p.id, 354, t.tanggal, now()
  from public.sigap_penugasan p
  cross join tgl t
  where p.kegiatan_id = 1 and p.akun_id = 354
  on conflict do nothing
  returning penugasan_id, tanggal
)
-- 4. Riwayat (hanya untuk baris yang benar-benar baru)
insert into public.sigap_hari_kerja_riwayat (penugasan_id, tanggal, aksi, oleh, waktu)
select penugasan_id, tanggal, 'tambah', 'admin:354 (20261020a korwil semua kelompok, sama dengan PPL)', now()
from baru;

-- Pemeriksaan (harus: 1 penugasan korwil, 6 kelompok, 31 hari kerja)
select
  (select count(*) from public.sigap_penugasan where kegiatan_id = 1 and akun_id = 354 and peran = 'korwil' and aktif) as penugasan_korwil,
  (select count(*) from public.bencana_kelompok_tim where kegiatan_id = 1 and akun_id = 354 and peran = 'kortim' and aktif) as kelompok,
  (select count(*) from public.sigap_hari_kerja where akun_id = 354) as hari_kerja,
  (select min(tanggal) from public.sigap_hari_kerja where akun_id = 354) as dari,
  (select max(tanggal) from public.sigap_hari_kerja where akun_id = 354) as sampai;

commit;

-- PEMBATALAN (jangan dijalankan kecuali ingin kembali ke keadaan semula). Database melarang hapus bebas pada sebagian tabel;
-- cara aman yang tidak menghapus: nonaktifkan.
--   update public.sigap_penugasan set aktif = false where kegiatan_id = 1 and akun_id = 354;
--   update public.bencana_kelompok_tim set aktif = false where kegiatan_id = 1 and akun_id = 354 and peran = 'kortim';
