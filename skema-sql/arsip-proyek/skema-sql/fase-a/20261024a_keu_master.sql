-- =====================================================================
-- 20261024a_keu_master.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE A1: master, struktur level,
-- peran/penugasan, hak akses, jejak.
-- Dibuat 24 Okt 2026. Mandiri: tidak bergantung pada tabel tkl_* / keu_*
-- lain. Bergantung pada: sigap_akun, sigap_audit.
-- Aman dijalankan ulang (if not exists / on conflict do nothing).
-- Tidak ada DELETE/DROP. RLS aktif di semua tabel (tanpa policy = hanya server).
-- Konvensi: acuan-skema-portal.md bagian 3.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 0. Fungsi pembantu
-- ---------------------------------------------------------------------
-- Akun yang sedang bertindak. Aplikasi mengisinya per transaksi:
--   select set_config('app.akun_id', '<id>', true);
-- Kosong = penulisan dari SQL editor / migrasi (tidak diperiksa hak).
create or replace function keu_akun_sesi() returns bigint
language sql stable as $$
  select nullif(current_setting('app.akun_id', true), '')::bigint
$$;

create or replace function keu_sentuh() returns trigger
language plpgsql as $$
begin
  new.diubah_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Master peran dan kewenangan
-- ---------------------------------------------------------------------
create table if not exists keu_master_peran (
  kode      text primary key check (kode ~ '^[A-Z]+$'),
  nama      text not null,
  ket       text not null default '',
  lingkup   text not null check (lingkup in ('global','ro')),
  urut      int  not null default 0,
  aktif     boolean not null default true,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now()
);
comment on column keu_master_peran.lingkup is
  'global = berlaku seluruh satker; ro = harus ditugaskan per RO (ketua tim, admin RO, PBJ).';

create table if not exists keu_master_kewenangan (
  kode        text primary key check (kode ~ '^[a-z_]+$'),
  nama        text not null,
  ket         text not null default '',
  pemberi_kode text references keu_master_kewenangan(kode),
  urut        int  not null default 0,
  aktif       boolean not null default true,
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now()
);
comment on column keu_master_kewenangan.pemberi_kode is
  'Kewenangan yang diperlukan untuk MEMBERIKAN kewenangan ini kepada akun lain (null = kewenangan akses, yaitu Admin Aplikasi).';

create table if not exists keu_master_kewenangan_peran (
  kewenangan_kode text not null references keu_master_kewenangan(kode),
  peran_kode      text not null references keu_master_peran(kode),
  perlu_pemberian boolean not null default false,
  ket             text not null default '',
  primary key (kewenangan_kode, peran_kode)
);
comment on column keu_master_kewenangan_peran.perlu_pemberian is
  'true = peran ini baru berwenang bila PPK/Admin memberi (keu_pemberian), mis. Tata Usaha untuk verifikasi.';

-- ---------------------------------------------------------------------
-- 2. Master akun, kelompok, pola dokumen
-- ---------------------------------------------------------------------
create table if not exists keu_master_kelompok (
  kode text primary key,
  nama text not null,
  urut int not null default 0
);

-- 51xxxx -> 51 ; 53xxxx -> 53 ; 524xxx -> 524 ; 52xxxx lain -> 52L
create or replace function keu_kelompok_akun(p text) returns text
language sql immutable as $$
  select case
    when p ~ '^51[0-9]{4}$'  then '51'
    when p ~ '^53[0-9]{4}$'  then '53'
    when p ~ '^524[0-9]{3}$' then '524'
    when p ~ '^52[0-9]{4}$'  then '52L'
    else null end
$$;

create table if not exists keu_master_pola_dok (
  kode text primary key check (kode ~ '^[A-Z]{3}$'),
  nama text not null,
  urut int not null default 0
);

