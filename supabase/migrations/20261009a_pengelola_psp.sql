-- (9 Okt 2026) Peran "Pengelola PSP Pascabencana" -- permintaan user: "berikan akses kepada alex kandria, wisnu, oryza,
-- yudi firdian dan para instruktur untuk mengelola ini khususnya kegiatan pendataan pasca bencana (pelatihan dan semuanya)".
-- Lingkup: kegiatan 3 (Pelatihan Petugas PSP Pascabencana 2026) dan 1 (Pendataan Pascabencana 2026).
-- Sengaja TIDAK diberi: akses.kelola (atur peran orang lain), translok.buka_kunci (buka SPJ terkunci), kontrak, pedia, portal.

insert into sigap_peran (kode, nama, keterangan, butuh_lingkup, sistem)
values ('pengelola_psp', 'Pengelola PSP Pascabencana',
        'Kelola pelatihan, administrasi, monitoring/penugasan/verifikasi transport lokal, dan admin pendataan bencana untuk kegiatan PSP Pascabencana 2026.',
        true, false)
on conflict (kode) do nothing;

insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, m.menu, m.level
from sigap_peran p
cross join (values
  ('pelatihan.kelola', 'kelola'),
  ('pelatihan.administrasi', 'kelola'),
  ('translok.monitoring', 'kelola'),
  ('translok.penugasan', 'kelola'),
  ('translok.verifikasi', 'kelola'),
  ('translok.izin_susulan', 'kelola'),
  ('translok.kegiatan', 'lihat'),
  ('bencana.admin', 'kelola')
) as m(menu, level)
where p.kode = 'pengelola_psp'
  and not exists (select 1 from sigap_peran_izin x where x.peran_id = p.id and x.menu_kode = m.menu);

-- Alex Kandria 23, Wisnu 710, Oryza 478, Yudi Firdian 745, instruktur: Faisal 200, Nurafiza 464, Anggun 49
-- + M. Iqbal Hadi 354 (juga instruktur, ditambahkan atas permintaan user).
insert into sigap_akun_peran (akun_id, peran_id, kegiatan_id, diberi_oleh)
select a.akun_id, p.id, k.kegiatan_id, 'claude (permintaan M. Iqbal Hadi, 9 Okt 2026)'
from sigap_peran p
cross join (values (23), (710), (478), (745), (200), (464), (49), (354)) as a(akun_id)
cross join (values (1), (3)) as k(kegiatan_id)
where p.kode = 'pengelola_psp'
  and not exists (select 1 from sigap_akun_peran x where x.akun_id = a.akun_id and x.peran_id = p.id and x.kegiatan_id = k.kegiatan_id);

insert into sigap_audit (akun_id, aksi, detail)
values (354, 'peran.beri', jsonb_build_object('peran', 'pengelola_psp', 'akun', array[23,710,478,745,200,464,49,354], 'kegiatan', array[1,3], 'oleh', 'claude'));
