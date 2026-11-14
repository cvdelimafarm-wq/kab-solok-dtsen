-- 20261114k — DATA (sudah dijalankan di produksi 14 Nov 2026)
-- Putusan Ketua Tim: hari kerja kegiatan 6 dipotong ke batas RAB (maks_hari = 4).
-- Yang dilepas hanya hari setelah hari ke-4 dan setelah 14 Nov (belum berjalan).
-- Hasil: 10 hari dilepas (1 PPL 6 hari, 4 PML masing-masing 1 hari).
-- Pola sama dengan aksi "lepas" admin (lib/sigapHariKerjaDb.ts): hapus + catat di
-- sigap_hari_kerja_riwayat, sehingga bisa dipulihkan dari riwayat.
with cut as (
  select h.id, h.penugasan_id, h.akun_id, h.tanggal,
         row_number() over (partition by h.penugasan_id order by h.tanggal) rn, p.maks_hari
  from sigap_hari_kerja h join sigap_penugasan p on p.id = h.penugasan_id
  where p.kegiatan_id = 6 and p.aktif and h.uji_coba_sampai is null
), sasaran as (select * from cut where rn > maks_hari and tanggal > date '2026-11-14'),
r as (
  insert into sigap_hari_kerja_riwayat (penugasan_id, akun_id, tanggal, aksi, oleh, alasan)
  select penugasan_id, akun_id, tanggal, 'hapus', 'admin:Claude (atas putusan Ketua Tim)', 'dipotong ke batas RAB 4 hari'
  from sasaran returning 1
)
delete from sigap_hari_kerja where id in (select id from sasaran);
