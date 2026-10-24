-- =====================================================================
-- 20261024s_keu_pok_banding_usulan.sql
-- Kertas Kerja Revisi POK (SIGAP) - papan 6 "Impor POK hasil penetapan":
-- pencocokan berkas dengan USULAN (kolom Menjadi kertas kerja) lewat kunci baris, serta keputusan operator per baris.
-- Bergantung pada 20261024a-r. Aman diulang. Tanpa DELETE/DROP. Hanya menambah (tabel, tampilan, fungsi, trigger).
--
--  1. keu_pok_unggah_tanda : keputusan operator per baris selisih (pakai | ditanyakan | belum), kunci = (unggahan, kunci baris).
--  2. keu_v_pok_banding_rinci : keu_v_pok_banding + kunci baris + jumlah usulan (Menjadi) + sesuai/tidak dengan usulan + tanda.
--  3. keu_v_pok_unggah_keputusan : hitungan otomatis / menunggu keputusan / pakai / ditanyakan per unggahan.
--  4. keu_pok_unggah_tandai, keu_pok_unggah_tandai_semua : fungsi PPK (kewenangan pok_pdf); didaftarkan ke gerbang keu_jalankan.
--  5. Penjaga: unggahan TIDAK dapat diterima selama masih ada baris berstatus 'ditanyakan'.
--
-- Aturan "sesuai usulan" (hanya bila unggahan punya jadwal dasar):
--   baru      : ada baris kertas kerja (RO, akun, uraian sama) dengan jumlah Menjadi = jumlah berkas.
--   berubah / dipadankan : baris kertas kerja untuk item itu punya jumlah Menjadi = jumlah berkas.
--   hilang    : baris kertas kerja untuk item itu dikosongkan, dipindah akun, atau diganti redaksi.
--   Selain itu: DI LUAR USULAN. Tanpa jadwal dasar tidak ada usulan pembanding (sesuai_usulan = null).
-- "Diterima otomatis" = sama, atau sesuai usulan, atau sudah dipadankan PPK. Sisanya menunggu keputusan operator.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tanda keputusan operator
-- ---------------------------------------------------------------------
create table if not exists keu_pok_unggah_tanda (
  unggah_id  bigint not null references keu_pok_unggah(id),
  kunci      text   not null check (length(btrim(kunci)) >= 3),
  tanda      text   not null check (tanda in ('pakai', 'ditanyakan', 'belum')),
  catatan    text   not null default '' check (length(catatan) <= 300),
  oleh       bigint references sigap_akun(id),
  waktu      timestamptz not null default now(),
  diubah_at  timestamptz not null default now(),
  primary key (unggah_id, kunci)
);
comment on table keu_pok_unggah_tanda is 'Keputusan PPK per baris selisih pada unggahan POK: pakai angka berkas, ditanyakan (menahan penerimaan), atau belum. Diubah lewat fungsi saja.';

