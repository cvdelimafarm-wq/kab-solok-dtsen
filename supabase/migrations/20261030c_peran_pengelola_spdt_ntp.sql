-- 30 Okt 2026 -- Peran baru "Pengelola SPDT NTP": akses Kelola Pendataan KHUSUS survei SPDT NTP (kegiatan 2).
-- Latar: SPDT NTP survei terpisah dari PSP Pascabencana, tetapi izin Kelola Pendataan (menu `bencana.admin`)
-- sebelumnya hanya dimiliki peran `pengelola_psp`. Kode aplikasi kini memeriksa lingkup kegiatan di server,
-- sehingga pengelola SPDT NTP tidak bisa membuka PSP dan sebaliknya.
-- Idempotent: aman dijalankan ulang. Jalankan SEBELUM atau bersamaan dengan deploy kode.

begin;

insert into sigap_peran (kode, nama, keterangan, butuh_lingkup, sistem)
values ('pengelola_spdt_ntp', 'Pengelola SPDT NTP',
        'Mengelola pendataan SPDT NTP (QC pemahaman, bank soal, dokumen pemeriksaan PML); hanya untuk kegiatan SPDT NTP.',
        true, false)
on conflict (kode) do nothing;

insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, 'bencana.admin', 'kelola' from sigap_peran p where p.kode = 'pengelola_spdt_ntp'
on conflict (peran_id, menu_kode) do nothing;

-- Penerima peran (lingkup kegiatan 2 = SPDT NTP): Mailani Putri (357), Arini Alva Syaadah (73), Faisal Siddiq (200).
-- Alex Kandria (23) dan Oryza Maria Ulva (478) sudah supervisor SPDT NTP + pengelola PSP; buka komentar jika perlu:
insert into sigap_akun_peran (akun_id, peran_id, kegiatan_id, diberi_oleh)
select a.id, p.id, 2, 'migrasi 20261030c'
from sigap_akun a
join sigap_peran p on p.kode = 'pengelola_spdt_ntp'
where a.id in (357, 73, 200
               -- , 23, 478
              )
  and not exists (select 1 from sigap_akun_peran x where x.akun_id = a.id and x.peran_id = p.id and x.kegiatan_id = 2);

commit;

-- Cek (harus 3 baris):
-- select ap.akun_id, a.nama, p.kode, ap.kegiatan_id from sigap_akun_peran ap join sigap_akun a on a.id=ap.akun_id join sigap_peran p on p.id=ap.peran_id where p.kode='pengelola_spdt_ntp';
