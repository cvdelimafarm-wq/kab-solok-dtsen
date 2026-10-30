-- =====================================================================
-- 20261024c_keu_pok.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE A3: tahun anggaran dan POK berversi
-- (pohon level + baris detail). Menggantikan bagian POK pada draf
-- 20261022b_keu_anggaran.sql (tidak pernah diterapkan di produksi).
-- Bergantung pada 20261024a (keu_ro, keu_struktur_level, keu_jaga, keu_jejak,
-- keu_boleh) dan sigap_akun. Aman diulang. Tanpa DELETE/DROP.
--
-- Perbaikan terhadap draf lama (celah 1,2,3,4,8 pada spesifikasi):
--  1. node unik per (versi, induk, kode, kemunculan): kode KRO/subkomponen kembar
--     pada POK nyata tidak menolak impor.
--  2. jumlah detail DISIMPAN (bukan volume x harga) + selisih_pembulatan.
--  3. kunci_stabil memuat nomor kemunculan untuk baris kembar; nomor_item resmi
--     (mis. 000252, dari laporan realisasi) disimpan terpisah.
--  4. alias kunci (keu_kunci_alias) + keu_kunci_resolusi() untuk memindahkan
--     acuan kunci setelah POK hasil penetapan diimpor.
--  8. subkomponen: level.tampil=false menyembunyikan dari tampilan, data tetap
--     lengkap (view keu_v_pok_node_tampil).
-- =====================================================================

create table if not exists keu_tahun_anggaran (
  tahun       smallint primary key check (tahun between 2020 and 2100),
  satker_kode text not null default '019979',
  status      text not null default 'susun' check (status in ('susun','berjalan','ditutup')),
  catatan     text not null default '',
  dibuat_at   timestamptz not null default now()
);
comment on table keu_tahun_anggaran is 'Tahun anggaran satker. Satu baris per tahun.';

-- Versi POK (DIPA awal dan tiap revisi resmi). Satu versi berlaku per tahun.
create table if not exists keu_pok_versi (
  id             bigint generated always as identity primary key,
  tahun          smallint not null references keu_tahun_anggaran(tahun),
  nomor_revisi   smallint not null check (nomor_revisi >= 0),
  jenis          text not null check (jenis in ('dipa_awal','revisi')),
  nomor_pok      text,                       -- nomor/tanggal dokumen pada berkas, bila ada
  tanggal_efektif date,
  sumber_berkas  text,
  hash_berkas    text check (hash_berkas is null or hash_berkas ~ '^[0-9a-f]{64}$'),
  status         text not null default 'draf' check (status in ('draf','berlaku','digantikan','dibatalkan')),
  diimpor_oleh   bigint references sigap_akun(id),
  dibuat_at      timestamptz not null default now(),
  diubah_at      timestamptz not null default now(),
  unique (tahun, nomor_revisi),
  check ((jenis = 'dipa_awal') = (nomor_revisi = 0)),
  check (status not in ('berlaku','digantikan') or (tanggal_efektif is not null and hash_berkas is not null))
);
create unique index if not exists keu_pok_versi_satu_berlaku on keu_pok_versi (tahun) where status = 'berlaku';

-- Pohon POK: program > kegiatan > KRO > RO > komponen > [subkomponen] > akun
create table if not exists keu_pok_node (
  id         bigint generated always as identity primary key,
  versi_id   bigint not null references keu_pok_versi(id),
  induk_id   bigint references keu_pok_node(id),
  tingkat    text not null references keu_struktur_level(kode) check (tingkat <> 'item'),
  kode       text not null,
  kemunculan smallint not null default 1 check (kemunculan >= 1),
  nama       text not null,
  pagu       numeric(18,0) not null default 0 check (pagu >= 0),
  ro_kode    text references keu_ro(kode),   -- hanya tingkat ro: kegiatan.KRO.RO
  volume     numeric(14,2) check (volume is null or volume >= 0),   -- volume RO (R-02)
  satuan     text,                           -- satuan RO
  unique nulls not distinct (versi_id, induk_id, kode, kemunculan),
  check ((tingkat = 'program') = (induk_id is null)),
  check ((tingkat = 'ro') = (ro_kode is not null)),
  check (tingkat = 'ro' or (volume is null and satuan is null))
);
create index if not exists keu_pok_node_induk_idx on keu_pok_node (induk_id);
create index if not exists keu_pok_node_versi_tingkat_idx on keu_pok_node (versi_id, tingkat, kode);
create index if not exists keu_pok_node_ro_idx on keu_pok_node (ro_kode) where ro_kode is not null;

