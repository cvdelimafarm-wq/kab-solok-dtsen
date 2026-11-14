-- skema-sql/20261114x_hierarki_satu_sumber.sql
--
-- (14 Nov 2026) Putusan Ketua Tim: "hierarki juga single data, perubahan di area lain akan mengupdate area lainnya juga".
--
-- Sebelumnya atasan seorang petugas disimpan terpisah di beberapa tempat tanpa saling memperbarui:
--   sigap_penugasan.atasan_akun_id  (tim pendataan, mis. Pascabencana kegiatan 1)
--   sigap_tim.atasan_akun_id        (alokasi Stage 1, mis. Seruti kegiatan 6)
--   sigap_pelatihan_hierarki        (Kelola Pelatihan > Hierarki; dasar "siapa melihat siapa" di Monitoring)
--   sigap_spdt_kk.pml_akun_id       (pasangan PPL-PML per KK SPDT)
-- Akibatnya PML Pascabencana di monitoring pelatihan hanya melihat dirinya (hierarki pelatihan kegiatan 3 kosong).
--
-- Sekarang: satu data per SURVEI (induk) di sigap_hierarki (induk_kode, akun_id) -> atasan_akun_id.
--   * Mengubah atasan di tempat mana pun (penugasan, tim, hierarki pelatihan, KK SPDT) memperbarui sigap_hierarki lalu disebar ke semua kegiatan
--     dalam induk yang sama (pendataan dan pelatihan).
--   * Baris baru yang atasannya kosong otomatis diisi dari sigap_hierarki.
--   * Yang disebar hanya ATASAN. Peran tetap per kegiatan (korwil di pendataan boleh PML di pelatihan).
--   * Setiap perubahan dicatat di sigap_hierarki_riwayat.
-- Migrasi menambah: tabel baru, fungsi, pemicu. Nilai atasan yang sudah ada tidak ditimpa (uji kering: 154 baris penugasan dan 101 baris hierarki
-- pelatihan yang masih kosong terisi; 0 bentrok).

create table if not exists sigap_hierarki (
  induk_kode text not null references sigap_induk(kode) on delete cascade,
  akun_id bigint not null references sigap_akun(id),
  atasan_akun_id bigint references sigap_akun(id),
  sumber text not null,
  kegiatan_asal bigint,
  diubah_oleh text,
  diubah_at timestamptz not null default now(),
  primary key (induk_kode, akun_id),
  constraint sigap_hierarki_bukan_diri check (atasan_akun_id is null or atasan_akun_id <> akun_id)
);
create index if not exists sigap_hierarki_atasan_idx on sigap_hierarki (induk_kode, atasan_akun_id);
alter table sigap_hierarki enable row level security;

create table if not exists sigap_hierarki_riwayat (
  id bigserial primary key,
  induk_kode text not null,
  akun_id bigint not null,
  atasan_lama bigint,
  atasan_baru bigint,
  sumber text not null,
  kegiatan_asal bigint,
  diubah_oleh text,
  diubah_at timestamptz not null default now()
);
create index if not exists sigap_hierarki_riwayat_akun_idx on sigap_hierarki_riwayat (induk_kode, akun_id, diubah_at desc);
alter table sigap_hierarki_riwayat enable row level security;

-- sumber baru untuk baris hierarki pelatihan yang diisi dari satu sumber
alter table sigap_pelatihan_hierarki drop constraint if exists sigap_pelatihan_hierarki_sumber_check;
alter table sigap_pelatihan_hierarki add constraint sigap_pelatihan_hierarki_sumber_check check (sumber = any (array['salin_psp','salin_sampel','manual','satu_sumber']));

-- induk (survei) yang memuat kegiatan ini
create or replace function sigap_induk_kegiatan(p_kegiatan bigint) returns setof text
language sql stable as $$
  select kode from sigap_induk where aktif and kegiatan_ids @> array[p_kegiatan]
$$;

create or replace function sigap_hierarki_atasan(p_kegiatan bigint, p_akun bigint) returns bigint
language sql stable as $$
  select h.atasan_akun_id from sigap_hierarki h
  where h.akun_id = p_akun and h.induk_kode in (select sigap_induk_kegiatan(p_kegiatan)) and h.atasan_akun_id is not null
  order by h.diubah_at desc limit 1
$$;

