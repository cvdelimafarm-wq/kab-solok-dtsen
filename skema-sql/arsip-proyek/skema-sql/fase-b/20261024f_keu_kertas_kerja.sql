-- =====================================================================
-- 20261024f_keu_kertas_kerja.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE B3: baris Semula/Menjadi, pasangan
-- (ganti akun/redaksi), Dana penggenap, buku geseran, keputusan PPK per KRO,
-- kecukupan KRO terhadap RAB, pemeriksaan R-xx, gerbang sebelum diterapkan.
-- Bergantung pada 20261024a, c, d, e. Aman diulang. Tanpa DELETE/DROP.
--
--  D-08 dana hanya bergerak dalam kelompok belanja yang sama (51, 524, 52L, 53)
--  D-09 Dana penggenap per akun 52xxxx dan komponen (pertanyaan terbuka 6); tidak minus
--  D-10 pagu KRO tetap pada Revisi POK; D-11 redaksi POK resmi tidak diedit
--       langsung; D-13 ganti akun/redaksi = pasangan (lama dikosongkan,
--       baru berisi salinan)
--  D-15 PPK memutuskan per KRO: semua, sebagian, tunda
--  D-28 faktor kebutuhan K (0,9) dan toleransi Cukup (5%) ada di Master
--  D-30 tidak ada baris minus
--
-- Catatan: R-02/R-04 (volume RO, sumber dana) belum dihitung di sini; R-06
-- menunggu data realisasi (Fase D); R-10..R-14 bersifat info/lampiran (Fase E).
-- R-17 dipenuhi struktur: jumlah_menjadi >= 0 dan satu penggenap per akun.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parameter Master (D-28)
-- ---------------------------------------------------------------------
create table if not exists keu_master_param (
  kode      text primary key,
  nilai     numeric(8,4) not null,
  ket       text not null default '',
  diubah_at timestamptz not null default now(),
  check (case kode when 'faktor_kebutuhan' then nilai > 0 and nilai <= 1.5
                   when 'toleransi_cukup'  then nilai >= 0 and nilai <= 0.5
                   else true end)
);
comment on table keu_master_param is 'Parameter Master kertas kerja. faktor_kebutuhan: K = RAB belum selesai dibagi faktor; toleransi_cukup: batas atas status Cukup.';
insert into keu_master_param(kode, nilai, ket) values
  ('faktor_kebutuhan', 0.9, 'K = RAB item belum selesai / faktor + RAB item selesai (nilai final menunggu keputusan)'),
  ('toleransi_cukup', 0.05, 'Status Cukup bila POK antara K dan K x (1 + toleransi)')
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- Pembantu
-- ---------------------------------------------------------------------
-- kegiatan.KRO dari kode RO (RO sementara T-nnn tidak punya KRO)
create or replace function keu_ro_kro(p text) returns text
language sql immutable as $$
  select case when p ~ '^[0-9]{4}\.[A-Z]{3}\.[A-Z0-9]{3}$' then substr(p, 1, 8) end
$$;

-- RO, komponen, dan akun dari sebuah baris detail POK (naik lewat induk)
create or replace function keu_pok_detail_jalur(p_detail bigint)
returns table(ro_kode text, komponen_kode text, akun_kode text)
language sql stable set search_path = public as $$
  with recursive naik as (
    select n.id, n.induk_id, n.tingkat, n.kode, n.ro_kode
    from keu_pok_detail d join keu_pok_node n on n.id = d.akun_node_id where d.id = p_detail
    union all
    select p.id, p.induk_id, p.tingkat, p.kode, p.ro_kode
    from naik a join keu_pok_node p on p.id = a.induk_id
  )
  select max(naik.ro_kode) filter (where naik.tingkat = 'ro'),
         max(naik.kode) filter (where naik.tingkat = 'komponen'),
         max(naik.kode) filter (where naik.tingkat = 'akun')
  from naik
$$;

-- ---------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_kk_baris (
  id            bigint generated always as identity primary key,
  jadwal_id     bigint not null references keu_revisi_jadwal(id),
  ro_kode       text   not null references keu_ro(kode),
  detail_id     bigint references keu_pok_detail(id),      -- baris POK semula; null = baris baru
  pok_kunci     text,
  komponen_kode text   not null check (komponen_kode ~ '^[0-9A-Z]{2,4}$'),
  akun_semula   text,
  akun_menjadi  text   not null check (akun_menjadi ~ '^[0-9]{6}$'),
  uraian_semula text,
  uraian_menjadi text,
  vol_semula    numeric(14,2) not null default 0,
  vol_menjadi   numeric(14,2) check (vol_menjadi >= 0),
  sat_semula    text,
  sat_menjadi   text,
  harga_semula  numeric(18,2) not null default 0,
  harga_menjadi numeric(18,2) check (harga_menjadi >= 0),
  jumlah_semula numeric(18,0) not null default 0,
  jumlah_menjadi numeric(18,0) check (jumlah_menjadi >= 0),
  selisih       numeric(18,0) generated always as (jumlah_menjadi - jumlah_semula) stored,
  pindah_dari   bigint references keu_kk_baris(id),        -- baris baru hasil pasangan; pindah_ke dihitung di view
  penggenap     boolean not null default false,
  prioritas_kode text references keu_master_prioritas(kode),
  rab_item_id   bigint references keu_rab_item(id),
  catatan       text not null default '',
  urut          int  not null default 0,
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  check ((detail_id is not null) = (pok_kunci is not null)),
  check (detail_id is null or pindah_dari is null),
  check (not penggenap or (detail_id is null and pindah_dari is null)),
  check (uraian_menjadi is null or length(btrim(uraian_menjadi)) >= 3),
  unique (jadwal_id, detail_id)
);
create unique index if not exists keu_kk_baris_pasangan_uq on keu_kk_baris(pindah_dari) where pindah_dari is not null;
create unique index if not exists keu_kk_baris_penggenap_uq on keu_kk_baris(jadwal_id, ro_kode, komponen_kode, akun_menjadi) where penggenap;
create index if not exists keu_kk_baris_jadwal_ro_idx on keu_kk_baris(jadwal_id, ro_kode);
create index if not exists keu_kk_baris_rab_idx on keu_kk_baris(rab_item_id) where rab_item_id is not null;
comment on table keu_kk_baris is 'Kertas kerja Semula/Menjadi per jadwal dan RO. Kolom semula berasal dari POK berlaku dan tidak dapat diubah.';

