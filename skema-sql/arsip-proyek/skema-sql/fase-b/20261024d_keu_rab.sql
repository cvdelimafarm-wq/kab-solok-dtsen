-- =====================================================================
-- 20261024d_keu_rab.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE B1: RAB per RO
-- (alur persetujuan, item, rincian, jadwal pencairan bulanan).
-- Bergantung pada 20261024a, 20261024c. Aman diulang. Tanpa DELETE/DROP.
--
-- Aturan yang dipenuhi (spesifikasi 24 Okt 2026):
--  D-02 RAB dibuat hanya oleh ketua tim RO; admin RO menyusun draf yang perlu
--       persetujuan ketua tim.   D-03 PPK yang merangkap ketua tim: langsung sah.
--  D-01 PPK mengesahkan; KPA tidak menyetujui.   D-12 prioritas dari master.
--  D-13 ganti akun = akun_tujuan (pasangan dibentuk saat kertas kerja diterapkan).
--  D-11 redaksi item POK resmi tidak diedit: uraian_menjadi hanya untuk item baru
--       atau akan membentuk pasangan pada kertas kerja.
-- =====================================================================

create table if not exists keu_rab (
  id            bigint generated always as identity primary key,
  ro_kode       text not null references keu_ro(kode),
  pok_versi_id  bigint not null references keu_pok_versi(id),
  nomor         smallint not null check (nomor >= 1),
  status        text not null default 'draf'
                check (status in ('draf','menunggu_ketua','menunggu_ppk','disetujui','dikembalikan','digantikan','dibatalkan')),
  dibuat_oleh   bigint not null references sigap_akun(id),
  diajukan_oleh bigint references sigap_akun(id),
  diajukan_at   timestamptz,
  disetujui_ketua_oleh bigint references sigap_akun(id),
  disetujui_ketua_at   timestamptz,
  disahkan_oleh bigint references sigap_akun(id),
  disahkan_at   timestamptz,
  catatan       text not null default '',
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  unique (ro_kode, nomor),
  constraint rab_sah_lengkap check (status <> 'disetujui' or (disahkan_oleh is not null and disahkan_at is not null))
);
-- satu RAB sah dan satu RAB dalam pengerjaan per RO
create unique index if not exists keu_rab_satu_sah on keu_rab(ro_kode) where status = 'disetujui';
create unique index if not exists keu_rab_satu_aktif on keu_rab(ro_kode) where status in ('draf','menunggu_ketua','menunggu_ppk','dikembalikan');
create index if not exists keu_rab_pok_idx on keu_rab(pok_versi_id);

create table if not exists keu_rab_riwayat (
  id        bigint generated always as identity primary key,
  rab_id    bigint not null references keu_rab(id),
  aksi      text not null,
  dari      text not null,
  ke        text not null,
  oleh      bigint references sigap_akun(id),
  catatan   text not null default '',
  waktu     timestamptz not null default now()
);
create index if not exists keu_rab_riwayat_rab_idx on keu_rab_riwayat(rab_id, waktu);

-- Item RAB. pok_kunci terisi = item POK yang ada; null = item baru (belum menjadi POK).
create table if not exists keu_rab_item (
  id            bigint generated always as identity primary key,
  rab_id        bigint not null references keu_rab(id),
  pok_kunci     text,
  komponen_kode text not null check (komponen_kode ~ '^[0-9]{3}$'),
  akun_kode     text not null references keu_master_akun(kode),
  akun_tujuan   text references keu_master_akun(kode),          -- ganti akun (D-13); null = akun semula
  uraian        text not null,
  satuan        text not null default 'PAKET',
  prioritas_kode text references keu_master_prioritas(kode),
  selesai       boolean not null default false,
  catatan       text not null default '',
  dibuat_at     timestamptz not null default now(),
  baru          boolean generated always as (pok_kunci is null) stored,
  check (akun_tujuan is null or akun_tujuan <> akun_kode)
);
create unique index if not exists keu_rab_item_kunci_uq on keu_rab_item(rab_id, pok_kunci) where pok_kunci is not null;
create index if not exists keu_rab_item_rab_idx on keu_rab_item(rab_id);

