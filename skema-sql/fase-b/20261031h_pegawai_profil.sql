-- 20261031h_pegawai_profil.sql  (31 Okt 2026)
-- Profil kepegawaian pegawai organik BPS Kab. Solok untuk tab Pengguna > Pegawai organik (daftar dari user, 28 pegawai).
-- Kunci = NIP lama; akun_id menghubungkan ke sigap_akun (null = pegawai belum punya akun SIGAP).
-- Usia dan masa kerja TIDAK disimpan: dihitung dari tanggal_lahir dan tmt saat ditampilkan.
-- Aman dijalankan ulang (on conflict do update). Jalankan setelah 20261031e/f/g (urutan tidak bergantung).

create table if not exists sigap_pegawai_profil (
  nip_lama           text primary key,
  urutan             int  not null default 0,
  akun_id            bigint references sigap_akun(id) on delete set null,
  nama_lengkap       text not null,
  nip_baru           text,
  jabatan            text,
  status_pegawai     text check (status_pegawai in ('PNS','PPPK')),
  jenis_kelamin      text check (jenis_kelamin in ('L','P')),
  tanggal_lahir      date,
  tmt                date,
  tmt_teks           text,
  email              text,
  domisili_kecamatan text,
  domisili_nagari    text,
  kantor_kecamatan   text,
  diubah_at          timestamptz not null default now()
);
create index if not exists sigap_pegawai_profil_akun_idx on sigap_pegawai_profil (akun_id);
alter table sigap_pegawai_profil enable row level security;

-- 1) Isi profil.
--    domisili_nagari hanya terisi untuk 5 pegawai yang titik domisilinya tampak sah (perkiraan dari koordinat,
--    sub-SLS terdekat; Bapak periksa). kantor_kecamatan = 'Gunung Talang' (titik "domisili" banyak organik
--    mengumpul di kantor, sub-SLS terdekat Batang Barus, Gunung Talang) -- ganti bila salah.
insert into sigap_pegawai_profil
  (urutan, nip_lama, akun_id, nama_lengkap, nip_baru, jabatan, status_pegawai, jenis_kelamin, tanggal_lahir, tmt, tmt_teks, email, domisili_kecamatan, domisili_nagari, kantor_kecamatan)