-- Buku geseran: siapa membiayai siapa (catatan; angka sebenarnya ada di baris)
create table if not exists keu_kk_geseran (
  id           bigint generated always as identity primary key,
  jadwal_id    bigint not null references keu_revisi_jadwal(id),
  donor_id     bigint not null references keu_kk_baris(id),
  penerima_id  bigint not null references keu_kk_baris(id),
  jumlah       numeric(18,0) not null check (jumlah > 0),
  catatan      text not null default '',
  dibuat_oleh  bigint not null references sigap_akun(id),
  dibuat_at    timestamptz not null default now(),
  batal        boolean not null default false,
  batal_oleh   bigint references sigap_akun(id),
  batal_at     timestamptz,
  check (donor_id <> penerima_id),
  check (batal = (batal_at is not null))
);
create index if not exists keu_kk_geseran_jadwal_idx on keu_kk_geseran(jadwal_id);

-- Keputusan PPK atas kekurangan per KRO (D-15)
create table if not exists keu_kk_keputusan_kro (
  id             bigint generated always as identity primary key,
  jadwal_id      bigint not null references keu_revisi_jadwal(id),
  kro            text   not null check (kro ~ '^[0-9]{4}\.[A-Z]{3}$'),
  keputusan      text   not null check (keputusan in ('semua','sebagian','tunda')),
  jumlah         numeric(18,0),
  catatan        text   not null default '',
  diputuskan_oleh bigint not null references sigap_akun(id),
  diputuskan_at  timestamptz not null default now(),
  diubah_at      timestamptz not null default now(),
  unique (jadwal_id, kro),
  check ((keputusan = 'sebagian') = (jumlah is not null and jumlah > 0))
);