-- ---------------------------------------------------------------------
-- 2. Tampilan rinci
-- ---------------------------------------------------------------------
create or replace view keu_v_pok_banding_rinci with (security_invoker = true) as
with b as (
  select x.*, h.jadwal_id
  from keu_v_pok_banding x join keu_pok_unggah h on h.id = x.unggah_id
), kb as (
  select k.id as baris_id, k.kunci, p.kunci_lama
  from keu_v_pok_unggah_kunci k
  left join keu_pok_unggah_padan p on p.baris_id = k.id and not p.batal
  where k.unggah_id in (select unggah_id from b)
), r as (
  select b.*,
         coalesce(kb.kunci, dk.kunci_stabil) as kunci,
         kb.kunci_lama as kunci_padan,
         ku.jumlah_menjadi as jumlah_usulan,
         case
           when b.jadwal_id is null or b.status = 'sama' then null
           when b.status = 'baru' then coalesce(ku.jumlah_menjadi = b.jumlah_baru, false)
           when b.status = 'hilang' then coalesce(
                  ku.id is not null and (ku.jumlah_menjadi = 0
                    or coalesce(ku.akun_menjadi, ku.akun_semula) is distinct from ku.akun_semula
                    or lower(btrim(coalesce(ku.uraian_menjadi, ku.uraian_semula))) is distinct from lower(btrim(ku.uraian_semula))), false)
           else coalesce(ku.jumlah_menjadi = b.jumlah_baru, false)
         end as sesuai_usulan
  from b
  left join kb on kb.baris_id = b.baris_id
  left join keu_pok_detail dk on dk.id = b.detail_id
  left join lateral (
    select k.id, k.jumlah_menjadi, k.akun_semula, k.akun_menjadi, k.uraian_semula, k.uraian_menjadi
    from keu_kk_baris k
    where k.jadwal_id = b.jadwal_id and k.ro_kode = b.ro_kode
      and ( (b.status in ('berubah', 'dipadankan', 'hilang') and k.detail_id = b.detail_id)
         or (b.status = 'baru' and coalesce(k.akun_menjadi, k.akun_semula) = b.akun_kode
             and lower(btrim(coalesce(k.uraian_menjadi, k.uraian_semula))) = lower(btrim(b.uraian_baru))) )
    order by (case when b.status = 'baru' and k.jumlah_menjadi = b.jumlah_baru then 0 else 1 end), k.id
    limit 1
  ) ku on b.jadwal_id is not null and b.status <> 'sama'
)
select r.unggah_id, r.status, r.baris_id, r.detail_id, r.ro_kode, r.komp_kode, r.akun_kode,
       r.uraian_lama, r.uraian_baru, r.vol_lama, r.vol_baru, r.harga_lama, r.harga_baru, r.jumlah_lama, r.jumlah_baru, r.selisih,
       r.di_luar_usulan, r.jadwal_id, r.kunci, r.kunci_padan, r.jumlah_usulan, r.sesuai_usulan,
       coalesce(t.tanda, 'belum') as tanda, coalesce(t.catatan, '') as tanda_catatan,
       (r.status = 'sama' or r.status = 'dipadankan' or r.sesuai_usulan is true) as otomatis
from r
left join keu_pok_unggah_tanda t on t.unggah_id = r.unggah_id and t.kunci = r.kunci;
comment on view keu_v_pok_banding_rinci is 'keu_v_pok_banding + kunci baris, jumlah usulan (Menjadi), sesuai_usulan, tanda keputusan operator, otomatis (diterima tanpa keputusan).';

create or replace view keu_v_pok_unggah_keputusan with (security_invoker = true) as
select h.id as unggah_id,
       count(*) filter (where r.status <> 'sama' and r.otomatis)                                            as n_otomatis,
       count(*) filter (where r.status <> 'sama' and not r.otomatis and r.tanda = 'belum')                  as n_menunggu,
       count(*) filter (where r.status <> 'sama' and not r.otomatis and r.tanda = 'pakai')                  as n_pakai,
       count(*) filter (where r.status <> 'sama' and r.tanda = 'ditanyakan')                                as n_ditanyakan,
       count(*) filter (where r.sesuai_usulan is false)                                                     as n_di_luar_usulan
from keu_pok_unggah h left join keu_v_pok_banding_rinci r on r.unggah_id = h.id
group by h.id;
comment on view keu_v_pok_unggah_keputusan is 'Hitungan keputusan per unggahan: otomatis, menunggu, pakai angka berkas, ditanyakan, di luar usulan.';

