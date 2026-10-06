-- (6 Okt 2026) Hari kerja UJI COBA -- permintaan user: semua petugas SPDT NTP mendapat hari kerja 6 Okt 2026
-- utk uji coba upload, otomatis tidak terbaca mulai 7 Okt 00:00 WIB. Data TIDAK dihapus; aplikasi memfilter
-- baris dgn uji_coba_sampai <= sekarang (lib/sigap.ts HK_AKTIF). Penugasan uji coba di akun admin (id 154)
-- dinonaktifkan (koreksi user).
set statement_timeout = '60s';
set lock_timeout = '10s';
alter table sigap_hari_kerja add column if not exists uji_coba_sampai timestamptz;
comment on column sigap_hari_kerja.uji_coba_sampai is 'Hari kerja uji coba: otomatis tidak terbaca aplikasi setelah waktu ini (data tidak dihapus).';

update sigap_penugasan set aktif = false where id = 154 and sumber = 'uji_coba_6okt';
update sigap_hari_kerja set uji_coba_sampai = '2026-10-07 00:00:00+07' where penugasan_id = 154 and tanggal = '2026-10-06';

insert into sigap_hari_kerja (penugasan_id, akun_id, tanggal, uji_coba_sampai)
select p.id, p.akun_id, '2026-10-06', '2026-10-07 00:00:00+07'
from sigap_penugasan p join sigap_kegiatan k on k.id = p.kegiatan_id
where k.kode = 'spdt_ntp_2026' and p.aktif
on conflict do nothing;

insert into sigap_hari_kerja_riwayat (penugasan_id, tanggal, aksi, oleh)
select p.id, '2026-10-06', 'tambah', 'admin: hari uji coba upload (otomatis nonaktif 7 Okt 00:00 WIB)'
from sigap_penugasan p join sigap_kegiatan k on k.id = p.kegiatan_id
where k.kode = 'spdt_ntp_2026' and p.aktif;
