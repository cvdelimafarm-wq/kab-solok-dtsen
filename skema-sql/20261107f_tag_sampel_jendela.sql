-- 20261107f_tag_sampel_jendela.sql
-- Tahap A2 rancangan "sampel lintas survei": stage 2 = tag sampel utama/cadangan dari master KK, dengan JENDELA RILIS 24 jam yang ditegakkan di basis data.
-- Syarat: migrasi 20261107e sudah dijalankan (master_wilayah, master_kk, sigap_alokasi_wilayah).
--
--  1. sigap_sampel_konfig.cadangan_per_sls : jumlah sampel cadangan per sub SLS (0 = tanpa cadangan). Berbeda tiap survei.
--  2. sigap_sampel_jendela  : riwayat jendela rilis per kegiatan. Dibuka Ketua/Wakil, berlaku 24 jam (waktu SERVER), bisa ditutup lebih awal, bisa dibuka kembali
--                            sesudah terkunci dengan ALASAN (tercatat). Status: belum (tak pernah dibuka) | terbuka | terkunci.
--  3. sigap_sampel_tag      : satu baris = (kegiatan, KK master) yang ditandai sebagai sampel 'utama' atau 'cadangan', siapa/kapan/lewat apa, dan hasil pendataan
--                            (didata | menolak | tidak_ditemukan). Melepas tag = mengisi dilepas_at (riwayat tetap).
--  4. Fungsi (semua security definer, hanya service_role):
--       sigap_jendela_info, sigap_jendela_buka, sigap_jendela_tutup,
--       sigap_tag_set (PPL menandai, hanya saat jendela terbuka), sigap_tag_lepas, sigap_tag_hasil (PPL menandai hasil pendataan),
--       sigap_tag_impor (Ketua/Wakil unggah templat; mode 'tambah' menolak konflik, mode 'ganti' menggantikan tag sub SLS yang ada di berkas).
--
-- Aturan inti (ditegakkan di sini, bukan hanya di layar):
--   * PPL hanya dapat menandai/melepas tag di sub SLS miliknya DAN hanya selama jendela terbuka.
--   * Jumlah utama per sub SLS <= target alokasi (atau target bawaan setelan); cadangan <= cadangan_per_sls.
--   * Satu KK hanya satu tag aktif per kegiatan. Mengganti peran (utama <-> cadangan) atomik, kecuali tag sudah punya hasil.
--   * Unggah Ketua/Wakil hanya sebelum jendela pernah dibuka atau selama terbuka; setelah terkunci harus membuka kembali jendela (dengan alasan).
--   * Tag yang sudah punya hasil pendataan tidak dapat dilepas atau digantikan.
-- Aman dijalankan ulang. Tidak mengubah objek lain selain menambah satu kolom setelan.

begin;

alter table public.sigap_sampel_konfig add column if not exists cadangan_per_sls integer not null default 0 check (cadangan_per_sls between 0 and 100);
comment on column public.sigap_sampel_konfig.cadangan_per_sls is 'Jumlah sampel cadangan per sub SLS pada stage 2 (0 = tanpa cadangan).';

-- 2. jendela rilis ----------------------------------------------------------------------------------------------------------------
create table if not exists public.sigap_sampel_jendela (
  id               bigint generated always as identity primary key,
  kegiatan_id      bigint not null references public.sigap_kegiatan(id) on delete cascade,
  dibuka_at        timestamptz not null default now(),
  ditutup_at       timestamptz not null,
  dibuka_oleh_akun bigint references public.sigap_akun(id),
  dibuka_oleh      text,
  alasan           text,
  buka_kembali     boolean not null default false,
  ditutup_awal_at  timestamptz,
  ditutup_oleh     text,
  check (ditutup_at > dibuka_at)
);
create index if not exists sigap_sampel_jendela_keg_idx on public.sigap_sampel_jendela (kegiatan_id, id desc);

