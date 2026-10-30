-- =====================================================================
-- 20261024h_keu_unggah_realisasi_skor.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE D: unggahan POK resmi + pembanding,
-- unggahan realisasi (Excel GLP039), peringatan SPAN, batas realisasi (R-06), skor RAB.
-- Bergantung pada 20261024a-f. Aman diulang. Tanpa DELETE/DROP.
--
--  D-26 Bendahara mengunggah Excel realisasi mingguan; PPK mengunggah PDF POK resmi dan
--       mencocokkannya; hanya selisih yang ditampilkan.
--  D-29 Impor POK hasil penetapan: sama / berubah / baru / hilang / di luar usulan, dan
--       pemadanan manual untuk kode atau redaksi yang berbeda (membuat alias kunci).
--  D-16 Realisasi: Excel GLP039. Nomor item resmi (000252) hanya ada di laporan ini ->
--       tabel pemetaan keu_item_nomor (kunci stabil item <-> nomor item).
--  D-21 Skor: bobot dan ambang dari keu_master_skor. RUMUS SEMENTARA (pertanyaan terbuka 5).
-- Cara kerja unggahan: aplikasi menguraikan berkas (PDF atau Excel) menjadi baris JSON,
-- lalu memanggil fungsi di bawah; fungsi memeriksa seluruhnya dalam satu transaksi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Unggahan POK resmi (PDF) - penampungan sebelum menjadi versi POK
-- ---------------------------------------------------------------------
create table if not exists keu_pok_unggah (
  id            bigint generated always as identity primary key,
  tahun         smallint not null references keu_tahun_anggaran(tahun),
  nomor_revisi  smallint not null check (nomor_revisi >= 1),
  jadwal_id     bigint references keu_revisi_jadwal(id),         -- dasar revisi (bila ada)
  nama_berkas   text not null check (length(btrim(nama_berkas)) >= 3),
  hash_berkas   text not null check (hash_berkas ~ '^[0-9a-f]{64}$'),
  nomor_pok     text,
  tanggal_efektif date not null,
  status        text not null default 'diunggah' check (status in ('diunggah','diterima','ditolak')),
  versi_id      bigint references keu_pok_versi(id),
  alasan_tolak  text not null default '',
  diunggah_oleh bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  constraint unggah_diterima_versi check ((status = 'diterima') = (versi_id is not null)),
  constraint unggah_tolak_alasan check (status <> 'ditolak' or length(btrim(alasan_tolak)) >= 5)
);
create unique index if not exists keu_pok_unggah_hash_uq on keu_pok_unggah(tahun, hash_berkas) where status <> 'ditolak';
create unique index if not exists keu_pok_unggah_nomor_uq on keu_pok_unggah(tahun, nomor_revisi) where status <> 'ditolak';
comment on table keu_pok_unggah is 'PDF POK resmi yang diunggah PPK. Status diunggah -> diterima (versi POK dibuat dan diberlakukan) atau ditolak.';

-- Baris datar hasil penguraian (satu baris = satu item POK dengan jalur lengkapnya)
create table if not exists keu_pok_unggah_baris (
  id          bigint generated always as identity primary key,
  unggah_id   bigint not null references keu_pok_unggah(id),
  urut        int not null check (urut >= 1),
  prog_kode   text not null check (prog_kode ~ '^[A-Z]{2}$'),
  prog_nama   text not null default '',
  keg_kode    text not null check (keg_kode ~ '^[0-9]{4}$'),
  keg_nama    text not null default '',
  kro_kode    text not null check (kro_kode ~ '^[A-Z]{3}$'),
  kro_nama    text not null default '',
  ro_sub      text not null check (ro_sub ~ '^[A-Z0-9]{3}$'),
  ro_nama     text not null default '',
  ro_volume   numeric(14,2) check (ro_volume is null or ro_volume >= 0),
  ro_satuan   text,
  komp_kode   text not null check (komp_kode ~ '^[0-9]{3}$'),
  komp_nama   text not null default '',
  sub_kode    text check (sub_kode is null or sub_kode ~ '^[A-Z0-9]{1,2}$'),
  sub_nama    text not null default '',
  akun_kode   text not null check (akun_kode ~ '^[0-9]{6}$'),
  akun_nama   text not null default '',
  uraian      text not null check (length(btrim(uraian)) >= 1),
  volume      numeric(14,2) not null check (volume >= 0),
  satuan      text not null,
  harga_satuan numeric(18,2) not null check (harga_satuan >= 0),
  jumlah      numeric(18,0) not null check (jumlah >= 0),
  sumber_dana text not null default 'RM',
  tanda_blokir boolean not null default false,
  catatan_khusus text not null default '',
  ro_kode     text generated always as (keg_kode || '.' || kro_kode || '.' || ro_sub) stored,
  unique (unggah_id, urut)
);
create index if not exists keu_pok_unggah_baris_ro_idx on keu_pok_unggah_baris(unggah_id, ro_kode);