-- Rincian: satu item boleh banyak baris (mis. PML 2 x 170.000 dan PPL 10 x 170.000).
create table if not exists keu_rab_baris (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references keu_rab_item(id),
  urut        smallint not null default 1,
  ket         text not null default '',
  volume      numeric(14,2) not null check (volume >= 0),
  satuan      text not null,
  harga_satuan numeric(18,2) not null check (harga_satuan >= 0),
  jumlah_tetap numeric(18,0) check (jumlah_tetap is null or jumlah_tetap >= 0),   -- bila sama dengan jumlah POK yang dibulatkan
  jumlah      numeric(18,0) generated always as (coalesce(jumlah_tetap, round(volume * harga_satuan))) stored,
  sama_dengan_item boolean not null default false,        -- "RAB = item" (bentuk paling sederhana)
  catatan     text not null default '',
  tautan      text not null default '',
  periode     text not null default 'sekali' check (periode in ('sekali','bulanan','triwulan')),
  bulan_mulai smallint not null default 1 check (bulan_mulai between 1 and 12),
  bulan_sampai smallint not null default 1 check (bulan_sampai between 1 and 12),
  minggu      smallint not null default 3 check (minggu between 1 and 4),
  manual      boolean not null default false,             -- jadwal diatur per bulan, tidak diratakan otomatis
  dibuat_at   timestamptz not null default now(),
  check (bulan_sampai >= bulan_mulai)
);
create index if not exists keu_rab_baris_item_idx on keu_rab_baris(item_id);

-- Jadwal pencairan: selalu 12 baris per rincian (Jan..Des), nilai Rp dan tag minggu M1..M4.
create table if not exists keu_rab_jadwal (
  baris_id bigint not null references keu_rab_baris(id),
  bulan    smallint not null check (bulan between 1 and 12),
  nilai    numeric(18,0) not null default 0 check (nilai >= 0),
  minggu   smallint not null default 3 check (minggu between 1 and 4),
  primary key (baris_id, bulan)
);

-- ---------------------------------------------------------------------
-- Pembangkit jadwal (sama dengan KKR.jadwalLine di mockup)
-- ---------------------------------------------------------------------
create or replace function keu_rab_bulan_cair(p_periode text, p_mulai int, p_sampai int)
returns int[] language sql immutable as $$
  select case
    when p_periode = 'sekali' then array[p_mulai]
    else (select array_agg(b order by b) from generate_series(p_mulai, greatest(p_sampai, p_mulai),
            case when p_periode = 'triwulan' then 3 else 1 end) b)
  end
$$;

create or replace function keu_rab_ratakan(p_baris bigint) returns void
language plpgsql set search_path = public as $$
declare r keu_rab_baris; bl int[]; n int; bagi numeric; sisa numeric; b int; k int;
begin
  select * into r from keu_rab_baris where id = p_baris;
  if not found then return; end if;
  bl := keu_rab_bulan_cair(r.periode, r.bulan_mulai, r.bulan_sampai);
  n := array_length(bl, 1);
  bagi := floor(r.jumlah / n); sisa := r.jumlah - bagi * n;
  perform set_config('keu.ratakan', '1', true);
  for b in 1..12 loop
    k := array_position(bl, b);
    insert into keu_rab_jadwal(baris_id, bulan, nilai, minggu)
    values (p_baris, b, case when k is null then 0 else bagi + case when k = n then sisa else 0 end end, r.minggu)
    on conflict (baris_id, bulan) do update set nilai = excluded.nilai, minggu = excluded.minggu;
  end loop;
  perform set_config('keu.ratakan', '', true);
  update keu_rab_baris set manual = false where id = p_baris and manual;
