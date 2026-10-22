-- =====================================================================
-- 20261022a_tkl_fondasi.sql
-- Lapis: layanan bersama (tata kelola). Prefix tkl_.
-- Isi: parameter berlaku-waktu, register regulasi (status verifikasi jujur),
--      jejak audit berantai hash (append-only), fungsi pembeku/pencatat umum.
-- Draf usulan. Diterapkan user sendiri setelah ditinjau. Tidak ada DROP/DELETE.
-- Checklist acuan-skema-portal bagian 4:
--   [x] lapis layanan bersama  [x] tabel serupa belum ada (sigap_audit tetap untuk
--   audit umum; tkl_jejak khusus objek keuangan/penilaian yang butuh bukti anti-ubah)
--   [x] orang=akun_id FK  [x] RLS aktif  [x] fungsi definer di-revoke
--   [x] tidak ada data pribadi tersalin  [x] nilai berubah-waktu bermasa berlaku
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto  with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Parameter berlaku-waktu (honor, batas hari, ambang). Aturan 6.
--    Nilai yang belum diverifikasi dari ketentuan resmi diberi status
--    'belum_diisi' dan fungsi pembaca mengembalikan NULL (penjaga dilewati
--    dan tampil sebagai peringatan di pemantauan, bukan angka karangan).
-- ---------------------------------------------------------------------
create table tkl_parameter (
  id            bigint generated always as identity primary key,
  kunci         text not null check (kunci ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  nilai_num     numeric,
  nilai_teks    text,
  satuan        text,
  status_isi    text not null default 'ilustrasi'
                check (status_isi in ('belum_diisi','ilustrasi','diisi_admin','terverifikasi')),
  dasar_keterangan text,
  berlaku_mulai date not null default current_date,
  berlaku_sampai date,
  diubah_oleh   bigint references sigap_akun(id),
  alasan_ubah   text,
  dibuat_at     timestamptz not null default now(),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  check (status_isi = 'belum_diisi' or nilai_num is not null or nilai_teks is not null),
  exclude using gist (
    kunci with =,
    daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&
  )
);
comment on table tkl_parameter is 'Parameter kebijakan bermasa berlaku. Nilai honor/ambang yang belum ada di ketentuan resmi berstatus belum_diisi (tidak dikarang).';
comment on column tkl_parameter.status_isi is 'belum_diisi: menunggu admin; ilustrasi: angka rancangan; diisi_admin: dari teks ketentuan yang diperiksa admin; terverifikasi: sudah dicek tim terhadap sumber resmi.';

create function tkl_param_num(p_kunci text, p_tanggal date default current_date)
returns numeric language sql stable
set search_path = public, pg_temp
as $$
  select nilai_num from tkl_parameter
  where kunci = p_kunci and status_isi <> 'belum_diisi'
    and p_tanggal between berlaku_mulai and coalesce(berlaku_sampai, 'infinity'::date)
  limit 1
$$;

insert into tkl_parameter (kunci, nilai_num, satuan, status_isi, dasar_keterangan) values
  ('rab.rentang.v1', 22, 'persen', 'ilustrasi', 'Rentang tolok ukur RAB versi 1 (rancangan)'),
  ('rab.rentang.v2', 14, 'persen', 'ilustrasi', 'Rentang RAB versi 2'),
  ('rab.rentang.v3',  8, 'persen', 'ilustrasi', 'Rentang RAB versi 3'),
  ('rab.rentang.v4',  5, 'persen', 'ilustrasi', 'Rentang RAB versi 4 dan seterusnya'),
  ('rab.cadangan_persen', 5, 'persen', 'ilustrasi', 'Cadangan revisi per rentang RAB'),
  ('kual.sanggah_hari_kerja', 7, 'hari kerja', 'ilustrasi', 'Batas mengajukan sanggah atas penilaian'),
  ('kual.umpan_balik_hari_kerja', 3, 'hari kerja', 'ilustrasi', 'Batas memberi umpan balik setelah tugas selesai'),
  ('kual.prior', 62, 'poin', 'ilustrasi', 'Skor awal pengaman untuk pengamatan sedikit'),
  ('kual.k', 4, 'pengamatan', 'ilustrasi', 'Bobot prior setara k pengamatan'),
  ('kual.paruh_bulan', 6, 'bulan', 'ilustrasi', 'Waktu paruh peluruhan pengamatan'),
  ('kual.min_tugas_panutan', 12, 'tugas', 'ilustrasi', 'Minimum tugas untuk tingkat Panutan'),
  ('kual.faktor_kesulitan_min', 1.0, 'kali', 'ilustrasi', 'Batas bawah faktor kesulitan'),
  ('kual.faktor_kesulitan_maks', 1.6, 'kali', 'ilustrasi', 'Batas atas faktor kesulitan'),
  ('pdp.batas_notifikasi_jam', 72, 'jam', 'ilustrasi', 'Perlu dicek tim terhadap teks UU 27/2022 dan aturan turunan sebelum dipakai'),
  ('keu.ambang_deviasi_rpd_persen', 10, 'persen', 'ilustrasi', 'Ambang peringatan deviasi realisasi terhadap RPD')
on conflict do nothing;

insert into tkl_parameter (kunci, status_isi, dasar_keterangan, nilai_teks) values
  ('mitra.batas_honor_bulanan', 'belum_diisi', 'Isi dari ketentuan resmi BPS. Penelusuran sesi ini tidak menemukan angka resmi.', null),
  ('mitra.bentuk_perjanjian',   'belum_diisi', 'Isi dari ketentuan resmi BPS (bentuk perjanjian kerja mitra statistik).', null)
on conflict do nothing;

-- Nilai awal berlaku sejak awal tahun anggaran 2026 agar penjaga berlaku untuk bulan beban 2026.
update tkl_parameter set berlaku_mulai = date '2026-01-01' where diubah_oleh is null and alasan_ubah is null;

-- ---------------------------------------------------------------------
-- 2. Register regulasi (peta dasar hukum -> kewajiban -> kontrol)
-- ---------------------------------------------------------------------
create table tkl_regulasi (
  id                bigint generated always as identity primary key,
  pedia_regulasi_id bigint references pedia_regulasi(id),
  jenis             text not null check (jenis in ('UU','PP','Perpres','PMK','PermenPANRB','PerBPS','Lainnya')),
  nomor             text not null,
  tahun             smallint not null check (tahun between 1945 and 2100),
  judul             text not null,
  status_verifikasi text not null default 'perlu_dicek'
                    check (status_verifikasi in ('terverifikasi','perlu_dicek','tidak_terverifikasi')),
  verifikasi_sumber text,
  diverifikasi_oleh bigint references sigap_akun(id),
  diverifikasi_at   timestamptz,
  dicabut_oleh_id   bigint references tkl_regulasi(id),
  catatan           text,
  dibuat_at         timestamptz not null default now(),
  unique (jenis, nomor, tahun),
  check (status_verifikasi <> 'terverifikasi' or (verifikasi_sumber is not null and diverifikasi_at is not null))
);
comment on table tkl_regulasi is 'Register regulasi yang dirujuk modul. Hanya status terverifikasi yang boleh ditampilkan tanpa catatan "perlu dicek".';
comment on column tkl_regulasi.status_verifikasi is 'terverifikasi (sumber resmi + tanggal), perlu_dicek (pengetahuan umum), tidak_terverifikasi (tidak ditemukan).';

insert into tkl_regulasi (jenis, nomor, tahun, judul, status_verifikasi, verifikasi_sumber, diverifikasi_at, catatan) values
 ('PMK','62',2023,'Perencanaan Anggaran, Pelaksanaan Anggaran, serta Akuntansi dan Pelaporan Keuangan','terverifikasi','Ringkasan JDIH Kemenkeu (penelusuran 2026)', '2026-10-20','Pasal rinci revisi anggaran: isi admin dari teks terbaru'),
 ('PMK','107',2024,'Perubahan atas PMK 62/2023','terverifikasi','Ringkasan JDIH Kemenkeu (penelusuran 2026)','2026-10-20','Ditetapkan 13 Des 2024, berlaku 31 Des 2024'),
 ('PMK','41',2026,'Perubahan kedua atas PMK 62/2023','terverifikasi','Penelusuran 2026 (isi pasal belum terbaca)','2026-10-20','Kewenangan revisi per jenjang dan batas waktu: isi admin'),
 ('Perpres','16',2018,'Pengadaan Barang/Jasa Pemerintah','terverifikasi','Penelusuran 2026','2026-10-20',null),
 ('Perpres','12',2021,'Perubahan pertama atas Perpres 16/2018','terverifikasi','Penelusuran 2026','2026-10-20',null),
 ('Perpres','46',2025,'Perubahan kedua atas Perpres 16/2018','terverifikasi','Penelusuran 2026 (ditetapkan 30 Apr 2025)','2026-10-20','Produk lokal, percepatan pengadaan, pengadaan di tingkat desa'),
 ('UU','27',2022,'Pelindungan Data Pribadi','terverifikasi','Penelusuran 2026','2026-10-20','RPP pelaksana dan lembaga pengawas: cek status terbaru (Hukumonline 24 Okt 2025 menyebut belum ditetapkan/dibentuk)'),
 ('PermenPANRB','6',2022,'Pengelolaan Kinerja Pegawai ASN','terverifikasi','Penelusuran 2026','2026-10-20','Matriks predikat: rujuk lampiran peraturan, tidak disalin'),
 ('Perpres','86',2007,'Badan Pusat Statistik','terverifikasi','Penelusuran 2026','2026-10-20',null),
 ('UU','16',1997,'Statistik','terverifikasi','Penelusuran 2026','2026-10-20','Kerahasiaan data individu responden'),
 ('PP','51',1999,'Penyelenggaraan Statistik','terverifikasi','Penelusuran 2026','2026-10-20',null),
 ('PerBPS','65',2024,'Standar Pelayanan Statistik Terpadu','terverifikasi','Penelusuran 2026','2026-10-20',null),
 ('PerBPS','7',2025,'Klasifikasi Baku Lapangan Usaha Indonesia (KBLI)','terverifikasi','Penelusuran 2026 (berlaku sejak 18 Des 2025)','2026-10-20','Mencabut PerBPS 2/2020')
on conflict do nothing;

insert into tkl_regulasi (jenis, nomor, tahun, judul, status_verifikasi, catatan) values
 ('UU','17',2003,'Keuangan Negara','perlu_dicek','Pengetahuan umum, belum diverifikasi sesi ini'),
 ('UU','1',2004,'Perbendaharaan Negara','perlu_dicek','Pengetahuan umum'),
 ('UU','15',2004,'Pemeriksaan Pengelolaan dan Tanggung Jawab Keuangan Negara','perlu_dicek','Pengetahuan umum'),
 ('PP','60',2008,'Sistem Pengendalian Intern Pemerintah','perlu_dicek','Lima unsur SPIP; pengetahuan umum'),
 ('UU','20',2023,'Aparatur Sipil Negara','perlu_dicek','Pengetahuan umum'),
 ('PP','94',2021,'Disiplin Pegawai Negeri Sipil','perlu_dicek','Pengetahuan umum'),
 ('UU','43',2009,'Kearsipan','perlu_dicek','Dasar retensi arsip; jadwal retensi: isi dari ketentuan'),
 ('UU','11',2008,'Informasi dan Transaksi Elektronik (jo perubahan, termasuk UU 1/2024)','perlu_dicek','Pengetahuan umum'),
 ('Perpres','95',2018,'Sistem Pemerintahan Berbasis Elektronik','perlu_dicek','Pengetahuan umum'),
 ('Perpres','39',2019,'Satu Data Indonesia','perlu_dicek','Pengetahuan umum'),
 ('UU','14',2008,'Keterbukaan Informasi Publik','perlu_dicek','Pengetahuan umum'),
 ('PMK','168',2023,'Pelaksanaan pemotongan PPh Pasal 21 (tarif efektif)','perlu_dicek','Cek judul dan tarif pada teks resmi sebelum dipakai')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Jejak audit berantai hash (append-only, tahan-ubah)
-- ---------------------------------------------------------------------
create table tkl_jejak (
  id             bigint generated always as identity primary key,
  urutan         bigint not null unique,
  waktu          timestamptz not null default now(),
  akun_id        bigint references sigap_akun(id),
  aksi           text not null check (aksi in ('buat','ubah','status','kunci','batal','baca_sensitif','ekspor','sistem')),
  objek_tabel    text not null,
  objek_id       text not null,
  sebelum        jsonb,
  sesudah        jsonb,
  hash_sebelumnya text not null,
  hash           text not null unique
);
create index tkl_jejak_objek_idx on tkl_jejak (objek_tabel, objek_id, urutan);
create index tkl_jejak_akun_idx  on tkl_jejak (akun_id, waktu desc);
comment on table tkl_jejak is 'Jejak audit berantai hash SHA-256 untuk objek keuangan, penilaian, dan akses data pribadi. Tidak bisa diubah/dihapus (trigger). Verifikasi dengan tkl_verifikasi_rantai().';

create function tkl_jejak_isi_hash() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_prev text; v_urut bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('tkl_jejak', 0));
  select hash, urutan into v_prev, v_urut from tkl_jejak order by urutan desc limit 1;
  new.urutan := coalesce(v_urut, 0) + 1;
  new.hash_sebelumnya := coalesce(v_prev, repeat('0', 64));
  new.hash := encode(digest(
      new.hash_sebelumnya || '|' || new.urutan::text || '|'
      || to_char(new.waktu at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|'
      || coalesce(new.akun_id::text, '') || '|' || new.aksi || '|' || new.objek_tabel || '|' || new.objek_id || '|'
      || coalesce(new.sebelum::text, '') || '|' || coalesce(new.sesudah::text, ''),
      'sha256'), 'hex');
  return new;
end $$;
create trigger tkl_jejak_hash_tr before insert on tkl_jejak
  for each row execute function tkl_jejak_isi_hash();

create function tkl_tolak_ubah() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  raise exception 'Tabel % bersifat tambah-saja (append-only): % ditolak', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end $$;
create trigger tkl_jejak_tolak_ubah_tr before update or delete on tkl_jejak
  for each row execute function tkl_tolak_ubah();
create trigger tkl_jejak_tolak_kosong_tr before truncate on tkl_jejak
  for each statement execute function tkl_tolak_ubah();

-- Verifikasi rantai: kembalikan baris rusak pertama (urutan, alasan). Kosong = utuh.
create function tkl_verifikasi_rantai(p_dari bigint default 1, p_sampai bigint default null)
returns table (urutan bigint, alasan text)
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  with b as (
    select j.urutan, j.hash, j.hash_sebelumnya,
           lag(j.hash) over (order by j.urutan) as hash_baris_sebelumnya,
           lag(j.urutan) over (order by j.urutan) as urutan_sebelumnya,
           encode(digest(
             j.hash_sebelumnya || '|' || j.urutan::text || '|'
             || to_char(j.waktu at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|'
             || coalesce(j.akun_id::text, '') || '|' || j.aksi || '|' || j.objek_tabel || '|' || j.objek_id || '|'
             || coalesce(j.sebelum::text, '') || '|' || coalesce(j.sesudah::text, ''),
             'sha256'), 'hex') as hash_hitung
    from tkl_jejak j
    where j.urutan >= greatest(p_dari - 1, 1) and (p_sampai is null or j.urutan <= p_sampai)
  )
  select b.urutan,
         case when b.hash <> b.hash_hitung then 'isi baris tidak cocok dengan hash'
              when b.urutan_sebelumnya is not null and b.urutan_sebelumnya + 1 <> b.urutan then 'urutan melompat (baris hilang)'
              when b.hash_baris_sebelumnya is not null and b.hash_sebelumnya <> b.hash_baris_sebelumnya then 'tautan ke baris sebelumnya putus'
         end
  from b
  where b.urutan >= p_dari
    and (b.hash <> b.hash_hitung
      or (b.urutan_sebelumnya is not null and b.urutan_sebelumnya + 1 <> b.urutan)
      or (b.hash_baris_sebelumnya is not null and b.hash_sebelumnya <> b.hash_baris_sebelumnya))
  order by b.urutan
$$;
revoke execute on function tkl_verifikasi_rantai(bigint, bigint) from public, anon, authenticated;
grant  execute on function tkl_verifikasi_rantai(bigint, bigint) to service_role;
revoke execute on function tkl_jejak_isi_hash() from public, anon, authenticated;

-- Pencatat generik: pasang pada tabel keuangan/penilaian.
--   create trigger x after insert or update on t for each row
--     execute function tkl_catat_jejak('kolom_pribadi_dilewati', ...);
-- Aktor dibaca dari pengaturan sesi: select set_config('sigap.akun_id','354',true);
create function tkl_catat_jejak() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_akun bigint; v_sebelum jsonb; v_sesudah jsonb; v_aksi text; v_id text; i int;
begin
  begin v_akun := nullif(current_setting('sigap.akun_id', true), '')::bigint; exception when others then v_akun := null; end;
  if tg_op = 'INSERT' then v_sebelum := null; v_sesudah := to_jsonb(new); v_aksi := 'buat';
  elsif tg_op = 'UPDATE' then v_sebelum := to_jsonb(old); v_sesudah := to_jsonb(new); v_aksi := 'ubah';
  else v_sebelum := to_jsonb(old); v_sesudah := null; v_aksi := 'batal'; end if;
  for i in 0 .. coalesce(tg_nargs, 0) - 1 loop
    v_sebelum := v_sebelum - tg_argv[i];
    v_sesudah := v_sesudah - tg_argv[i];
  end loop;
  v_id := coalesce(v_sesudah ->> 'id', v_sebelum ->> 'id', '?');
  insert into tkl_jejak (akun_id, aksi, objek_tabel, objek_id, sebelum, sesudah)
  values (v_akun, v_aksi, tg_table_name, v_id, v_sebelum, v_sesudah);
  return null;
end $$;
revoke execute on function tkl_catat_jejak() from public, anon, authenticated;

-- Pembeku generik: baris yang sudah final hanya boleh mengubah kolom yang diizinkan.
--   create trigger x before update on t for each row
--     execute function tkl_beku_jika('status', 'dikunci', 'digantikan_oleh_id');
-- argumen 0: kolom penentu, 1: nilai beku, 2..: kolom yang tetap boleh berubah
create function tkl_beku_jika() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_o jsonb := to_jsonb(old); v_n jsonb := to_jsonb(new); i int;
begin
  if (v_o ->> tg_argv[0]) = tg_argv[1] then
    for i in 2 .. tg_nargs - 1 loop v_o := v_o - tg_argv[i]; v_n := v_n - tg_argv[i]; end loop;
    if v_o is distinct from v_n then
      raise exception '% id=% sudah % dan tidak boleh diubah (buat versi baru)', tg_table_name, old.id, tg_argv[1]
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- RLS: semua tabel aktif; tanpa policy = hanya server (service role)
-- ---------------------------------------------------------------------
alter table tkl_parameter enable row level security;
alter table tkl_regulasi  enable row level security;
alter table tkl_jejak     enable row level security;
