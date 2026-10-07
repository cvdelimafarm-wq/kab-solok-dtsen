-- (7 Okt 2026) Lepas hari kerja DEMO SPDT NTP tgl 8 Okt 2026 utk 10 pegawai organik agar bisa ikut kegiatan
-- Pelatihan PSP Pascabencana (aturan 1 tanggal = 1 kegiatan) -- permintaan user "lepas hari demo itu untuk tgl 8".
-- Dijalankan USER di Supabase SQL Editor. 10 baris demo (id 101,102,104,106,109,110,112,113,118,119),
-- semuanya tanpa laporan & tanpa foto (dicek 7 Okt 2026).
begin;

insert into sigap_hari_kerja_riwayat (penugasan_id, tanggal, aksi, oleh)
select penugasan_id, tanggal, 'hapus', 'admin:lepas demo 8 Okt utk pelatihan (permintaan user)'
from sigap_hari_kerja
where id in (101,102,104,106,109,110,112,113,118,119) and tanggal = '2026-10-08' and uji_coba_sampai is not null;

delete from sigap_hari_kerja
where id in (101,102,104,106,109,110,112,113,118,119) and tanggal = '2026-10-08' and uji_coba_sampai is not null;

-- hari kerja pelatihan 8 Okt utk peserta yg belum punya
insert into sigap_hari_kerja (penugasan_id, akun_id, tanggal)
select p.id, p.akun_id, date '2026-10-08'
from sigap_penugasan p join sigap_kegiatan k on k.id = p.kegiatan_id
where k.kode = 'pelatihan_psp_pascabencana_2026' and p.aktif
  and not exists (select 1 from sigap_hari_kerja h where h.akun_id = p.akun_id and h.tanggal = date '2026-10-08');

insert into sigap_hari_kerja_riwayat (penugasan_id, tanggal, aksi, oleh)
select h.penugasan_id, h.tanggal, 'tambah', 'admin:pelatihan 8 Okt (otomatis, permintaan user)'
from sigap_hari_kerja h join sigap_penugasan p on p.id = h.penugasan_id join sigap_kegiatan k on k.id = p.kegiatan_id
where k.kode = 'pelatihan_psp_pascabencana_2026'
  and not exists (select 1 from sigap_hari_kerja_riwayat r where r.penugasan_id = h.penugasan_id and r.tanggal = h.tanggal and r.aksi = 'tambah');

commit;

-- Cek (harus 91 = semua peserta pelatihan aktif punya hari kerja 8 Okt):
select count(*) from sigap_hari_kerja h join sigap_penugasan p on p.id = h.penugasan_id where p.kegiatan_id = 3 and p.aktif and h.tanggal = '2026-10-08';
