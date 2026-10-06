-- (7 Okt 2026) PORTAL SATU LOGIN -- permintaan user: "buat portal login hanya 1 saja di depan, kemudian user bisa
-- menggunakan/akses kartu/menu sesuai periodenya". Keputusan user:
--  - Semua aplikasi langsung 1 login (DTSEN, Bencana, Penyisiran, Seruti ikut).
--  - Translok petugas setelah kegiatan selesai -> arsip baca-saja.
--  - Ditutup pada "tgl selesai kegiatan + 7" (masa tenggang), dapat diedit admin anggaran.
--  - Di atas admin anggaran ada Admin Aplikasi (saat ini M. Iqbal Hadi, bisa ditambah/dikelola),
--    lalu admin per aplikasi: admin delego, admin dtsen, dll.
--  - Tetap boleh mengubah kegiatan yg sudah ditutup: Admin Anggaran, PJ Kegiatan, Bendahara, Admin Aplikasi.
--
-- Aman dijalankan ulang (idempoten, tanpa DROP). Tabel baru memakai prefix portal_.

-- ---------------------------------------------------------------- 1. periode kegiatan
alter table sigap_kegiatan add column if not exists hari_tenggang integer not null default 7;
alter table sigap_kegiatan add column if not exists dibuka_sampai date;      -- "Buka ulang": aktif lagi s.d. tanggal ini
alter table sigap_kegiatan add column if not exists periode_diubah_oleh text;
alter table sigap_kegiatan add column if not exists periode_diubah_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sigap_kegiatan_hari_tenggang_check') then
    alter table sigap_kegiatan add constraint sigap_kegiatan_hari_tenggang_check check (hari_tenggang between 0 and 365);
  end if;
end $$;

-- ---------------------------------------------------------------- 2. menu admin per aplikasi
insert into sigap_menu (kode, portal, nama, keterangan, urutan, aktif) values
  ('portal.kelola',     'Admin Aplikasi',        'Kelola aplikasi, admin & periode', 'Tingkat tertinggi: menunjuk admin per aplikasi, mengatur periode', 1, true),
  ('delego.admin',      'Delego',                'Admin Delego',            'Mengelola aplikasi Delego',                      400, true),
  ('dtsen.admin',       'Usulan DTSEN',          'Admin DTSEN',             'Pemeriksaan usulan & akun operator Wali Nagari', 410, true),
  ('bencana.admin',     'Pendataan Pascabencana','Admin Bencana',           'Plotting, undangan & monitoring petugas',        420, true),
  ('penyisiran.admin',  'Penyisiran SE2026',     'Admin Penyisiran',        'Master petugas, target & monitoring',            430, true),
  ('seruti.admin',      'Seruti',                'Admin Seruti',            'Progres & kualitas data Seruti',                 440, true)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------- 3. peran admin
insert into sigap_peran (kode, nama, keterangan, butuh_lingkup, sistem) values
  ('admin_aplikasi',   'Admin Aplikasi',   'Tingkat tertinggi. Mengelola semua aplikasi, admin per aplikasi & periode. Minimal 1 orang.', false, true),
  ('admin_delego',     'Admin Delego',     'Admin aplikasi Delego / pengadaan', false, true),
  ('admin_dtsen',      'Admin DTSEN',      'Admin Usulan DTSEN',                false, true),
  ('admin_bencana',    'Admin Bencana',    'Admin Pendataan Pascabencana',      false, true),
  ('admin_penyisiran', 'Admin Penyisiran', 'Admin Penyisiran SE2026',           false, true),
  ('admin_seruti',     'Admin Seruti',     'Admin Seruti',                      false, true)
on conflict (kode) do nothing;

-- Admin Aplikasi: kelola SEMUA menu (termasuk menu yg ditambah nanti -> jalankan ulang baris ini).
insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, m.kode, 'kelola' from sigap_peran p cross join sigap_menu m where p.kode = 'admin_aplikasi'
on conflict (peran_id, menu_kode) do update set level = 'kelola';