-- ---------------------------------------------------------------------
-- 3. Fungsi PPK
-- ---------------------------------------------------------------------
create or replace function keu_pok_unggah_tandai(p_unggah bigint, p_kunci text, p_tanda text, p_catatan text default '',
                                                 p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare h keu_pok_unggah;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  if p_tanda is null or p_tanda not in ('pakai', 'ditanyakan', 'belum') then
    raise exception 'Tanda harus pakai, ditanyakan, atau belum' using errcode = '22023';
  end if;
  select * into h from keu_pok_unggah where id = p_unggah;
  if not found then raise exception 'Unggahan % tidak ada', p_unggah using errcode = 'P0002'; end if;
  if h.status <> 'diunggah' then raise exception 'Unggahan berstatus %', h.status using errcode = '23514'; end if;
  if not exists (select 1 from keu_v_pok_banding_rinci r where r.unggah_id = p_unggah and r.kunci = p_kunci and r.status <> 'sama') then
    raise exception 'Baris % bukan baris selisih pada unggahan %', p_kunci, p_unggah using errcode = '23514';
  end if;
  insert into keu_pok_unggah_tanda(unggah_id, kunci, tanda, catatan, oleh, waktu, diubah_at)
  values (p_unggah, p_kunci, p_tanda, left(btrim(coalesce(p_catatan, '')), 300), p_akun, now(), now())
  on conflict (unggah_id, kunci) do update
    set tanda = excluded.tanda, catatan = excluded.catatan, oleh = excluded.oleh, waktu = now(), diubah_at = now();
end $$;
revoke execute on function keu_pok_unggah_tandai(bigint, text, text, text, bigint) from public, anon, authenticated;

-- Pakai angka berkas untuk SEMUA baris yang masih menunggu keputusan (yang berstatus ditanyakan tidak disentuh).
create or replace function keu_pok_unggah_tandai_semua(p_unggah bigint, p_akun bigint default keu_akun_sesi())
returns int language plpgsql security definer set search_path = public as $$
declare h keu_pok_unggah; n int;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'pok_pdf') then raise exception 'Akun % bukan PPK', p_akun using errcode = '42501'; end if;
  select * into h from keu_pok_unggah where id = p_unggah;
  if not found then raise exception 'Unggahan % tidak ada', p_unggah using errcode = 'P0002'; end if;
  if h.status <> 'diunggah' then raise exception 'Unggahan berstatus %', h.status using errcode = '23514'; end if;
  with c as (
    select distinct r.kunci from keu_v_pok_banding_rinci r
    where r.unggah_id = p_unggah and r.status <> 'sama' and not r.otomatis and r.tanda = 'belum' and r.kunci is not null
  ), i as (
    insert into keu_pok_unggah_tanda(unggah_id, kunci, tanda, catatan, oleh, waktu, diubah_at)
    select p_unggah, c.kunci, 'pakai', '', p_akun, now(), now() from c
    on conflict (unggah_id, kunci) do update set tanda = 'pakai', oleh = excluded.oleh, waktu = now(), diubah_at = now()
      where keu_pok_unggah_tanda.tanda = 'belum'
    returning 1
  )
  select count(*) into n from i;
  return n;
end $$;
revoke execute on function keu_pok_unggah_tandai_semua(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Penjaga: unggahan tidak dapat diterima selama ada baris 'ditanyakan'
-- ---------------------------------------------------------------------
create or replace function keu_pok_unggah_tanda_cek() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_op = 'UPDATE' and old.status = 'diunggah' and new.status = 'diterima' then
    select count(*) into n from keu_pok_unggah_tanda where unggah_id = new.id and tanda = 'ditanyakan';
    if n > 0 then
      raise exception '% baris masih ditandai ditanyakan. Putuskan (pakai angka berkas) atau tolak unggahan.', n using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function keu_pok_unggah_tanda_cek() from public, anon, authenticated;

create or replace function keu_pok_unggah_tanda_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if keu_akun_sesi() is not null then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    return old;
  end if;
  new.diubah_at := now();
  return new;
end $$;
revoke execute on function keu_pok_unggah_tanda_jaga() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_unggah'::regclass and tgname = 'keu_t0b_tanda') then
    create trigger keu_t0b_tanda before update on keu_pok_unggah for each row execute function keu_pok_unggah_tanda_cek();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pok_unggah_tanda'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update or delete on keu_pok_unggah_tanda for each row execute function keu_pok_unggah_tanda_jaga();
    create trigger keu_t1_jaga before insert or update or delete on keu_pok_unggah_tanda for each row execute function keu_jaga('pok_pdf');
    create trigger keu_t9_jejak after insert or update on keu_pok_unggah_tanda for each row execute function keu_jejak();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. RLS, hak, dan pendaftaran di gerbang keu_jalankan
-- ---------------------------------------------------------------------
alter table keu_pok_unggah_tanda enable row level security;
revoke all on table keu_pok_unggah_tanda from anon, authenticated;
grant all on table keu_pok_unggah_tanda to service_role;
revoke all on keu_v_pok_banding_rinci, keu_v_pok_unggah_keputusan from anon, authenticated;
grant select on keu_v_pok_banding_rinci, keu_v_pok_unggah_keputusan to service_role;

-- Menambah dua fungsi ke daftar izin keu_jalankan tanpa menulis ulang seluruh fungsi (aman diulang).
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_pok_unggah_tandai''' in d) = 0 then
    d := replace(d, '''keu_pok_unggah_tolak'',', '''keu_pok_unggah_tandai'',''keu_pok_unggah_tandai_semua'',''keu_pok_unggah_tolak'',');
    if position('''keu_pok_unggah_tandai''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