-- 3. tag sampel -------------------------------------------------------------------------------------------------------------------
create table if not exists public.sigap_sampel_tag (
  id               bigint generated always as identity primary key,
  kegiatan_id      bigint not null references public.sigap_kegiatan(id) on delete cascade,
  idsubsls         text   not null references public.master_wilayah(idsubsls),
  kk_id            bigint not null references public.master_kk(id),
  peran            text   not null check (peran in ('utama', 'cadangan')),
  via              text   not null default 'hp' check (via in ('hp', 'unggah')),
  berkas           text,
  ditandai_oleh    bigint references public.sigap_akun(id),
  ditandai_at      timestamptz not null default now(),
  hasil            text check (hasil is null or hasil in ('didata', 'menolak', 'tidak_ditemukan')),
  hasil_at         timestamptz,
  hasil_oleh       bigint references public.sigap_akun(id),
  dilepas_at       timestamptz,
  dilepas_oleh     bigint references public.sigap_akun(id),
  alasan_lepas     text
);
create unique index if not exists sigap_sampel_tag_aktif_uq on public.sigap_sampel_tag (kegiatan_id, kk_id) where dilepas_at is null;
create index if not exists sigap_sampel_tag_subsls_idx on public.sigap_sampel_tag (kegiatan_id, idsubsls) where dilepas_at is null;