insert into sigap_peran_izin (peran_id, menu_kode, level)
select p.id, x.menu, 'kelola' from sigap_peran p join (values
  ('admin_delego','delego.admin'), ('admin_delego','kontrak.kelola'),
  ('admin_dtsen','dtsen.admin'), ('admin_bencana','bencana.admin'),
  ('admin_penyisiran','penyisiran.admin'), ('admin_seruti','seruti.admin')
) x(peran, menu) on x.peran = p.kode
on conflict (peran_id, menu_kode) do nothing;

-- ---------------------------------------------------------------- 4. daftar aplikasi portal
create table if not exists portal_aplikasi (
  kode        text primary key,
  nama        text not null,
  uraian      text,
  href        text,                 -- null = belum ada tautan (mis. aplikasi eksternal)
  peran_admin text not null references sigap_peran(kode),
  menu_admin  text references sigap_menu(kode),
  urutan      integer not null default 0,
  aktif       boolean not null default true,
  dibuat_at   timestamptz not null default now()
);
alter table portal_aplikasi enable row level security;  -- hanya diakses server (service role)

insert into portal_aplikasi (kode, nama, uraian, href, peran_admin, menu_admin, urutan) values
  ('translok',   'Transport Lokal & Anggaran', 'Kegiatan, penugasan, verifikasi SPJ transport lokal', '/sigap/admin',   'admin_anggaran',   'translok.kegiatan', 10),
  ('kontrak',    'Pengadaan & Kontrak',        'Paket pengadaan & dokumen kontrak',                   '/sigap/kontrak', 'admin_delego',     'kontrak.kelola',    20),
  ('delego',     'Delego',                     'Sistem kerja berbasis delegasi',                      null,             'admin_delego',     'delego.admin',      30),
  ('dtsen',      'Usulan DTSEN',               'Usulan update data DTSEN oleh operator Wali Nagari',  '/dashboard',     'admin_dtsen',      'dtsen.admin',       40),
  ('bencana',    'Pendataan Pascabencana',     'Plotting, konfirmasi & monitoring petugas',           '/bencana',       'admin_bencana',    'bencana.admin',     50),
  ('penyisiran', 'Penyisiran & Identifikasi',  'Penyisiran undercoverage usaha SE2026',               '/penyisiran',    'admin_penyisiran', 'penyisiran.admin',  60),
  ('seruti',     'Seruti',                     'Progres lapangan & kualitas data Seruti',             '/seruti',        'admin_seruti',     'seruti.admin',      70),
  ('pedia',      'SIGAP PEDIA',                'Ensiklopedia & arsip bukti',                          '/sigap/pedia',   'admin_anggaran',   'pedia.kelola',      80)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------- 5. Admin Aplikasi awal: M. Iqbal Hadi (akun 354)
insert into sigap_akun_peran (akun_id, peran_id, kegiatan_id, diberi_oleh)
select 354, p.id, null, 'migrasi 20261007c'
from sigap_peran p
where p.kode = 'admin_aplikasi'
  and exists (select 1 from sigap_akun where id = 354)
  and not exists (select 1 from sigap_akun_peran ap where ap.akun_id = 354 and ap.peran_id = p.id);

-- ---------------------------------------------------------------- 6. penjaga: Admin Aplikasi minimal 1 orang
create or replace function public.portal_jaga_admin_aplikasi() returns trigger
language plpgsql as $$
declare pid bigint; sisa integer;
begin
  select id into pid from sigap_peran where kode = 'admin_aplikasi';
  if old.peran_id = pid and (tg_op = 'DELETE' or new.peran_id is distinct from old.peran_id or new.akun_id is distinct from old.akun_id) then
    select count(*) into sisa from sigap_akun_peran where peran_id = pid and id <> old.id;
    if sisa = 0 then raise exception 'Admin Aplikasi minimal harus 1 orang.'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
-- (dibuat tanpa DROP; bila sudah ada, CREATE TRIGGER akan gagal -> abaikan)
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'portal_jaga_admin_aplikasi_ud') then
    create trigger portal_jaga_admin_aplikasi_ud before update or delete on sigap_akun_peran
      for each row execute function public.portal_jaga_admin_aplikasi();
  end if;
end $$;

-- Cek:
--   select kode, nama from sigap_peran order by id;
--   select * from portal_aplikasi order by urutan;
--   select a.nama, p.kode from sigap_akun_peran ap join sigap_akun a on a.id=ap.akun_id join sigap_peran p on p.id=ap.peran_id;