-- ---------------------------------------------------------------------
-- Izin ubah kertas kerja: ok | jadwal | tutup | hak | usulan
-- ---------------------------------------------------------------------
create or replace function keu_kk_izin(p_akun bigint, p_ro text, p_jadwal bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_st text; v_us text;
begin
  select status into v_st from keu_revisi_jadwal where id = p_jadwal;
  if v_st is null or v_st not in ('dibuka','terkumpul') then return 'jadwal'; end if;
  if p_akun is null then return 'ok'; end if;
  if keu_boleh(p_akun, 'sahkan') then return 'ok'; end if;
  if not (keu_boleh(p_akun, 'rab', p_ro) or keu_boleh(p_akun, 'draf', p_ro)) then return 'hak'; end if;
  if v_st <> 'dibuka' then return 'tutup'; end if;
  select status into v_us from keu_revisi_usulan where jadwal_id = p_jadwal and ro_kode = p_ro;
  if v_us in ('menunggu_ketua','menunggu_ppk','disetujui') then return 'usulan'; end if;
  return 'ok';
end $$;
revoke execute on function keu_kk_izin(bigint, text, bigint) from public, anon, authenticated;

create or replace function keu_kk_tolak(p_alasan text, p_ro text) returns void
language plpgsql set search_path = public as $$
begin
  if p_alasan = 'jadwal' then
    raise exception 'Kertas kerja hanya dapat diubah saat jadwal dibuka atau terkumpul.' using errcode = '23514';
  elsif p_alasan = 'tutup' then
    raise exception 'Jendela usulan sudah ditutup; hanya PPK yang dapat mengubah kertas kerja.' using errcode = '42501';
  elsif p_alasan = 'hak' then
    raise exception 'Akun tidak berwenang mengubah kertas kerja RO %.', p_ro using errcode = '42501';
  elsif p_alasan = 'usulan' then
    raise exception 'Usulan RO % sedang diproses atau sudah disetujui; kertas kerja terkunci.', p_ro using errcode = '23514';
  end if;
end $$;
revoke execute on function keu_kk_tolak(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Penjaga dan pengisi baris
-- ---------------------------------------------------------------------
create or replace function keu_kk_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_akun bigint := keu_akun_sesi(); v_jid bigint; v_ro text; v_izin text;
begin
  v_jid := case when tg_op = 'DELETE' then old.jadwal_id else new.jadwal_id end;
  v_ro  := case when tg_op = 'DELETE' then old.ro_kode   else new.ro_kode   end;
  if tg_op = 'DELETE' and v_akun is not null and coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
    raise exception 'Baris kertas kerja dihapus lewat keu_kk_hapus_baris().' using errcode = '42501';
  end if;
  -- baris baru yang ro_kode-nya diisi dari detail: izin dicek pada keu_kk_sebelum (setelah ro_kode terisi)
  if tg_op = 'INSERT' and v_ro is null then return new; end if;
  v_izin := keu_kk_izin(v_akun, v_ro, v_jid);
  if v_izin <> 'ok' then perform keu_kk_tolak(v_izin, v_ro); end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function keu_kk_jaga() from public, anon, authenticated;

create or replace function keu_kk_sebelum() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j keu_revisi_jadwal; d keu_pok_detail; jl record; a keu_kk_baris;
  v_berlaku bigint; v_sat text; v_izin text; v_akun bigint := keu_akun_sesi();
begin
  select * into j from keu_revisi_jadwal where id = new.jadwal_id;
  select id into v_berlaku from keu_pok_versi where tahun = j.tahun and status = 'berlaku';

  if tg_op = 'UPDATE' then
    if new.jadwal_id <> old.jadwal_id or new.ro_kode <> old.ro_kode or new.detail_id is distinct from old.detail_id
       or new.pok_kunci is distinct from old.pok_kunci or new.komponen_kode <> old.komponen_kode
       or new.pindah_dari is distinct from old.pindah_dari or new.penggenap <> old.penggenap
       or new.akun_semula is distinct from old.akun_semula or new.uraian_semula is distinct from old.uraian_semula
       or new.vol_semula <> old.vol_semula or new.sat_semula is distinct from old.sat_semula
       or new.harga_semula <> old.harga_semula or new.jumlah_semula <> old.jumlah_semula then
      raise exception 'Kolom identitas dan kolom Semula tidak dapat diubah.' using errcode = '23514';
    end if;
  end if;

  if new.detail_id is not null then
    -- ---- baris POK semula
    if tg_op = 'INSERT' then
      select * into d from keu_pok_detail where id = new.detail_id;
      if not found then raise exception 'Detail POK % tidak ada.', new.detail_id using errcode = '23503'; end if;
      if d.versi_id is distinct from v_berlaku then
        raise exception 'Detail POK bukan dari versi POK yang berlaku saat ini.' using errcode = '23514';
      end if;
      select * into jl from keu_pok_detail_jalur(new.detail_id);
      if new.ro_kode is not null and new.ro_kode <> jl.ro_kode then
        raise exception 'RO % tidak sesuai dengan detail POK (RO %).', new.ro_kode, jl.ro_kode using errcode = '23514';
      end if;
      new.ro_kode := jl.ro_kode; new.komponen_kode := jl.komponen_kode; new.akun_semula := jl.akun_kode;
      new.pok_kunci := d.kunci_stabil; new.uraian_semula := d.uraian; new.vol_semula := d.volume;
      new.sat_semula := d.satuan; new.harga_semula := d.harga_satuan; new.jumlah_semula := d.jumlah;
      new.akun_menjadi := coalesce(new.akun_menjadi, jl.akun_kode);
      new.uraian_menjadi := coalesce(new.uraian_menjadi, d.uraian);
      new.vol_menjadi := coalesce(new.vol_menjadi, d.volume);
      new.sat_menjadi := coalesce(new.sat_menjadi, d.satuan);
      new.harga_menjadi := coalesce(new.harga_menjadi, d.harga_satuan);
      if new.rab_item_id is null then
        select i.id into new.rab_item_id
        from keu_rab r join keu_rab_item i on i.rab_id = r.id
        where r.ro_kode = new.ro_kode and r.status = 'disetujui'
          and keu_kunci_resolusi(i.pok_kunci) = keu_kunci_resolusi(d.kunci_stabil)
        limit 1;
      end if;
      v_izin := keu_kk_izin(v_akun, new.ro_kode, new.jadwal_id);
      if v_izin <> 'ok' then perform keu_kk_tolak(v_izin, new.ro_kode); end if;
    end if;
    if new.akun_menjadi <> new.akun_semula or new.uraian_menjadi <> new.uraian_semula or new.sat_menjadi <> new.sat_semula then
      raise exception 'Akun, redaksi, dan satuan item POK resmi tidak diedit langsung; gunakan pasangan (keu_kk_pasangkan).' using errcode = '23514';
    end if;
    new.jumlah_menjadi := case when new.vol_menjadi = new.vol_semula and new.harga_menjadi = new.harga_semula
                               then new.jumlah_semula else round(new.vol_menjadi * new.harga_menjadi) end;
  else
    -- ---- baris baru (item baru, penggenap, atau pasangan)
    new.vol_menjadi := coalesce(new.vol_menjadi, 0);
    new.harga_menjadi := coalesce(new.harga_menjadi, 0);
    if tg_op = 'INSERT' then
      new.akun_semula := null; new.uraian_semula := null; new.sat_semula := null;
      new.vol_semula := 0; new.harga_semula := 0; new.jumlah_semula := 0;
      if new.uraian_menjadi is null then
        raise exception 'Uraian item baru wajib diisi.' using errcode = '23514';
      end if;
    end if;
    if tg_op = 'INSERT' or new.akun_menjadi is distinct from old.akun_menjadi then
      if not exists (select 1 from keu_master_akun where kode = new.akun_menjadi and aktif) then
        raise exception 'Akun % tidak ada di Master akun (atau tidak aktif).', new.akun_menjadi using errcode = '23514';
      end if;
    end if;
    if new.penggenap and new.akun_menjadi not like '52%' then
      raise exception 'Dana penggenap hanya untuk akun 52xxxx (D-09).' using errcode = '23514';
    end if;
    if new.pindah_dari is not null then
      select * into a from keu_kk_baris where id = new.pindah_dari;
      if not found or a.jadwal_id <> new.jadwal_id or a.ro_kode <> new.ro_kode
         or a.komponen_kode <> new.komponen_kode or a.detail_id is null then
        raise exception 'Pasangan harus berasal dari baris POK semula pada jadwal, RO, dan komponen yang sama.' using errcode = '23514';
      end if;
      if tg_op = 'INSERT' and new.rab_item_id is null then new.rab_item_id := a.rab_item_id; end if;
    end if;
    -- satuan baku (D-19); pasangan boleh membawa satuan lama
    if new.sat_menjadi is null then
      raise exception 'Satuan wajib diisi.' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' or new.sat_menjadi is distinct from old.sat_menjadi then
      v_sat := coalesce(keu_satuan_baku(new.sat_menjadi), (select kode from keu_master_satuan where kode = upper(btrim(new.sat_menjadi))));
      if v_sat is not null then
        new.sat_menjadi := v_sat;
      elsif not (new.pindah_dari is not null and new.sat_menjadi = a.sat_semula) then
        raise exception 'Satuan % bukan satuan baku (lihat Master satuan).', new.sat_menjadi using errcode = '23514';
      end if;
    end if;
    if tg_op = 'INSERT' then
      -- komponen harus sudah ada pada RO yang ada di POK berlaku (komponen baru lewat Struktur Usulan)
      if exists (select 1 from keu_pok_node n where n.versi_id = v_berlaku and n.tingkat = 'ro' and n.ro_kode = new.ro_kode)
         and not exists (select 1 from keu_pok_node ro join keu_pok_node k on k.induk_id = ro.id
                         where ro.versi_id = v_berlaku and ro.tingkat = 'ro' and ro.ro_kode = new.ro_kode
                           and k.tingkat = 'komponen' and k.kode = new.komponen_kode) then
        raise exception 'Komponen % belum ada pada RO % (komponen baru melalui Struktur Usulan).', new.komponen_kode, new.ro_kode using errcode = '23514';
      end if;
      v_izin := keu_kk_izin(v_akun, new.ro_kode, new.jadwal_id);
      if v_izin <> 'ok' then perform keu_kk_tolak(v_izin, new.ro_kode); end if;
    end if;
    if new.rab_item_id is not null and (tg_op = 'INSERT' or new.rab_item_id is distinct from old.rab_item_id) then
      if not exists (select 1 from keu_rab_item i join keu_rab r on r.id = i.rab_id
                     where i.id = new.rab_item_id and r.ro_kode = new.ro_kode and r.status = 'disetujui') then
        raise exception 'Item RAB harus berasal dari RAB disetujui RO %.', new.ro_kode using errcode = '23514';
      end if;
    end if;
    new.jumlah_menjadi := round(new.vol_menjadi * new.harga_menjadi);
  end if;
  new.diubah_at := now();
  return new;
end $$;
revoke execute on function keu_kk_sebelum() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Fungsi kerja
-- ---------------------------------------------------------------------
-- salin seluruh baris POK berlaku sebuah RO ke kertas kerja (idempoten)
create or replace function keu_kk_muat_ro(p_jadwal bigint, p_ro text) returns int
language plpgsql set search_path = public as $$
declare v_tahun smallint; v_ver bigint; n int := 0; r record;
begin
  select tahun into v_tahun from keu_revisi_jadwal where id = p_jadwal;
  if not found then raise exception 'Jadwal % tidak ada', p_jadwal using errcode = 'P0002'; end if;
  select id into v_ver from keu_pok_versi where tahun = v_tahun and status = 'berlaku';
  if v_ver is null then raise exception 'Belum ada POK berlaku untuk tahun %', v_tahun using errcode = '23514'; end if;
  for r in
    with recursive turun as (
      select id from keu_pok_node where versi_id = v_ver and ro_kode = p_ro
      union all
      select n.id from keu_pok_node n join turun t on n.induk_id = t.id
    )
    select d.id from keu_pok_detail d
    where d.versi_id = v_ver and d.akun_node_id in (select id from turun)
      and not exists (select 1 from keu_kk_baris b where b.jadwal_id = p_jadwal and b.detail_id = d.id)
    order by d.id
  loop
    insert into keu_kk_baris(jadwal_id, detail_id, urut) values (p_jadwal, r.id, n + 1);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function keu_kk_muat_ro(bigint, text) from public, anon, authenticated;

-- ganti akun dan/atau redaksi: lama dikurangi (atau dikosongkan), baru berisi salinan
create or replace function keu_kk_pasangkan(p_lama bigint, p_akun_baru text default null, p_uraian_baru text default null, p_vol numeric default null)
returns bigint language plpgsql set search_path = public as $$
declare a keu_kk_baris; v numeric; na text; nu text; v_id bigint;
begin
  select * into a from keu_kk_baris where id = p_lama for update;
  if not found then raise exception 'Baris % tidak ada', p_lama using errcode = 'P0002'; end if;
  if a.detail_id is null then
    raise exception 'Pasangan hanya untuk baris POK semula.' using errcode = '23514';
  end if;
  if exists (select 1 from keu_kk_baris where pindah_dari = a.id) then
    raise exception 'Baris ini sudah punya pasangan; batalkan pasangan lama lebih dahulu.' using errcode = '23514';
  end if;
  v := coalesce(p_vol, a.vol_menjadi);
  if v <= 0 or v > a.vol_menjadi then
    raise exception 'Volume yang dipindah harus lebih dari 0 dan paling banyak %.', a.vol_menjadi using errcode = '23514';
  end if;
  na := coalesce(nullif(btrim(p_akun_baru), ''), a.akun_menjadi);
  nu := coalesce(nullif(btrim(p_uraian_baru), ''), a.uraian_menjadi);
  if na = a.akun_semula and nu = a.uraian_semula then
    raise exception 'Akun atau redaksi harus berbeda dari yang semula.' using errcode = '23514';
  end if;
  insert into keu_kk_baris(jadwal_id, ro_kode, komponen_kode, akun_menjadi, uraian_menjadi, vol_menjadi, sat_menjadi, harga_menjadi,
                           pindah_dari, prioritas_kode, rab_item_id, urut)
  values (a.jadwal_id, a.ro_kode, a.komponen_kode, na, nu, v, a.sat_menjadi, a.harga_menjadi, a.id, a.prioritas_kode, a.rab_item_id, a.urut)
  returning id into v_id;
  update keu_kk_baris set vol_menjadi = a.vol_menjadi - v where id = a.id;
  return v_id;
end $$;
revoke execute on function keu_kk_pasangkan(bigint, text, text, numeric) from public, anon, authenticated;

-- hapus baris baru (item baru, penggenap, atau pasangan: volume dikembalikan ke baris lama)
create or replace function keu_kk_hapus_baris(p_baris bigint) returns void
language plpgsql set search_path = public as $$
declare b keu_kk_baris;
begin
  select * into b from keu_kk_baris where id = p_baris for update;
  if not found then raise exception 'Baris % tidak ada', p_baris using errcode = 'P0002'; end if;
  if b.detail_id is not null then
    raise exception 'Baris POK semula tidak dapat dihapus; kosongkan volumenya (P-05/P-07) atau batalkan pasangannya.' using errcode = '23514';
  end if;
  if exists (select 1 from keu_kk_geseran g where (g.donor_id = b.id or g.penerima_id = b.id) and not g.batal) then
    raise exception 'Baris masih tercatat di buku geseran; batalkan geseran lebih dahulu.' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  delete from keu_kk_baris where id = b.id;
  if b.pindah_dari is not null then
    update keu_kk_baris set vol_menjadi = vol_menjadi + b.vol_menjadi where id = b.pindah_dari;
  end if;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kk_hapus_baris(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Geseran: penjaga
-- ---------------------------------------------------------------------
create or replace function keu_kk_geseran_cek() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_akun bigint := keu_akun_sesi(); d keu_kk_baris; p keu_kk_baris; v_izin text; v_ro text;
begin
  if tg_op = 'INSERT' then
    select * into d from keu_kk_baris where id = new.donor_id;
    select * into p from keu_kk_baris where id = new.penerima_id;
    if d.jadwal_id <> new.jadwal_id or p.jadwal_id <> new.jadwal_id then
      raise exception 'Donor dan penerima harus berada pada jadwal yang sama.' using errcode = '23514';
    end if;
    if keu_kelompok_akun(d.akun_menjadi) is distinct from keu_kelompok_akun(p.akun_menjadi) then
      raise exception 'Geseran hanya dalam kelompok belanja yang sama (D-08): % -> %.',
        keu_kelompok_akun(d.akun_menjadi), keu_kelompok_akun(p.akun_menjadi) using errcode = '23514';
    end if;
    v_ro := d.ro_kode;
    v_izin := keu_kk_izin(v_akun, v_ro, new.jadwal_id);
    if v_izin = 'ok' and p.ro_kode <> d.ro_kode then v_ro := p.ro_kode; v_izin := keu_kk_izin(v_akun, v_ro, new.jadwal_id); end if;
    if v_izin <> 'ok' then perform keu_kk_tolak(v_izin, v_ro); end if;
    if new.batal then raise exception 'Geseran baru tidak boleh langsung dibatalkan.' using errcode = '23514'; end if;
    new.dibuat_oleh := coalesce(v_akun, new.dibuat_oleh);
    if new.dibuat_oleh is null then raise exception 'Pencatat geseran wajib diketahui.' using errcode = '23514'; end if;
  else
    if new.jadwal_id <> old.jadwal_id or new.donor_id <> old.donor_id or new.penerima_id <> old.penerima_id
       or new.jumlah <> old.jumlah or new.catatan <> old.catatan or new.dibuat_oleh <> old.dibuat_oleh then
      raise exception 'Geseran tidak dapat diubah; batalkan lalu catat ulang.' using errcode = '23514';
    end if;
    if old.batal and not new.batal then raise exception 'Geseran yang dibatalkan tidak dapat dipulihkan.' using errcode = '23514'; end if;
    if new.batal and not old.batal then
      select * into d from keu_kk_baris where id = new.donor_id;
      v_izin := keu_kk_izin(v_akun, d.ro_kode, new.jadwal_id);
      if v_izin <> 'ok' then perform keu_kk_tolak(v_izin, d.ro_kode); end if;
      new.batal_oleh := coalesce(v_akun, new.batal_oleh);
      new.batal_at := now();
    end if;
  end if;
  return new;
end $$;
revoke execute on function keu_kk_geseran_cek() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Keputusan PPK per KRO: penjaga dan fungsi
-- ---------------------------------------------------------------------
create or replace function keu_kk_keputusan_cek() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_akun bigint := keu_akun_sesi(); v_st text; v_kurang numeric;
begin
  select status into v_st from keu_revisi_jadwal where id = new.jadwal_id;
  if v_st is null or v_st not in ('dibuka','terkumpul') then
    raise exception 'Keputusan hanya dapat dicatat saat jadwal dibuka atau terkumpul.' using errcode = '23514';
  end if;
  new.diputuskan_oleh := coalesce(v_akun, new.diputuskan_oleh);
  new.diputuskan_at := now(); new.diubah_at := now();
  if new.keputusan in ('semua','sebagian') then
    select coalesce(sum(kurang), 0) into v_kurang from keu_v_kk_kecukupan where jadwal_id = new.jadwal_id and kro = new.kro;
    if v_kurang <= 0 then
      raise exception 'KRO % tidak memiliki kekurangan terhadap RAB; tidak ada yang perlu diterima.', new.kro using errcode = '23514';
    end if;
    if new.keputusan = 'sebagian' and new.jumlah > v_kurang then
      raise exception 'Jumlah diterima (%) melebihi kekurangan KRO % (%).', new.jumlah, new.kro, v_kurang using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function keu_kk_keputusan_cek() from public, anon, authenticated;

create or replace function keu_kk_putuskan(p_jadwal bigint, p_kro text, p_keputusan text, p_jumlah numeric default null, p_catatan text default '')
returns bigint language plpgsql set search_path = public as $$
declare v_id bigint; v_akun bigint := keu_akun_sesi();
begin
  if v_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  insert into keu_kk_keputusan_kro(jadwal_id, kro, keputusan, jumlah, catatan, diputuskan_oleh)
  values (p_jadwal, p_kro, p_keputusan, p_jumlah, coalesce(p_catatan, ''), v_akun)
  on conflict (jadwal_id, kro) do update
    set keputusan = excluded.keputusan, jumlah = excluded.jumlah, catatan = excluded.catatan
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function keu_kk_putuskan(bigint, text, text, numeric, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pemicu P-01..P-08 (sama dengan mockup)
-- ---------------------------------------------------------------------
create or replace function keu_kk_pemicu_pasangan(a keu_kk_baris, b keu_kk_baris) returns text
language plpgsql immutable as $$
declare beda int := 0; k text := 'P-03';
begin
  if not (abs(b.vol_menjadi + a.vol_menjadi - a.vol_semula) < 0.001 and b.harga_menjadi = a.harga_semula) then beda := beda + 1; k := 'P-01'; end if;
  if b.uraian_menjadi is distinct from a.uraian_semula then beda := beda + 1; k := 'P-02'; end if;
  if a.akun_semula is distinct from b.akun_menjadi then beda := beda + 1; k := 'P-03'; end if;
  return case when beda <= 1 then k else 'P-08' end;
end $$;

create or replace view keu_v_kk_baris with (security_invoker = true) as
select b.id, b.jadwal_id, b.ro_kode, keu_ro_kro(b.ro_kode) as kro, b.detail_id, b.pok_kunci, b.komponen_kode,
       b.akun_semula, b.akun_menjadi, b.uraian_semula, b.uraian_menjadi,
       b.vol_semula, b.vol_menjadi, b.sat_semula, b.sat_menjadi, b.harga_semula, b.harga_menjadi,
       b.jumlah_semula, b.jumlah_menjadi, b.selisih, b.pindah_dari, p.id as pindah_ke, b.penggenap,
       (b.detail_id is null) as baru, b.prioritas_kode, b.rab_item_id, b.catatan, b.urut,
       case
         when b.penggenap then null
         when p.id is not null then keu_kk_pemicu_pasangan(b, p)
         when b.pindah_dari is not null then keu_kk_pemicu_pasangan(a, b)
         when b.detail_id is null then
           case when exists (select 1 from keu_kk_baris x
                             where x.jadwal_id = b.jadwal_id and x.ro_kode = b.ro_kode and x.komponen_kode = b.komponen_kode
                               and x.detail_id is not null and x.akun_semula = b.akun_menjadi)
                then 'P-06' else 'P-04' end
         when b.jumlah_menjadi = 0 and b.jumlah_semula > 0 then
           case when exists (select 1 from keu_kk_baris x
                             where x.id <> b.id and x.jadwal_id = b.jadwal_id and x.ro_kode = b.ro_kode
                               and x.komponen_kode = b.komponen_kode and x.detail_id is not null
                               and x.akun_semula = b.akun_semula and x.jumlah_menjadi > 0)
                then 'P-07' else 'P-05' end
         when b.vol_menjadi <> b.vol_semula or b.harga_menjadi <> b.harga_semula then 'P-01'
       end as pemicu
from keu_kk_baris b
left join keu_kk_baris p on p.pindah_dari = b.id
left join keu_kk_baris a on a.id = b.pindah_dari;

-- ringkasan per jadwal dan RO
create or replace view keu_v_kk_ringkas with (security_invoker = true) as
select v.jadwal_id, v.ro_kode, v.kro,
       sum(v.jumlah_semula) as total_semula, sum(v.jumlah_menjadi) as total_menjadi, sum(v.selisih) as selisih,
       count(*) filter (where v.pemicu is not null) as n_berubah,
       count(*) filter (where v.baru and not v.penggenap and v.pindah_dari is null) as n_baru,
       count(*) filter (where v.penggenap) as n_penggenap,
       coalesce(sum(v.jumlah_menjadi) filter (where v.penggenap), 0) as total_penggenap
from keu_v_kk_baris v
group by v.jadwal_id, v.ro_kode, v.kro;

-- ---------------------------------------------------------------------
-- Kecukupan KRO terhadap RAB (D-28)
-- ---------------------------------------------------------------------
create or replace view keu_v_kk_kecukupan_item with (security_invoker = true) as
select b.jadwal_id, b.ro_kode, keu_ro_kro(b.ro_kode) as kro, v.item_id, v.rab_id,
       v.akun_menjadi as akun_kode, keu_kelompok_akun(v.akun_menjadi) as kelompok,
       v.selesai, v.jumlah_rab, sum(b.jumlah_menjadi) as jumlah_pok
from keu_kk_baris b
join keu_v_rab_item v on v.item_id = b.rab_item_id and v.status <> 'belum'
group by b.jadwal_id, b.ro_kode, v.item_id, v.rab_id, v.akun_menjadi, v.selesai, v.jumlah_rab;

create or replace view keu_v_kk_kecukupan with (security_invoker = true) as
with prm as (
  select coalesce(max(nilai) filter (where kode = 'faktor_kebutuhan'), 0.9) as f,
         coalesce(max(nilai) filter (where kode = 'toleransi_cukup'), 0.05) as t
  from keu_master_param
), g as (
  select i.jadwal_id, i.kro, i.kelompok,
         sum(i.jumlah_rab) as rab, sum(i.jumlah_pok) as pok,
         round(sum(case when i.selesai then i.jumlah_rab else i.jumlah_rab / prm.f end)) as k,
         count(*) as n_item
  from keu_v_kk_kecukupan_item i cross join prm
  where i.kro is not null
  group by i.jadwal_id, i.kro, i.kelompok
)
select g.jadwal_id, g.kro, g.kelompok, g.n_item, g.rab, g.pok, g.k,
       case when g.pok < g.rab then 'Kurang'
            when g.pok < g.k then 'Tipis'
            when g.pok <= round(g.k * (1 + prm.t)) then 'Cukup'
            else 'Lebih' end as status,
       greatest(g.rab - g.pok, 0) as kurang,
       greatest(g.k - g.pok, 0) as kurang_dari_k
from g cross join prm;

-- Buku selisih: kekurangan terhadap RAB per KRO dan kelompok, beserta keputusan PPK
create or replace view keu_v_kk_buku_selisih with (security_invoker = true) as
select k.jadwal_id, k.kro, k.kelompok, k.rab, k.pok, k.kurang,
       sum(k.kurang) over (partition by k.jadwal_id, k.kro) as kurang_kro,
       kp.keputusan, kp.jumlah as jumlah_diterima, kp.catatan as catatan_ppk, kp.diputuskan_at
from keu_v_kk_kecukupan k
left join keu_kk_keputusan_kro kp on kp.jadwal_id = k.jadwal_id and kp.kro = k.kro
where k.kurang > 0;

-- geseran yang dicatat melebihi perubahan sebenarnya pada baris (peringatan)
create or replace view keu_v_kk_geseran_beda with (security_invoker = true) as
select x.jadwal_id, x.baris_id, x.peran, x.dicatat, x.sebenarnya
from (
  select g.jadwal_id, g.donor_id as baris_id, 'donor'::text as peran, sum(g.jumlah) as dicatat, greatest(-max(b.selisih), 0) as sebenarnya
  from keu_kk_geseran g join keu_kk_baris b on b.id = g.donor_id where not g.batal group by g.jadwal_id, g.donor_id
  union all
  select g.jadwal_id, g.penerima_id, 'penerima', sum(g.jumlah), greatest(max(b.selisih), 0)
  from keu_kk_geseran g join keu_kk_baris b on b.id = g.penerima_id where not g.batal group by g.jadwal_id, g.penerima_id
) x where x.dicatat > x.sebenarnya;

-- ---------------------------------------------------------------------
-- Pemeriksaan kesesuaian (R-xx). merah memblokir penerapan pada Mode Pagu Tetap.
-- ---------------------------------------------------------------------
create or replace view keu_v_kk_periksa with (security_invoker = true) as
with jd as (
  select j.id as jadwal_id, j.jenis,
         case when j.jenis in ('dipa_djpb','dipa_dja') then 'dipa' else 'tetap' end as mode
  from keu_revisi_jadwal j where j.id in (select distinct jadwal_id from keu_kk_baris)
), tot as (
  select jadwal_id, sum(selisih) as d from keu_kk_baris group by jadwal_id
), jenis_net as (
  select jadwal_id, pre, sum(v) as n from (
    select jadwal_id, left(akun_semula, 2) as pre, -jumlah_semula as v from keu_kk_baris where akun_semula is not null
    union all
    select jadwal_id, left(akun_menjadi, 2), jumlah_menjadi from keu_kk_baris
  ) x group by jadwal_id, pre
), kel_net as (
  select jadwal_id, kro, kel, sum(v) as n from (
    select jadwal_id, keu_ro_kro(ro_kode) as kro, keu_kelompok_akun(akun_semula) as kel, -jumlah_semula as v
      from keu_kk_baris where akun_semula is not null
    union all
    select jadwal_id, keu_ro_kro(ro_kode), keu_kelompok_akun(akun_menjadi), jumlah_menjadi from keu_kk_baris
  ) x where kro is not null group by jadwal_id, kro, kel
), kro_net as (
  select jadwal_id, kro, sum(n) as n from kel_net group by jadwal_id, kro
)
-- R-01 total pagu satker
select jd.jadwal_id, 'R-01'::text as kode,
       case when t.d = 0 or jd.jenis = 'dipa_dja' then 'hijau' else 'merah' end as tingkat,
       null::text as objek,
       case when t.d = 0 then 'Total pagu sebelum dan sesudah sama.'
            else 'Pagu berubah ' || t.d::text || (case when jd.jenis = 'dipa_dja' then ' (diizinkan pada jalur DJA).' else '; naik ke Revisi DIPA jalur DJA.' end) end as pesan,
       t.d as nilai
from jd join tot t using (jadwal_id)
union all
-- R-03 jenis belanja (dua digit pertama akun)
select jd.jadwal_id, 'R-03',
       case when c.n >= 2 then (case when jd.mode = 'tetap' then 'merah' else 'info' end) else 'hijau' end,
       null,
       case when c.n >= 2 then 'Dana berpindah antar-jenis belanja (' || c.n || ' jenis berubah); naik ke Revisi DIPA jalur DJPb.' else 'Tetap dalam jenis belanja yang sama.' end,
       c.n::numeric
from jd join lateral (select count(*) filter (where n <> 0) as n from jenis_net where jadwal_id = jd.jadwal_id) c on true
union all
-- R-05 pagu KRO tetap
select jd.jadwal_id, 'R-05',
       case when k.n <> 0 then (case when jd.mode = 'tetap' then 'merah' else 'info' end) else 'hijau' end,
       k.kro,
       case when k.n <> 0 then 'Pagu KRO ' || k.kro || ' berubah ' || k.n::text || '.' else 'Pagu KRO ' || k.kro || ' tetap.' end,
       k.n
from jd join kro_net k using (jadwal_id)
union all
-- R-07 belanja pegawai bukan sumber pergeseran biasa
select jd.jadwal_id, 'R-07',
       case when c.n > 0 then 'kuning' else 'hijau' end, null,
       case when c.n > 0 then c.n || ' baris belanja pegawai dikurangi; hanya untuk jalur khusus dengan persetujuan Sekjen/Sestama.' else 'Tidak ada pengurangan belanja pegawai.' end,
       c.n::numeric
from jd join lateral (select count(*) as n from keu_kk_baris b where b.jadwal_id = jd.jadwal_id and keu_kelompok_akun(b.akun_menjadi) = '51' and b.selisih < 0) c on true
union all
-- R-08 baris bertanda blokir tidak disentuh
select jd.jadwal_id, 'R-08',
       case when c.n > 0 then 'info' else 'hijau' end, null,
       case when c.n > 0 then c.n || ' baris bertanda blokir/catatan khusus berubah; periksa.' else 'Tidak ada baris bertanda blokir yang disentuh.' end,
       c.n::numeric
from jd join lateral (
  select count(*) as n from keu_kk_baris b join keu_pok_detail d on d.id = b.detail_id
  where b.jadwal_id = jd.jadwal_id and d.tanda_blokir and (b.selisih <> 0 or exists (select 1 from keu_kk_baris x where x.pindah_dari = b.id))
) c on true
union all
-- R-09 dana penggenap
select jd.jadwal_id, 'R-09',
       case when c.n > 0 then 'kuning' else 'hijau' end, null,
       case when c.n > 0 then c.n || ' baris Dana penggenap, total ' || c.t::text || '. Dasar hukum belum ditemukan; tanyakan Kanwil atau APIP.' else 'Tidak ada baris penggenap.' end,
       c.t
from jd join lateral (select count(*) as n, coalesce(sum(jumlah_menjadi), 0) as t from keu_kk_baris b where b.jadwal_id = jd.jadwal_id and b.penggenap) c on true
union all
-- R-15 kecukupan KRO terhadap RAB (tidak memblokir)
select c.jadwal_id, 'R-15',
       case c.status when 'Kurang' then 'kuning' when 'Tipis' then 'info' else 'hijau' end,
       c.kro || '/' || c.kelompok,
       'Kecukupan ' || c.kro || ' kelompok ' || c.kelompok || ': ' || c.status || ' (POK ' || c.pok::text || ', RAB ' || c.rab::text || ').',
       c.kurang
from keu_v_kk_kecukupan c
union all
-- R-16 kelompok belanja sama
select jd.jadwal_id, 'R-16',
       case when k.n <> 0 then (case when jd.mode = 'tetap' then 'merah' else 'info' end) else 'hijau' end,
       k.kro || '/' || k.kel,
       case when k.n <> 0 then 'Kelompok ' || k.kel || ' pada ' || k.kro || ' berubah ' || k.n::text || '; dana tidak boleh melintasi kelompok belanja.' else 'Kelompok ' || k.kel || ' pada ' || k.kro || ' tetap.' end,
       k.n
from jd join kel_net k using (jadwal_id);

create or replace view keu_v_kk_periksa_ringkas with (security_invoker = true) as
select jadwal_id,
       count(*) filter (where tingkat = 'merah')  as merah,
       count(*) filter (where tingkat = 'kuning') as kuning,
       count(*) filter (where tingkat = 'info')   as info,
       count(*) filter (where tingkat = 'hijau')  as hijau
from keu_v_kk_periksa group by jadwal_id;

-- gerbang: jadwal tidak dapat diterapkan selama masih ada pemeriksaan merah
create or replace function keu_kk_gerbang() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kode text;
begin
  if new.status = 'diterapkan' and old.status is distinct from 'diterapkan' then
    select string_agg(distinct kode, ', ' order by kode) into v_kode from keu_v_kk_periksa where jadwal_id = new.id and tingkat = 'merah';
    if v_kode is not null then
      raise exception 'Jadwal belum dapat diterapkan: pemeriksaan merah pada kertas kerja (%).', v_kode using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function keu_kk_gerbang() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_master_param'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_master_param for each row execute function keu_jaga('master');
    create trigger keu_t2_sentuh before update on keu_master_param for each row execute function keu_sentuh();
    create trigger keu_t9_jejak after insert or update on keu_master_param for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kk_baris'::regclass and tgname = 'keu_t0_sebelum') then
    create trigger keu_t0_sebelum before insert or update on keu_kk_baris for each row execute function keu_kk_sebelum();
    create trigger keu_t1_jaga before update or delete on keu_kk_baris for each row execute function keu_kk_jaga();
    create trigger keu_t9_jejak_ubah after update or delete on keu_kk_baris for each row execute function keu_jejak();
    create trigger keu_t9_jejak_baru after insert on keu_kk_baris for each row when (new.detail_id is null) execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kk_geseran'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_kk_geseran for each row execute function keu_kk_geseran_cek();
    create trigger keu_t1_catat before delete on keu_kk_geseran for each row execute function keu_catat_saja();
    create trigger keu_t9_jejak after insert or update on keu_kk_geseran for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kk_keputusan_kro'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_kk_keputusan_kro for each row execute function keu_kk_keputusan_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_kk_keputusan_kro for each row execute function keu_jaga('sahkan');
    create trigger keu_t9_jejak after insert or update on keu_kk_keputusan_kro for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_revisi_jadwal'::regclass and tgname = 'keu_t3_gerbang') then
    create trigger keu_t3_gerbang before update on keu_revisi_jadwal for each row execute function keu_kk_gerbang();
  end if;
end $$;

-- RLS dan hak
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in
             ('keu_master_param','keu_kk_baris','keu_kk_geseran','keu_kk_keputusan_kro')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_kk_baris, keu_v_kk_ringkas, keu_v_kk_kecukupan_item, keu_v_kk_kecukupan, keu_v_kk_buku_selisih,
              keu_v_kk_geseran_beda, keu_v_kk_periksa, keu_v_kk_periksa_ringkas from anon, authenticated;
grant select on keu_v_kk_baris, keu_v_kk_ringkas, keu_v_kk_kecukupan_item, keu_v_kk_kecukupan, keu_v_kk_buku_selisih,
                keu_v_kk_geseran_beda, keu_v_kk_periksa, keu_v_kk_periksa_ringkas to service_role;
