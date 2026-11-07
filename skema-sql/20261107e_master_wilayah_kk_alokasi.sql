-- 20261107e_master_wilayah_kk_alokasi.sql
-- Tahap A1 rancangan "sampel lintas survei": lapis 1 (Master) dan lapis 2 (Alokasi kegiatan per sub SLS).
--
--  1. master_wilayah : 1.084 sub SLS se-Kab. Solok, kunci idsubsls (kode 16 digit). Salinan bencana_wilayah TANPA kolom cakupan Pascabencana (nonaktif dan
--                      sejenisnya): master berlaku lintas kegiatan, cakupan per kegiatan disimpan di alokasi.
--  2. master_kk      : kerangka keluarga lintas kegiatan per sub SLS. Awal: salinan KK aktif dari bencana_pendataan_kk (sumber 'pascabencana', sumber_ref = id asal).
--                      Hasil updating/tag petugas TIDAK otomatis memperbarui master (setelan sinkron_ke_master menyusul pada tahap B, bawaan: tidak).
--  3. sigap_alokasi_unggah / sigap_alokasi_wilayah : alokasi satu kegiatan = (kegiatan, sub SLS) + NKS (hanya penanda/remark) + target sampel + PPL + PML.
--                      PPL dan PML boleh kosong (alokasi dini untuk RAB/identifikasi/rekrutmen; petugas menyusul). Unggah ulang MENGGANTIKAN alokasi aktif
--                      (riwayat tetap tersimpan, nonaktif_at diisi).
--  4. sigap_alokasi_impor(...) : SATU transaksi: alokasi + (opsional) penugasan petugas baru + susunan tim (sigap_tim). Pola yang sama dengan
--                      sigap_tim_sampel_impor (20261102c). Gagal di mana pun = tidak ada yang tersimpan.
--
-- Hak: hanya service_role (server). RLS aktif tanpa policy, seperti tabel sigap_* lain. Aman dijalankan ulang (if not exists / on conflict do nothing / create or replace).
-- Tidak mengubah tabel atau fungsi yang sudah ada.

begin;

-- 1. master_wilayah ---------------------------------------------------------------------------------------------------------------
create table if not exists public.master_wilayah (
  idsubsls   text primary key check (idsubsls ~ '^[0-9]{16}$'),
  kd_kec     text not null generated always as (left(idsubsls, 7)) stored,
  iddesa     text not null,
  idsls      text not null,
  kecamatan  text not null,
  nagari     text not null,
  sls        text not null,
  sub_sls    text not null,
  aktif      boolean not null default true,
  dibuat_at  timestamptz not null default now(),
  diubah_at  timestamptz not null default now()
);
create index if not exists master_wilayah_kec_idx on public.master_wilayah (kd_kec);
create index if not exists master_wilayah_desa_idx on public.master_wilayah (iddesa);

insert into public.master_wilayah (idsubsls, iddesa, idsls, kecamatan, nagari, sls, sub_sls)
select w.idsubsls, w.iddesa, w.idsls, w.kecamatan, w.nagari, w.sls, w.sub_sls
from public.bencana_wilayah w
on conflict (idsubsls) do nothing;

