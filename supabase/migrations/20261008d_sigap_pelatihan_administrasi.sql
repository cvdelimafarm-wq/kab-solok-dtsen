-- (8 Okt 2026) SIGAP > Kelola Pelatihan > tab Administrasi (SPJ translok per kelas + kelengkapan pelatihan).
--
-- 1. Kelas instruktur DIPERBARUI sesuai keputusan user: Iqbal -> 2, Anggun -> 4, Faisal -> 3, Nurafiza -> 1.
-- 2. Menu izin baru `pelatihan.administrasi` (lihat | kelola).
--      kelola : Admin Anggaran, PJ Kegiatan, Admin Aplikasi, Instruktur Pelatihan, Panitia Pelatihan
--      lihat  : Bendahara
--    Cakupan DATA ditentukan di kode API: peran admin/bendahara/panitia = semua kelas; akun yang HANYA
--    berperan Instruktur Pelatihan = kelas miliknya (tabel sigap_kuis_instruktur_kelas).
-- 3. Peran baru `panitia_pelatihan` (pelatihan.kelola = lihat, pelatihan.administrasi = kelola, semua kelas):
--    Oryza Maria Ulva (akun 478), Alex Kandria (akun 23), Wisnu Dwi Jayanto (akun 710).
-- 4. Tabel narasi laporan (Laporan Pelatihan & Laporan Pelatihan Instruktur) per kelas.
-- 5. Peserta tambahan manual memakai sigap_penugasan.sumber = 'administrasi' (dikecualikan dari tes/kuis/presensi di kode).

-- 1) kelas instruktur
insert into sigap_kuis_instruktur_kelas (kegiatan_id, akun_id, kelas) values
  (3, 354, 2), (3, 49, 4), (3, 200, 3), (3, 464, 1)
on conflict (kegiatan_id, akun_id) do update set kelas = excluded.kelas;

-- 2) menu izin
insert into sigap_menu (kode, portal, nama, keterangan, urutan, aktif)
select 'pelatihan.administrasi', 'Pelatihan', 'Administrasi pelatihan (SPJ translok & kelengkapan)',
       'Cetak SPJ transport lokal peserta pelatihan, daftar hadir, laporan pelatihan & laporan instruktur.', 71, true
where not exists (select 1 from sigap_menu where kode = 'pelatihan.administrasi');

-- 3) peran panitia
insert into sigap_peran (kode, nama, keterangan, butuh_lingkup, sistem)
select 'panitia_pelatihan', 'Panitia Pelatihan', 'Panitia: memantau pelatihan dan mengurus administrasi (SPJ translok, daftar hadir, laporan) untuk SEMUA kelas.', true, false
where not exists (select 1 from sigap_peran where kode = 'panitia_pelatihan');

insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, v.menu_kode, v.level
from sigap_peran p
join (values
  ('admin_anggaran',       'pelatihan.administrasi', 'kelola'),
  ('pj_kegiatan',          'pelatihan.administrasi', 'kelola'),
  ('admin_aplikasi',       'pelatihan.administrasi', 'kelola'),
  ('instruktur_pelatihan', 'pelatihan.administrasi', 'kelola'),
  ('bendahara',            'pelatihan.administrasi', 'lihat'),
  ('panitia_pelatihan',    'pelatihan.administrasi', 'kelola'),
  ('panitia_pelatihan',    'pelatihan.kelola',       'lihat')
) as v(peran_kode, menu_kode, level) on v.peran_kode = p.kode
where not exists (select 1 from sigap_peran_izin i where i.peran_id = p.id and i.menu_kode = v.menu_kode);

insert into sigap_akun_peran (akun_id, peran_id, kegiatan_id)
select a.id, p.id, k.id
from sigap_akun a
join sigap_peran p on p.kode = 'panitia_pelatihan'
join sigap_kegiatan k on k.nama = 'Pelatihan Petugas PSP Pascabencana 2026'
where a.id in (478, 23, 710)
  and not exists (select 1 from sigap_akun_peran x where x.akun_id = a.id and x.peran_id = p.id and x.kegiatan_id = k.id);

-- 4) narasi laporan per kelas
create table if not exists sigap_pelatihan_laporan (
  kegiatan_id bigint not null references sigap_kegiatan(id),
  kelas smallint not null check (kelas between 1 and 4),
  jenis text not null check (jenis in ('pelatihan', 'instruktur')),
  ringkasan text,
  kendala text,
  catatan text,
  diubah_at timestamptz not null default now(),
  diubah_oleh text,
  primary key (kegiatan_id, kelas, jenis)
);
alter table sigap_pelatihan_laporan enable row level security;