-- Baris detail (item). jumlah disimpan apa adanya dari POK.
create table if not exists keu_pok_detail (
  id           bigint generated always as identity primary key,
  versi_id     bigint not null references keu_pok_versi(id),
  akun_node_id bigint not null references keu_pok_node(id),
  kunci_stabil text not null,
  kemunculan   smallint not null default 1 check (kemunculan >= 1),
  nomor_item   text check (nomor_item is null or nomor_item ~ '^[0-9]{3,8}$'),
  uraian       text not null,
  volume       numeric(14,2) not null check (volume >= 0),
  satuan       text not null,
  harga_satuan numeric(18,2) not null check (harga_satuan >= 0),
  jumlah       numeric(18,0) not null check (jumlah >= 0),
  selisih_pembulatan numeric(18,2) generated always as (jumlah - round(volume * harga_satuan)) stored,
  sumber_dana  text not null default 'RM',
  tanda_blokir boolean not null default false,
  catatan_khusus text not null default '',
  unique (versi_id, kunci_stabil)
);
create index if not exists keu_pok_detail_akun_idx on keu_pok_detail (akun_node_id);
create index if not exists keu_pok_detail_nomor_idx on keu_pok_detail (versi_id, nomor_item) where nomor_item is not null;
comment on column keu_pok_detail.kunci_stabil is
  'Kunci baris yang sama lintas versi: ro/komponen/akun/uraian-ternormalisasi#kemunculan (lihat keu_kunci_detail).';
comment on column keu_pok_detail.nomor_item is 'Nomor item resmi (000252) - hanya dikenal dari laporan realisasi.';
comment on column keu_pok_detail.tanda_blokir is 'Catatan khusus/blokir (tanda bintang) pada POK.';

-- kunci baris: normalisasi uraian = huruf kecil, spasi tunggal
create or replace function keu_kunci_detail(p_ro text, p_komponen text, p_akun text, p_uraian text, p_kemunculan int default 1)
returns text language sql immutable as $$
  select p_ro || '/' || coalesce(p_komponen,'') || '/' || p_akun || '/'
         || regexp_replace(lower(btrim(p_uraian)), '\s+', ' ', 'g') || '#' || p_kemunculan
$$;

-- ---------------------------------------------------------------------
-- Alias kunci: memindahkan acuan setelah POK hasil penetapan diimpor
-- ---------------------------------------------------------------------
create table if not exists keu_kunci_alias (
  kunci_lama text primary key,
  kunci_baru text not null,
  versi_id   bigint references keu_pok_versi(id),
  alasan     text not null default '',
  dibuat_oleh bigint references sigap_akun(id),
  dibuat_at  timestamptz not null default now(),
  check (kunci_lama <> kunci_baru)
);
comment on table keu_kunci_alias is 'Kunci lama menunjuk ke kunci baru. Pembaca memakai keu_kunci_resolusi(kunci) agar RAB/kertas kerja lama tetap menemukan barisnya.';

create or replace function keu_kunci_resolusi(p text) returns text
language plpgsql stable as $$
declare v text := p; v2 text; n int := 0;
begin
  loop
    select kunci_baru into v2 from keu_kunci_alias where kunci_lama = v;
    exit when v2 is null;
    v := v2; n := n + 1;
    if n > 20 then raise exception 'Rantai alias kunci terlalu panjang atau berputar: %', p using errcode = '23514'; end if;
  end loop;
  return v;
end $$;

create or replace function keu_kunci_alias_cek() returns trigger
language plpgsql set search_path = public as $$
begin
  if keu_kunci_resolusi(new.kunci_baru) = new.kunci_lama then
    raise exception 'Alias % -> % membentuk putaran.', new.kunci_lama, new.kunci_baru using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Penjaga: hirarki node, kode RO, pembekuan versi