-- 2. master_kk --------------------------------------------------------------------------------------------------------------------
create table if not exists public.master_kk (
  id           bigint generated always as identity primary key,
  idsubsls     text not null references public.master_wilayah(idsubsls),
  nama_kk      text not null check (btrim(nama_kk) <> ''),
  nama_kk_norm text,
  anggota_lain text,
  patokan      text,
  lat          double precision,
  lng          double precision,
  sumber       text not null default 'manual',
  sumber_ref   bigint,
  aktif        boolean not null default true,
  dibuat_at    timestamptz not null default now(),
  diubah_at    timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index if not exists master_kk_subsls_idx on public.master_kk (idsubsls) where aktif;
create unique index if not exists master_kk_sumber_uq on public.master_kk (sumber, sumber_ref) where sumber_ref is not null;

insert into public.master_kk (idsubsls, nama_kk, nama_kk_norm, anggota_lain, patokan, lat, lng, sumber, sumber_ref)
select k.idsubsls, k.nama_kk, k.nama_kk_norm, nullif(btrim(coalesce(k.anggota_lain, '')), ''), nullif(btrim(coalesce(k.patokan, '')), ''),
       case when k.lat is not null and k.lng is not null then k.lat end,
       case when k.lat is not null and k.lng is not null then k.lng end,
       'pascabencana', k.id
from public.bencana_pendataan_kk k
where k.aktif
on conflict (sumber, sumber_ref) where sumber_ref is not null do nothing;

-- 3. alokasi per kegiatan ---------------------------------------------------------------------------------------------------------
create table if not exists public.sigap_alokasi_unggah (
  id            bigint generated always as identity primary key,
  kegiatan_id   bigint not null references public.sigap_kegiatan(id) on delete cascade,
  nama_berkas   text,
  oleh          text,
  jumlah        integer not null default 0,
  dengan_petugas integer not null default 0,
  catatan       jsonb,
  diunggah_at   timestamptz not null default now(),
  digantikan_at timestamptz
);
create index if not exists sigap_alokasi_unggah_keg_idx on public.sigap_alokasi_unggah (kegiatan_id, id desc);

create table if not exists public.sigap_alokasi_wilayah (
  id            bigint generated always as identity primary key,
  kegiatan_id   bigint not null references public.sigap_kegiatan(id) on delete cascade,
  unggah_id     bigint not null references public.sigap_alokasi_unggah(id),
  idsubsls      text   not null references public.master_wilayah(idsubsls),
  nks           text,
  target_sampel integer check (target_sampel is null or (target_sampel >= 0 and target_sampel <= 500)),
  ppl_akun_id   bigint references public.sigap_akun(id),
  pml_akun_id   bigint references public.sigap_akun(id),
  urut          integer not null default 0,
  nonaktif_at   timestamptz,
  dibuat_at     timestamptz not null default now(),
  check ((ppl_akun_id is null) = (pml_akun_id is null)),
  check (ppl_akun_id is null or ppl_akun_id <> pml_akun_id)
);
create unique index if not exists sigap_alokasi_wilayah_aktif_uq on public.sigap_alokasi_wilayah (kegiatan_id, idsubsls) where nonaktif_at is null;
create index if not exists sigap_alokasi_wilayah_ppl_idx on public.sigap_alokasi_wilayah (kegiatan_id, ppl_akun_id) where nonaktif_at is null;
create index if not exists sigap_alokasi_wilayah_pml_idx on public.sigap_alokasi_wilayah (kegiatan_id, pml_akun_id) where nonaktif_at is null;
create index if not exists sigap_alokasi_wilayah_subsls_idx on public.sigap_alokasi_wilayah (idsubsls);

-- Model 1 punya DUA pilihan per kegiatan (permintaan Iqbal 7 Nov 17.30):
--   dengan_updating = true  : stage 1 updating riil dilakukan petugas (di FASIH), lalu stage 2 tag sampel utama + cadangan.
--   dengan_updating = false : tanpa updating riil; prinsipnya tetap dua stage, tetapi stage 1 dilewati dan admin langsung ke stage 2
--                             (tag sampel utama dan cadangan) dari master KK apa adanya.
-- Disimpan di tabel setelan sampel yang sudah ada (satu baris per kegiatan). Bawaan true = perilaku sekarang.
alter table public.sigap_sampel_konfig add column if not exists dengan_updating boolean not null default true;
comment on column public.sigap_sampel_konfig.dengan_updating is 'Model 1: true = ada updating riil sebelum tag sampel; false = tanpa updating, langsung tag sampel utama dan cadangan dari master KK.';

-- hak dan RLS ---------------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['master_wilayah', 'master_kk', 'sigap_alokasi_unggah', 'sigap_alokasi_wilayah'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

comment on table public.master_wilayah is 'Master sub SLS se-Kab. Solok (kunci kode 16 digit), lintas kegiatan. Bukan penanda cakupan Pascabencana.';
comment on table public.master_kk is 'Master keluarga per sub SLS, lintas kegiatan. Sumber awal: salinan bencana_pendataan_kk. Diperbarui lewat menu Master atau sinkron terkendali, bukan otomatis.';
comment on table public.sigap_alokasi_wilayah is 'Alokasi kegiatan per sub SLS: NKS (remark), target sampel, PPL, PML. Satu baris aktif per (kegiatan, sub SLS).';

-- 4. impor atomik -----------------------------------------------------------------------------------------------------------------
create or replace function public.sigap_alokasi_impor(
  p_kegiatan bigint,
  p_oleh text,
  p_berkas text,
  p_baris jsonb,
  p_catatan jsonb,
  p_tim jsonb,
  p_tugaskan boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_unggah bigint;
  v_sumber text;
  v_n integer;
  v_baru integer := 0;
  v_tim integer := 0;
  v_dengan integer;
  v_tim_arr jsonb := coalesce(p_tim, '[]'::jsonb);
  e jsonb;
  v_hilang text;
begin
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    return jsonb_build_object('ok', false, 'kode', 'KOSONG', 'pesan', 'Tidak ada baris alokasi untuk disimpan.');
  end if;
  if jsonb_typeof(v_tim_arr) <> 'array' then
    return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Susunan tim tidak terbaca.');
  end if;
  if (select count(*) from jsonb_array_elements(p_baris) x) <> (select count(distinct x ->> 'idsubsls') from jsonb_array_elements(p_baris) x) then
    return jsonb_build_object('ok', false, 'kode', 'SUBSLS_GANDA', 'pesan', 'Ada kode sub SLS yang muncul lebih dari sekali pada berkas.');
  end if;
  select string_agg(distinct x ->> 'idsubsls', ', ') into v_hilang
  from (select x from jsonb_array_elements(p_baris) x
        where not exists (select 1 from public.master_wilayah m where m.idsubsls = x ->> 'idsubsls' and m.aktif) limit 5) q;
  if v_hilang is not null then
    return jsonb_build_object('ok', false, 'kode', 'SUBSLS_TIDAK_ADA', 'pesan', 'Kode sub SLS tidak ada di master wilayah: ' || v_hilang || '.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_baris) x
    where ((x ->> 'ppl_akun_id') is null) <> ((x ->> 'pml_akun_id') is null)
       or (x ->> 'ppl_akun_id') = (x ->> 'pml_akun_id')
  ) then
    return jsonb_build_object('ok', false, 'kode', 'PETUGAS_TIDAK_SAH', 'pesan', 'PPL dan PML harus terisi berpasangan dan tidak boleh orang yang sama.');
  end if;
  if exists (
    select 1 from (
      select (x ->> 'ppl_akun_id') as a from jsonb_array_elements(p_baris) x where (x ->> 'ppl_akun_id') is not null
      union
      select (x ->> 'pml_akun_id') from jsonb_array_elements(p_baris) x where (x ->> 'pml_akun_id') is not null
    ) q
    left join public.sigap_akun a on a.id = case when q.a ~ '^[0-9]{1,18}$' then q.a::bigint end
    where a.id is null or not a.aktif
  ) then
    return jsonb_build_object('ok', false, 'kode', 'AKUN_TIDAK_SAH', 'pesan', 'Ada PPL/PML pada berkas yang tidak ditemukan atau tidak aktif.');
  end if;

  if jsonb_array_length(v_tim_arr) > 0 then
    if exists (select 1 from jsonb_array_elements(v_tim_arr) x where coalesce(x ->> 'peran', '') not in ('ppl', 'pml', 'korwil', 'supervisor')) then
      return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Ada peran yang tidak sah pada susunan tim.');
    end if;
    if (select count(*) from jsonb_array_elements(v_tim_arr)) <> (select count(distinct x ->> 'akun_id') from jsonb_array_elements(v_tim_arr) x) then
      return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Ada akun yang muncul lebih dari sekali pada susunan tim.');
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_tim_arr) x
      left join public.sigap_akun a on a.id = case when (x ->> 'akun_id') ~ '^[0-9]{1,18}$' then (x ->> 'akun_id')::bigint end
      where a.id is null or not a.aktif
    ) then
      return jsonb_build_object('ok', false, 'kode', 'AKUN_TIDAK_SAH', 'pesan', 'Ada akun pada susunan tim yang tidak ditemukan atau tidak aktif.');
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_tim_arr) x
      where nullif(x ->> 'atasan_akun_id', '') is not null
        and ((x ->> 'atasan_akun_id') = (x ->> 'akun_id')
             or not exists (select 1 from jsonb_array_elements(v_tim_arr) y where (y ->> 'akun_id') = (x ->> 'atasan_akun_id')))
    ) then
      return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Atasan harus anggota susunan tim yang sama dan bukan diri sendiri.');
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('sigap_alokasi:' || p_kegiatan::text));
  perform pg_advisory_xact_lock(hashtext('sigap_tim:' || p_kegiatan::text));

  if jsonb_array_length(v_tim_arr) > 0 and exists (
    select 1 from jsonb_array_elements(v_tim_arr) x
    join public.sigap_penugasan p on p.kegiatan_id = p_kegiatan and p.akun_id = (x ->> 'akun_id')::bigint and p.aktif and p.peran <> (x ->> 'peran')
  ) then
    return jsonb_build_object('ok', false, 'kode', 'PERAN_BENTROK', 'pesan', 'Ada petugas yang sudah ditugaskan dengan peran lain pada kegiatan ini. Ubah dahulu di Penugasan dan ST.');
  end if;

  update public.sigap_alokasi_wilayah set nonaktif_at = now() where kegiatan_id = p_kegiatan and nonaktif_at is null;
  update public.sigap_alokasi_unggah set digantikan_at = now() where kegiatan_id = p_kegiatan and digantikan_at is null;
  insert into public.sigap_alokasi_unggah (kegiatan_id, nama_berkas, oleh, catatan) values (p_kegiatan, left(p_berkas, 200), left(p_oleh, 120), p_catatan) returning id into v_unggah;

  insert into public.sigap_alokasi_wilayah (kegiatan_id, unggah_id, idsubsls, nks, target_sampel, ppl_akun_id, pml_akun_id, urut)
  select p_kegiatan, v_unggah, e2.v ->> 'idsubsls', nullif(btrim(e2.v ->> 'nks'), ''),
         nullif(e2.v ->> 'target_sampel', '')::integer,
         nullif(e2.v ->> 'ppl_akun_id', '')::bigint, nullif(e2.v ->> 'pml_akun_id', '')::bigint, e2.urut::integer
  from jsonb_array_elements(p_baris) with ordinality as e2(v, urut);
  get diagnostics v_n = row_count;
  select count(*) into v_dengan from public.sigap_alokasi_wilayah where unggah_id = v_unggah and ppl_akun_id is not null;
  update public.sigap_alokasi_unggah set jumlah = v_n, dengan_petugas = v_dengan where id = v_unggah;

  if jsonb_array_length(v_tim_arr) > 0 then
    v_sumber := 'impor_alokasi:' || v_unggah;
    if coalesce(p_tugaskan, true) then
      for e in select x from jsonb_array_elements(v_tim_arr) x loop
        insert into public.sigap_penugasan (kegiatan_id, akun_id, peran, aktif, sumber)
        values (p_kegiatan, (e ->> 'akun_id')::bigint, e ->> 'peran', true, v_sumber)
        on conflict (kegiatan_id, akun_id) do update
          set aktif = true, peran = excluded.peran, sumber = excluded.sumber
          where public.sigap_penugasan.aktif = false;
        get diagnostics v_n = row_count;
        v_baru := v_baru + v_n;
      end loop;
    end if;
    delete from public.sigap_tim where kegiatan_id = p_kegiatan and sumber = 'impor';
    insert into public.sigap_tim (kegiatan_id, akun_id, peran, atasan_akun_id, sumber, diubah_oleh)
    select p_kegiatan, (x ->> 'akun_id')::bigint, x ->> 'peran', nullif(x ->> 'atasan_akun_id', '')::bigint, 'impor', left(p_oleh, 120)
    from jsonb_array_elements(v_tim_arr) x
    on conflict (kegiatan_id, akun_id) do nothing;
    get diagnostics v_tim = row_count;
  end if;

  return jsonb_build_object('ok', true, 'unggah_id', v_unggah, 'jumlah', (select jumlah from public.sigap_alokasi_unggah where id = v_unggah),
                            'dengan_petugas', v_dengan, 'penugasan_baru', v_baru, 'tim', v_tim);