-- Pemadanan manual: baris unggahan yang berbeda kode/redaksi dipetakan ke kunci baris POK lama
create table if not exists keu_pok_unggah_padan (
  baris_id    bigint primary key references keu_pok_unggah_baris(id),
  kunci_lama  text not null,
  batal       boolean not null default false,
  dipadankan_oleh bigint references sigap_akun(id),
  dipadankan_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Realisasi (GLP039) dan pemetaan nomor item resmi
-- ---------------------------------------------------------------------
create table if not exists keu_realisasi_unggah (
  id            bigint generated always as identity primary key,
  tahun         smallint not null references keu_tahun_anggaran(tahun),
  sampai_tanggal date not null,                                   -- data realisasi sampai tanggal ini
  bulan         smallint generated always as (extract(month from sampai_tanggal)::smallint) stored,
  nama_berkas   text not null check (length(btrim(nama_berkas)) >= 3),
  hash_berkas   text not null check (hash_berkas ~ '^[0-9a-f]{64}$'),
  pok_versi_id  bigint not null references keu_pok_versi(id),    -- POK berlaku saat diunggah
  n_item        int not null check (n_item >= 1),
  total_pagu    numeric(18,0) not null,
  total_lock    numeric(18,0) not null,
  total_sd      numeric(18,0) not null,
  status        text not null default 'diterima' check (status in ('diterima','dibatalkan')),
  alasan_batal  text not null default '',
  diunggah_oleh bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  constraint realisasi_batal_alasan check (status <> 'dibatalkan' or length(btrim(alasan_batal)) >= 5),
  constraint realisasi_tahun_tanggal check (extract(year from sampai_tanggal) = tahun)
);
create unique index if not exists keu_realisasi_unggah_hash_uq on keu_realisasi_unggah(tahun, hash_berkas) where status = 'diterima';
create unique index if not exists keu_realisasi_unggah_tgl_uq on keu_realisasi_unggah(tahun, sampai_tanggal) where status = 'diterima';
comment on table keu_realisasi_unggah is 'Excel Laporan Ketersediaan Dana Detail (GLP039) yang diunggah bendahara. Satu per tanggal data; batalkan dahulu sebelum mengunggah ulang.';

create table if not exists keu_realisasi_item (
  id          bigint generated always as identity primary key,
  unggah_id   bigint not null references keu_realisasi_unggah(id),
  urut        int not null check (urut >= 1),
  nomor_item  text not null check (nomor_item ~ '^[0-9]{3,8}$'),
  ro_kode     text not null,
  komponen_kode text not null,
  akun_kode   text not null,
  uraian      text not null,
  pagu        numeric(18,0) not null check (pagu >= 0),
  lock_pagu   numeric(18,0) not null default 0 check (lock_pagu >= 0),
  real_lalu   numeric(18,0) not null default 0,
  real_ini    numeric(18,0) not null default 0,
  real_sd     numeric(18,0) not null default 0,
  sisa        numeric(18,0) not null default 0,
  cocok       text not null default 'tidak' check (cocok in ('nomor','teks','manual','tidak')),
  unique (unggah_id, nomor_item),
  unique (unggah_id, urut),
  constraint realisasi_sd_hitung check (abs(real_sd - (real_lalu + real_ini)) <= 1),
  constraint realisasi_sisa_hitung check (abs(sisa - (pagu - lock_pagu - real_sd)) <= 1)
);
create index if not exists keu_realisasi_item_ro_idx on keu_realisasi_item(unggah_id, ro_kode);

-- Pemetaan nomor item resmi <-> kunci stabil (mengikuti kunci terbaru; alias kunci diselesaikan saat dibaca)
create table if not exists keu_item_nomor (
  tahun       smallint not null references keu_tahun_anggaran(tahun),
  nomor_item  text not null check (nomor_item ~ '^[0-9]{3,8}$'),
  kunci_stabil text not null,
  sumber      text not null default 'teks' check (sumber in ('teks','manual','pok')),
  dicatat_at  timestamptz not null default now(),
  primary key (tahun, nomor_item),
  unique (tahun, kunci_stabil)
);

-- ---------------------------------------------------------------------
-- 3. Penjaga
-- ---------------------------------------------------------------------
create or replace function keu_pok_unggah_cek() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_via boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    if keu_akun_sesi() is not null then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'diunggah' and not v_via then
      raise exception 'Unggahan baru harus berstatus diunggah.' using errcode = '23514';
    end if;
  elsif new.status is distinct from old.status then
    if not v_via then raise exception 'Status unggahan hanya dapat diubah melalui fungsi.' using errcode = '42501'; end if;
    if old.status <> 'diunggah' then raise exception 'Unggahan berstatus % sudah final.', old.status using errcode = '23514'; end if;
  elsif old.status <> 'diunggah' and (to_jsonb(new) - 'diubah_at') is distinct from (to_jsonb(old) - 'diubah_at') then
    raise exception 'Unggahan berstatus % tidak dapat diubah.', old.status using errcode = '23514';
  end if;
  new.diubah_at := now();
  return new;
end $$;
revoke execute on function keu_pok_unggah_cek() from public, anon, authenticated;

create or replace function keu_pok_unggah_baris_cek() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_st text;
begin
  select status into v_st from keu_pok_unggah where id = new.unggah_id;
  if v_st <> 'diunggah' then
    raise exception 'Baris hanya dapat ditambah pada unggahan berstatus diunggah (status %).', v_st using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function keu_pok_unggah_baris_cek() from public, anon, authenticated;

create or replace function keu_realisasi_cek() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_via boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    if keu_akun_sesi() is not null then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if tg_table_name = 'keu_realisasi_unggah' then
      if new.status <> 'diterima' and not v_via then
        raise exception 'Unggahan realisasi baru harus berstatus diterima.' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;
  -- UPDATE
  if keu_akun_sesi() is not null and not v_via then
    raise exception 'Perubahan % hanya melalui fungsi.', tg_table_name using errcode = '42501';
  end if;
  if tg_table_name = 'keu_realisasi_unggah' then
    if old.status = 'dibatalkan' then raise exception 'Unggahan yang sudah dibatalkan tidak dapat diubah.' using errcode = '23514'; end if;
    new.diubah_at := now();
  end if;
  return new;
end $$;
revoke execute on function keu_realisasi_cek() from public, anon, authenticated;

create or replace function keu_item_nomor_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_akun bigint := keu_akun_sesi();
begin
  if v_akun is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' then
    raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
  end if;
  if not (keu_boleh(v_akun, 'realisasi', null) or keu_boleh(v_akun, 'pok_pdf', null)) then
    raise exception 'Akun % tidak berwenang mengubah pemetaan nomor item.', v_akun using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function keu_item_nomor_jaga() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Kunci baris unggahan dan pembanding terhadap POK berlaku
-- ---------------------------------------------------------------------
create or replace view keu_v_pok_unggah_kunci with (security_invoker = true) as
select b.*,
       k.dasar || '#' || row_number() over (partition by b.unggah_id, k.dasar order by b.urut) as kunci,
       row_number() over (partition by b.unggah_id, k.dasar order by b.urut)::smallint as kemunculan_hitung
from keu_pok_unggah_baris b
cross join lateral (
  select left(x, length(x) - 2) as dasar
  from (select keu_kunci_detail(b.ro_kode, b.komp_kode, b.akun_kode, b.uraian, 1) as x) q
) k;

-- Pembanding: unggahan berstatus diunggah terhadap POK berlaku pada tahun yang sama
create or replace view keu_v_pok_banding with (security_invoker = true) as
with u as (
  select k.unggah_id, k.id as baris_id, k.urut, k.ro_kode, k.komp_kode, k.akun_kode, k.uraian, k.volume, k.satuan,
         k.harga_satuan, k.jumlah, k.kunci, p.kunci_lama
  from keu_v_pok_unggah_kunci k
  join keu_pok_unggah h on h.id = k.unggah_id and h.status = 'diunggah'
  left join keu_pok_unggah_padan p on p.baris_id = k.id and not p.batal
), d as (
  select h.id as unggah_id, d.id as detail_id, d.kunci_stabil,
         split_part(d.kunci_stabil, '/', 1) as ro_kode, split_part(d.kunci_stabil, '/', 2) as komp_kode,
         split_part(d.kunci_stabil, '/', 3) as akun_kode, d.uraian, d.volume, d.satuan, d.harga_satuan, d.jumlah
  from keu_pok_unggah h
  join keu_pok_versi v on v.tahun = h.tahun and v.status = 'berlaku'
  join keu_pok_detail d on d.versi_id = v.id
  where h.status = 'diunggah'
), m as (
  select u.*, d.detail_id, d.uraian as uraian_lama, d.volume as vol_lama, d.satuan as sat_lama,
         d.harga_satuan as harga_lama, d.jumlah as jumlah_lama, d.akun_kode as akun_lama, d.kunci_stabil as kunci_lama_pok
  from u join d on d.unggah_id = u.unggah_id
   and ((u.kunci_lama is not null and d.kunci_stabil = u.kunci_lama)
     or (u.kunci_lama is null and d.kunci_stabil = u.kunci))
), semua as (
  select m.unggah_id, m.baris_id, m.detail_id, m.ro_kode, m.komp_kode, m.akun_kode, m.uraian as uraian_baru, m.uraian_lama,
         m.volume as vol_baru, m.vol_lama, m.harga_satuan as harga_baru, m.harga_lama,
         m.jumlah as jumlah_baru, m.jumlah_lama,
         case when m.kunci_lama is not null then 'dipadankan'
              when m.volume = m.vol_lama and m.harga_satuan = m.harga_lama and m.jumlah = m.jumlah_lama and m.satuan = m.sat_lama then 'sama'
              else 'berubah' end as status
  from m
  union all
  select u.unggah_id, u.baris_id, null, u.ro_kode, u.komp_kode, u.akun_kode, u.uraian, null,
         u.volume, null, u.harga_satuan, null, u.jumlah, null, 'baru'
  from u where not exists (select 1 from m where m.baris_id = u.baris_id)
  union all
  select d.unggah_id, null, d.detail_id, d.ro_kode, d.komp_kode, d.akun_kode, null, d.uraian,
         null, d.volume, null, d.harga_satuan, null, d.jumlah, 'hilang'
  from d where not exists (select 1 from m where m.detail_id = d.detail_id and m.unggah_id = d.unggah_id)
)
select s.unggah_id, s.status, s.baris_id, s.detail_id, s.ro_kode, s.komp_kode, s.akun_kode,
       s.uraian_lama, s.uraian_baru, s.vol_lama, s.vol_baru, s.harga_lama, s.harga_baru, s.jumlah_lama, s.jumlah_baru,
       coalesce(s.jumlah_baru, 0) - coalesce(s.jumlah_lama, 0) as selisih,
       (s.status <> 'sama' and h.jadwal_id is not null and not exists (
          select 1 from keu_revisi_usulan us
          where us.jadwal_id = h.jadwal_id and us.ro_kode = s.ro_kode and us.status = 'disetujui')) as di_luar_usulan
from semua s join keu_pok_unggah h on h.id = s.unggah_id;
comment on view keu_v_pok_banding is 'sama / berubah / baru / hilang / dipadankan; di_luar_usulan = perubahan pada RO yang tidak punya usulan disetujui pada jadwal dasar.';

create or replace view keu_v_pok_unggah_ringkas with (security_invoker = true) as
select h.id as unggah_id, h.tahun, h.nomor_revisi, h.status,
       (select count(*) from keu_pok_unggah_baris b where b.unggah_id = h.id) as n_baris,
       coalesce((select sum(b.jumlah) from keu_pok_unggah_baris b where b.unggah_id = h.id), 0) as total_unggah,
       coalesce((select sum(d.jumlah) from keu_pok_detail d join keu_pok_versi v on v.id = d.versi_id
                 where v.tahun = h.tahun and v.status = 'berlaku'), 0) as total_berlaku,
       coalesce((select count(*) from keu_v_pok_banding x where x.unggah_id = h.id and x.status = 'sama'), 0) as n_sama,
       coalesce((select count(*) from keu_v_pok_banding x where x.unggah_id = h.id and x.status = 'berubah'), 0) as n_berubah,
       coalesce((select count(*) from keu_v_pok_banding x where x.unggah_id = h.id and x.status = 'dipadankan'), 0) as n_dipadankan,
       coalesce((select count(*) from keu_v_pok_banding x where x.unggah_id = h.id and x.status = 'baru'), 0) as n_baru,
       coalesce((select count(*) from keu_v_pok_banding x where x.unggah_id = h.id and x.status = 'hilang'), 0) as n_hilang,
       coalesce((select count(*) from keu_v_pok_banding x where x.unggah_id = h.id and x.di_luar_usulan), 0) as n_di_luar_usulan,
       (select count(distinct b.ro_kode) from keu_pok_unggah_baris b
         where b.unggah_id = h.id and not exists (select 1 from keu_ro r where r.kode = b.ro_kode)) as n_ro_tak_terdaftar
from keu_pok_unggah h;

-- ---------------------------------------------------------------------
-- 5. Fungsi unggahan POK
-- ---------------------------------------------------------------------
create or replace function keu_pok_unggah_baru(p_tahun int, p_nomor int, p_nama text, p_hash text, p_nomor_pok text,
                                               p_tanggal date, p_jadwal bigint default null, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare vb keu_pok_versi; j keu_revisi_jadwal; v_id bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK (tidak berwenang mengunggah POK)', p_akun using errcode = '42501'; end if;
  select * into vb from keu_pok_versi where tahun = p_tahun and status = 'berlaku';
  if not found then raise exception 'Tahun % belum punya versi POK berlaku sebagai pembanding', p_tahun using errcode = '23514'; end if;
  if p_nomor <= vb.nomor_revisi then
    raise exception 'Nomor revisi % harus lebih besar dari versi berlaku (%)', p_nomor, vb.nomor_revisi using errcode = '23514';
  end if;
  if p_jadwal is not null then
    select * into j from keu_revisi_jadwal where id = p_jadwal;
    if not found then raise exception 'Jadwal % tidak ada', p_jadwal using errcode = 'P0002'; end if;
    if j.tahun <> p_tahun then raise exception 'Jadwal berada pada tahun %, bukan %', j.tahun, p_tahun using errcode = '23514'; end if;
    if j.status not in ('diterapkan','sah') then
      raise exception 'POK hasil revisi diunggah setelah jadwal diterapkan atau sah (status jadwal %)', j.status using errcode = '23514';
    end if;
  end if;
  insert into keu_pok_unggah(tahun, nomor_revisi, jadwal_id, nama_berkas, hash_berkas, nomor_pok, tanggal_efektif, diunggah_oleh)
  values (p_tahun, p_nomor, p_jadwal, p_nama, lower(p_hash), nullif(btrim(coalesce(p_nomor_pok, '')), ''), p_tanggal, p_akun)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function keu_pok_unggah_baru(int, int, text, text, text, date, bigint, bigint) from public, anon, authenticated;

-- isi baris datar (jsonb array berkunci sama dengan kolom keu_pok_unggah_baris); sekali per unggahan
create or replace function keu_pok_unggah_isi(p_unggah bigint, p_baris jsonb, p_akun bigint default keu_akun_sesi())
returns int language plpgsql security definer set search_path = public as $$
declare h keu_pok_unggah; n int;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  select * into h from keu_pok_unggah where id = p_unggah for update;
  if not found then raise exception 'Unggahan % tidak ada', p_unggah using errcode = 'P0002'; end if;
  if h.status <> 'diunggah' then raise exception 'Unggahan berstatus %', h.status using errcode = '23514'; end if;
  if jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    raise exception 'Baris unggahan harus berupa larik JSON tidak kosong' using errcode = '22023';
  end if;
  if exists (select 1 from keu_pok_unggah_baris where unggah_id = p_unggah) then
    raise exception 'Unggahan % sudah berisi baris; tolak lalu unggah ulang bila perlu', p_unggah using errcode = '23514';
  end if;
  insert into keu_pok_unggah_baris(unggah_id, urut, prog_kode, prog_nama, keg_kode, keg_nama, kro_kode, kro_nama,
                                   ro_sub, ro_nama, ro_volume, ro_satuan, komp_kode, komp_nama, sub_kode, sub_nama,
                                   akun_kode, akun_nama, uraian, volume, satuan, harga_satuan, jumlah,
                                   sumber_dana, tanda_blokir, catatan_khusus)
  select p_unggah, x.ordinality::int, x.prog_kode, coalesce(x.prog_nama, ''), x.keg_kode, coalesce(x.keg_nama, ''),
         x.kro_kode, coalesce(x.kro_nama, ''), x.ro_sub, coalesce(x.ro_nama, ''), x.ro_volume, x.ro_satuan,
         x.komp_kode, coalesce(x.komp_nama, ''), x.sub_kode, coalesce(x.sub_nama, ''), x.akun_kode, coalesce(x.akun_nama, ''),
         x.uraian, x.volume, x.satuan, x.harga_satuan, x.jumlah,
         coalesce(x.sumber_dana, 'RM'), coalesce(x.tanda_blokir, false), coalesce(x.catatan_khusus, '')
  from jsonb_populate_recordset(null::keu_pok_unggah_baris, p_baris) with ordinality as x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function keu_pok_unggah_isi(bigint, jsonb, bigint) from public, anon, authenticated;

create or replace function keu_pok_unggah_padankan(p_baris bigint, p_kunci_lama text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare b record; h keu_pok_unggah; vb bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  select k.*, null::text as dummy into b from keu_v_pok_unggah_kunci k where k.id = p_baris;
  if not found then raise exception 'Baris unggahan % tidak ada', p_baris using errcode = 'P0002'; end if;
  select * into h from keu_pok_unggah where id = b.unggah_id;
  if h.status <> 'diunggah' then raise exception 'Unggahan berstatus %', h.status using errcode = '23514'; end if;
  select id into vb from keu_pok_versi where tahun = h.tahun and status = 'berlaku';
  if not exists (select 1 from keu_pok_detail where versi_id = vb and kunci_stabil = p_kunci_lama) then
    raise exception 'Kunci lama % tidak ada pada POK berlaku', p_kunci_lama using errcode = '23514';
  end if;
  if exists (select 1 from keu_pok_detail where versi_id = vb and kunci_stabil = b.kunci) then
    raise exception 'Baris ini sudah cocok otomatis dengan POK berlaku; tidak perlu dipadankan' using errcode = '23514';
  end if;
  if exists (select 1 from keu_v_pok_unggah_kunci k where k.unggah_id = b.unggah_id and k.kunci = p_kunci_lama) then
    raise exception 'Kunci lama % sudah cocok otomatis dengan baris unggahan lain', p_kunci_lama using errcode = '23514';
  end if;
  if exists (select 1 from keu_pok_unggah_padan p join keu_pok_unggah_baris x on x.id = p.baris_id
             where x.unggah_id = b.unggah_id and p.kunci_lama = p_kunci_lama and not p.batal and p.baris_id <> p_baris) then
    raise exception 'Kunci lama % sudah dipadankan dengan baris lain', p_kunci_lama using errcode = '23505';
  end if;
  insert into keu_pok_unggah_padan(baris_id, kunci_lama, batal, dipadankan_oleh, dipadankan_at)
  values (p_baris, p_kunci_lama, false, p_akun, now())
  on conflict (baris_id) do update set kunci_lama = excluded.kunci_lama, batal = false,
                                       dipadankan_oleh = excluded.dipadankan_oleh, dipadankan_at = now();
end $$;
revoke execute on function keu_pok_unggah_padankan(bigint, text, bigint) from public, anon, authenticated;

create or replace function keu_pok_unggah_lepas_padan(p_baris bigint, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  update keu_pok_unggah_padan p set batal = true, dipadankan_oleh = p_akun, dipadankan_at = now()
  where p.baris_id = p_baris
    and exists (select 1 from keu_pok_unggah_baris b join keu_pok_unggah h on h.id = b.unggah_id
                where b.id = p.baris_id and h.status = 'diunggah');
end $$;
revoke execute on function keu_pok_unggah_lepas_padan(bigint, bigint) from public, anon, authenticated;

create or replace function keu_pok_unggah_tolak(p_unggah bigint, p_alasan text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan penolakan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_pok_unggah set status = 'ditolak', alasan_tolak = btrim(p_alasan) where id = p_unggah and status = 'diunggah';
  if not found then
    perform set_config('keu.via_fungsi', '', true);
    raise exception 'Unggahan % tidak ada atau sudah final', p_unggah using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_pok_unggah_tolak(bigint, text, bigint) from public, anon, authenticated;

-- Terima: membangun versi POK dari baris unggahan, membawa nomor item, membuat alias untuk baris yang dipadankan,
-- memberlakukan versi, dan menautkannya ke catatan sah bila ada.
create or replace function keu_pok_unggah_terima(p_unggah bigint, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare h keu_pok_unggah; j keu_revisi_jadwal; vb keu_pok_versi; v bigint; r record; peta jsonb := '{}'::jsonb;
        nid bigint; pid bigint; n_baris int; tot_baru numeric; tot_lama numeric; tak_terdaftar text;
        cacah jsonb := '{}'::jsonb; dasar text; kem int; kunci text; lama text; nomor text; akun_path text; ind text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  select * into h from keu_pok_unggah where id = p_unggah for update;
  if not found then raise exception 'Unggahan % tidak ada', p_unggah using errcode = 'P0002'; end if;
  if h.status <> 'diunggah' then raise exception 'Unggahan berstatus %', h.status using errcode = '23514'; end if;
  select count(*), coalesce(sum(jumlah), 0) into n_baris, tot_baru from keu_pok_unggah_baris where unggah_id = h.id;
  if n_baris = 0 then raise exception 'Unggahan belum berisi baris' using errcode = '23514'; end if;
  select * into vb from keu_pok_versi where tahun = h.tahun and status = 'berlaku';
  if not found then raise exception 'Tidak ada versi POK berlaku' using errcode = '23514'; end if;
  if h.nomor_revisi <= vb.nomor_revisi then
    raise exception 'Nomor revisi % tidak lebih besar dari versi berlaku (%)', h.nomor_revisi, vb.nomor_revisi using errcode = '23514';
  end if;
  if h.jadwal_id is not null then
    select * into j from keu_revisi_jadwal where id = h.jadwal_id;
    if j.jenis in ('pok','administrasi') then
      select coalesce(sum(jumlah), 0) into tot_lama from keu_pok_detail where versi_id = vb.id;
      if tot_baru <> tot_lama then
        raise exception 'Revisi % mempertahankan pagu Satker: total unggahan % tidak sama dengan POK berlaku %', j.jenis, tot_baru, tot_lama
          using errcode = '23514';
      end if;
    end if;
  end if;
  select string_agg(distinct b.ro_kode, ', ') into tak_terdaftar
  from keu_pok_unggah_baris b where b.unggah_id = h.id and not exists (select 1 from keu_ro kr where kr.kode = b.ro_kode);
  if tak_terdaftar is not null then
    raise exception 'RO belum terdaftar di Master RO: %', tak_terdaftar using errcode = '23503';
  end if;

  insert into keu_pok_versi(tahun, nomor_revisi, jenis, nomor_pok, tanggal_efektif, sumber_berkas, hash_berkas, status, diimpor_oleh)
  values (h.tahun, h.nomor_revisi, 'revisi', h.nomor_pok, h.tanggal_efektif, h.nama_berkas, h.hash_berkas, 'draf', p_akun)
  returning id into v;

  -- node (atas ke bawah); jalur diberi awalan tingkat supaya tidak bentrok
  for r in
    with s as (
      select b.*,
             'P=' || b.prog_kode as p1,
             'P=' || b.prog_kode || '/G=' || b.keg_kode as p2,
             'P=' || b.prog_kode || '/G=' || b.keg_kode || '/R=' || b.kro_kode as p3,
             'P=' || b.prog_kode || '/G=' || b.keg_kode || '/R=' || b.kro_kode || '/O=' || b.ro_sub as p4,
             'P=' || b.prog_kode || '/G=' || b.keg_kode || '/R=' || b.kro_kode || '/O=' || b.ro_sub || '/K=' || b.komp_kode as p5
      from keu_pok_unggah_baris b where b.unggah_id = h.id
    ), t as (
      select s.*, case when s.sub_kode is null then null else s.p5 || '/S=' || s.sub_kode end as p6 from s
    ), u as (
      select t.*, coalesce(t.p6, t.p5) || '/A=' || t.akun_kode as p7 from t
    )
    select x.lvl, x.tingkat, x.path, x.kode,
           max(x.nama) as nama, sum(u.jumlah) as pagu,
           max(u.ro_kode) filter (where x.lvl = 4) as ro_kode,
           max(u.ro_volume) filter (where x.lvl = 4) as vol,
           max(u.ro_satuan) filter (where x.lvl = 4) as sat
    from u join lateral (values
      (1, 'program',  u.p1, u.prog_kode, u.prog_nama),
      (2, 'kegiatan', u.p2, u.keg_kode,  u.keg_nama),
      (3, 'kro',      u.p3, u.kro_kode,  u.kro_nama),
      (4, 'ro',       u.p4, u.ro_sub,    u.ro_nama),
      (5, 'komponen', u.p5, u.komp_kode, u.komp_nama),
      (6, 'subkomp',  u.p6, u.sub_kode,  u.sub_nama),
      (7, 'akun',     u.p7, u.akun_kode, u.akun_nama)
    ) as x(lvl, tingkat, path, kode, nama) on x.path is not null
    group by x.lvl, x.tingkat, x.path, x.kode
    order by x.lvl, x.path
  loop
    ind := case when position('/' in r.path) = 0 then null else regexp_replace(r.path, '/[^/]*$', '') end;
    pid := case when ind is null then null else (peta ->> ind)::bigint end;
    insert into keu_pok_node(versi_id, induk_id, tingkat, kode, nama, pagu, ro_kode, volume, satuan)
    values (v, pid, r.tingkat, r.kode, coalesce(nullif(btrim(r.nama), ''), r.kode), r.pagu, r.ro_kode, r.vol, r.sat)
    returning id into nid;
    peta := peta || jsonb_build_object(r.path, nid);
  end loop;

  -- detail
  for r in select b.* from keu_pok_unggah_baris b where b.unggah_id = h.id order by b.urut loop
    dasar := keu_kunci_detail(r.ro_kode, r.komp_kode, r.akun_kode, r.uraian, 1);
    dasar := left(dasar, length(dasar) - 2);
    kem := coalesce((cacah ->> dasar)::int, 0) + 1;
    cacah := cacah || jsonb_build_object(dasar, kem);
    kunci := dasar || '#' || kem;
    select p.kunci_lama into lama from keu_pok_unggah_padan p where p.baris_id = r.id and not p.batal;
    select n.nomor_item into nomor from keu_item_nomor n
      where n.tahun = h.tahun and keu_kunci_resolusi(n.kunci_stabil) = keu_kunci_resolusi(coalesce(lama, kunci));
    akun_path := 'P=' || r.prog_kode || '/G=' || r.keg_kode || '/R=' || r.kro_kode || '/O=' || r.ro_sub || '/K=' || r.komp_kode
                 || case when r.sub_kode is null then '' else '/S=' || r.sub_kode end || '/A=' || r.akun_kode;
    insert into keu_pok_detail(versi_id, akun_node_id, kunci_stabil, kemunculan, nomor_item, uraian, volume, satuan,
                               harga_satuan, jumlah, sumber_dana, tanda_blokir, catatan_khusus)
    values (v, (peta ->> akun_path)::bigint, kunci, kem, nomor, r.uraian, r.volume, r.satuan, r.harga_satuan, r.jumlah,
            r.sumber_dana, r.tanda_blokir, r.catatan_khusus);
    if lama is not null and lama <> kunci then
      insert into keu_kunci_alias(kunci_lama, kunci_baru, versi_id, alasan, dibuat_oleh)
      values (lama, kunci, v, 'Pemadanan unggahan POK ' || h.id, p_akun)
      on conflict (kunci_lama) do nothing;
      update keu_item_nomor set kunci_stabil = kunci where tahun = h.tahun and kunci_stabil = lama;
    end if;
  end loop;

  perform keu_pok_berlakukan(v);

  perform set_config('keu.via_fungsi', '1', true);
  update keu_pok_unggah set status = 'diterima', versi_id = v where id = h.id;
  perform set_config('keu.via_fungsi', '', true);
  if h.jadwal_id is not null then
    update keu_revisi_sah set pok_versi_hasil_id = v where jadwal_id = h.jadwal_id and pok_versi_hasil_id is null;
  end if;
  return v;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_pok_unggah_terima(bigint, bigint) from public, anon, authenticated;

-- Bila jadwal baru dinyatakan sah sesudah POK hasil revisi diterima: tautkan.
create or replace function keu_sah_tautkan_pok(p_jadwal bigint, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'jadwal') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  select versi_id into v from keu_pok_unggah where jadwal_id = p_jadwal and status = 'diterima' order by id desc limit 1;
  if v is null then raise exception 'Belum ada POK hasil revisi yang diterima untuk jadwal %', p_jadwal using errcode = '23514'; end if;
  update keu_revisi_sah set pok_versi_hasil_id = v where jadwal_id = p_jadwal and pok_versi_hasil_id is null;
  return v;
end $$;
revoke execute on function keu_sah_tautkan_pok(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Fungsi unggahan realisasi
--  Kunci JSON tiap item: nomor_item, ro_kode, komponen_kode, akun_kode, uraian,
--  pagu, lock_pagu, real_lalu, real_ini, real_sd, sisa
-- ---------------------------------------------------------------------
create or replace function keu_realisasi_masuk(p_tahun int, p_sampai date, p_nama text, p_hash text, p_item jsonb,
                                               p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare vb bigint; id_u bigint; e jsonb; n int; urut int := 0; dasar text; cacah jsonb := '{}'::jsonb; kem int; kunci text;
        nomor text; ro text; komp text; akun text; ura text; c text; k_nomor text; cocok_n int := 0;
        t_pagu numeric := 0; t_lock numeric := 0; t_sd numeric := 0; pagu numeric; lock_ numeric; lalu numeric; ini numeric; sd numeric; sisa_ numeric;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'realisasi') then raise exception 'Akun % bukan bendahara (tidak berwenang mengunggah realisasi)', p_akun using errcode = '42501'; end if;
  if extract(year from p_sampai) <> p_tahun then raise exception 'Tanggal data % bukan tahun %', p_sampai, p_tahun using errcode = '23514'; end if;
  select id into vb from keu_pok_versi where tahun = p_tahun and status = 'berlaku';
  if vb is null then raise exception 'Tahun % belum punya versi POK berlaku', p_tahun using errcode = '23514'; end if;
  if jsonb_typeof(p_item) <> 'array' or jsonb_array_length(p_item) = 0 then
    raise exception 'Item realisasi harus berupa larik JSON tidak kosong' using errcode = '22023';
  end if;
  -- periksa identitas dan jumlah lebih dahulu (pesan jelas)
  for e in select x from jsonb_array_elements(p_item) x loop
    urut := urut + 1;
    pagu := (e ->> 'pagu')::numeric; lock_ := coalesce((e ->> 'lock_pagu')::numeric, 0);
    lalu := coalesce((e ->> 'real_lalu')::numeric, 0); ini := coalesce((e ->> 'real_ini')::numeric, 0);
    sd := coalesce((e ->> 'real_sd')::numeric, 0); sisa_ := coalesce((e ->> 'sisa')::numeric, 0);
    if abs(sd - (lalu + ini)) > 1 then
      raise exception 'Item % (baris %): s.d. % bukan lalu % + ini %', e ->> 'nomor_item', urut, sd, lalu, ini using errcode = '23514';
    end if;
    if abs(sisa_ - (pagu - lock_ - sd)) > 1 then
      raise exception 'Item % (baris %): sisa % bukan pagu % - lock % - s.d. %', e ->> 'nomor_item', urut, sisa_, pagu, lock_, sd using errcode = '23514';
    end if;
    t_pagu := t_pagu + pagu; t_lock := t_lock + lock_; t_sd := t_sd + sd;
  end loop;
  n := urut; urut := 0;

  insert into keu_realisasi_unggah(tahun, sampai_tanggal, nama_berkas, hash_berkas, pok_versi_id, n_item, total_pagu, total_lock, total_sd, diunggah_oleh)
  values (p_tahun, p_sampai, p_nama, lower(p_hash), vb, n, t_pagu, t_lock, t_sd, p_akun)
  returning id into id_u;

  for e in select x from jsonb_array_elements(p_item) x loop
    urut := urut + 1;
    nomor := e ->> 'nomor_item'; ro := e ->> 'ro_kode'; komp := e ->> 'komponen_kode'; akun := e ->> 'akun_kode'; ura := e ->> 'uraian';
    dasar := keu_kunci_detail(ro, komp, akun, ura, 1); dasar := left(dasar, length(dasar) - 2);
    kem := coalesce((cacah ->> dasar)::int, 0) + 1;
    cacah := cacah || jsonb_build_object(dasar, kem);
    kunci := dasar || '#' || kem;
    c := 'tidak';
    select kunci_stabil into k_nomor from keu_item_nomor where tahun = p_tahun and nomor_item = nomor;
    if k_nomor is not null then
      if exists (select 1 from keu_pok_detail d where d.versi_id = vb and d.kunci_stabil = keu_kunci_resolusi(k_nomor)) then c := 'nomor'; end if;
    elsif exists (select 1 from keu_pok_detail d where d.versi_id = vb and d.kunci_stabil = kunci)
          and not exists (select 1 from keu_item_nomor where tahun = p_tahun and kunci_stabil = kunci) then
      insert into keu_item_nomor(tahun, nomor_item, kunci_stabil, sumber) values (p_tahun, nomor, kunci, 'teks');
      c := 'teks';
    end if;
    if c <> 'tidak' then cocok_n := cocok_n + 1; end if;
    insert into keu_realisasi_item(unggah_id, urut, nomor_item, ro_kode, komponen_kode, akun_kode, uraian,
                                   pagu, lock_pagu, real_lalu, real_ini, real_sd, sisa, cocok)
    values (id_u, urut, nomor, ro, komp, akun, ura, (e ->> 'pagu')::numeric, coalesce((e ->> 'lock_pagu')::numeric, 0),
            coalesce((e ->> 'real_lalu')::numeric, 0), coalesce((e ->> 'real_ini')::numeric, 0),
            coalesce((e ->> 'real_sd')::numeric, 0), coalesce((e ->> 'sisa')::numeric, 0), c);
  end loop;

  insert into keu_laporan_kpa(jenis, rujukan_id, isi)
  values ('realisasi', id_u, jsonb_build_object('sampai_tanggal', p_sampai, 'n_item', n, 'n_cocok', cocok_n,
          'total_pagu', t_pagu, 'total_lock', t_lock, 'total_realisasi', t_sd));
  return id_u;
end $$;
revoke execute on function keu_realisasi_masuk(int, date, text, text, jsonb, bigint) from public, anon, authenticated;

-- pemetaan manual satu item realisasi yang belum cocok ke kunci baris POK berlaku
create or replace function keu_realisasi_padankan(p_item bigint, p_kunci text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare i keu_realisasi_item; u keu_realisasi_unggah; vb bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'realisasi') then raise exception 'Akun % bukan bendahara', p_akun using errcode = '42501'; end if;
  select * into i from keu_realisasi_item where id = p_item;
  if not found then raise exception 'Item realisasi % tidak ada', p_item using errcode = 'P0002'; end if;
  select * into u from keu_realisasi_unggah where id = i.unggah_id;
  select id into vb from keu_pok_versi where tahun = u.tahun and status = 'berlaku';
  if not exists (select 1 from keu_pok_detail where versi_id = vb and kunci_stabil = p_kunci) then
    raise exception 'Kunci % tidak ada pada POK berlaku', p_kunci using errcode = '23514';
  end if;
  if exists (select 1 from keu_item_nomor where tahun = u.tahun and kunci_stabil = p_kunci and nomor_item <> i.nomor_item) then
    raise exception 'Kunci % sudah dipetakan ke nomor item lain', p_kunci using errcode = '23505';
  end if;
  insert into keu_item_nomor(tahun, nomor_item, kunci_stabil, sumber) values (u.tahun, i.nomor_item, p_kunci, 'manual')
  on conflict (tahun, nomor_item) do update set kunci_stabil = excluded.kunci_stabil, sumber = 'manual', dicatat_at = now();
  perform set_config('keu.via_fungsi', '1', true);
  update keu_realisasi_item set cocok = 'manual' where id = p_item;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_realisasi_padankan(bigint, text, bigint) from public, anon, authenticated;

create or replace function keu_realisasi_batalkan(p_unggah bigint, p_alasan text, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'realisasi') then raise exception 'Akun % bukan bendahara', p_akun using errcode = '42501'; end if;
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Alasan pembatalan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_realisasi_unggah set status = 'dibatalkan', alasan_batal = btrim(p_alasan) where id = p_unggah and status = 'diterima';
  if not found then
    perform set_config('keu.via_fungsi', '', true);
    raise exception 'Unggahan realisasi % tidak ada atau sudah dibatalkan', p_unggah using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_realisasi_batalkan(bigint, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. View realisasi, peringatan SPAN, batas realisasi (R-06)
-- ---------------------------------------------------------------------
-- tiap item realisasi (unggahan diterima) dengan baris POK berlaku yang dituju lewat nomor item
create or replace view keu_v_realisasi_item_sekarang with (security_invoker = true) as
select i.id as item_id, i.unggah_id, u.tahun, u.sampai_tanggal, u.bulan, i.urut, i.nomor_item, i.ro_kode, i.komponen_kode, i.akun_kode,
       i.uraian, i.pagu, i.lock_pagu, i.real_lalu, i.real_ini, i.real_sd, i.sisa, i.cocok,
       d.id as detail_id, d.kunci_stabil, d.jumlah as jumlah_pok
from keu_realisasi_item i
join keu_realisasi_unggah u on u.id = i.unggah_id and u.status = 'diterima'
left join keu_item_nomor n on n.tahun = u.tahun and n.nomor_item = i.nomor_item
left join keu_pok_versi v on v.tahun = u.tahun and v.status = 'berlaku'
left join keu_pok_detail d on d.versi_id = v.id and n.kunci_stabil is not null and d.kunci_stabil = keu_kunci_resolusi(n.kunci_stabil);

-- hanya unggahan dengan tanggal data terbaru per tahun
create or replace view keu_v_realisasi_terbaru with (security_invoker = true) as
select s.* from keu_v_realisasi_item_sekarang s
where s.sampai_tanggal = (select max(x.sampai_tanggal) from keu_realisasi_unggah x where x.tahun = s.tahun and x.status = 'diterima');

create or replace view keu_v_realisasi_ro with (security_invoker = true) as
select t.tahun, t.sampai_tanggal, t.ro_kode,
       count(*) as n_item, sum(t.pagu) as pagu, sum(t.lock_pagu) as lock_pagu,
       sum(t.real_lalu) as real_lalu, sum(t.real_ini) as real_ini, sum(t.real_sd) as real_sd, sum(t.sisa) as sisa,
       case when sum(t.pagu) = 0 then null else round(100.0 * sum(t.real_sd) / sum(t.pagu), 2) end as persen
from keu_v_realisasi_terbaru t
group by t.tahun, t.sampai_tanggal, t.ro_kode;

-- realisasi per bulan = 'bulan ini' dari unggahan terakhir pada bulan itu
create or replace view keu_v_realisasi_bulan with (security_invoker = true) as
select distinct on (i.tahun, i.bulan, i.nomor_item)
       i.tahun, i.bulan, i.nomor_item, i.ro_kode, i.detail_id, i.real_ini as realisasi_bulan, i.real_sd, i.sampai_tanggal
from keu_v_realisasi_item_sekarang i
order by i.tahun, i.bulan, i.nomor_item, i.sampai_tanggal desc;

-- Peringatan SPAN: merah = realisasi tanpa RAB / melebihi RAB / jatuh di bulan tak terjadwal; kuning = informasi
create or replace view keu_v_span_peringatan with (security_invoker = true) as
with t as (select max(tahun) as tahun from keu_pok_versi where status = 'berlaku'),
rabsah as (select r.id as rab_id, r.ro_kode from keu_rab r where r.status = 'disetujui'),
rit as (
  select rs.ro_kode, i.id as item_id, d.id as detail_id,
         coalesce((select sum(b.jumlah) from keu_rab_baris b where b.item_id = i.id), 0) as jumlah_rab
  from rabsah rs
  join keu_rab_item i on i.rab_id = rs.rab_id and i.pok_kunci is not null
  join t on true
  join keu_pok_versi v on v.tahun = t.tahun and v.status = 'berlaku'
  join keu_pok_detail d on d.versi_id = v.id and d.kunci_stabil = keu_kunci_resolusi(i.pok_kunci)
)
select 'tanpa_rab'::text as jenis, 'merah'::text as tingkat, r.tahun, r.ro_kode, r.nomor_item, r.detail_id, r.uraian,
       null::smallint as bulan, r.real_sd as nilai, 0::numeric as pembanding,
       'Realisasi tetapi item tidak punya RAB pada RAB sah RO ini'::text as keterangan
from keu_v_realisasi_terbaru r
where r.real_sd > 0 and r.detail_id is not null
  and exists (select 1 from rabsah x where x.ro_kode = split_part(r.kunci_stabil, '/', 1))
  and not exists (select 1 from rit where rit.detail_id = r.detail_id and rit.jumlah_rab > 0)
union all
select 'melebihi_rab', 'merah', r.tahun, r.ro_kode, r.nomor_item, r.detail_id, r.uraian, null, r.real_sd, rit.jumlah_rab,
       'Realisasi s.d. tanggal data melebihi jumlah RAB item'
from keu_v_realisasi_terbaru r join rit on rit.detail_id = r.detail_id
where rit.jumlah_rab > 0 and r.real_sd > rit.jumlah_rab
union all
select 'bulan_tak_terjadwal', 'merah', rb.tahun, rb.ro_kode, rb.nomor_item, rb.detail_id, d.uraian, rb.bulan, rb.realisasi_bulan, 0,
       'Ada realisasi pada bulan yang tidak terjadwal di RAB'
from keu_v_realisasi_bulan rb
join rit on rit.detail_id = rb.detail_id and rit.jumlah_rab > 0
join keu_pok_detail d on d.id = rb.detail_id
where rb.realisasi_bulan > 0
  and coalesce((select sum(j.nilai) from keu_rab_baris b join keu_rab_jadwal j on j.baris_id = b.id
                where b.item_id = rit.item_id and j.bulan = rb.bulan), 0) = 0
union all
select 'ro_tanpa_rab_sah', 'kuning', r.tahun, r.ro_kode, r.nomor_item, r.detail_id, r.uraian, null, r.real_sd, null,
       'RO belum punya RAB sah; realisasi belum dapat diperiksa terhadap RAB'
from keu_v_realisasi_terbaru r
where r.real_sd > 0 and r.detail_id is not null
  and not exists (select 1 from rabsah x where x.ro_kode = split_part(r.kunci_stabil, '/', 1))
union all
select 'tidak_cocok_pok', 'kuning', r.tahun, r.ro_kode, r.nomor_item, null, r.uraian, null, r.pagu, null,
       'Nomor item belum dipadankan dengan baris POK'
from keu_v_realisasi_terbaru r where r.detail_id is null
union all
select 'pagu_beda_pok', 'kuning', r.tahun, r.ro_kode, r.nomor_item, r.detail_id, r.uraian, null, r.pagu, r.jumlah_pok,
       'Pagu pada laporan realisasi tidak sama dengan jumlah di POK sistem'
from keu_v_realisasi_terbaru r where r.detail_id is not null and r.pagu <> r.jumlah_pok;

-- R-06: pagu baris sesudah revisi tidak boleh di bawah realisasi (Booked belum ada sumber datanya)
create or replace view keu_v_kk_r06 with (security_invoker = true) as
select b.jadwal_id, b.id as kk_baris_id, b.ro_kode, b.detail_id, b.uraian_semula, b.jumlah_semula, b.jumlah_menjadi,
       t.real_sd as batas, t.sampai_tanggal, (t.real_sd - b.jumlah_menjadi) as kekurangan
from keu_kk_baris b
join keu_v_realisasi_terbaru t on t.detail_id = b.detail_id
where b.jumlah_menjadi < t.real_sd;

-- ---------------------------------------------------------------------
-- 8. Skor kualitas RAB per RO (RUMUS SEMENTARA - pertanyaan terbuka 5)
--  penarikan : 100 x (1 - jumlah |rencana - realisasi| bulanan / jumlah nilai terbesar) sampai bulan data terakhir
--  volume    : 100 x (1 - jumlah |POK - RAB| / jumlah nilai terbesar) pada item ber-RAB (belum selesai)
--  cakupan   : 100 x jumlah POK item yang punya RAB / jumlah POK RO
--  disiplin  : 100 x (1 - usulan yang tidak disetujui saat jadwal tertutup / seluruh usulan jadwal tertutup)
--  RO tanpa RAB sah: penarikan, volume, cakupan = 0. Komponen tanpa data (null) tidak ikut rata-rata berbobot.
-- ---------------------------------------------------------------------
create or replace view keu_v_skor_ro with (security_invoker = true) as
with t as (select max(tahun) as tahun from keu_pok_versi where status = 'berlaku'),
vb as (select v.id from keu_pok_versi v join t on v.tahun = t.tahun where v.status = 'berlaku'),
mx as (select coalesce(max(u.bulan), 0)::int as m from keu_realisasi_unggah u join t on u.tahun = t.tahun where u.status = 'diterima'),
w as (select * from keu_master_skor where id = 1),
rabsah as (select r.id as rab_id, r.ro_kode from keu_rab r where r.status = 'disetujui'),
ri as (
  select rs.ro_kode, i.selesai, d.jumlah as jumlah_pok,
         coalesce((select sum(b.jumlah) from keu_rab_baris b where b.item_id = i.id), 0) as jumlah_rab
  from rabsah rs
  join keu_rab_item i on i.rab_id = rs.rab_id and i.pok_kunci is not null
  join vb on true
  join keu_pok_detail d on d.versi_id = vb.id and d.kunci_stabil = keu_kunci_resolusi(i.pok_kunci)
),
rencana as (
  select rs.ro_kode, j.bulan, sum(j.nilai) as nilai
  from rabsah rs join keu_rab_item i on i.rab_id = rs.rab_id
  join keu_rab_baris b on b.item_id = i.id join keu_rab_jadwal j on j.baris_id = b.id
  group by rs.ro_kode, j.bulan
),
realb as (
  select b.ro_kode, b.bulan, sum(b.realisasi_bulan) as nilai
  from keu_v_realisasi_bulan b join t on b.tahun = t.tahun group by b.ro_kode, b.bulan
),
tarik as (
  select ro.kode as ro_kode,
         sum(abs(coalesce(p.nilai, 0) - coalesce(a.nilai, 0))) as selisih,
         sum(greatest(coalesce(p.nilai, 0), coalesce(a.nilai, 0))) as terbesar
  from keu_ro ro cross join mx cross join generate_series(1, 12) as m(bulan)
  left join rencana p on p.ro_kode = ro.kode and p.bulan = m.bulan
  left join realb a on a.ro_kode = ro.kode and a.bulan = m.bulan
  where m.bulan <= mx.m
  group by ro.kode
),
vol as (
  select ro_kode, sum(abs(jumlah_pok - jumlah_rab)) as sel, sum(greatest(jumlah_pok, jumlah_rab)) as bsr
  from ri where not selesai and jumlah_rab > 0 group by ro_kode
),
pokro as (
  select split_part(d.kunci_stabil, '/', 1) as ro_kode, sum(d.jumlah) as total
  from keu_pok_detail d join vb on d.versi_id = vb.id group by 1
),
cak as (
  select ro_kode, sum(jumlah_pok) filter (where jumlah_rab > 0) as tercakup from ri group by ro_kode
),
dis as (
  select u.ro_kode, count(*) as n, count(*) filter (where u.status <> 'disetujui') as buruk
  from keu_revisi_usulan u join keu_revisi_jadwal j on j.id = u.jadwal_id join t on j.tahun = t.tahun
  where j.status in ('terkumpul','diterapkan','sah') group by u.ro_kode
),
k as (
  select ro.kode as ro_kode, t.tahun, mx.m as sampai_bulan,
         exists (select 1 from rabsah x where x.ro_kode = ro.kode) as ada_rab_sah,
         case when mx.m = 0 then null
              when not exists (select 1 from rabsah x where x.ro_kode = ro.kode) then 0
              when tr.terbesar is null or tr.terbesar = 0 then 100
              else round(100 * (1 - tr.selisih / tr.terbesar), 1) end as n_penarikan,
         case when not exists (select 1 from rabsah x where x.ro_kode = ro.kode) then 0
              when vo.bsr is null or vo.bsr = 0 then null
              else round(100 * (1 - vo.sel / vo.bsr), 1) end as n_volume,
         case when not exists (select 1 from rabsah x where x.ro_kode = ro.kode) then 0
              when pr.total is null or pr.total = 0 then null
              else round(100.0 * coalesce(ca.tercakup, 0) / pr.total, 1) end as n_cakupan,
         case when di.n is null or di.n = 0 then 100
              else round(100.0 * (1 - di.buruk::numeric / di.n), 1) end as n_disiplin
  from keu_ro ro
  cross join t cross join mx
  left join tarik tr on tr.ro_kode = ro.kode
  left join vol vo on vo.ro_kode = ro.kode
  left join pokro pr on pr.ro_kode = ro.kode
  left join cak ca on ca.ro_kode = ro.kode
  left join dis di on di.ro_kode = ro.kode
  where ro.aktif
), h as (
  select k.*,
    (coalesce(k.n_penarikan * w.bobot_penarikan, 0) + coalesce(k.n_volume * w.bobot_volume, 0)
     + coalesce(k.n_cakupan * w.bobot_cakupan, 0) + coalesce(k.n_disiplin * w.bobot_disiplin, 0)) as num,
    (case when k.n_penarikan is not null then w.bobot_penarikan else 0 end + case when k.n_volume is not null then w.bobot_volume else 0 end
     + case when k.n_cakupan is not null then w.bobot_cakupan else 0 end + case when k.n_disiplin is not null then w.bobot_disiplin else 0 end) as den,
    w.ambang_baik, w.ambang_cukup
  from k cross join w
)
select h.ro_kode, h.tahun, h.sampai_bulan, h.ada_rab_sah, h.n_penarikan, h.n_volume, h.n_cakupan, h.n_disiplin,
       case when h.den = 0 then null else round(h.num / h.den, 1) end as total,
       case when h.den = 0 then null
            when round(h.num / h.den, 1) >= h.ambang_baik then 'Baik'
            when round(h.num / h.den, 1) >= h.ambang_cukup then 'Cukup'
            else 'Perlu pembinaan' end as kategori
from h;
comment on view keu_v_skor_ro is 'Skor pembinaan RAB per RO. RUMUS SEMENTARA; bobot dan ambang dari keu_master_skor.';

-- ---------------------------------------------------------------------
-- 9. Trigger, RLS, hak
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_unggah'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update or delete on keu_pok_unggah for each row execute function keu_pok_unggah_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_pok_unggah for each row execute function keu_jaga('pok_pdf');
    create trigger keu_t9_jejak after insert or update on keu_pok_unggah for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_unggah_baris'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert on keu_pok_unggah_baris for each row execute function keu_pok_unggah_baris_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_pok_unggah_baris for each row execute function keu_jaga('pok_pdf');
    create trigger keu_t2_catat before update or delete on keu_pok_unggah_baris for each row execute function keu_catat_saja();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_unggah_padan'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_pok_unggah_padan for each row execute function keu_jaga('pok_pdf');
    create trigger keu_t9_jejak after insert or update on keu_pok_unggah_padan for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_realisasi_unggah'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update or delete on keu_realisasi_unggah for each row execute function keu_realisasi_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_realisasi_unggah for each row execute function keu_jaga('realisasi');
    create trigger keu_t9_jejak after insert or update on keu_realisasi_unggah for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_realisasi_item'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update or delete on keu_realisasi_item for each row execute function keu_realisasi_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_realisasi_item for each row execute function keu_jaga('realisasi');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_item_nomor'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_item_nomor for each row execute function keu_item_nomor_jaga();
  end if;
end $$;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in
             ('keu_pok_unggah','keu_pok_unggah_baris','keu_pok_unggah_padan','keu_item_nomor','keu_realisasi_unggah','keu_realisasi_item')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_pok_unggah_kunci, keu_v_pok_banding, keu_v_pok_unggah_ringkas, keu_v_realisasi_item_sekarang, keu_v_realisasi_terbaru,
              keu_v_realisasi_ro, keu_v_realisasi_bulan, keu_v_span_peringatan, keu_v_kk_r06, keu_v_skor_ro from anon, authenticated;
grant select on keu_v_pok_unggah_kunci, keu_v_pok_banding, keu_v_pok_unggah_ringkas, keu_v_realisasi_item_sekarang, keu_v_realisasi_terbaru,
                keu_v_realisasi_ro, keu_v_realisasi_bulan, keu_v_span_peringatan, keu_v_kk_r06, keu_v_skor_ro to service_role;