-- ---------------------------------------------------------------------
create or replace function keu_node_cek() returns trigger
language plpgsql set search_path = public as $$
declare v_ind record; v_lvl record; v_keg text; v_ok boolean;
begin
  select * into v_lvl from keu_struktur_level where kode = new.tingkat;
  if v_lvl.format_re is not null and new.kode !~ v_lvl.format_re then
    raise exception 'Kode % tidak sesuai format % (%)', new.kode, new.tingkat, v_lvl.format_ket using errcode = '23514';
  end if;
  if new.induk_id is null then return new; end if;
  select id, versi_id, tingkat, kode, induk_id into v_ind from keu_pok_node where id = new.induk_id;
  if v_ind.versi_id <> new.versi_id then
    raise exception 'Induk berada pada versi POK berbeda' using errcode = '23514';
  end if;
  -- akun boleh langsung di bawah komponen (tanpa subkomponen)
  v_ok := (v_ind.tingkat = v_lvl.induk_kode) or (new.tingkat = 'akun' and v_ind.tingkat = 'komponen');
  if not v_ok then
    raise exception 'Tingkat % tidak boleh berada di bawah %', new.tingkat, v_ind.tingkat using errcode = '23514';
  end if;
  if new.tingkat = 'ro' then
    -- induk = KRO, induk KRO = kegiatan
    select kode into v_keg from keu_pok_node where id = v_ind.induk_id;
    if new.ro_kode is distinct from (v_keg || '.' || v_ind.kode || '.' || new.kode) then
      raise exception 'ro_kode % tidak cocok dengan %.%.%', new.ro_kode, v_keg, v_ind.kode, new.kode using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create or replace function keu_detail_cek() returns trigger
language plpgsql set search_path = public as $$
declare v_n record;
begin
  select versi_id, tingkat into v_n from keu_pok_node where id = new.akun_node_id;
  if v_n.tingkat <> 'akun' then
    raise exception 'Baris detail harus berada di bawah node akun (bukan %)', v_n.tingkat using errcode = '23514';
  end if;
  if v_n.versi_id <> new.versi_id then
    raise exception 'Node akun berada pada versi POK berbeda' using errcode = '23514';
  end if;
  return new;
end $$;

-- versi selain draf tidak boleh diubah isinya
create or replace function keu_beku_versi() returns trigger
language plpgsql set search_path = public as $$
declare v_id bigint := case when tg_op = 'DELETE' then old.versi_id else new.versi_id end; v_st text;
begin
  select status into v_st from keu_pok_versi where id = v_id;
  if v_st <> 'draf' then
    raise exception 'Isi POK versi berstatus % tidak dapat diubah (hanya draf).', v_st using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- status versi: hanya maju (draf -> berlaku -> digantikan; draf -> dibatalkan)
create or replace function keu_versi_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status is distinct from new.status then
    if not ((old.status = 'draf' and new.status in ('berlaku','dibatalkan'))
         or (old.status = 'berlaku' and new.status = 'digantikan')) then
      raise exception 'Perubahan status POK % -> % tidak diizinkan', old.status, new.status using errcode = '23514';
    end if;
  elsif old.status <> 'draf' and (to_jsonb(new) - 'diubah_at') is distinct from (to_jsonb(old) - 'diubah_at') then
    raise exception 'Versi POK berstatus % tidak dapat diubah.', old.status using errcode = '23514';
  end if;
  new.diubah_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- View konsistensi dan tampilan
-- ---------------------------------------------------------------------
-- pagu node harus sama dengan jumlah anak (node non-akun) atau jumlah detail (node akun)
create or replace view keu_v_pok_selisih with (security_invoker = true) as
select n.id as node_id, n.versi_id, n.tingkat, n.kode, n.pagu,
       coalesce(a.jml, 0) as jumlah_bawahan,
       n.pagu - coalesce(a.jml, 0) as selisih
from keu_pok_node n
left join lateral (
  select case when n.tingkat = 'akun'
              then (select sum(d.jumlah) from keu_pok_detail d where d.akun_node_id = n.id)
              else (select sum(k.pagu)   from keu_pok_node k   where k.induk_id = n.id) end as jml
) a on true;
comment on view keu_v_pok_selisih is 'Deteksi POK tak konsisten: selisih harus 0 di semua node. Dicek sebelum versi dijadikan berlaku.';