end
$function$;

revoke all on function public.sigap_alokasi_impor(bigint, text, text, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sigap_alokasi_impor(bigint, text, text, jsonb, jsonb, jsonb, boolean) to service_role;

-- Hitung KK aktif per sub SLS (dipakai layar alokasi dan Master; PostgREST tidak punya group by).
create or replace function public.master_kk_hitung(p_ids text[])
returns table (idsubsls text, jumlah bigint)
language sql
stable
security definer
set search_path to 'public'
as $f$
  select k.idsubsls, count(*)::bigint
  from public.master_kk k
  where k.aktif and k.idsubsls = any (p_ids)
  group by k.idsubsls
$f$;
revoke all on function public.master_kk_hitung(text[]) from public, anon, authenticated;
grant execute on function public.master_kk_hitung(text[]) to service_role;

commit;

-- Verifikasi (hanya baca): jumlah salinan, RLS, fungsi.
select
  (select count(*) from public.master_wilayah) as wilayah,
  (select count(*) from public.master_kk) as kk,
  (select count(distinct idsubsls) from public.master_kk) as subsls_berkk,
  (select count(*) from public.bencana_pendataan_kk where aktif) as kk_asal_aktif,
  (select count(*) from public.sigap_alokasi_wilayah) as alokasi,
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.master_wilayah'::regclass, 'public.master_kk'::regclass, 'public.sigap_alokasi_unggah'::regclass, 'public.sigap_alokasi_wilayah'::regclass)) as rls_aktif,
  (select count(*) from pg_proc where proname in ('sigap_alokasi_impor', 'master_kk_hitung') and pronamespace = 'public'::regnamespace) as fungsi_ada;