end $$;

create or replace function keu_rab_baris_setelah() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform keu_rab_ratakan(new.id);
  elsif not new.manual and (new.volume, new.harga_satuan, new.jumlah_tetap, new.periode, new.bulan_mulai, new.bulan_sampai, new.minggu, new.manual)
          is distinct from (old.volume, old.harga_satuan, old.jumlah_tetap, old.periode, old.bulan_mulai, old.bulan_sampai, old.minggu, old.manual) then
    perform keu_rab_ratakan(new.id);
  elsif new.manual and (new.minggu is distinct from old.minggu) then
    update keu_rab_jadwal set minggu = new.minggu where baris_id = new.id and nilai > 0;
  end if;
  return null;
end $$;

-- mengubah jadwal bulanan dengan tangan menjadikan rincian bertanda manual
create or replace function keu_rab_jadwal_setelah() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('keu.ratakan', true), '') <> '1' then
    update keu_rab_baris set manual = true where id = new.baris_id and not manual;
  end if;
  return null;
end $$;

-- sebelum insert/ubah: bila volume/harga berubah tanpa jumlah_tetap diubah, hapus jumlah_tetap
create or replace function keu_rab_baris_sebelum() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.jumlah_tetap is not distinct from old.jumlah_tetap
     and (new.volume is distinct from old.volume or new.harga_satuan is distinct from old.harga_satuan) then
    new.jumlah_tetap := null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Penjaga isi: hanya saat draf/dikembalikan, dan hanya oleh yang berwenang pada RO itu
-- ---------------------------------------------------------------------
create or replace function keu_rab_jaga_isi() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rab bigint; v_st text; v_ro text; v_akun bigint := keu_akun_sesi();
begin
  if tg_table_name = 'keu_rab_item' then
    v_rab := case when tg_op = 'DELETE' then old.rab_id else new.rab_id end;
  elsif tg_table_name = 'keu_rab_baris' then
    select rab_id into v_rab from keu_rab_item where id = case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  else -- jadwal
    select i.rab_id into v_rab from keu_rab_baris b join keu_rab_item i on i.id = b.item_id
      where b.id = case when tg_op = 'DELETE' then old.baris_id else new.baris_id end;
  end if;
  select status, ro_kode into v_st, v_ro from keu_rab where id = v_rab;
  if v_st not in ('draf','dikembalikan') then
    raise exception 'RAB berstatus % tidak dapat diubah (hanya draf atau dikembalikan).', v_st using errcode = '23514';
  end if;
  if v_akun is not null then
    if tg_op = 'DELETE' and tg_table_name = 'keu_rab_item' then
      raise exception 'Item RAB tidak dapat dihapus; kosongkan rincian atau tandai selesai.' using errcode = '42501';
    end if;
    if not (keu_boleh(v_akun, 'rab', v_ro) or keu_boleh(v_akun, 'draf', v_ro)) then
      raise exception 'Akun % tidak berwenang mengubah RAB RO %.', v_akun, v_ro using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function keu_rab_jaga_isi() from public, anon, authenticated;

-- validasi item: kunci POK harus ada pada versi POK dasar RAB; akun tujuan sekelompok? (R-16 dicek di kertas kerja)
create or replace function keu_rab_item_cek() returns trigger
language plpgsql set search_path = public as $$
declare v_versi bigint; v_ada boolean;
begin
  if new.pok_kunci is not null then
    select pok_versi_id into v_versi from keu_rab where id = new.rab_id;
    select exists (select 1 from keu_pok_detail where versi_id = v_versi and kunci_stabil = new.pok_kunci) into v_ada;
    if not v_ada then
      raise exception 'Kunci POK % tidak ada pada versi POK dasar RAB', new.pok_kunci using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- status RAB tidak boleh diubah langsung; hanya lewat keu_rab_aksi