-- Catat atasan baru di sigap_hierarki lalu sebar ke semua kegiatan induk. Pemicu tidak berjalan ulang selama penyebaran (penanda transaksi).
create or replace function sigap_hierarki_sebar(p_induk text, p_akun bigint, p_atasan bigint, p_sumber text, p_kegiatan bigint, p_oleh text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lama bigint;
  v_ada boolean;
  v_ids bigint[];
  v_oleh text := left(coalesce(nullif(p_oleh, ''), 'satu sumber'), 120);
begin
  if p_akun is null or (p_atasan is not null and p_atasan = p_akun) then return; end if;
  select kegiatan_ids into v_ids from sigap_induk where kode = p_induk;
  if v_ids is null then return; end if;

  select atasan_akun_id, true into v_lama, v_ada from sigap_hierarki where induk_kode = p_induk and akun_id = p_akun;
  if coalesce(v_ada, false) and v_lama is not distinct from p_atasan then
    null; -- sudah sama; tetap sebar supaya tempat lain yang tertinggal ikut sama
  else
    insert into sigap_hierarki (induk_kode, akun_id, atasan_akun_id, sumber, kegiatan_asal, diubah_oleh, diubah_at)
    values (p_induk, p_akun, p_atasan, p_sumber, p_kegiatan, v_oleh, now())
    on conflict (induk_kode, akun_id) do update set atasan_akun_id = excluded.atasan_akun_id, sumber = excluded.sumber,
      kegiatan_asal = excluded.kegiatan_asal, diubah_oleh = excluded.diubah_oleh, diubah_at = now();
    insert into sigap_hierarki_riwayat (induk_kode, akun_id, atasan_lama, atasan_baru, sumber, kegiatan_asal, diubah_oleh)
    values (p_induk, p_akun, v_lama, p_atasan, p_sumber, p_kegiatan, v_oleh);
  end if;

  perform set_config('sigap.hierarki_sebar', '1', true);

  update sigap_penugasan set atasan_akun_id = p_atasan
   where akun_id = p_akun and kegiatan_id = any (v_ids) and aktif and peran in ('korwil', 'pml', 'ppl')
     and atasan_akun_id is distinct from p_atasan;

  update sigap_tim set atasan_akun_id = p_atasan, diubah_oleh = v_oleh, diubah_at = now()
   where akun_id = p_akun and kegiatan_id = any (v_ids) and atasan_akun_id is distinct from p_atasan;

  update sigap_pelatihan_hierarki set atasan_akun_id = p_atasan, diubah_oleh = v_oleh, diubah_at = now()
   where akun_id = p_akun and kegiatan_id = any (v_ids) and atasan_akun_id is distinct from p_atasan;

  insert into sigap_pelatihan_hierarki (kegiatan_id, akun_id, peran_pelatihan, atasan_akun_id, sumber, diubah_oleh, diubah_at)
  select p.kegiatan_id, p.akun_id, p.peran, p_atasan, 'satu_sumber', v_oleh, now()
    from sigap_penugasan p join sigap_kegiatan k on k.id = p.kegiatan_id and k.jenis = 'pelatihan'
   where p.akun_id = p_akun and p.kegiatan_id = any (v_ids) and p.aktif and p.peran in ('korwil', 'pml', 'ppl')
  on conflict (kegiatan_id, akun_id) do nothing;

  perform set_config('sigap.hierarki_sebar', '', true);
end $$;

-- Pemicu umum untuk tabel yang punya (kegiatan_id, akun_id, atasan_akun_id)
create or replace function sigap_hierarki_pemicu_isi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('sigap.hierarki_sebar', true), '') = '1' then return new; end if;
  if new.atasan_akun_id is null then
    if tg_table_name = 'sigap_penugasan' and not (coalesce((to_jsonb(new) ->> 'aktif')::boolean, true) and (to_jsonb(new) ->> 'peran') in ('korwil', 'pml', 'ppl')) then return new; end if;
    new.atasan_akun_id := sigap_hierarki_atasan(new.kegiatan_id, new.akun_id);
    if new.atasan_akun_id = new.akun_id then new.atasan_akun_id := null; end if;
  end if;
  return new;
end $$;

create or replace function sigap_hierarki_pemicu_sebar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_induk text;
  v_oleh text;
begin
  if coalesce(current_setting('sigap.hierarki_sebar', true), '') = '1' then return null; end if;
  if tg_op = 'UPDATE' and old.atasan_akun_id is not distinct from new.atasan_akun_id then return null; end if;
  if tg_op = 'INSERT' and new.atasan_akun_id is null then return null; end if; -- baris baru tanpa atasan bukan perintah menghapus atasan
  if tg_table_name = 'sigap_penugasan' and not (coalesce((to_jsonb(new) ->> 'aktif')::boolean, true) and (to_jsonb(new) ->> 'peran') in ('korwil', 'pml', 'ppl')) then return null; end if;
  v_oleh := case when tg_table_name = 'sigap_penugasan' then 'penugasan' else coalesce(to_jsonb(new) ->> 'diubah_oleh', tg_table_name) end;
  for v_induk in select sigap_induk_kegiatan(new.kegiatan_id) loop
    perform sigap_hierarki_sebar(v_induk, new.akun_id, new.atasan_akun_id, tg_table_name, new.kegiatan_id, v_oleh);
  end loop;
  return null;