do $$
declare t text;
begin
  foreach t in array array['sigap_sampel_jendela', 'sigap_sampel_tag'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

comment on table public.sigap_sampel_jendela is 'Jendela rilis sampel tahap 2 per kegiatan: dibuka Ketua/Wakil, 24 jam, dapat dibuka kembali dengan alasan. Waktu dihitung server.';
comment on table public.sigap_sampel_tag is 'Tag sampel stage 2: KK master yang ditandai utama/cadangan pada satu kegiatan, plus hasil pendataan.';

-- 4a. status jendela --------------------------------------------------------------------------------------------------------------
-- Waktu untuk HP ditulis ISO 8601 UTC dengan milidetik ("2026-11-07T10:44:56.123Z"): format ini terbaca semua peramban, termasuk Safari lama.
create or replace function public.sigap_iso(p_ts timestamptz)
returns text
language sql
immutable
set search_path to 'public'
as $f$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$f$;

create or replace function public.sigap_jendela_status(p_kegiatan bigint)
returns text
language sql
stable
security definer
set search_path to 'public'
as $f$
  select coalesce(
    (select case when j.ditutup_awal_at is null and now() < j.ditutup_at then 'terbuka' else 'terkunci' end
     from public.sigap_sampel_jendela j where j.kegiatan_id = p_kegiatan order by j.id desc limit 1),
    'belum');
$f$;

create or replace function public.sigap_jendela_info(p_kegiatan bigint)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $f$
  select coalesce(
    (select jsonb_build_object(
        'status', case when j.ditutup_awal_at is null and now() < j.ditutup_at then 'terbuka' else 'terkunci' end,
        'id', j.id,
        'dibuka_at', public.sigap_iso(j.dibuka_at),
        'ditutup_at', public.sigap_iso(coalesce(j.ditutup_awal_at, j.ditutup_at)),
        'batas_at', public.sigap_iso(j.ditutup_at),
        'detik_sisa', case when j.ditutup_awal_at is null and now() < j.ditutup_at then floor(extract(epoch from (j.ditutup_at - now())))::integer else 0 end,
        'dibuka_oleh', j.dibuka_oleh,
        'alasan', j.alasan,
        'buka_kembali', j.buka_kembali,
        'jumlah_buka', (select count(*) from public.sigap_sampel_jendela x where x.kegiatan_id = p_kegiatan),
        'sekarang', public.sigap_iso(now()))
     from public.sigap_sampel_jendela j where j.kegiatan_id = p_kegiatan order by j.id desc limit 1),
    jsonb_build_object('status', 'belum', 'jumlah_buka', 0, 'detik_sisa', 0, 'sekarang', public.sigap_iso(now())));
$f$;

-- 4b. buka / tutup ----------------------------------------------------------------------------------------------------------------
create or replace function public.sigap_jendela_buka(p_kegiatan bigint, p_akun bigint, p_nama text, p_alasan text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_ulang boolean;
  v_alasan text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  if not exists (select 1 from public.sigap_kegiatan where id = p_kegiatan) then
    return jsonb_build_object('ok', false, 'kode', 'KEGIATAN_TIDAK_ADA', 'pesan', 'Kegiatan tidak ditemukan.');
  end if;
  perform pg_advisory_xact_lock(hashtext('sigap_jendela:' || p_kegiatan::text));
  if not exists (select 1 from public.sigap_alokasi_wilayah where kegiatan_id = p_kegiatan and nonaktif_at is null and ppl_akun_id is not null) then
    return jsonb_build_object('ok', false, 'kode', 'BELUM_ADA_ALOKASI', 'pesan', 'Belum ada alokasi sub SLS dengan PPL. Unggah alokasi lebih dulu.');
  end if;
  v_status := public.sigap_jendela_status(p_kegiatan);
  if v_status = 'terbuka' then
    return jsonb_build_object('ok', false, 'kode', 'SUDAH_TERBUKA', 'pesan', 'Jendela rilis sudah terbuka.');
  end if;
  v_ulang := (v_status = 'terkunci');
  if v_ulang and (v_alasan is null or char_length(v_alasan) < 5) then
    return jsonb_build_object('ok', false, 'kode', 'ALASAN_WAJIB', 'pesan', 'Membuka kembali jendela yang sudah terkunci wajib disertai alasan (minimal 5 huruf).');
  end if;
  insert into public.sigap_sampel_jendela (kegiatan_id, dibuka_at, ditutup_at, dibuka_oleh_akun, dibuka_oleh, alasan, buka_kembali)
  values (p_kegiatan, now(), now() + interval '24 hours', p_akun, left(p_nama, 120), left(v_alasan, 500), v_ulang);
  return jsonb_build_object('ok', true, 'buka_kembali', v_ulang, 'info', public.sigap_jendela_info(p_kegiatan));
end
$function$;

create or replace function public.sigap_jendela_tutup(p_kegiatan bigint, p_nama text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('sigap_jendela:' || p_kegiatan::text));
  select j.id into v_id from public.sigap_sampel_jendela j
   where j.kegiatan_id = p_kegiatan and j.ditutup_awal_at is null and now() < j.ditutup_at order by j.id desc limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false, 'kode', 'TIDAK_TERBUKA', 'pesan', 'Jendela rilis tidak sedang terbuka.');
  end if;
  update public.sigap_sampel_jendela set ditutup_awal_at = now(), ditutup_oleh = left(p_nama, 120) where id = v_id;
  return jsonb_build_object('ok', true, 'info', public.sigap_jendela_info(p_kegiatan));
end
$function$;

-- 4c. batas jumlah per sub SLS ------------------------------------------------------------------------------------------------------
-- (target utama, jatah cadangan) untuk satu sub SLS beralokasi; null bila sub SLS tidak beralokasi pada kegiatan itu.
create or replace function public.sigap_tag_batas(p_kegiatan bigint, p_idsubsls text)
returns table (target integer, cadangan integer, ppl_akun_id bigint)
language sql
stable
security definer
set search_path to 'public'
as $f$
  select coalesce(a.target_sampel, k.target_per_sls, 10)::integer,
         coalesce(k.cadangan_per_sls, 0)::integer,
         a.ppl_akun_id
  from public.sigap_alokasi_wilayah a
  left join public.sigap_sampel_konfig k on k.kegiatan_id = a.kegiatan_id
  where a.kegiatan_id = p_kegiatan and a.idsubsls = p_idsubsls and a.nonaktif_at is null
$f$;

-- 4d. PPL menandai sampel ---------------------------------------------------------------------------------------------------------
create or replace function public.sigap_tag_set(p_kegiatan bigint, p_akun bigint, p_idsubsls text, p_kk bigint, p_peran text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target integer; v_cad integer; v_ppl bigint;
  v_status text;
  v_ada record;
  v_n_utama integer; v_n_cad integer;
begin
  if p_peran is null or p_peran not in ('utama', 'cadangan') then
    return jsonb_build_object('ok', false, 'kode', 'PERAN_TIDAK_SAH', 'pesan', 'Peran sampel harus utama atau cadangan.');
  end if;
  perform pg_advisory_xact_lock(hashtext('sigap_tag:' || p_kegiatan::text || ':' || p_idsubsls));
  select b.target, b.cadangan, b.ppl_akun_id into v_target, v_cad, v_ppl from public.sigap_tag_batas(p_kegiatan, p_idsubsls) b;
  if v_target is null then
    return jsonb_build_object('ok', false, 'kode', 'SUBSLS_TIDAK_DIALOKASIKAN', 'pesan', 'Sub SLS ini tidak ada dalam alokasi kegiatan.');
  end if;
  if v_ppl is distinct from p_akun then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_PPL', 'pesan', 'Hanya PPL sub SLS ini yang dapat menandai sampel.');
  end if;
  v_status := public.sigap_jendela_status(p_kegiatan);
  if v_status <> 'terbuka' then
    return jsonb_build_object('ok', false, 'kode', case when v_status = 'belum' then 'JENDELA_BELUM' else 'JENDELA_TUTUP' end,
      'pesan', case when v_status = 'belum' then 'Penandaan sampel belum dibuka oleh Ketua tim.' else 'Daftar sampel sudah dikunci. Hubungi Ketua tim bila perlu dibuka kembali.' end);
  end if;
  if not exists (select 1 from public.master_kk where id = p_kk and idsubsls = p_idsubsls and aktif) then
    return jsonb_build_object('ok', false, 'kode', 'KK_TIDAK_ADA', 'pesan', 'KK tidak ditemukan pada sub SLS ini.');
  end if;

  select t.id, t.peran, t.hasil into v_ada from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = p_kk and t.dilepas_at is null;
  if found and v_ada.peran = p_peran then
    return jsonb_build_object('ok', true, 'sudah', true);
  end if;
  if found and v_ada.hasil is not null then
    return jsonb_build_object('ok', false, 'kode', 'SUDAH_ADA_HASIL', 'pesan', 'KK ini sudah punya hasil pendataan, perannya tidak dapat diubah.');
  end if;

  select count(*) filter (where peran = 'utama'), count(*) filter (where peran = 'cadangan') into v_n_utama, v_n_cad
  from public.sigap_sampel_tag where kegiatan_id = p_kegiatan and idsubsls = p_idsubsls and dilepas_at is null and kk_id <> p_kk;
  if p_peran = 'utama' and v_n_utama >= v_target then
    return jsonb_build_object('ok', false, 'kode', 'TARGET_PENUH', 'pesan', format('Sampel utama sub SLS ini sudah %s dari %s. Lepas satu dulu bila ingin mengganti.', v_n_utama, v_target));
  end if;
  if p_peran = 'cadangan' and v_cad = 0 then
    return jsonb_build_object('ok', false, 'kode', 'CADANGAN_TIDAK_ADA', 'pesan', 'Kegiatan ini tidak memakai sampel cadangan.');
  end if;
  if p_peran = 'cadangan' and v_n_cad >= v_cad then
    return jsonb_build_object('ok', false, 'kode', 'CADANGAN_PENUH', 'pesan', format('Sampel cadangan sub SLS ini sudah %s dari %s. Lepas satu dulu bila ingin mengganti.', v_n_cad, v_cad));
  end if;

  if v_ada.id is not null then
    update public.sigap_sampel_tag set dilepas_at = now(), dilepas_oleh = p_akun, alasan_lepas = 'ganti peran' where id = v_ada.id;
  end if;
  insert into public.sigap_sampel_tag (kegiatan_id, idsubsls, kk_id, peran, via, ditandai_oleh) values (p_kegiatan, p_idsubsls, p_kk, p_peran, 'hp', p_akun);
  return jsonb_build_object('ok', true, 'sudah', false, 'ganti_peran', v_ada.id is not null,
    'utama', v_n_utama + (case when p_peran = 'utama' then 1 else 0 end), 'cadangan', v_n_cad + (case when p_peran = 'cadangan' then 1 else 0 end));
end
$function$;

create or replace function public.sigap_tag_lepas(p_kegiatan bigint, p_akun bigint, p_kk bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_t record; v_ppl bigint; v_status text;
begin
  select t.id, t.idsubsls, t.hasil into v_t from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = p_kk and t.dilepas_at is null;
  if not found then
    return jsonb_build_object('ok', true, 'sudah', true);
  end if;
  perform pg_advisory_xact_lock(hashtext('sigap_tag:' || p_kegiatan::text || ':' || v_t.idsubsls));
  select b.ppl_akun_id into v_ppl from public.sigap_tag_batas(p_kegiatan, v_t.idsubsls) b;
  if v_ppl is distinct from p_akun then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_PPL', 'pesan', 'Hanya PPL sub SLS ini yang dapat melepas tag.');
  end if;
  v_status := public.sigap_jendela_status(p_kegiatan);
  if v_status <> 'terbuka' then
    return jsonb_build_object('ok', false, 'kode', case when v_status = 'belum' then 'JENDELA_BELUM' else 'JENDELA_TUTUP' end,
      'pesan', case when v_status = 'belum' then 'Penandaan sampel belum dibuka oleh Ketua tim.' else 'Daftar sampel sudah dikunci.' end);
  end if;
  if v_t.hasil is not null then
    return jsonb_build_object('ok', false, 'kode', 'SUDAH_ADA_HASIL', 'pesan', 'KK ini sudah punya hasil pendataan, tag tidak dapat dilepas.');
  end if;
  update public.sigap_sampel_tag set dilepas_at = now(), dilepas_oleh = p_akun, alasan_lepas = 'dilepas PPL' where id = v_t.id and dilepas_at is null;
  return jsonb_build_object('ok', true, 'sudah', false);
end
$function$;

-- 4e. hasil pendataan (boleh kapan saja sesudah ditandai; hanya sampel utama pada A2, cadangan baru bisa dipakai setelah tahap penggantian) --------------
create or replace function public.sigap_tag_hasil(p_kegiatan bigint, p_akun bigint, p_kk bigint, p_hasil text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_t record; v_ppl bigint;
begin
  if p_hasil is not null and p_hasil not in ('didata', 'menolak', 'tidak_ditemukan') then
    return jsonb_build_object('ok', false, 'kode', 'HASIL_TIDAK_SAH', 'pesan', 'Hasil harus didata, menolak, atau tidak ditemukan.');
  end if;
  select t.id, t.idsubsls, t.peran into v_t from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = p_kk and t.dilepas_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_SAMPEL', 'pesan', 'KK ini belum ditandai sebagai sampel.');
  end if;
  select b.ppl_akun_id into v_ppl from public.sigap_tag_batas(p_kegiatan, v_t.idsubsls) b;
  if v_ppl is distinct from p_akun then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_PPL', 'pesan', 'Hanya PPL sub SLS ini yang dapat mengisi hasil pendataan.');
  end if;
  if v_t.peran <> 'utama' then
    return jsonb_build_object('ok', false, 'kode', 'HASIL_HANYA_UTAMA', 'pesan', 'Hasil pendataan hanya untuk sampel utama. Cadangan dipakai lewat pengajuan penggantian.');
  end if;
  update public.sigap_sampel_tag set hasil = p_hasil, hasil_at = case when p_hasil is null then null else now() end, hasil_oleh = case when p_hasil is null then null else p_akun end where id = v_t.id;
  return jsonb_build_object('ok', true);
end
$function$;

-- 4f. unggah templat Ketua/Wakil --------------------------------------------------------------------------------------------------
-- p_baris: [{idsubsls, kk_id, peran}] (peran utama|cadangan). p_mode: 'tambah' (tolak bila ada konflik) | 'ganti' (sub SLS yang ada di berkas disamakan dengan berkas).
create or replace function public.sigap_tag_impor(p_kegiatan bigint, p_akun bigint, p_nama text, p_berkas text, p_baris jsonb, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_ids text[];
  v_sub text;
  v_target integer; v_cad integer;
  v_konflik integer := 0;
  v_ditambah integer := 0; v_diganti integer := 0; v_dilepas integer := 0; v_sama integer := 0; v_n integer;
  r record;
begin
  if p_mode is null or p_mode not in ('tambah', 'ganti') then
    return jsonb_build_object('ok', false, 'kode', 'MODE_TIDAK_SAH', 'pesan', 'Mode unggah harus tambah atau ganti.');
  end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    return jsonb_build_object('ok', false, 'kode', 'KOSONG', 'pesan', 'Tidak ada baris tag untuk disimpan.');
  end if;
  if exists (select 1 from jsonb_array_elements(p_baris) x where coalesce(x ->> 'peran', '') not in ('utama', 'cadangan')
             or coalesce(x ->> 'kk_id', '') !~ '^[0-9]{1,18}$' or coalesce(x ->> 'idsubsls', '') !~ '^[0-9]{16}$') then
    return jsonb_build_object('ok', false, 'kode', 'BARIS_TIDAK_SAH', 'pesan', 'Ada baris dengan kode sub SLS, ID KK, atau peran yang tidak sah.');
  end if;
  if (select count(*) from jsonb_array_elements(p_baris)) <> (select count(distinct x ->> 'kk_id') from jsonb_array_elements(p_baris) x) then
    return jsonb_build_object('ok', false, 'kode', 'KK_GANDA', 'pesan', 'Ada KK yang muncul lebih dari sekali pada berkas.');
  end if;

  perform pg_advisory_xact_lock(hashtext('sigap_jendela:' || p_kegiatan::text));
  v_status := public.sigap_jendela_status(p_kegiatan);
  if v_status = 'terkunci' then
    return jsonb_build_object('ok', false, 'kode', 'TERKUNCI', 'pesan', 'Daftar sampel sudah dikunci. Buka kembali jendela rilis (dengan alasan) bila perlu mengunggah.');
  end if;

  select array_agg(distinct x ->> 'idsubsls' order by x ->> 'idsubsls') into v_ids from jsonb_array_elements(p_baris) x;
  foreach v_sub in array v_ids loop
    perform pg_advisory_xact_lock(hashtext('sigap_tag:' || p_kegiatan::text || ':' || v_sub));
  end loop;

  if exists (select 1 from unnest(v_ids) s where not exists (select 1 from public.sigap_alokasi_wilayah a where a.kegiatan_id = p_kegiatan and a.idsubsls = s and a.nonaktif_at is null)) then
    return jsonb_build_object('ok', false, 'kode', 'SUBSLS_TIDAK_DIALOKASIKAN', 'pesan', 'Ada sub SLS pada berkas yang tidak ada dalam alokasi kegiatan.');
  end if;
  if exists (select 1 from jsonb_array_elements(p_baris) x
             where not exists (select 1 from public.master_kk k where k.id = (x ->> 'kk_id')::bigint and k.idsubsls = x ->> 'idsubsls' and k.aktif)) then
    return jsonb_build_object('ok', false, 'kode', 'KK_TIDAK_ADA', 'pesan', 'Ada ID KK pada berkas yang tidak cocok dengan sub SLS-nya atau sudah tidak aktif.');
  end if;

  -- batas jumlah dan konflik, per sub SLS
  foreach v_sub in array v_ids loop
    select b.target, b.cadangan into v_target, v_cad from public.sigap_tag_batas(p_kegiatan, v_sub) b;
    -- tag aktif di sub SLS yang TIDAK ada di berkas
    declare
      v_sisa_utama integer; v_sisa_cad integer; v_file_utama integer; v_file_cad integer;
    begin
      select count(*) filter (where t.peran = 'utama'), count(*) filter (where t.peran = 'cadangan') into v_sisa_utama, v_sisa_cad
      from public.sigap_sampel_tag t
      where t.kegiatan_id = p_kegiatan and t.idsubsls = v_sub and t.dilepas_at is null
        and (p_mode = 'tambah' and not exists (select 1 from jsonb_array_elements(p_baris) x where (x ->> 'kk_id')::bigint = t.kk_id));
      -- pada mode ganti semua tag aktif sub SLS ini digantikan berkas, jadi tidak ada sisa
      select count(*) filter (where x ->> 'peran' = 'utama'), count(*) filter (where x ->> 'peran' = 'cadangan') into v_file_utama, v_file_cad
      from jsonb_array_elements(p_baris) x where x ->> 'idsubsls' = v_sub;
      if v_sisa_utama + v_file_utama > v_target then
        return jsonb_build_object('ok', false, 'kode', 'TARGET_LEBIH', 'pesan', format('Sub SLS %s: sampel utama menjadi %s, melebihi target %s.', v_sub, v_sisa_utama + v_file_utama, v_target));
      end if;
      if v_sisa_cad + v_file_cad > v_cad then
        return jsonb_build_object('ok', false, 'kode', 'CADANGAN_LEBIH', 'pesan', format('Sub SLS %s: sampel cadangan menjadi %s, melebihi jatah %s.', v_sub, v_sisa_cad + v_file_cad, v_cad));
      end if;
    end;
  end loop;

  -- konflik: KK di berkas sudah bertag dengan peran lain (mode tambah), atau tag yang akan terganti sudah punya hasil
  select count(*) into v_konflik
  from jsonb_array_elements(p_baris) x
  join public.sigap_sampel_tag t on t.kegiatan_id = p_kegiatan and t.kk_id = (x ->> 'kk_id')::bigint and t.dilepas_at is null
  where t.peran <> x ->> 'peran' and (p_mode = 'tambah' or t.hasil is not null);
  if v_konflik > 0 then
    return jsonb_build_object('ok', false, 'kode', 'KONFLIK', 'pesan', format('%s KK sudah bertag dengan peran berbeda dari berkas. Periksa pratinjau lalu pilih mode ganti bila berkas yang benar.', v_konflik), 'konflik', v_konflik);
  end if;
  if p_mode = 'ganti' and exists (
      select 1 from public.sigap_sampel_tag t
      where t.kegiatan_id = p_kegiatan and t.idsubsls = any (v_ids) and t.dilepas_at is null and t.hasil is not null
        and not exists (select 1 from jsonb_array_elements(p_baris) x where (x ->> 'kk_id')::bigint = t.kk_id)) then
    return jsonb_build_object('ok', false, 'kode', 'HASIL_ADA', 'pesan', 'Ada tag di sub SLS ini yang sudah punya hasil pendataan tetapi tidak ada di berkas. Tag itu tidak dapat dilepas.');
  end if;

  -- terapkan
  if p_mode = 'ganti' then
    update public.sigap_sampel_tag t set dilepas_at = now(), dilepas_oleh = p_akun, alasan_lepas = 'diganti unggahan'
    where t.kegiatan_id = p_kegiatan and t.idsubsls = any (v_ids) and t.dilepas_at is null
      and not exists (select 1 from jsonb_array_elements(p_baris) x where (x ->> 'kk_id')::bigint = t.kk_id);
    get diagnostics v_dilepas = row_count;
  end if;
  for r in select (x ->> 'idsubsls') as sub, (x ->> 'kk_id')::bigint as kk, (x ->> 'peran') as peran from jsonb_array_elements(p_baris) x loop
    if exists (select 1 from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = r.kk and t.dilepas_at is null and t.peran = r.peran) then
      v_sama := v_sama + 1;
      continue;
    end if;
    update public.sigap_sampel_tag set dilepas_at = now(), dilepas_oleh = p_akun, alasan_lepas = 'ganti peran (unggahan)'
    where kegiatan_id = p_kegiatan and kk_id = r.kk and dilepas_at is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_diganti := v_diganti + 1; else v_ditambah := v_ditambah + 1; end if;
    insert into public.sigap_sampel_tag (kegiatan_id, idsubsls, kk_id, peran, via, berkas, ditandai_oleh) values (p_kegiatan, r.sub, r.kk, r.peran, 'unggah', left(p_berkas, 200), p_akun);
  end loop;
  return jsonb_build_object('ok', true, 'ditambah', v_ditambah, 'diganti', v_diganti, 'dilepas', v_dilepas, 'sama', v_sama, 'jendela', public.sigap_jendela_status(p_kegiatan));
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'sigap_iso(timestamptz)', 'sigap_jendela_status(bigint)', 'sigap_jendela_info(bigint)', 'sigap_jendela_buka(bigint,bigint,text,text)', 'sigap_jendela_tutup(bigint,text)',
    'sigap_tag_batas(bigint,text)', 'sigap_tag_set(bigint,bigint,text,bigint,text)', 'sigap_tag_lepas(bigint,bigint,bigint)',
    'sigap_tag_hasil(bigint,bigint,bigint,text)', 'sigap_tag_impor(bigint,bigint,text,text,jsonb,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;

-- Verifikasi (hanya baca).
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sigap_sampel_konfig' and column_name = 'cadangan_per_sls') as kolom_cadangan,
  (select count(*) from public.sigap_sampel_jendela) as jendela,
  (select count(*) from public.sigap_sampel_tag) as tag,
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.sigap_sampel_jendela'::regclass, 'public.sigap_sampel_tag'::regclass)) as rls_aktif,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('sigap_iso', 'sigap_jendela_status', 'sigap_jendela_info', 'sigap_jendela_buka', 'sigap_jendela_tutup', 'sigap_tag_batas', 'sigap_tag_set', 'sigap_tag_lepas', 'sigap_tag_hasil', 'sigap_tag_impor')) as fungsi_ada;