create or replace function keu_rab_jaga_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
    raise exception 'Status RAB hanya dapat diubah melalui keu_rab_aksi().' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status in ('disetujui','digantikan','dibatalkan')
     and coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
    raise exception 'RAB berstatus % tidak dapat diubah.', old.status using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.status <> 'draf' and coalesce(current_setting('keu.via_fungsi', true), '') <> '1' then
    raise exception 'RAB baru harus berstatus draf.' using errcode = '23514';
  end if;
  new.diubah_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Alur persetujuan (satu pintu)
--  ajukan        draf/dikembalikan -> menunggu_ketua (admin RO) | menunggu_ppk (ketua)
--                | disetujui bila pengaju ketua tim yang juga PPK (D-03)
--  setuju_ketua  menunggu_ketua -> menunggu_ppk (| disetujui bila ketua itu juga PPK)
--  sahkan        menunggu_ppk -> disetujui (RAB sah sebelumnya -> digantikan)
--  kembalikan    menunggu_ketua (ketua) / menunggu_ppk (PPK) -> dikembalikan; catatan wajib
--  batalkan      draf/dikembalikan -> dibatalkan
-- ---------------------------------------------------------------------
create or replace function keu_rab_aksi(p_rab bigint, p_aksi text, p_catatan text default '',
                                        p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare r keu_rab; ke text; v_ketua boolean; v_adm boolean; v_ppk boolean;
begin
  if p_akun is null then
    raise exception 'Akun pelaku wajib diketahui (app.akun_id atau parameter).' using errcode = '42501';
  end if;
  select * into r from keu_rab where id = p_rab for update;
  if not found then raise exception 'RAB % tidak ada', p_rab using errcode = 'P0002'; end if;
  v_ketua := keu_boleh(p_akun, 'rab', r.ro_kode);
  v_adm   := keu_boleh(p_akun, 'draf', r.ro_kode);
  v_ppk   := keu_boleh(p_akun, 'sahkan');
  perform set_config('keu.via_fungsi', '1', true);

  if p_aksi = 'ajukan' then
    if r.status not in ('draf','dikembalikan') then raise exception 'Hanya draf/dikembalikan yang dapat diajukan (status %)', r.status using errcode = '23514'; end if;
    if not exists (select 1 from keu_rab_item where rab_id = r.id) then raise exception 'RAB belum berisi item' using errcode = '23514'; end if;
    if v_ketua then
      if v_ppk then
        ke := 'disetujui';
        update keu_rab set status = 'digantikan' where ro_kode = r.ro_kode and status = 'disetujui' and id <> r.id;
        update keu_rab set status = ke, diajukan_oleh = p_akun, diajukan_at = now(), disahkan_oleh = p_akun, disahkan_at = now() where id = r.id;
      else
        ke := 'menunggu_ppk';
        update keu_rab set status = ke, diajukan_oleh = p_akun, diajukan_at = now() where id = r.id;
      end if;
    elsif v_adm then
      ke := 'menunggu_ketua';
      update keu_rab set status = ke, diajukan_oleh = p_akun, diajukan_at = now() where id = r.id;
    else
      raise exception 'Akun % tidak berwenang mengajukan RAB RO %', p_akun, r.ro_kode using errcode = '42501';
    end if;

  elsif p_aksi = 'setuju_ketua' then
    if r.status <> 'menunggu_ketua' then raise exception 'RAB tidak menunggu ketua tim (status %)', r.status using errcode = '23514'; end if;
    if not keu_boleh(p_akun, 'setuju_ketua', r.ro_kode) then raise exception 'Akun % bukan ketua tim RO %', p_akun, r.ro_kode using errcode = '42501'; end if;
    if p_akun = r.diajukan_oleh then raise exception 'Pengaju tidak boleh menyetujui drafnya sendiri' using errcode = '42501'; end if;
    if v_ppk then
      ke := 'disetujui';
      update keu_rab set status = 'digantikan' where ro_kode = r.ro_kode and status = 'disetujui' and id <> r.id;
      update keu_rab set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now(), disahkan_oleh = p_akun, disahkan_at = now() where id = r.id;
    else
      ke := 'menunggu_ppk';
      update keu_rab set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now() where id = r.id;
    end if;

  elsif p_aksi = 'sahkan' then
    if r.status <> 'menunggu_ppk' then raise exception 'RAB tidak menunggu PPK (status %)', r.status using errcode = '23514'; end if;
    if not v_ppk then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
    if p_akun = r.diajukan_oleh and not v_ketua then raise exception 'Pengaju tidak boleh mengesahkan RAB sendiri' using errcode = '42501'; end if;
    ke := 'disetujui';
    update keu_rab set status = 'digantikan' where ro_kode = r.ro_kode and status = 'disetujui' and id <> r.id;
    update keu_rab set status = ke, disahkan_oleh = p_akun, disahkan_at = now() where id = r.id;

  elsif p_aksi = 'kembalikan' then
    if length(btrim(coalesce(p_catatan,''))) < 5 then raise exception 'Alasan pengembalian wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if r.status = 'menunggu_ketua' and keu_boleh(p_akun, 'setuju_ketua', r.ro_kode) then ke := 'dikembalikan';
    elsif r.status = 'menunggu_ppk' and v_ppk then ke := 'dikembalikan';
    else raise exception 'Akun % tidak dapat mengembalikan RAB berstatus %', p_akun, r.status using errcode = '42501'; end if;
    update keu_rab set status = ke, catatan = p_catatan where id = r.id;

  elsif p_aksi = 'batalkan' then
    if r.status not in ('draf','dikembalikan') then raise exception 'Hanya draf/dikembalikan yang dapat dibatalkan (status %)', r.status using errcode = '23514'; end if;
    if not (v_ketua or p_akun = r.dibuat_oleh) then raise exception 'Akun % tidak berwenang membatalkan' , p_akun using errcode = '42501'; end if;
    ke := 'dibatalkan';
    update keu_rab set status = ke, catatan = coalesce(nullif(p_catatan,''), catatan) where id = r.id;
  else
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;

  insert into keu_rab_riwayat(rab_id, aksi, dari, ke, oleh, catatan) values (r.id, p_aksi, r.status, ke, p_akun, coalesce(p_catatan,''));
  perform set_config('keu.via_fungsi', '', true);
  return ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_rab_aksi(bigint, text, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Membuat versi RAB berikutnya (salinan) dari RAB sah / terakhir
-- ---------------------------------------------------------------------
create or replace function keu_rab_baru(p_ro text, p_dari bigint default null, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_pok bigint; v_no int; v_new bigint; it record; br record; v_item bigint; v_baris bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (keu_boleh(p_akun, 'rab', p_ro) or keu_boleh(p_akun, 'draf', p_ro)) then
    raise exception 'Akun % tidak berwenang menyusun RAB RO %', p_akun, p_ro using errcode = '42501';
  end if;
  select id into v_pok from keu_pok_versi where status = 'berlaku' order by tahun desc limit 1;
  if v_pok is null then raise exception 'Belum ada versi POK berlaku' using errcode = '23514'; end if;
  if exists (select 1 from keu_rab where ro_kode = p_ro and status in ('draf','menunggu_ketua','menunggu_ppk','dikembalikan')) then
    raise exception 'RO % masih memiliki RAB dalam pengerjaan', p_ro using errcode = '23505';
  end if;
  select coalesce(max(nomor), 0) + 1 into v_no from keu_rab where ro_kode = p_ro;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_rab(ro_kode, pok_versi_id, nomor, dibuat_oleh) values (p_ro, v_pok, v_no, p_akun) returning id into v_new;
  perform set_config('keu.via_fungsi', '', true);
  if p_dari is not null then
    for it in select * from keu_rab_item where rab_id = p_dari order by id loop
      -- kunci yang tidak ada lagi pada POK baru: ikuti alias; bila tetap tidak ada, jadikan item baru
      insert into keu_rab_item(rab_id, pok_kunci, komponen_kode, akun_kode, akun_tujuan, uraian, satuan, prioritas_kode, selesai, catatan)
      values (v_new,
              case when it.pok_kunci is null then null
                   when exists (select 1 from keu_pok_detail d where d.versi_id = v_pok and d.kunci_stabil = keu_kunci_resolusi(it.pok_kunci)) then keu_kunci_resolusi(it.pok_kunci)
                   else null end,
              it.komponen_kode, it.akun_kode, it.akun_tujuan, it.uraian, it.satuan, it.prioritas_kode, it.selesai, it.catatan)
      returning id into v_item;
      for br in select * from keu_rab_baris where item_id = it.id order by urut, id loop
        insert into keu_rab_baris(item_id, urut, ket, volume, satuan, harga_satuan, jumlah_tetap, sama_dengan_item, catatan, tautan, periode, bulan_mulai, bulan_sampai, minggu, manual)
        values (v_item, br.urut, br.ket, br.volume, br.satuan, br.harga_satuan, br.jumlah_tetap, br.sama_dengan_item, br.catatan, br.tautan, br.periode, br.bulan_mulai, br.bulan_sampai, br.minggu, false)
        returning id into v_baris;
        if br.manual then
          perform set_config('keu.ratakan', '1', true);
          update keu_rab_jadwal j set nilai = o.nilai, minggu = o.minggu
            from keu_rab_jadwal o where o.baris_id = br.id and j.baris_id = v_baris and j.bulan = o.bulan;
          perform set_config('keu.ratakan', '', true);
          update keu_rab_baris set manual = true where id = v_baris;
        end if;
      end loop;
    end loop;
  end if;
  insert into keu_rab_riwayat(rab_id, aksi, dari, ke, oleh, catatan)
  values (v_new, 'buat', '-', 'draf', p_akun, case when p_dari is null then 'RAB baru' else 'Salinan dari RAB ' || p_dari end);
  return v_new;
end $$;
revoke execute on function keu_rab_baru(text, bigint, bigint) from public, anon, authenticated;

-- menghapus satu rincian pada RAB yang masih dapat diubah (jejak tercatat di sigap_audit)
create or replace function keu_rab_hapus_baris(p_baris bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from keu_rab_jadwal where baris_id = p_baris;
  delete from keu_rab_baris where id = p_baris;
end $$;
revoke execute on function keu_rab_hapus_baris(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- View
-- ---------------------------------------------------------------------
-- status item: belum / sama / rinci / selesai (sama dengan KKR.status)
create or replace view keu_v_rab_item with (security_invoker = true) as
select i.id as item_id, i.rab_id, i.pok_kunci, i.baru, i.komponen_kode, i.akun_kode, coalesce(i.akun_tujuan, i.akun_kode) as akun_menjadi,
       i.uraian, i.prioritas_kode, i.selesai,
       coalesce(b.n, 0) as jumlah_rincian, coalesce(b.vol, 0) as volume_total, coalesce(b.jml, 0) as jumlah_rab,
       case when i.selesai then 'selesai'
            when coalesce(b.n, 0) = 0 then 'belum'
            when b.n = 1 and b.semua_sama then 'sama'
            else 'rinci' end as status
from keu_rab_item i
left join lateral (
  select count(*) n, sum(volume) vol, sum(jumlah) jml, bool_and(sama_dengan_item) semua_sama
  from keu_rab_baris where item_id = i.id
) b on true;

-- jadwal yang tidak sama dengan jumlah rincian (peringatan, tidak memblokir)
create or replace view keu_v_rab_jadwal_beda with (security_invoker = true) as
select b.id as baris_id, b.item_id, b.jumlah, coalesce(sum(j.nilai), 0) as total_jadwal, b.jumlah - coalesce(sum(j.nilai), 0) as selisih
from keu_rab_baris b left join keu_rab_jadwal j on j.baris_id = b.id
group by b.id, b.item_id, b.jumlah
having b.jumlah <> coalesce(sum(j.nilai), 0);

-- perkiraan kebutuhan pencairan per RAB: bulan x minggu (item selesai tidak ikut)
create or replace view keu_v_rab_pencairan with (security_invoker = true) as
select i.rab_id, j.bulan, j.minggu, sum(j.nilai) as nilai
from keu_rab_jadwal j
join keu_rab_baris b on b.id = j.baris_id
join keu_rab_item i on i.id = b.item_id and not i.selesai
where j.nilai > 0
group by i.rab_id, j.bulan, j.minggu;

-- ringkasan per RAB
create or replace view keu_v_rab_ringkas with (security_invoker = true) as
select r.id as rab_id, r.ro_kode, r.nomor, r.status,
       count(v.item_id) as n_item,
       count(*) filter (where v.status = 'belum')   as n_belum,
       count(*) filter (where v.status = 'sama')    as n_sama,
       count(*) filter (where v.status = 'rinci')   as n_rinci,
       count(*) filter (where v.status = 'selesai') as n_selesai,
       coalesce(sum(v.jumlah_rab) filter (where v.status <> 'selesai'), 0) as jumlah_rab
from keu_rab r left join keu_v_rab_item v on v.rab_id = r.id
group by r.id, r.ro_kode, r.nomor, r.status;

-- Penjaga catatan: tabel riwayat hanya boleh ditambah dari aplikasi (tanpa ubah/hapus);
-- arg 'tanpa_hapus' = boleh diubah tetapi tidak boleh dihapus.
create or replace function keu_catat_saja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if keu_akun_sesi() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and coalesce(tg_argv[0], '') <> 'tanpa_hapus') then
    raise exception 'Tabel % hanya dapat ditambah dari aplikasi.', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function keu_catat_saja() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_rab'::regclass and tgname = 'keu_t0_status') then
    create trigger keu_t0_status before insert or update on keu_rab for each row execute function keu_rab_jaga_status();
    create trigger keu_t9_jejak after insert or update on keu_rab for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_rab_riwayat'::regclass and tgname = 'keu_t1_catat') then
    create trigger keu_t1_catat before update or delete on keu_rab_riwayat for each row execute function keu_catat_saja();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_rab_item'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_rab_item for each row execute function keu_rab_item_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_rab_item for each row execute function keu_rab_jaga_isi();
    create trigger keu_t9_jejak after insert or update on keu_rab_item for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_rab_baris'::regclass and tgname = 'keu_t0_sebelum') then
    create trigger keu_t0_sebelum before insert or update on keu_rab_baris for each row execute function keu_rab_baris_sebelum();
    create trigger keu_t1_jaga before insert or update or delete on keu_rab_baris for each row execute function keu_rab_jaga_isi();
    create trigger keu_t5_setelah after insert or update on keu_rab_baris for each row execute function keu_rab_baris_setelah();
    create trigger keu_t9_jejak after insert or update or delete on keu_rab_baris for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_rab_jadwal'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_rab_jadwal for each row execute function keu_rab_jaga_isi();
    create trigger keu_t5_setelah after update on keu_rab_jadwal for each row execute function keu_rab_jadwal_setelah();
  end if;
end $$;

-- RLS dan hak
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in
             ('keu_rab','keu_rab_riwayat','keu_rab_item','keu_rab_baris','keu_rab_jadwal')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_rab_item, keu_v_rab_jadwal_beda, keu_v_rab_pencairan, keu_v_rab_ringkas from anon, authenticated;
grant select on keu_v_rab_item, keu_v_rab_jadwal_beda, keu_v_rab_pencairan, keu_v_rab_ringkas to service_role;