values
  (1, '340017299', 787, 'Bambang Suryanggono SST., M.Ec.Dev', '198209282004121001', 'Kepala BPS Kabupaten', 'PNS', 'L', '1982-09-28', '2004-12-01', 'Des 2004', 'b.surya@bps.go.id', null, null, 'Gunung Talang'),
  (2, '340054620', 710, 'Wisnu Dwi Jayanto S.Si', '198512312011011022', 'Kepala Subbagian Umum', 'PNS', 'L', '1985-12-31', '2011-01-01', 'Jan 2011', 'wisnu.jayanto@bps.go.id', null, null, 'Gunung Talang'),
  (3, '340064676', 266, 'Hariston', '197901182025211026', 'Subbagian Umum', 'PPPK', 'L', '1979-01-18', '2025-01-01', '2025 (PPPK)', 'hariston-pppk@bps.go.id', null, null, 'Gunung Talang'),
  (4, '340064237', 67, 'Ardial Jaraf', '198703152025211054', 'Subbagian Umum', 'PPPK', 'L', '1987-03-15', '2025-01-01', '2025 (PPPK)', 'ardialjaraf-pppk@bps.go.id', 'Kubung', 'Koto Baru', 'Gunung Talang'),
  (5, '340064807', 281, 'Ilham', '199512212025211031', 'Subbagian Umum', 'PPPK', 'L', '1995-12-21', '2025-01-01', '2025 (PPPK)', 'ilham-pppk@bps.go.id', null, null, 'Gunung Talang'),
  (6, '340018427', null, 'Novriady S.Ak', '198011132006041003', 'Subbagian Umum', 'PNS', 'L', '1980-11-13', '2006-04-01', 'Apr 2006', 'novriady@bps.go.id', null, null, 'Gunung Talang'),
  (7, '340054611', 478, 'Oryza Maria Ulva A.Md', '198803202011012013', 'Subbagian Umum', 'PNS', 'P', '1988-03-20', '2011-01-01', 'Jan 2011', 'oryza.ulva@bps.go.id', null, null, 'Gunung Talang'),
  (8, '340019359', 23, 'Alex Kandria', '198406062007011004', 'Subbagian Umum', 'PNS', 'L', '1984-06-06', '2007-01-01', 'Jan 2007', 'kandria@bps.go.id', null, null, 'Gunung Talang'),
  (9, '340019020', 410, 'Muzahar', '197305132006041017', 'Pegawai', 'PNS', 'L', '1973-05-13', '2006-04-01', 'Apr 2006', 'muzahar@bps.go.id', null, null, 'Gunung Talang'),
  (10, '340014968', 148, 'Deswaty SST', '197412251994032001', 'Pegawai', 'PNS', 'P', '1974-12-25', '1994-03-01', 'Mar 1994', 'deswaty@bps.go.id', null, null, 'Gunung Talang'),
  (11, '340016310', 322, 'Kafsal SE', '197602192001121002', 'Pegawai', 'PNS', 'L', '1976-02-19', '2001-12-01', 'Des 2001', 'kafsal@bps.go.id', null, null, 'Gunung Talang'),
  (12, '340019357', 6, 'Adriyanto', '197602252007011001', 'Pegawai', 'PNS', 'L', '1976-02-25', '2007-01-01', 'Jan 2007', 'adrianto@bps.go.id', 'Kubung', 'Saok Laweh', 'Gunung Talang'),
  (13, '340017131', 550, 'Riko Putra Roma', '198308082003121003', 'Pegawai', 'PNS', 'L', '1983-08-08', '2003-12-01', 'Des 2003', 'rikoputra@bps.go.id', 'Kubung', 'Selayo', 'Gunung Talang'),
  (14, '340054622', null, 'Yudi Firdian S.M.', '198512132011011006', 'Pegawai', 'PNS', 'L', '1985-12-13', '2011-01-01', 'Jan 2011', 'yfirdian@bps.go.id', null, null, 'Gunung Talang'),
  (15, '340017476', 346, 'Lucia Veronica', '198606102005022001', 'Pegawai', 'PNS', 'P', '1986-06-10', '2005-02-01', 'Feb 2005', 'lucia@bps.go.id', 'Kubung', 'Saok Laweh', 'Gunung Talang'),
  (16, '340061509', 563, 'Riva Hestaria A.Md', '198811282022032005', 'Pegawai', 'PNS', 'P', '1988-11-28', '2022-03-01', 'Mar 2022', 'riva.hestaria@bps.go.id', null, null, 'Gunung Talang'),
  (17, '340057628', 671, 'Uci Yumanda Rizki SST', '199303032016022002', 'Pegawai', 'PNS', 'P', '1993-03-03', '2016-02-01', 'Feb 2016', 'uci.yumanda@bps.go.id', null, null, 'Gunung Talang'),
  (18, '340057272', null, 'Akbari Wafridh SST., M.Kom.', '199310152016021001', 'Pegawai', 'PNS', 'L', '1993-10-15', '2016-02-01', 'Feb 2016', 'akbariwafridh@bps.go.id', null, null, 'Gunung Talang'),
  (19, '340058005', 354, 'M. Iqbal Hadi SST', '199410062017011001', 'Pegawai', 'PNS', 'L', '1994-10-06', '2017-01-01', 'Jan 2017', 'iqbal.hadi@bps.go.id', null, null, 'Gunung Talang'),
  (20, '340059123', 357, 'Mailani Putri S.Stat.', '199605062019032001', 'Pegawai', 'PNS', 'P', '1996-05-06', '2019-03-01', 'Mar 2019', 'mailani.putri@bps.go.id', null, null, 'Gunung Talang'),
  (21, '340059116', null, 'Anggun Permata Munef S.Stat.', '199610242019032002', 'Pegawai', 'PNS', 'P', '1996-10-24', '2019-03-01', 'Mar 2019', 'anggun.munef@bps.go.id', null, null, 'Gunung Talang'),
  (22, '340062096', 712, 'Witria Dasni S.Tr.Stat.', '199807162023022001', 'Pegawai', 'PNS', 'P', '1998-07-16', '2023-02-01', 'Feb 2023', 'witria.dasni@bps.go.id', null, null, 'Gunung Talang'),
  (23, '340061776', 200, 'Faisal Siddiq S.Tr.Stat.', '199908222023021001', 'Pegawai', 'PNS', 'L', '1999-08-22', '2023-02-01', 'Feb 2023', 'faisal.siddiq@bps.go.id', null, null, 'Gunung Talang'),
  (24, '340062356', 73, 'Arini Alva Syaadah S.Tr.Stat.', '200010302023102001', 'Pegawai', 'PNS', 'P', '2000-10-30', '2023-10-01', 'Okt 2023', 'arini.alva@bps.go.id', 'Gunung Talang', 'Koto Gaek Guguk', 'Gunung Talang'),
  (25, '340060830', 464, 'Nurafiza Thamrin S.Tr.Stat.', '200011082022012001', 'Pegawai', 'PNS', 'P', '2000-11-08', '2022-01-01', 'Jan 2022', 'nurafiza.thamrin@bps.go.id', null, null, 'Gunung Talang'),
  (26, '340062406', 160, 'Dina Marizka S.Tr.Stat.', '200103192023102002', 'Pegawai', 'PNS', 'P', '2001-03-19', '2023-10-01', 'Okt 2023', 'dina.marizka@bps.go.id', null, null, 'Gunung Talang'),
  (27, '340013513', 4, 'Adrianus', '197103081993011001', 'Pegawai', 'PNS', 'L', '1971-03-08', '1993-01-01', 'Jan 1993', 'adrianus@bps.go.id', null, null, 'Gunung Talang'),
  (28, '340056500', null, 'Elvini Adrita A.Md', '198905252014032002', 'Pegawai', 'PNS', 'P', '1989-05-25', '2014-03-01', 'Mar 2014', 'elvini.adrita@bps.go.id', null, null, 'Gunung Talang')
on conflict (nip_lama) do update set
  urutan = excluded.urutan, akun_id = excluded.akun_id, nama_lengkap = excluded.nama_lengkap, nip_baru = excluded.nip_baru,
  jabatan = excluded.jabatan, status_pegawai = excluded.status_pegawai, jenis_kelamin = excluded.jenis_kelamin,
  tanggal_lahir = excluded.tanggal_lahir, tmt = excluded.tmt, tmt_teks = excluded.tmt_teks, email = excluded.email,
  diubah_at = now();
-- (domisili_* dan kantor_kecamatan sengaja tidak ditimpa saat dijalankan ulang, agar isian manual tidak hilang.)

-- 2) Lengkapi NIP (lama) akun yang masih kosong dari daftar ini. Akun yang NIP-nya sudah ada tidak diubah.
update sigap_akun a set nip = p.nip_lama
from sigap_pegawai_profil p
where p.akun_id = a.id and (a.nip is null or btrim(a.nip) = '');
