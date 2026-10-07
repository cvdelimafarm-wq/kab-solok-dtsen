-- (8 Okt 2026) Peran "Instruktur Pelatihan (Inda)": akses penuh menu Kelola Pelatihan (termasuk Adu Sigap) utk kegiatan pelatihan.
insert into sigap_peran (kode, nama, keterangan, butuh_lingkup, sistem)
select 'instruktur_pelatihan', 'Instruktur Pelatihan (Inda)', 'Instruktur/Inda: mengelola pelatihan (soal, presensi, instrumen, Adu Sigap). Lingkup per kegiatan.', true, false
where not exists (select 1 from sigap_peran where kode = 'instruktur_pelatihan');

insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, 'pelatihan.kelola', 'kelola' from sigap_peran p
where p.kode = 'instruktur_pelatihan'
  and not exists (select 1 from sigap_peran_izin i where i.peran_id = p.id and i.menu_kode = 'pelatihan.kelola');

insert into sigap_akun_peran (akun_id, peran_id, kegiatan_id)
select a.id, p.id, k.id
from sigap_akun a
join sigap_peran p on p.kode = 'instruktur_pelatihan'
join sigap_kegiatan k on k.nama = 'Pelatihan Petugas PSP Pascabencana 2026'
where a.id in (354, 200, 464, 49)
  and not exists (select 1 from sigap_akun_peran x where x.akun_id = a.id and x.peran_id = p.id and x.kegiatan_id = k.id);