create table if not exists keu_master_akun (
  kode          text primary key check (kode ~ '^[0-9]{6}$'),
  nama          text not null,
  kelompok_kode text generated always as (keu_kelompok_akun(kode)) stored not null
                references keu_master_kelompok(kode),
  pola_kode     text not null references keu_master_pola_dok(kode),
  aktif         boolean not null default true,
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Master satuan (+alias)
-- ---------------------------------------------------------------------
create table if not exists keu_master_satuan (
  kode  text primary key check (kode = upper(kode)),
  arti  text not null,
  pasti boolean not null default false,
  urut  int not null default 0,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now()
);
comment on column keu_master_satuan.pasti is
  'true = arti satuan sudah dipastikan kantor; false = masih dugaan (ditandai kuning di Master).';

create table if not exists keu_master_satuan_alias (
  alias       text primary key check (alias = upper(alias)),
  satuan_kode text not null references keu_master_satuan(kode)
);

create or replace function keu_satuan_baku(p text) returns text
language sql stable as $$
  select a.satuan_kode from keu_master_satuan_alias a where a.alias = upper(btrim(p))
$$;

-- ---------------------------------------------------------------------
-- 4. Prioritas, waktu, profil penarikan, skor
-- ---------------------------------------------------------------------
create table if not exists keu_master_prioritas (
  kode  text primary key check (kode ~ '^[a-z]+$'),
  nama  text not null,
  warna text not null,
  urut  int not null default 0
);

create table if not exists keu_master_waktu (
  kode          text primary key check (kode ~ '^[a-z_]+$'),
  nama          text not null,
  nilai         text not null,
  nilai_tanggal date,
  ket           text not null default '',
  urut          int not null default 0,
  diubah_at     timestamptz not null default now()
);
comment on column keu_master_waktu.nilai_tanggal is 'Diisi bila nilai berupa satu tanggal (tenggat); dipakai pengingat, tidak mengunci.';

create table if not exists keu_master_profil_penarikan (
  bulan  smallint primary key check (bulan between 1 and 12),
  persen numeric(5,2) not null check (persen >= 0 and persen <= 100)
);
comment on table keu_master_profil_penarikan is 'Bawaan rencana penarikan RAB; total 12 bulan harus 100 (lihat uji kesehatan).';

create table if not exists keu_master_skor (
  id smallint primary key default 1 check (id = 1),
  bobot_penarikan smallint not null check (bobot_penarikan between 0 and 100),
  bobot_volume    smallint not null check (bobot_volume    between 0 and 100),
  bobot_cakupan   smallint not null check (bobot_cakupan   between 0 and 100),
  bobot_disiplin  smallint not null check (bobot_disiplin  between 0 and 100),
  ambang_baik     smallint not null check (ambang_baik  between 1 and 100),
  ambang_cukup    smallint not null check (ambang_cukup between 1 and 100),
  diubah_oleh bigint references sigap_akun(id),
  diubah_at   timestamptz not null default now(),
  constraint skor_bobot_100 check (bobot_penarikan + bobot_volume + bobot_cakupan + bobot_disiplin = 100),
  constraint skor_ambang_urut check (ambang_baik > ambang_cukup)
);
comment on table keu_master_skor is 'Satu baris (id=1). Hanya PPK yang mengubah (kewenangan bobot). Nilai awal sementara, diisi Claude 24 Okt 2026.';

create table if not exists keu_master_skor_riwayat (
  id bigint generated always as identity primary key,
  bobot_penarikan smallint not null, bobot_volume smallint not null,
  bobot_cakupan smallint not null,   bobot_disiplin smallint not null,
  ambang_baik smallint not null,     ambang_cukup smallint not null,
  berlaku_dari timestamptz not null, berlaku_sampai timestamptz not null default now(),
  diubah_oleh bigint references sigap_akun(id)
);

create or replace function keu_skor_riwayat() returns trigger
language plpgsql as $$
begin
  insert into keu_master_skor_riwayat(bobot_penarikan, bobot_volume, bobot_cakupan, bobot_disiplin,
                                      ambang_baik, ambang_cukup, berlaku_dari, diubah_oleh)
  values (old.bobot_penarikan, old.bobot_volume, old.bobot_cakupan, old.bobot_disiplin,
          old.ambang_baik, old.ambang_cukup, old.diubah_at, old.diubah_oleh);
  new.diubah_at := now();
  new.diubah_oleh := coalesce(keu_akun_sesi(), new.diubah_oleh);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. Struktur level mata anggaran dan jalur penambahan
-- ---------------------------------------------------------------------
create table if not exists keu_struktur_level (
  kode        text primary key check (kode ~ '^[a-z]+$'),
  no          smallint not null unique,
  nama        text not null,
  istilah_sakti text not null,
  contoh      text not null,
  format_ket  text not null,
  format_re   text,                                  -- regex kode; null = bebas (item)
  induk_kode  text references keu_struktur_level(kode),
  pengusul    text not null check (pengusul in ('pusat','ppk','tim')),
  tampil      boolean not null default true,         -- subkomponen: false = disembunyikan, dapat diaktifkan
  diubah_at   timestamptz not null default now()
);

create table if not exists keu_master_jalur (
  id          bigint generated always as identity primary key,
  level_kode  text not null references keu_struktur_level(kode),
  sumber      text not null check (sumber in ('dalam','lintas','tambahan')),
  khusus      boolean not null default false,
  jalur_kode  text not null check (jalur_kode in ('pok','djpb','dja')),
  nama        text not null,
  pemutus     text not null,
  dasar       text not null,
  kepastian   text not null check (kepastian in ('catatan','dugaan')),
  tenggat_kode text references keu_master_waktu(kode),
  syarat      text[] not null default '{}',
  unique (level_kode, sumber, khusus)
);
comment on column keu_master_jalur.kepastian is 'catatan = ada rujukan pasal/lampiran; dugaan = belum dikonfirmasi Kanwil.';

-- ---------------------------------------------------------------------
-- 6. Registri RO (identitas stabil lintas versi POK)
-- ---------------------------------------------------------------------
create table if not exists keu_ro (
  kode   text primary key
         check (kode ~ '^[0-9]{4}\.[A-Z]{3}\.[A-Z0-9]{3}$' or kode ~ '^T-[0-9]{3}$'),
  nama   text not null,
  sementara boolean generated always as (kode like 'T-%') stored,
  aktif  boolean not null default true,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now()
);
comment on table keu_ro is 'Identitas RO: kegiatan.KRO.RO (mis. 2906.BMA.005) atau kode sementara T-nnn sebelum POK resmi terbit.';

-- ---------------------------------------------------------------------
-- 7. Penugasan, akses Administrasi, pemberian kewenangan
-- ---------------------------------------------------------------------
create table if not exists keu_penugasan (
  id        bigint generated always as identity primary key,
  akun_id   bigint not null references sigap_akun(id),
  peran_kode text not null references keu_master_peran(kode),
  ro_kode   text references keu_ro(kode),
  berlaku_mulai  date not null,
  berlaku_sampai date,
  masa      daterange generated always as (daterange(berlaku_mulai, berlaku_sampai, '[]')) stored,
  ket       text not null default '',
  dibuat_oleh bigint references sigap_akun(id),
  dibuat_at timestamptz not null default now(),
  dibatalkan_at timestamptz,
  constraint penugasan_masa_sah check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  -- satu ketua tim aktif per RO pada satu waktu
  constraint penugasan_ketua_tunggal exclude using gist
    (ro_kode with =, masa with &&) where (peran_kode = 'KETUA' and dibatalkan_at is null),
  -- satu PPK dan satu KPA pada satu waktu
  constraint penugasan_pejabat_tunggal exclude using gist
    (peran_kode with =, masa with &&) where (peran_kode in ('PPK','KPA') and dibatalkan_at is null),
  -- orang yang sama tidak diberi peran+RO sama dua kali pada masa yang tumpang tindih
  constraint penugasan_tidak_ganda exclude using gist
    (akun_id with =, peran_kode with =, (coalesce(ro_kode,'')) with =, masa with &&) where (dibatalkan_at is null)
);
create index if not exists keu_penugasan_akun_idx on keu_penugasan(akun_id) where dibatalkan_at is null;
create index if not exists keu_penugasan_ro_idx   on keu_penugasan(ro_kode) where dibatalkan_at is null;

create table if not exists keu_akses_adm (
  id        bigint generated always as identity primary key,
  akun_id   bigint not null references sigap_akun(id),
  ro_kode   text references keu_ro(kode),          -- null = semua RO
  berlaku_mulai  date not null,
  berlaku_sampai date,
  masa      daterange generated always as (daterange(berlaku_mulai, berlaku_sampai, '[]')) stored,
  ket       text not null default '',
  dibuat_oleh bigint references sigap_akun(id),
  dibuat_at timestamptz not null default now(),
  dibatalkan_at timestamptz,
  constraint akses_adm_masa_sah check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  constraint akses_adm_tidak_ganda exclude using gist
    (akun_id with =, (coalesce(ro_kode,'')) with =, masa with &&) where (dibatalkan_at is null)
);
comment on table keu_akses_adm is 'Siapa boleh membuka tab Administrasi (dokumen pertanggungjawaban) untuk RO tertentu atau semua RO.';

create table if not exists keu_pemberian (
  id        bigint generated always as identity primary key,
  akun_id   bigint not null references sigap_akun(id),
  kewenangan_kode text not null references keu_master_kewenangan(kode),
  ro_kode   text references keu_ro(kode),          -- null = semua RO
  berlaku_mulai  date not null,
  berlaku_sampai date,
  masa      daterange generated always as (daterange(berlaku_mulai, berlaku_sampai, '[]')) stored,
  ket       text not null default '',
  diberi_oleh bigint references sigap_akun(id),
  dibuat_at timestamptz not null default now(),
  dibatalkan_at timestamptz,
  constraint pemberian_masa_sah check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  constraint pemberian_tidak_ganda exclude using gist
    (akun_id with =, kewenangan_kode with =, (coalesce(ro_kode,'')) with =, masa with &&) where (dibatalkan_at is null)
);
comment on table keu_pemberian is 'Kewenangan yang diberikan khusus kepada akun (mis. PPK memberi Tata Usaha hak verifikasi), bermasa berlaku.';

-- ---------------------------------------------------------------------
-- 8. Pemeriksaan hak
-- ---------------------------------------------------------------------
-- keu_boleh(akun, kewenangan, ro, tanggal): apakah akun berwenang pada tanggal itu.
--  * peran lingkup global: cukup ada penugasan aktif.
--  * peran lingkup ro   : penugasan harus untuk RO yang sama (p_ro null = tidak boleh).
--  * perlu_pemberian    : baru berlaku bila ada keu_pemberian yang cocok.
--  * keu_pemberian sendiri juga memberi kewenangan (akun lain dapat diberi).
create or replace function keu_boleh(p_akun bigint, p_kew text, p_ro text default null,
                                     p_tgl date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sigap_akun a where a.id = p_akun and a.aktif)
     and exists (select 1 from keu_master_kewenangan k where k.kode = p_kew and k.aktif)
     and (
       exists (
         select 1
         from keu_penugasan t
         join keu_master_peran pr on pr.kode = t.peran_kode and pr.aktif
         join keu_master_kewenangan_peran kp on kp.peran_kode = t.peran_kode and kp.kewenangan_kode = p_kew
         where t.akun_id = p_akun and t.dibatalkan_at is null and t.masa @> p_tgl
           and (pr.lingkup = 'global' or (p_ro is not null and t.ro_kode = p_ro))
           and (not kp.perlu_pemberian or exists (
                 select 1 from keu_pemberian g
                 where g.akun_id = p_akun and g.kewenangan_kode = p_kew and g.dibatalkan_at is null
                   and g.masa @> p_tgl and (g.ro_kode is null or g.ro_kode = p_ro)))
       )
       or exists (
         select 1 from keu_pemberian g
         where g.akun_id = p_akun and g.kewenangan_kode = p_kew and g.dibatalkan_at is null
           and g.masa @> p_tgl and (g.ro_kode is null or g.ro_kode = p_ro)
       )
     )
$$;
revoke execute on function keu_boleh(bigint, text, text, date) from public, anon, authenticated;

-- daftar peran aktif seorang akun (untuk menu)
create or replace function keu_peran_akun(p_akun bigint, p_tgl date default current_date)
returns table (peran_kode text, ro_kode text) language sql stable security definer set search_path = public as $$
  select t.peran_kode, t.ro_kode
  from keu_penugasan t
  join keu_master_peran pr on pr.kode = t.peran_kode and pr.aktif
  where t.akun_id = p_akun and t.dibatalkan_at is null and t.masa @> p_tgl
$$;
revoke execute on function keu_peran_akun(bigint, date) from public, anon, authenticated;

-- jalur penambahan mata anggaran
create or replace function keu_jalur(p_level text, p_sumber text, p_khusus boolean default false)
returns keu_master_jalur language sql stable as $$
  select j.* from keu_master_jalur j
  where j.sumber = case when p_sumber = 'tambahan' then 'tambahan' else p_sumber end
    and j.level_kode = p_level and j.khusus = (p_khusus and p_level = 'komponen' and p_sumber <> 'tambahan')
$$;
-- ---------------------------------------------------------------------
-- Data awal (dihasilkan dari model mockup 24 Okt 2026). on conflict do nothing:
-- aman diulang dan tidak menimpa perubahan yang sudah dibuat di Master.
-- ---------------------------------------------------------------------
insert into keu_master_peran(kode,nama,ket,lingkup,urut) values
('ADMIN','Admin Aplikasi','Mengatur peran dan akses. Tidak menyetujui anggaran.','global',1),
('KPA','Kepala (KPA)','Menerima laporan revisi, realisasi, dan skor. Tidak menyetujui; sah atau tidaknya revisi cukup di PPK (ketentuan kantor, 24 Okt 2026).','global',2),
('PPK','PPK','Melihat semua RO, menyetujui, membuka jadwal, menyatakan revisi sah (sendiri), mengunggah POK resmi, memberi kewenangan verifikasi. Tidak membuat RAB kecuali merangkap ketua tim; bila merangkap, RAB-nya langsung sah.','global',3),
('KETUA','Ketua Tim Kegiatan','Satu-satunya pembuat RAB untuk RO tim sendiri; menyetujui usulan admin RO.','ro',4),
('ADMINRO','Admin RO','Membantu ketua tim mengelola SIGAP pada RO yang ditunjuk, termasuk revisi; usulan butuh persetujuan ketua tim.','ro',5),
('BEND','Bendahara','Mengunggah Excel realisasi tiap minggu; melihat semua RO tanpa mengubah RAB.','global',6),
('PBJ','Pengelola PBJ','Menyiapkan dokumen pengadaan pada tab Administrasi RO yang dibuka untuknya.','ro',7),
('TU','Tata Usaha','Membantu administrasi; dapat diberi kewenangan verifikasi dokumen oleh PPK.','global',8),
('RENC','Perencanaan','Menyiapkan SK KPA dan dokumen perencanaan pada tab Administrasi.','global',9)
on conflict (kode) do nothing;
insert into keu_master_kewenangan(kode,nama,ket,pemberi_kode,urut) values
('rab','Membuat dan mengubah RAB','Satu-satunya pembuat RAB per RO.',null,1),
('draf','Menyusun draf RAB dan usulan revisi','Perlu persetujuan ketua tim.',null,2),
('setuju_ketua','Menyetujui draf admin RO','',null,3),
('sahkan','Mengesahkan RAB dan menyatakan revisi sah','PPK merangkap ketua tim: RAB langsung sah. KPA hanya menerima laporan.',null,4),
('jadwal','Membuka dan membuat jadwal revisi','',null,5),
('pok_pdf','Mengunggah PDF POK resmi','',null,6),
('realisasi','Mengunggah Excel realisasi mingguan','',null,7),
('verifikasi','Memverifikasi dokumen administrasi','Bendahara untuk dokumen bendahara; Tata Usaha bila diberi PPK; akun lain dapat diberi.','sahkan',8),
('kek_catat','Mencatat kekurangan RAB','',null,9),
('str_tim','Mengusulkan Komponen, Subkomponen, Akun, atau Item baru','Admin RO sebagai draf; ketua tim menyetujui; PPK mengesahkan (papan 16).',null,10),
('str_ppk','Mengusulkan KRO, RO, Kegiatan, atau Program baru','Program dan Kegiatan ditetapkan pusat; PPK hanya mencatat usulan.',null,11),
('kek_putus','Memutuskan kekurangan RAB (penuhi, tunda, tolak)','Hanya saat ada tambahan pagu resmi RO itu.',null,12),
('bobot','Mengubah bobot skor RAB','',null,13),
('skor','Melihat skor kualitas RAB','Semua pengguna, semua RO. Skor adalah pembinaan.',null,14),
('laporan','Menerima laporan revisi, realisasi, skor','Tanpa persetujuan.',null,15),
('master','Mengelola master data','Master kewenangan hanya Admin Aplikasi.',null,16),
('akses','Mengatur peran dan akses','',null,17)
on conflict (kode) do nothing;
insert into keu_master_kewenangan_peran(kewenangan_kode,peran_kode,perlu_pemberian) values
('rab','KETUA',false),
('draf','ADMINRO',false),
('setuju_ketua','KETUA',false),
('sahkan','PPK',false),
('jadwal','PPK',false),
('pok_pdf','PPK',false),
('realisasi','BEND',false),
('verifikasi','PPK',false),
('verifikasi','BEND',false),
('verifikasi','TU',true),
('kek_catat','KETUA',false),
('kek_catat','ADMINRO',false),
('str_tim','KETUA',false),
('str_tim','ADMINRO',false),
('str_tim','PPK',false),
('str_ppk','PPK',false),
('kek_putus','KETUA',false),
('bobot','PPK',false),
('skor','ADMIN',false),
('skor','KPA',false),
('skor','PPK',false),
('skor','KETUA',false),
('skor','ADMINRO',false),
('skor','BEND',false),
('skor','TU',false),
('skor','PBJ',false),
('skor','RENC',false),
('laporan','KPA',false),
('master','ADMIN',false),
('master','PPK',false),
('akses','ADMIN',false)
on conflict do nothing;
insert into keu_master_kelompok(kode,nama,urut) values
('51','Belanja pegawai (51xxxx)',1),
('53','Belanja modal (53xxxx)',2),
('524','Perjalanan dinas (524xxx)',3),
('52L','Belanja barang lain (52xxxx selain 524)',4)
on conflict (kode) do nothing;
insert into keu_master_pola_dok(kode,nama,urut) values
('PEG','Belanja pegawai',1),
('BRG','Belanja barang umum',2),
('LGN','Langganan daya dan jasa',3),
('JSA','Sewa, jasa profesi, dan jasa lainnya',4),
('PDN','Perjalanan dinas',5),
('MLH','Pemeliharaan',6),
('MDL','Belanja modal',7)
on conflict (kode) do nothing;
insert into keu_master_akun(kode,nama,pola_kode,aktif) values
('511111','Belanja Gaji Pokok PNS','PEG',true),
('511119','Belanja Pembulatan Gaji PNS','PEG',true),
('511121','Belanja Tunj. Suami/Istri PNS','PEG',true),
('511122','Belanja Tunj. Anak PNS','PEG',true),
('511123','Belanja Tunj. Struktural PNS','PEG',true),
('511124','Belanja Tunj. Fungsional PNS','PEG',true),
('511125','Belanja Tunj. PPh PNS','PEG',true),
('511126','Belanja Tunj. Beras PNS','PEG',true),
('511129','Belanja Uang Makan PNS','PEG',true),
('511151','Belanja Tunjangan Umum PNS','PEG',true),
('511611','Belanja Gaji Pokok PPPK','PEG',true),
('511619','Belanja Pembulatan Gaji PPPK','PEG',true),
('511621','Belanja Tunjangan Suami/Istri PPPK','PEG',true),
('511622','Belanja Tunjangan Anak PPPK','PEG',true),
('511624','Belanja Tunjangan Fungsional PPPK','PEG',true),
('511625','Belanja Tunjangan Beras PPPK','PEG',true),
('511628','Belanja Uang Makan PPPK','PEG',true),
('512211','Belanja Uang Lembur','PEG',true),
('512411','Belanja Pegawai (Tunjangan Khusus/Kegiatan/Kinerja)','PEG',true),
('512414','Belanja Pegawai Tunjangan Khusus/Kegiatan/Kinerja PPPK','PEG',true),
('521111','Belanja Keperluan Perkantoran','BRG',true),
('521115','Belanja Honor Operasional Satuan Kerja','BRG',true),
('521119','Belanja Barang Operasional Lainnya','BRG',true),
('521211','Belanja Bahan','BRG',true),
('521213','Belanja Honor Output Kegiatan','BRG',true),
('521219','Belanja Barang Non Operasional Lainnya','BRG',true),
('521252','Belanja Peralatan dan Mesin - Ekstrakomptabel','BRG',true),
('521811','Belanja Barang Persediaan Barang Konsumsi','BRG',true),
('522111','Belanja Langganan Listrik','LGN',true),
('522112','Belanja Langganan Telepon','LGN',true),
('522113','Belanja Langganan Air','LGN',true),
('522119','Belanja Langganan Daya dan Jasa Lainnya','LGN',true),
('522141','Belanja Sewa','JSA',true),
('522151','Belanja Jasa Profesi','JSA',true),
('522191','Belanja Jasa Lainnya','JSA',true),
('523111','Belanja Pemeliharaan Gedung dan Bangunan','MLH',true),
('523121','Belanja Pemeliharaan Peralatan dan Mesin','MLH',true),
('523123','Belanja Barang Persediaan Pemeliharaan Peralatan dan','MLH',true),
('524111','Belanja Perjalanan Dinas Biasa','PDN',true),
('524113','Belanja Perjalanan Dinas Dalam Kota','PDN',true),
('524114','Belanja Perjalanan Dinas Paket Meeting Dalam Kota','PDN',true),
('524119','Belanja Perjalanan Dinas Paket Meeting Luar Kota','PDN',true),
('532111','Belanja Modal Peralatan dan Mesin','MDL',true)
on conflict (kode) do nothing;
insert into keu_master_satuan(kode,arti,pasti,urut) values
('OK','Orang kegiatan',true,1),
('OB','Orang bulan',true,2),
('OP','Orang paket',true,3),
('OH','Orang hari',true,4),
('OJP','Orang jam pelajaran',true,5),
('DOK','Dokumen',true,6),
('PAKET','Paket',true,7),
('BLN','Bulan',true,8),
('THN','Tahun',true,9),
('SET','Set',true,10),
('LMBR','Lembar',true,11),
('RUTA','Rumah tangga',true,12),
('EA','Each (tiap atau per unit)',true,13),
('UNIT','Unit',true,14),
('RESP','Responden',true,15),
('M2','Meter persegi',true,16),
('SGMN','Segmen',true,17),
('U/THN','Unit per tahun',true,18),
('M2/TH','Meter persegi per tahun',true,19),
('OT','Orang tahun',true,20)
on conflict (kode) do nothing;
insert into keu_master_satuan_alias(alias,satuan_kode) values
('OK','OK'),
('O-K','OK'),
('OB','OB'),
('O-B','OB'),
('OP','OP'),
('O-P','OP'),
('OH','OH'),
('OJP','OJP'),
('OJ','OJP'),
('O-J','OJP'),
('DOK','DOK'),
('PAKET','PAKET'),
('BLN','BLN'),
('THN','THN'),
('SET','SET'),
('LMBR','LMBR'),
('LBR','LMBR'),
('RUTA','RUTA'),
('RT','RUTA'),
('EA','EA'),
('UNIT','UNIT'),
('RESP','RESP'),
('M2','M2'),
('SGMN','SGMN'),
('SEGMN','SGMN'),
('U/THN','U/THN'),
('M2/TH','M2/TH'),
('OT','OT'),
('O-TH','OT')
on conflict (alias) do nothing;
insert into keu_master_prioritas(kode,nama,warna,urut) values
('inti','Inti','merah',1),
('penting','Penting','kuning',2),
('tunda','Dapat ditunda','abu',3)
on conflict (kode) do nothing;
insert into keu_master_waktu(kode,nama,nilai,nilai_tanggal,ket,urut) values
('tahun_anggaran','Tahun anggaran','2026',null,'Dipakai semua papan; berganti tahun melalui impor POK awal tahun.',1),
('jadwal_bawaan_revisi','Jadwal bawaan Revisi POK','Buka tanggal 10 tiap bulan, tutup 2 hari kemudian',null,'PPK dapat melewati atau memulihkan tiap bulan.',2),
('tenggat_dipa_dja','Tenggat Revisi DIPA jalur DJA','30 Oktober 2026','2026-10-30'::date,'Pengingat (Pasal 175 PMK 62/2023). Tidak mengunci.',3),
('tenggat_dipa_djpb','Tenggat Revisi DIPA jalur DJPb','30 November 2026','2026-11-30'::date,'Pengingat.',4),
('tenggat_pok','Tenggat Revisi POK dan Administrasi','27 Desember 2026','2026-12-27'::date,'Pengingat.',5),
('unggah_realisasi','Unggah Excel realisasi','Mingguan, hari Senin (data sampai Minggu lalu)',null,'Bendahara; pengingat bila lewat dua hari.',6),
('profil_penarikan','Profil penarikan awal tahun','Jan 3%, Feb 5%, Mar 8%, Apr 9%, Mei 10%, Jun 11%, Jul 10%, Agu 10%, Sep 9%, Okt 9%, Nov 9%, Des 7%',null,'Bawaan rencana penarikan RAB; dapat diubah per RO.',7),
('masa_penugasan','Masa berlaku penugasan','Bertanggal mulai dan berakhir',null,'Ketua tim, admin RO, akses Administrasi.',8)
on conflict (kode) do nothing;
insert into keu_master_profil_penarikan(bulan,persen) values
(1,3),(2,5),(3,8),(4,9),(5,10),(6,11),(7,10),(8,10),(9,9),(10,9),(11,9),(12,7)
on conflict (bulan) do nothing;
insert into keu_master_skor(id,bobot_penarikan,bobot_volume,bobot_cakupan,bobot_disiplin,ambang_baik,ambang_cukup)
values (1,35,25,20,20,85,70)
on conflict (id) do nothing;
insert into keu_struktur_level(kode,no,nama,istilah_sakti,contoh,format_ket,format_re,induk_kode,pengusul,tampil) values
('program',1,'Program','Program','GG','2 huruf (mis. GG)','^[A-Z]{2}$',null,'pusat',true),
('kegiatan',2,'Kegiatan','Kegiatan','2906','4 angka (mis. 2906)','^[0-9]{4}$','program','pusat',true),
('kro',3,'KRO (Klasifikasi Rincian Output)','Output','BMA','3 huruf (mis. BMA)','^[A-Z]{3}$','kegiatan','ppk',true),
('ro',4,'RO (Rincian Output)','SubOutput','005','3 angka (mis. 005, jadi BMA.005)','^[A-Z0-9]{3}$','kro','ppk',true),
('komponen',5,'Komponen','Komponen','055','3 angka (mis. 055)','^[0-9]{3}$','ro','tim',true),
('subkomp',6,'Subkomponen','SubKomponen','B','1 sampai 2 huruf atau angka (mis. B, 0A)','^[A-Z0-9]{1,2}$','komponen','tim',false),
('akun',7,'Akun','Akun','521211','6 angka, harus ada di Master akun','^[0-9]{6}$','subkomp','tim',true),
('item',8,'Item (detail)','Item','honor pencacah','uraian + volume, satuan, harga',null,'akun','tim',true)
on conflict (kode) do nothing;
insert into keu_master_jalur(level_kode,sumber,khusus,jalur_kode,nama,pemutus,dasar,kepastian,tenggat_kode,syarat) values
('program','dalam',false,'dja','Revisi DIPA jalur DJA','DJA','Antar-Program atau antar-Eselon I: Lampiran IV.C 2.b, 2.c, 2.af.','catatan','tenggat_dipa_dja',array['Program ditetapkan pusat. Satker hampir tidak pernah memulai; program baru masuk lewat impor DIPA dan POK resmi.']::text[]),
('program','lintas',false,'dja','Revisi DIPA jalur DJA','DJA','Antar-Program atau antar-Eselon I: Lampiran IV.C 2.b, 2.c, 2.af.','catatan','tenggat_dipa_dja',array['Program ditetapkan pusat. Satker hampir tidak pernah memulai; program baru masuk lewat impor DIPA dan POK resmi.']::text[]),
('program','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('kegiatan','dalam',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Eselon I (surat persetujuan) lalu Kanwil DJPb','Penambahan Kegiatan baru: Pasal 172 ayat (1)(a)(2), (4) sampai (6).','catatan','tenggat_dipa_djpb',array['Surat persetujuan Eselon I dilampirkan.','Kegiatan ditetapkan pusat; biasanya masuk lewat impor POK resmi.']::text[]),
('kegiatan','lintas',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Eselon I (surat persetujuan) lalu Kanwil DJPb','Penambahan Kegiatan baru: Pasal 172 ayat (1)(a)(2), (4) sampai (6).','catatan','tenggat_dipa_djpb',array['Surat persetujuan Eselon I dilampirkan.','Kegiatan ditetapkan pusat; biasanya masuk lewat impor POK resmi.']::text[]),
('kegiatan','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('kro','dalam',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Kanwil DJPb','Antar-KRO dalam 1 Kegiatan di luar Pasal 173; jalur Kanwil. Catatan kerancuan Lampiran 2.af masih ditanyakan.','catatan','tenggat_dipa_djpb',array['Pagu satker tetap; dana digeser dari KRO lain pada Kegiatan yang sama.']::text[]),
('kro','lintas',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Kanwil DJPb','Antar-KRO dalam 1 Kegiatan di luar Pasal 173; jalur Kanwil. Catatan kerancuan Lampiran 2.af masih ditanyakan.','catatan','tenggat_dipa_djpb',array['Pagu satker tetap; dana digeser dari KRO lain pada Kegiatan yang sama.']::text[]),
('kro','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('ro','dalam',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Kanwil DJPb','RO baru memiliki satuan dan volume sendiri; Pasal 173 hanya mengizinkan pergeseran tanpa mengubah satuan dan volume RO. Dugaan, belum ada pasal eksplisit untuk RO baru.','dugaan','tenggat_dipa_djpb',array['Wajib punya volume dan satuan RO.','Setelah RO ada, PPK menetapkan ketua tim dan tim di Peran dan Akses.']::text[]),
('ro','lintas',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Kanwil DJPb','RO baru memiliki satuan dan volume sendiri; Pasal 173 hanya mengizinkan pergeseran tanpa mengubah satuan dan volume RO. Dugaan, belum ada pasal eksplisit untuk RO baru.','dugaan','tenggat_dipa_djpb',array['Wajib punya volume dan satuan RO.','Setelah RO ada, PPK menetapkan ketua tim dan tim di Peran dan Akses.']::text[]),
('ro','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('komponen','dalam',false,'pok','Revisi POK (wewenang KPA, disahkan PPK)','PPK; KPA menerima laporan','Komponen ada di POK, bukan di Halaman III DIPA; tambah atau ubah dalam 1 RO: Pasal 173; Lampiran IV.C angka 5. Dugaan untuk komponen biasa.','dugaan','tenggat_pok',array['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja, sumber dana.']::text[]),
('komponen','lintas',false,'pok','Revisi POK (wewenang KPA, disahkan PPK)','PPK; KPA menerima laporan','Komponen ada di POK, bukan di Halaman III DIPA; tambah atau ubah dalam 1 RO: Pasal 173; Lampiran IV.C angka 5. Dugaan untuk komponen biasa.','dugaan','tenggat_pok',array['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja, sumber dana.']::text[]),
('komponen','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('subkomp','dalam',false,'pok','Revisi POK (wewenang KPA, disahkan PPK)','PPK; KPA menerima laporan','Dalam 1 RO: Pasal 173; Lampiran IV.C angka 5. Dugaan untuk subkomponen.','dugaan','tenggat_pok',array['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja, sumber dana.']::text[]),
('subkomp','lintas',false,'pok','Revisi POK (wewenang KPA, disahkan PPK)','PPK; KPA menerima laporan','Dalam 1 RO: Pasal 173; Lampiran IV.C angka 5. Dugaan untuk subkomponen.','dugaan','tenggat_pok',array['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja, sumber dana.']::text[]),
('subkomp','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('akun','dalam',false,'pok','Revisi POK (wewenang KPA, disahkan PPK)','PPK; KPA menerima laporan','Tambah atau ubah akun dalam 1 RO: Pasal 173 ayat (1) sampai (3); Lampiran IV.C angka 5 a sampai c. Perubahan empat digit terakhir akun adalah kelonggaran KPA.','catatan','tenggat_pok',array['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja (dua digit pertama akun), sumber dana.','Dana digeser dalam kelompok belanja yang sama (R-16); penggenap tidak minus (R-17).']::text[]),
('akun','lintas',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Kanwil DJPb','Antar-jenis belanja tanpa menurunkan volume RO: Pasal 124 ayat (2)(b); Lampiran IV.C 2.q. Bila menurunkan volume RO total: DJA (2.q, 2.u).','catatan','tenggat_dipa_djpb',array['Dana dari jenis belanja lain, atau dari RO lain: pindahkan lewat jendela geseran (papan 1 sampai 8).']::text[]),
('akun','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('item','dalam',false,'pok','Revisi POK (wewenang KPA, disahkan PPK)','PPK; KPA menerima laporan','Tambah atau ubah detail dalam 1 RO: Pasal 173 ayat (1) sampai (3); Lampiran IV.C angka 5 a sampai c. Perubahan empat digit terakhir akun adalah kelonggaran KPA.','catatan','tenggat_pok',array['Tidak mengubah pagu satker, satuan dan volume RO, jenis belanja (dua digit pertama akun), sumber dana.','Dana digeser dalam kelompok belanja yang sama (R-16); penggenap tidak minus (R-17).']::text[]),
('item','lintas',false,'djpb','Revisi DIPA jalur DJPb (Kanwil)','Kanwil DJPb','Antar-jenis belanja tanpa menurunkan volume RO: Pasal 124 ayat (2)(b); Lampiran IV.C 2.q. Bila menurunkan volume RO total: DJA (2.q, 2.u).','catatan','tenggat_dipa_djpb',array['Dana dari jenis belanja lain, atau dari RO lain: pindahkan lewat jendela geseran (papan 1 sampai 8).']::text[]),
('item','tambahan',false,'dja','Revisi DIPA jalur DJA','DJA melalui Eselon I','Penambahan pagu bukan wewenang KPA: Pasal 120 ayat (2); Lampiran IV.C angka 1.','catatan','tenggat_dipa_dja',array['Usulan dibawa ke Eselon I; satker tidak menulis pagu baru ke POK sebelum DIPA disahkan.','Sebelum itu, kebutuhan dicatat di papan 15 (catatan kekurangan RAB).']::text[]),
('komponen','dalam',true,'dja','Revisi DIPA jalur DJA','DJA','Pembentukan Komponen Khusus: Lampiran IV.C 3.e.2.d; Pasal 157 ayat (6)(c), 158A.','catatan','tenggat_dipa_dja',array['Pemanfaatan memerlukan keputusan Menteri atau Pimpinan Lembaga.']::text[]),
('komponen','lintas',true,'dja','Revisi DIPA jalur DJA','DJA','Pembentukan Komponen Khusus: Lampiran IV.C 3.e.2.d; Pasal 157 ayat (6)(c), 158A.','catatan','tenggat_dipa_dja',array['Pemanfaatan memerlukan keputusan Menteri atau Pimpinan Lembaga.']::text[])
on conflict (level_kode,sumber,khusus) do nothing;
insert into keu_ro(kode,nama) values
('2896.BMA.004','Publikasi/Laporan Analisis Statistik Dan Neraca Satelit'),
('2897.BMA.004','Layanan Statistik Terpadu'),
('2897.QDB.003','Pembinaan Statistik Sektoral'),
('2898.BMA.007','Publikasi/Laporan Statistik Neraca Pengeluaran'),
('2899.BMA.006','Publikasi/Laporan Neraca Produksi'),
('2900.BMA.005','Dokumen/Laporan Pengembangan Metodologi Statistik dan Sains Data'),
('2900.QMA.006','Pemanfaatan Big Data untuk Statistik Resmi'),
('2901.CAN.004','Pengembangan Infrastruktur dan Layanan Teknologi Informasi dan Komunikasi'),
('2902.BMA.004','Publikasi/Laporan Statistik Distribusi'),
('2902.BMA.006','Publikasi/Laporan Sensus Ekonomi'),
('2902.CAN.004','Pengembangan Infrastruktur dan Layanan Teknologi Informasi dan Komunikasi'),
('2902.FAN.ZZ1','Pemenuhan Prioritas Direktif Presiden'),
('2903.BMA.007','Publikasi/Laporan Survei Pola Konsumsi Rumah Tangga'),
('2903.BMA.009','Publikasi/Laporan Statistik Harga'),
('2903.BMA.008','Publikasi/Laporan Survei Penyempurnaan Diagram Timbang Nilai Tukar Petani'),
('2904.BMA.006','Publikasi/Laporan Statistik Industri'),
('2905.BMA.004','Publikasi/Laporan Survei Angkatan Kerja Nasional'),
('2906.BMA.005','Publikasi/Laporan Data Tunggal Sosial Dan Ekonomi Nasional'),
('2906.BMA.006','Publikasi/Laporan Survei Sosial Ekonomi Nasional'),
('2907.BMA.006','Publikasi/Laporan Statistik Ketahanan Sosial'),
('2907.BMA.008','Publikasi/Laporan Pendataan Potensi Desa'),
('2907.BMA.009','Publikasi/Laporan Data Tunggal Bencana'),
('2907.UBB.006','Pembinaan Desa Cinta Statistik'),
('2908.BMA.004','Publikasi/Laporan Statistik Jasa'),
('2909.BMA.005','Publikasi/Laporan Statistik Peternakan, Perikanan, Dan Kehutanan'),
('2909.BMA.006','Publikasi/Laporan Survei Pertanian Terintegrasi'),
('2910.BMA.007','Publikasi/Laporan Statistik Tanaman Pangan'),
('2910.BMA.008','Publikasi/Laporan Statistik Hortikultura Dan Perkebunan'),
('8130.BMA.007','Publikasi/Laporan Statistik Tanaman Pangan'),
('8131.BMA.005','Publikasi/Laporan Statistik Sumber Daya Mineral Dan Konstruksi'),
('2886.EBA.956','Layanan BMN'),
('2886.EBA.962','Layanan Umum'),
('2886.EBA.994','Layanan Perkantoran'),
('2886.EBD.955','Layanan Manajemen Keuangan'),
('2886.EBD.961','Layanan Reformasi Kinerja')
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 9. Validasi, penjaga hak, jejak audit
-- ---------------------------------------------------------------------
create or replace function keu_cek_penugasan() returns trigger
language plpgsql set search_path = public as $$
declare v_lingkup text;
begin
  select lingkup into v_lingkup from keu_master_peran where kode = new.peran_kode;
  if v_lingkup = 'global' and new.ro_kode is not null then
    raise exception 'Peran % berlaku seluruh satker; RO tidak boleh diisi.', new.peran_kode using errcode = '23514';
  elsif v_lingkup = 'ro' and new.ro_kode is null then
    raise exception 'Peran % harus ditugaskan pada satu RO.', new.peran_kode using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from sigap_akun where id = new.akun_id and aktif) then
      raise exception 'Akun % tidak aktif.', new.akun_id using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Penjaga: hanya bekerja bila aplikasi mengisi app.akun_id (SQL editor/migrasi bebas).
-- TG_ARGV[0] = kewenangan yang diperlukan; '@pemberian' = ikuti pemberi_kode kewenangan yang diberikan.
create or replace function keu_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_akun bigint := keu_akun_sesi(); v_kew text := tg_argv[0];
begin
  if v_akun is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %). Gunakan pembatalan / nonaktif.', tg_table_name
      using errcode = '42501';
  end if;
  if v_kew = '@pemberian' then
    select coalesce(pemberi_kode, 'akses') into v_kew from keu_master_kewenangan where kode = new.kewenangan_kode;
    v_kew := coalesce(v_kew, 'akses');
  end if;
  if not keu_boleh(v_akun, v_kew, null) then
    raise exception 'Akun % tidak berwenang (%) pada tabel %.', v_akun, v_kew, tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function keu_jaga() from public, anon, authenticated;

-- Jejak ke sigap_audit: nilai baru untuk INSERT; hanya kolom yang berubah (lama dan baru) untuk UPDATE.
create or replace function keu_jejak() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_baru jsonb; v_lama jsonb; v_det jsonb;
begin
  if tg_op = 'INSERT' then
    v_det := jsonb_build_object('tabel', tg_table_name, 'baru', to_jsonb(new) - 'diubah_at' - 'dibuat_at');
  elsif tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) into v_baru
      from jsonb_each(to_jsonb(new)) n
      where n.key not in ('diubah_at') and (to_jsonb(old) -> n.key) is distinct from n.value;
    if v_baru = '{}'::jsonb then return null; end if;
    select coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb) into v_lama
      from jsonb_each(to_jsonb(old)) o where v_baru ? o.key;
    v_det := jsonb_build_object('tabel', tg_table_name, 'lama', v_lama, 'baru', v_baru);
  else
    v_det := jsonb_build_object('tabel', tg_table_name, 'lama', to_jsonb(old));
  end if;
  insert into sigap_audit(akun_id, aksi, detail)
  values (keu_akun_sesi(), 'keu.' || tg_table_name || '.' || lower(tg_op), v_det);
  return null;
end $$;
revoke execute on function keu_jejak() from public, anon, authenticated;

-- pasang trigger (tanpa DROP; lewati yang sudah ada)
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('keu_master_peran',            'akses'),
      ('keu_master_kewenangan',       'akses'),
      ('keu_master_kewenangan_peran', 'akses'),
      ('keu_master_kelompok',         'master'),
      ('keu_master_pola_dok',         'master'),
      ('keu_master_akun',             'master'),
      ('keu_master_satuan',           'master'),
      ('keu_master_satuan_alias',     'master'),
      ('keu_master_prioritas',        'master'),
      ('keu_master_waktu',            'master'),
      ('keu_master_profil_penarikan', 'master'),
      ('keu_master_skor',             'bobot'),
      ('keu_struktur_level',          'master'),
      ('keu_master_jalur',            'master'),
      ('keu_ro',                      'master'),
      ('keu_penugasan',               'akses'),
      ('keu_akses_adm',               'akses'),
      ('keu_pemberian',               '@pemberian')
    ) v(tabel, kew)
  loop
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || r.tabel)::regclass and tgname = 'keu_t1_jaga') then
      execute format('create trigger keu_t1_jaga before insert or update or delete on %I
                      for each row execute function keu_jaga(%L)', r.tabel, r.kew);
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || r.tabel)::regclass and tgname = 'keu_t9_jejak') then
      execute format('create trigger keu_t9_jejak after insert or update or delete on %I
                      for each row execute function keu_jejak()', r.tabel);
    end if;
  end loop;

  -- sentuh diubah_at
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('keu_master_peran','keu_master_kewenangan','keu_master_akun','keu_master_satuan','keu_master_waktu','keu_struktur_level','keu_ro')
  loop
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || r.relname)::regclass and tgname = 'keu_t2_sentuh') then
      execute format('create trigger keu_t2_sentuh before update on %I for each row execute function keu_sentuh()', r.relname);
    end if;
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_master_skor'::regclass and tgname = 'keu_t2_riwayat') then
    create trigger keu_t2_riwayat before update on keu_master_skor for each row execute function keu_skor_riwayat();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_penugasan'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_penugasan for each row execute function keu_cek_penugasan();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 10. RLS dan hak tabel (tanpa policy = hanya server / service role)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'keu\_%'
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