end $$;

drop trigger if exists sigap_hierarki_isi on sigap_penugasan;
create trigger sigap_hierarki_isi before insert on sigap_penugasan for each row execute function sigap_hierarki_pemicu_isi();
drop trigger if exists sigap_hierarki_sebar on sigap_penugasan;
create trigger sigap_hierarki_sebar after insert or update of atasan_akun_id on sigap_penugasan for each row execute function sigap_hierarki_pemicu_sebar();

drop trigger if exists sigap_hierarki_isi on sigap_tim;
create trigger sigap_hierarki_isi before insert on sigap_tim for each row execute function sigap_hierarki_pemicu_isi();
drop trigger if exists sigap_hierarki_sebar on sigap_tim;
create trigger sigap_hierarki_sebar after insert or update of atasan_akun_id on sigap_tim for each row execute function sigap_hierarki_pemicu_sebar();

drop trigger if exists sigap_hierarki_isi on sigap_pelatihan_hierarki;
create trigger sigap_hierarki_isi before insert on sigap_pelatihan_hierarki for each row execute function sigap_hierarki_pemicu_isi();
drop trigger if exists sigap_hierarki_sebar on sigap_pelatihan_hierarki;
create trigger sigap_hierarki_sebar after insert or update of atasan_akun_id on sigap_pelatihan_hierarki for each row execute function sigap_hierarki_pemicu_sebar();

-- Penugasan yang diaktifkan lagi atau berganti peran mengambil atasan dari satu sumber bila kosong
create or replace function sigap_hierarki_pemicu_aktif() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('sigap.hierarki_sebar', true), '') = '1' then return new; end if;
  if new.atasan_akun_id is null and new.aktif and new.peran in ('korwil', 'pml', 'ppl') then
    new.atasan_akun_id := sigap_hierarki_atasan(new.kegiatan_id, new.akun_id);
    if new.atasan_akun_id = new.akun_id then new.atasan_akun_id := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists sigap_hierarki_aktif on sigap_penugasan;
create trigger sigap_hierarki_aktif before update of aktif, peran on sigap_penugasan for each row execute function sigap_hierarki_pemicu_aktif();

-- SPDT: atasan PPL = PML yang paling banyak KK-nya bersama PPL itu (dihitung ulang setiap daftar KK berubah)
create or replace function sigap_hierarki_spdt_ppl(p_kegiatan bigint, p_ppl bigint) returns bigint
language sql stable as $$
  select pml_akun_id from sigap_spdt_kk
   where kegiatan_id = p_kegiatan and ppl_akun_id = p_ppl and pml_akun_id is not null and pml_akun_id <> p_ppl
   group by pml_akun_id order by count(*) desc, pml_akun_id limit 1
$$;

create or replace function sigap_hierarki_pemicu_spdt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_induk text;
  v_pml bigint;
begin
  for r in select distinct kegiatan_id, ppl_akun_id from baru where ppl_akun_id is not null loop
    v_pml := sigap_hierarki_spdt_ppl(r.kegiatan_id, r.ppl_akun_id);
    if v_pml is null then continue; end if;
    for v_induk in select sigap_induk_kegiatan(r.kegiatan_id) loop
      perform sigap_hierarki_sebar(v_induk, r.ppl_akun_id, v_pml, 'sigap_spdt_kk', r.kegiatan_id, 'daftar KK SPDT');
    end loop;
  end loop;
  return null;
end $$;
drop trigger if exists sigap_hierarki_spdt_ins on sigap_spdt_kk;
create trigger sigap_hierarki_spdt_ins after insert on sigap_spdt_kk referencing new table as baru for each statement execute function sigap_hierarki_pemicu_spdt();
drop trigger if exists sigap_hierarki_spdt_upd on sigap_spdt_kk;
create trigger sigap_hierarki_spdt_upd after update on sigap_spdt_kk referencing new table as baru for each statement execute function sigap_hierarki_pemicu_spdt();

-- Bahan halaman: atasan menurut satu sumber untuk satu kegiatan (dipakai Kelola > Hierarki untuk penanda asal)
create or replace view sigap_v_hierarki_kegiatan as
  select g.kegiatan_id, h.induk_kode, h.akun_id, h.atasan_akun_id, h.sumber, h.kegiatan_asal, h.diubah_oleh, h.diubah_at
    from sigap_hierarki h join (select kode, unnest(kegiatan_ids) kegiatan_id from sigap_induk where aktif) g on g.kode = h.induk_kode;

