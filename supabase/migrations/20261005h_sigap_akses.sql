-- (5 Okt 2026) SIGAP: Kelola Peran & Akses -- permintaan user: admin bisa mengatur peran akun lain dan
-- menentukan setiap portal/menu boleh diakses siapa. Peran & izin TIDAK di-hardcode di kode.
--   sigap_menu        : daftar portal & menu (modul baru menambah barisnya sendiri)
--   sigap_peran       : peran (admin anggaran, PJ kegiatan, bendahara, + peran baru buatan admin)
--   sigap_peran_izin  : izin per peran per menu: 'lihat' | 'kelola' (kelola sudah termasuk lihat)
--   sigap_akun_peran  : akun <-> peran, dgn lingkup kegiatan (null = semua kegiatan)
--   sigap_audit       : riwayat aksi admin (siapa, apa, kapan)
-- Menu petugas "Transport Lokal" tidak diatur di sini: aksesnya otomatis dari sigap_penugasan.
set statement_timeout = '60s';
set lock_timeout = '10s';

create table if not exists sigap_menu (
  kode text primary key,
  portal text not null,
  nama text not null,
  keterangan text,
  urutan integer not null default 0,
  aktif boolean not null default true
);

create table if not exists sigap_peran (
  id bigserial primary key,
  kode text not null unique,
  nama text not null,
  keterangan text,
  butuh_lingkup boolean not null default false,
  sistem boolean not null default false,       -- peran bawaan (tidak bisa dihapus)
  dibuat_at timestamptz not null default now()
);

create table if not exists sigap_peran_izin (
  peran_id bigint not null references sigap_peran(id),
  menu_kode text not null references sigap_menu(kode),
  level text not null check (level in ('lihat','kelola')),
  primary key (peran_id, menu_kode)
);

create table if not exists sigap_akun_peran (
  id bigserial primary key,
  akun_id bigint not null references sigap_akun(id),
  peran_id bigint not null references sigap_peran(id),
  kegiatan_id bigint references sigap_kegiatan(id),   -- null = semua kegiatan
  diberi_oleh text,
  dibuat_at timestamptz not null default now()
);
create unique index if not exists sigap_akun_peran_uq on sigap_akun_peran (akun_id, peran_id, coalesce(kegiatan_id, 0));

create table if not exists sigap_audit (
  id bigserial primary key,
  akun_id bigint references sigap_akun(id),
  aksi text not null,
  detail jsonb,
  waktu timestamptz not null default now()
);
create index if not exists sigap_audit_waktu_idx on sigap_audit (waktu desc);

alter table sigap_menu enable row level security;
alter table sigap_peran enable row level security;
alter table sigap_peran_izin enable row level security;
alter table sigap_akun_peran enable row level security;
alter table sigap_audit enable row level security;

-- Kunci SPJ: catat siapa membuka kunci (riwayat juga di sigap_audit).
alter table sigap_penugasan add column if not exists dibuka_at timestamptz;
alter table sigap_penugasan add column if not exists dibuka_oleh text;

-- Daftar menu awal
insert into sigap_menu (kode, portal, nama, keterangan, urutan) values
  ('translok.monitoring',   'Admin Transport Lokal', 'Monitoring',               'Matriks harian & ringkasan kegiatan', 10),
  ('translok.izin_susulan', 'Admin Transport Lokal', 'Izin susulan',             'Membuka upload untuk tanggal terlewat', 20),
  ('translok.penugasan',    'Admin Transport Lokal', 'Penugasan & Surat Tugas',  'Petugas, peran, ST, unggah PDF ST', 30),
  ('translok.kegiatan',     'Admin Transport Lokal', 'Kegiatan, peran & tarif',  'Data kegiatan, periode, tarif, maks hari', 40),
  ('translok.verifikasi',   'Admin Transport Lokal', 'Verifikasi & Kunci',       'Pratinjau & kunci SPJ per petugas', 50),
  ('translok.buka_kunci',   'Admin Transport Lokal', 'Buka kunci SPJ',           'Membuka kembali SPJ yang sudah dikunci', 60),
  ('akses.kelola',          'Kelola Peran & Akses',  'Atur peran, izin & akun',  'Peran baru, izin per menu, akun & lingkup', 100)
on conflict (kode) do nothing;

insert into sigap_peran (kode, nama, keterangan, butuh_lingkup, sistem) values
  ('admin_anggaran', 'Admin Anggaran', 'Mengelola semua kegiatan & akses', false, true),
  ('pj_kegiatan',    'PJ Kegiatan',    'Mengelola kegiatan yang ditunjuk', true,  true),
  ('bendahara',      'Bendahara',      'Memeriksa SPJ sebelum pembayaran', false, true)
on conflict (kode) do nothing;

-- Izin awal (bisa diubah admin dari portal Kelola Peran & Akses)
insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, m.kode, 'kelola' from sigap_peran p cross join sigap_menu m where p.kode = 'admin_anggaran'
on conflict do nothing;
insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, x.menu, x.level from sigap_peran p
join (values ('translok.monitoring','lihat'), ('translok.penugasan','kelola'), ('translok.kegiatan','lihat'), ('translok.verifikasi','kelola')) as x(menu, level) on true
where p.kode = 'pj_kegiatan'
on conflict do nothing;
insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, x.menu, 'lihat' from sigap_peran p
join (values ('translok.monitoring'), ('translok.penugasan'), ('translok.kegiatan'), ('translok.verifikasi')) as x(menu) on true
where p.kode = 'bendahara'
on conflict do nothing;

-- Admin anggaran pertama: M. Iqbal Hadi (akun 354), pegawai organik.
update sigap_akun set jenis = 'organik' where id = 354;
insert into sigap_akun_peran (akun_id, peran_id, kegiatan_id, diberi_oleh)
select 354, id, null, 'migrasi awal' from sigap_peran where kode = 'admin_anggaran'
on conflict do nothing;