-- node dengan induk efektif: subkomponen yang disembunyikan dilompati
create or replace view keu_v_pok_node_tampil with (security_invoker = true) as
select n.*,
       case when i.tingkat is not null and not l.tampil then i.induk_id else n.induk_id end as induk_tampil_id,
       lv.tampil as level_tampil
from keu_pok_node n
left join keu_pok_node i on i.id = n.induk_id
left join keu_struktur_level l on l.kode = i.tingkat
join keu_struktur_level lv on lv.kode = n.tingkat;
comment on view keu_v_pok_node_tampil is 'level_tampil=false: baris disembunyikan di tampilan; induk_tampil_id melompati level tersembunyi.';

-- ---------------------------------------------------------------------
-- Memberlakukan versi (definer; hanya server)
-- ---------------------------------------------------------------------
create or replace function keu_pok_berlakukan(p_versi bigint, p_abaikan_selisih boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v record; n_selisih int;
begin
  select * into v from keu_pok_versi where id = p_versi for update;
  if not found then raise exception 'Versi POK % tidak ada', p_versi using errcode = 'P0002'; end if;
  if v.status <> 'draf' then raise exception 'Hanya versi draf yang dapat diberlakukan (status %)', v.status using errcode = '23514'; end if;
  if v.tanggal_efektif is null or v.hash_berkas is null then
    raise exception 'Tanggal efektif dan hash berkas wajib diisi sebelum diberlakukan' using errcode = '23514';
  end if;
  if keu_akun_sesi() is not null and not keu_boleh(keu_akun_sesi(), 'pok_pdf') then
    raise exception 'Akun % tidak berwenang mengunggah/memberlakukan POK', keu_akun_sesi() using errcode = '42501';
  end if;
  select count(*) into n_selisih from keu_v_pok_selisih s where s.versi_id = p_versi and s.selisih <> 0;
  if n_selisih > 0 and not p_abaikan_selisih then
    raise exception '% node POK tidak konsisten (lihat keu_v_pok_selisih)', n_selisih using errcode = '23514';
  end if;
  update keu_pok_versi set status = 'digantikan' where tahun = v.tahun and status = 'berlaku';
  update keu_pok_versi set status = 'berlaku' where id = p_versi;
end $$;
revoke execute on function keu_pok_berlakukan(bigint, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_node'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_pok_node for each row execute function keu_node_cek();
    create trigger keu_t1_beku before insert or update or delete on keu_pok_node for each row execute function keu_beku_versi();
    create trigger keu_t2_jaga before insert or update or delete on keu_pok_node for each row execute function keu_jaga('pok_pdf');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_detail'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_pok_detail for each row execute function keu_detail_cek();
    create trigger keu_t1_beku before insert or update or delete on keu_pok_detail for each row execute function keu_beku_versi();
    create trigger keu_t2_jaga before insert or update or delete on keu_pok_detail for each row execute function keu_jaga('pok_pdf');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_versi'::regclass and tgname = 'keu_t0_status') then
    create trigger keu_t0_status before update on keu_pok_versi for each row execute function keu_versi_status();
    create trigger keu_t2_jaga before insert or update or delete on keu_pok_versi for each row execute function keu_jaga('pok_pdf');
    create trigger keu_t9_jejak after insert or update or delete on keu_pok_versi for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kunci_alias'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_kunci_alias for each row execute function keu_kunci_alias_cek();
    create trigger keu_t2_jaga before insert or update or delete on keu_kunci_alias for each row execute function keu_jaga('pok_pdf');
    create trigger keu_t9_jejak after insert or update or delete on keu_kunci_alias for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_tahun_anggaran'::regclass and tgname = 'keu_t2_jaga') then
    create trigger keu_t2_jaga before insert or update or delete on keu_tahun_anggaran for each row execute function keu_jaga('master');
    create trigger keu_t9_jejak after insert or update or delete on keu_tahun_anggaran for each row execute function keu_jejak();
  end if;
end $$;

insert into keu_tahun_anggaran(tahun, status) values (2026, 'berjalan') on conflict (tahun) do nothing;

-- RLS dan hak
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in
             ('keu_tahun_anggaran','keu_pok_versi','keu_pok_node','keu_pok_detail','keu_kunci_alias')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_pok_selisih, keu_v_pok_node_tampil from anon, authenticated;
grant select on keu_v_pok_selisih, keu_v_pok_node_tampil to service_role;