-- ---------- Isi awal (hanya mengisi yang kosong; tidak menimpa) ----------
do $$
declare
  r record;
begin
  -- Pascabencana: tim pendataan (penugasan kegiatan 1 berperan korwil/PML/PPL)
  insert into sigap_hierarki (induk_kode, akun_id, atasan_akun_id, sumber, kegiatan_asal, diubah_oleh)
  select g.kode, p.akun_id, p.atasan_akun_id, 'sigap_penugasan', p.kegiatan_id, 'isi awal'
    from sigap_penugasan p join sigap_kegiatan k on k.id = p.kegiatan_id and k.jenis = 'pendataan'
    join (select kode, unnest(kegiatan_ids) kegiatan_id from sigap_induk where aktif) g on g.kegiatan_id = p.kegiatan_id
   where p.aktif and p.peran in ('korwil', 'pml', 'ppl') and p.atasan_akun_id is not null
  on conflict do nothing;

  -- Seruti dan lainnya: alokasi Stage 1 (sigap_tim)
  insert into sigap_hierarki (induk_kode, akun_id, atasan_akun_id, sumber, kegiatan_asal, diubah_oleh)
  select g.kode, t.akun_id, t.atasan_akun_id, 'sigap_tim', t.kegiatan_id, 'isi awal'
    from sigap_tim t join (select kode, unnest(kegiatan_ids) kegiatan_id from sigap_induk where aktif) g on g.kegiatan_id = t.kegiatan_id
   where t.atasan_akun_id is not null
  on conflict do nothing;

  -- Hierarki pelatihan yang diatur manual (peserta yang tidak ada di tim pendataan)
  insert into sigap_hierarki (induk_kode, akun_id, atasan_akun_id, sumber, kegiatan_asal, diubah_oleh)
  select g.kode, h.akun_id, h.atasan_akun_id, 'sigap_pelatihan_hierarki', h.kegiatan_id, 'isi awal'
    from sigap_pelatihan_hierarki h join (select kode, unnest(kegiatan_ids) kegiatan_id from sigap_induk where aktif) g on g.kegiatan_id = h.kegiatan_id
   where h.atasan_akun_id is not null
  on conflict do nothing;

  -- SPDT: pasangan PPL-PML terbanyak di daftar KK
  insert into sigap_hierarki (induk_kode, akun_id, atasan_akun_id, sumber, kegiatan_asal, diubah_oleh)
  select g.kode, x.ppl_akun_id, sigap_hierarki_spdt_ppl(x.kegiatan_id, x.ppl_akun_id), 'sigap_spdt_kk', x.kegiatan_id, 'isi awal'
    from (select distinct kegiatan_id, ppl_akun_id from sigap_spdt_kk where ppl_akun_id is not null) x
    join (select kode, unnest(kegiatan_ids) kegiatan_id from sigap_induk where aktif) g on g.kegiatan_id = x.kegiatan_id
   where sigap_hierarki_spdt_ppl(x.kegiatan_id, x.ppl_akun_id) is not null
  on conflict do nothing;

  insert into sigap_hierarki_riwayat (induk_kode, akun_id, atasan_lama, atasan_baru, sumber, kegiatan_asal, diubah_oleh)
  select induk_kode, akun_id, null, atasan_akun_id, sumber, kegiatan_asal, 'isi awal' from sigap_hierarki;

  -- Sebarkan ke semua kegiatan induk (hanya mengisi yang kosong atau berbeda; uji kering: tidak ada yang berbeda, hanya yang kosong)
  for r in select induk_kode, akun_id, atasan_akun_id, sumber, kegiatan_asal from sigap_hierarki loop
    perform sigap_hierarki_sebar(r.induk_kode, r.akun_id, r.atasan_akun_id, r.sumber, r.kegiatan_asal, 'isi awal');
  end loop;

  -- Peserta pelatihan tanpa atasan (mis. PML/korwil puncak) tetap dapat baris hierarki supaya Monitoring memakai pohon
  insert into sigap_pelatihan_hierarki (kegiatan_id, akun_id, peran_pelatihan, atasan_akun_id, sumber, diubah_oleh, diubah_at)
  select p.kegiatan_id, p.akun_id, p.peran, null, 'satu_sumber', 'isi awal', now()
    from sigap_penugasan p join sigap_kegiatan k on k.id = p.kegiatan_id and k.jenis = 'pelatihan'
   where p.aktif and p.peran in ('korwil', 'pml', 'ppl')
     and exists (select 1 from sigap_induk i where i.aktif and i.kegiatan_ids @> array[p.kegiatan_id])
  on conflict (kegiatan_id, akun_id) do nothing;
end $$;
