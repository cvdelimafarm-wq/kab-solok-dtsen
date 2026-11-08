-- 20261108a_sampel_objek.sql
-- Tahap D1+D2 rancangan "sampel lintas survei": MODEL 2 dan 3 (daftar objek sampel dari pusat, bukan KK master).
--
--  1. sigap_sampel_profil  : satu baris per kegiatan model 2/3 = variabel yang dicentang Ketua (kolom templat unggah) + label 5 kolom bebas + tingkat wilayah
--                            (variabel wilayah terdalam: kecamatan/nagari/sls/sub_sls, atau null). Kegiatan TANPA baris profil = model 1 (perilaku sekarang).
--  2. sigap_objek_unggah / sigap_sampel_objek : objek sampel aktif per kegiatan. Satu baris = satu sampel (nama_sampel terisi) atau satu baris berjumlah
--                            (nama_sampel kosong, jumlah N). Wilayah disimpan sebagai kode di tingkat profil (kode_wilayah; idsubsls bila tingkat sub SLS).
--                            Hasil per objek: didata | menolak | tidak_ditemukan (+ jumlah_didata untuk baris berjumlah).
--  3. sigap_profil_simpan / sigap_profil_hapus : simpan/hapus profil dengan aturan yang sama dengan lib/sampelObjek.ts (validasiProfil). Ditolak bila sudah ada objek
--                            aktif (kode PROFIL_TERPAKAI) atau alokasi model 1 aktif (ALOKASI_AKTIF).
--  4. sigap_objek_impor(...) : SATU transaksi: objek + (opsional) penugasan petugas baru + susunan tim (sigap_tim). Pola sigap_alokasi_impor (20261107e).
--  5. sigap_objek_catat(...) : catat hasil satu objek oleh PPL yang ditugaskan (atomik, dengan pemeriksaan jumlah_didata).
--  6. sigap_objek_kosongkan(...) : nonaktifkan semua objek aktif (riwayat tetap), jalan keluar saat profil terpakai.
--
-- Hak: hanya service_role. RLS aktif tanpa policy. Aman dijalankan ulang. Tidak mengubah tabel atau fungsi lain.
-- Prasyarat: master_wilayah, sigap_alokasi_wilayah (20261107e), sigap_kegiatan, sigap_akun, sigap_penugasan, sigap_tim.

begin;

-- 1. profil -----------------------------------------------------------------------------------------------------------------------
create table if not exists public.sigap_sampel_profil (
  kegiatan_id  bigint primary key references public.sigap_kegiatan(id) on delete cascade,
  model        smallint not null check (model in (2, 3)),
  variabel     text[] not null,
  label_bebas  jsonb not null default '{}'::jsonb,
  level_plot   text check (level_plot is null or level_plot in ('kecamatan', 'nagari', 'sls', 'sub_sls')),
  diubah_oleh  text,
  diubah_at    timestamptz not null default now()
);

-- 2. objek ------------------------------------------------------------------------------------------------------------------------
create table if not exists public.sigap_objek_unggah (
  id             bigint generated always as identity primary key,
  kegiatan_id    bigint not null references public.sigap_kegiatan(id) on delete cascade,
  nama_berkas    text,
  oleh           text,
  jumlah         integer not null default 0,
  jumlah_sampel  integer not null default 0,
  dengan_petugas integer not null default 0,
  catatan        jsonb,
  diunggah_at    timestamptz not null default now(),
  digantikan_at  timestamptz
);
create index if not exists sigap_objek_unggah_keg_idx on public.sigap_objek_unggah (kegiatan_id, id desc);

create table if not exists public.sigap_sampel_objek (
  id             bigint generated always as identity primary key,
  kegiatan_id    bigint not null references public.sigap_kegiatan(id) on delete cascade,
  unggah_id      bigint not null references public.sigap_objek_unggah(id),
  urut           integer not null default 0,
  kode_wilayah   text check (kode_wilayah is null or kode_wilayah ~ '^([0-9]{7}|[0-9]{10}|[0-9]{14}|[0-9]{16})$'),
  idsubsls       text references public.master_wilayah(idsubsls),
  nama_sampel    text check (nama_sampel is null or btrim(nama_sampel) <> ''),
  jumlah         integer not null default 1 check (jumlah between 1 and 100000),
  ppl_akun_id    bigint references public.sigap_akun(id),
  pml_akun_id    bigint references public.sigap_akun(id),
  atribut        jsonb not null default '{}'::jsonb,
  hasil          text check (hasil is null or hasil in ('didata', 'menolak', 'tidak_ditemukan')),
  jumlah_didata  integer,
  hasil_oleh     bigint references public.sigap_akun(id),
  hasil_at       timestamptz,
  nonaktif_at    timestamptz,
  dibuat_at      timestamptz not null default now(),
  check ((ppl_akun_id is null) = (pml_akun_id is null)),
  check (ppl_akun_id is null or ppl_akun_id <> pml_akun_id),
  check (idsubsls is null or kode_wilayah = idsubsls),
  check ((hasil is null) = (hasil_at is null)),
  check (jumlah_didata is null or (hasil = 'didata' and jumlah_didata between 1 and jumlah))
);
create index if not exists sigap_sampel_objek_keg_idx on public.sigap_sampel_objek (kegiatan_id, urut) where nonaktif_at is null;
create index if not exists sigap_sampel_objek_ppl_idx on public.sigap_sampel_objek (kegiatan_id, ppl_akun_id) where nonaktif_at is null;
create index if not exists sigap_sampel_objek_pml_idx on public.sigap_sampel_objek (kegiatan_id, pml_akun_id) where nonaktif_at is null;
create index if not exists sigap_sampel_objek_wil_idx on public.sigap_sampel_objek (kegiatan_id, kode_wilayah) where nonaktif_at is null;

-- hak dan RLS ---------------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sigap_sampel_profil', 'sigap_objek_unggah', 'sigap_sampel_objek'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

comment on table public.sigap_sampel_profil is 'Profil variabel sampel kegiatan model 2/3 (kolom templat unggah). Tanpa baris = model 1.';
comment on table public.sigap_sampel_objek is 'Objek sampel model 2/3 per kegiatan: satu baris = satu sampel, atau satu baris berjumlah (nama_sampel kosong). Hasil per objek: didata, menolak, tidak_ditemukan.';

-- 3. profil: simpan dan hapus -----------------------------------------------------------------------------------------------------
create or replace function public.sigap_profil_simpan(
  p_kegiatan bigint, p_oleh text, p_model integer, p_variabel text[], p_label jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_baku constant text[] := array['kecamatan','nagari','sls','sub_sls','nks','nama_sampel','alamat','patokan','lat','lng','jumlah','ppl','pml','korwil','supervisor','bebas1','bebas2','bebas3','bebas4','bebas5'];
  v_baku_label constant text[] := array['kecamatan','nagari','jorongsls','subsls','nks','namasampel','alamat','patokan','latitude','longitude','jumlah','namappl','namapml','namakorwil','namasupervisor'];
  v_var text[];
  v_label jsonb := coalesce(p_label, '{}'::jsonb);
  v_level text;
  v_b text;
  v_l text;
  v_pakai text[] := '{}';
  v_sama boolean;
begin
  if p_model is null or p_model not in (2, 3) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Model harus 2 atau 3.');
  end if;
  if p_variabel is null or array_length(p_variabel, 1) is null then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Pilih minimal satu variabel.');
  end if;
  if jsonb_typeof(v_label) <> 'object' then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Label kolom bebas tidak terbaca.');
  end if;
  if exists (select 1 from unnest(p_variabel) u where u <> all (v_baku)) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Ada variabel yang tidak dikenal.');
  end if;
  if (select count(*) from unnest(p_variabel)) <> (select count(distinct u) from unnest(p_variabel) u) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Ada variabel yang dipilih dua kali.');
  end if;
  -- urutan baku katalog
  select array_agg(b order by array_position(v_baku, b)) into v_var from unnest(p_variabel) b;

  v_level := case
    when 'sub_sls' = any (v_var) then 'sub_sls'
    when 'sls' = any (v_var) then 'sls'
    when 'nagari' = any (v_var) then 'nagari'
    when 'kecamatan' = any (v_var) then 'kecamatan'
    else null end;
  if p_model = 2 and v_level is null then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Model 2 wajib memilih minimal satu variabel wilayah.');
  end if;
  if not ('nama_sampel' = any (v_var)) and not ('jumlah' = any (v_var)) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Pilih Nama Sampel atau Jumlah.');
  end if;
  if ('ppl' = any (v_var)) <> ('pml' = any (v_var)) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Nama PPL dan Nama PML dipilih berpasangan.');
  end if;
  if (('korwil' = any (v_var)) or ('supervisor' = any (v_var))) and not ('ppl' = any (v_var)) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Korwil/Supervisor hanya bersama PPL dan PML.');
  end if;
  if ('lat' = any (v_var)) <> ('lng' = any (v_var)) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Latitude dan Longitude dipilih berpasangan.');
  end if;
  -- label kolom bebas: hanya untuk yang dicentang; wajib, <= 40 huruf, unik, tidak bentrok katalog
  foreach v_b in array array['bebas1','bebas2','bebas3','bebas4','bebas5'] loop
    if v_b = any (v_var) then
      v_l := btrim(coalesce(v_label ->> v_b, ''));
      if v_l = '' then
        return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Kolom bebas ' || right(v_b, 1) || ' dipilih tetapi labelnya kosong.');
      end if;
      if char_length(v_l) > 40 then
        return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Label kolom bebas ' || right(v_b, 1) || ' lebih dari 40 huruf.');
      end if;
      v_l := lower(regexp_replace(v_l, '[^a-zA-Z0-9]', '', 'g'));
      if v_l = any (v_baku_label) or v_l = any (v_pakai) then
        return jsonb_build_object('ok', false, 'kode', 'PROFIL_TIDAK_SAH', 'pesan', 'Label kolom bebas sama dengan kolom lain.');
      end if;
      v_pakai := v_pakai || v_l;
    end if;
  end loop;
  -- bersihkan label yang tidak dipakai
  v_label := coalesce((select jsonb_object_agg(k, btrim(v_label ->> k)) from unnest(array['bebas1','bebas2','bebas3','bebas4','bebas5']) k where k = any (v_var)), '{}'::jsonb);

  perform pg_advisory_xact_lock(hashtext('sigap_alokasi:' || p_kegiatan::text));
  if not exists (select 1 from public.sigap_kegiatan where id = p_kegiatan) then
    return jsonb_build_object('ok', false, 'kode', 'KEGIATAN_TIDAK_ADA', 'pesan', 'Kegiatan tidak ditemukan.');
  end if;
  if exists (select 1 from public.sigap_alokasi_wilayah where kegiatan_id = p_kegiatan and nonaktif_at is null) then
    return jsonb_build_object('ok', false, 'kode', 'ALOKASI_AKTIF', 'pesan', 'Kegiatan ini sudah memakai alokasi model 1 (per sub SLS). Model 2/3 tidak bisa dipilih bersamaan.');
  end if;
  select (p.model = p_model and p.variabel = v_var and p.label_bebas = v_label) into v_sama from public.sigap_sampel_profil p where p.kegiatan_id = p_kegiatan;
  if exists (select 1 from public.sigap_sampel_objek where kegiatan_id = p_kegiatan and nonaktif_at is null) and coalesce(v_sama, false) = false then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TERPAKAI', 'pesan', 'Daftar sampel sudah diunggah dengan profil sekarang. Profil tidak bisa diubah; kosongkan daftar sampel lebih dulu.');
  end if;

  insert into public.sigap_sampel_profil (kegiatan_id, model, variabel, label_bebas, level_plot, diubah_oleh, diubah_at)
  values (p_kegiatan, p_model, v_var, v_label, v_level, left(p_oleh, 120), now())
  on conflict (kegiatan_id) do update
    set model = excluded.model, variabel = excluded.variabel, label_bebas = excluded.label_bebas, level_plot = excluded.level_plot,
        diubah_oleh = excluded.diubah_oleh, diubah_at = now();
  return jsonb_build_object('ok', true, 'level_plot', v_level, 'variabel', to_jsonb(v_var));
end
$function$;

create or replace function public.sigap_profil_hapus(p_kegiatan bigint) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform pg_advisory_xact_lock(hashtext('sigap_alokasi:' || p_kegiatan::text));
  if exists (select 1 from public.sigap_sampel_objek where kegiatan_id = p_kegiatan and nonaktif_at is null) then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_TERPAKAI', 'pesan', 'Masih ada daftar sampel aktif. Kosongkan lebih dulu sebelum kembali ke model 1.');
  end if;
  delete from public.sigap_sampel_profil where kegiatan_id = p_kegiatan;
  return jsonb_build_object('ok', true);
end
$function$;

-- 4. impor atomik -----------------------------------------------------------------------------------------------------------------
create or replace function public.sigap_objek_impor(
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
  v_prof public.sigap_sampel_profil%rowtype;
  v_unggah bigint;
  v_sumber text;
  v_n integer;
  v_baru integer := 0;
  v_tim integer := 0;
  v_dengan integer;
  v_sampel integer;
  v_tim_arr jsonb := coalesce(p_tim, '[]'::jsonb);
  v_panjang integer;
  e jsonb;
  v_hilang text;
  v_pakai_nama boolean;
begin
  select * into v_prof from public.sigap_sampel_profil where kegiatan_id = p_kegiatan;
  if not found then
    return jsonb_build_object('ok', false, 'kode', 'PROFIL_BELUM_ADA', 'pesan', 'Profil variabel kegiatan ini belum disimpan.');
  end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    return jsonb_build_object('ok', false, 'kode', 'KOSONG', 'pesan', 'Tidak ada baris sampel untuk disimpan.');
  end if;
  if jsonb_array_length(p_baris) > 5000 then
    return jsonb_build_object('ok', false, 'kode', 'TERLALU_BANYAK', 'pesan', 'Satu unggahan paling banyak 5.000 baris.');
  end if;
  if jsonb_typeof(v_tim_arr) <> 'array' then
    return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Susunan tim tidak terbaca.');
  end if;
  v_pakai_nama := 'nama_sampel' = any (v_prof.variabel);
  v_panjang := case v_prof.level_plot when 'kecamatan' then 7 when 'nagari' then 10 when 'sls' then 14 when 'sub_sls' then 16 else null end;

  if exists (select 1 from jsonb_array_elements(p_baris) x where jsonb_typeof(x) <> 'object' or jsonb_typeof(coalesce(x -> 'atribut', '{}'::jsonb)) <> 'object') then
    return jsonb_build_object('ok', false, 'kode', 'BARIS_TIDAK_SAH', 'pesan', 'Ada baris sampel yang bentuknya tidak sah.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_baris) x
    where (x ->> 'jumlah') is null or (x ->> 'jumlah') !~ '^[0-9]{1,6}$' or (x ->> 'jumlah')::integer not between 1 and 100000
  ) then
    return jsonb_build_object('ok', false, 'kode', 'JUMLAH_TIDAK_SAH', 'pesan', 'Jumlah tiap baris harus bilangan bulat 1-100000.');
  end if;
  if v_pakai_nama and exists (select 1 from jsonb_array_elements(p_baris) x where btrim(coalesce(x ->> 'nama_sampel', '')) = '') then
    return jsonb_build_object('ok', false, 'kode', 'NAMA_KOSONG', 'pesan', 'Ada baris tanpa nama sampel.');
  end if;
  if not v_pakai_nama and exists (select 1 from jsonb_array_elements(p_baris) x where btrim(coalesce(x ->> 'nama_sampel', '')) <> '') then
    return jsonb_build_object('ok', false, 'kode', 'NAMA_TIDAK_DIPAKAI', 'pesan', 'Profil tidak memakai Nama Sampel, tetapi ada baris yang memuatnya.');
  end if;
  if v_panjang is null then
    if exists (select 1 from jsonb_array_elements(p_baris) x where nullif(x ->> 'kode_wilayah', '') is not null) then
      return jsonb_build_object('ok', false, 'kode', 'WILAYAH_TIDAK_DIPAKAI', 'pesan', 'Profil tidak memakai wilayah, tetapi ada baris yang memuat kode wilayah.');
    end if;
  else
    if exists (
      select 1 from jsonb_array_elements(p_baris) x
      where coalesce(x ->> 'kode_wilayah', '') !~ '^[0-9]+$' or char_length(x ->> 'kode_wilayah') <> v_panjang
    ) then
      return jsonb_build_object('ok', false, 'kode', 'WILAYAH_TIDAK_SAH', 'pesan', 'Kode wilayah harus ' || v_panjang || ' digit pada setiap baris.');
    end if;
    select string_agg(k, ', ') into v_hilang from (
      select distinct x ->> 'kode_wilayah' as k from jsonb_array_elements(p_baris) x
      where not exists (
        select 1 from public.master_wilayah m
        where m.aktif and (case v_prof.level_plot when 'kecamatan' then m.kd_kec when 'nagari' then m.iddesa when 'sls' then m.idsls else m.idsubsls end) = x ->> 'kode_wilayah'
      ) limit 5) q;
    if v_hilang is not null then
      return jsonb_build_object('ok', false, 'kode', 'WILAYAH_TIDAK_ADA', 'pesan', 'Kode wilayah tidak ada di master wilayah: ' || v_hilang || '.');
    end if;
    if v_prof.level_plot = 'sub_sls' and exists (select 1 from jsonb_array_elements(p_baris) x where (x ->> 'idsubsls') is distinct from (x ->> 'kode_wilayah')) then
      return jsonb_build_object('ok', false, 'kode', 'WILAYAH_TIDAK_SAH', 'pesan', 'idsubsls harus sama dengan kode wilayah pada tingkat sub SLS.');
    end if;
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

  if exists (select 1 from public.sigap_alokasi_wilayah where kegiatan_id = p_kegiatan and nonaktif_at is null) then
    return jsonb_build_object('ok', false, 'kode', 'ALOKASI_AKTIF', 'pesan', 'Kegiatan ini masih punya alokasi model 1 yang aktif.');
  end if;
  if jsonb_array_length(v_tim_arr) > 0 and exists (
    select 1 from jsonb_array_elements(v_tim_arr) x
    join public.sigap_penugasan p on p.kegiatan_id = p_kegiatan and p.akun_id = (x ->> 'akun_id')::bigint and p.aktif and p.peran <> (x ->> 'peran')
  ) then
    return jsonb_build_object('ok', false, 'kode', 'PERAN_BENTROK', 'pesan', 'Ada petugas yang sudah ditugaskan dengan peran lain pada kegiatan ini. Ubah dahulu di Penugasan dan ST.');
  end if;

  -- unggah ulang menggantikan daftar aktif; hasil yang sudah dicatat pada objek lama ikut nonaktif (riwayat tetap ada)
  update public.sigap_sampel_objek set nonaktif_at = now() where kegiatan_id = p_kegiatan and nonaktif_at is null;
  update public.sigap_objek_unggah set digantikan_at = now() where kegiatan_id = p_kegiatan and digantikan_at is null;
  insert into public.sigap_objek_unggah (kegiatan_id, nama_berkas, oleh, catatan) values (p_kegiatan, left(p_berkas, 200), left(p_oleh, 120), p_catatan) returning id into v_unggah;

  insert into public.sigap_sampel_objek (kegiatan_id, unggah_id, urut, kode_wilayah, idsubsls, nama_sampel, jumlah, ppl_akun_id, pml_akun_id, atribut)
  select p_kegiatan, v_unggah, e2.urut::integer, nullif(e2.v ->> 'kode_wilayah', ''), nullif(e2.v ->> 'idsubsls', ''),
         nullif(btrim(e2.v ->> 'nama_sampel'), ''), (e2.v ->> 'jumlah')::integer,
         nullif(e2.v ->> 'ppl_akun_id', '')::bigint, nullif(e2.v ->> 'pml_akun_id', '')::bigint, coalesce(e2.v -> 'atribut', '{}'::jsonb)
  from jsonb_array_elements(p_baris) with ordinality as e2(v, urut);
  get diagnostics v_n = row_count;
  select count(*) filter (where ppl_akun_id is not null), coalesce(sum(jumlah), 0) into v_dengan, v_sampel from public.sigap_sampel_objek where unggah_id = v_unggah;
  update public.sigap_objek_unggah set jumlah = v_n, jumlah_sampel = v_sampel, dengan_petugas = v_dengan where id = v_unggah;

  if jsonb_array_length(v_tim_arr) > 0 then
    v_sumber := 'impor_objek:' || v_unggah;
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

  return jsonb_build_object('ok', true, 'unggah_id', v_unggah, 'jumlah', (select jumlah from public.sigap_objek_unggah where id = v_unggah),
                            'jumlah_sampel', v_sampel, 'dengan_petugas', v_dengan, 'penugasan_baru', v_baru, 'tim', v_tim);
end
$function$;

-- 5. catat hasil ------------------------------------------------------------------------------------------------------------------
-- p_hasil null = hapus catatan hasil (koreksi). Hanya PPL yang ditugaskan pada objek itu; objek harus aktif. Baris berjumlah (tanpa nama sampel, jumlah > 1):
-- 'didata' wajib memuat p_jumlah_didata 1..jumlah; hasil lain tanpa jumlah. Baris satu sampel: jumlah_didata otomatis = jumlah bila didata.
create or replace function public.sigap_objek_catat(
  p_objek bigint, p_akun bigint, p_hasil text, p_jumlah_didata integer default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  o public.sigap_sampel_objek%rowtype;
  v_jd integer;
begin
  select * into o from public.sigap_sampel_objek where id = p_objek for update;
  if not found or o.nonaktif_at is not null then
    return jsonb_build_object('ok', false, 'kode', 'OBJEK_TIDAK_ADA', 'pesan', 'Sampel tidak ditemukan atau sudah diganti unggahan baru.');
  end if;
  if o.ppl_akun_id is distinct from p_akun then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_PETUGAS', 'pesan', 'Sampel ini bukan penugasan Anda.');
  end if;
  if p_hasil is null then
    update public.sigap_sampel_objek set hasil = null, jumlah_didata = null, hasil_oleh = null, hasil_at = null where id = p_objek;
    return jsonb_build_object('ok', true, 'hasil', null);
  end if;
  if p_hasil not in ('didata', 'menolak', 'tidak_ditemukan') then
    return jsonb_build_object('ok', false, 'kode', 'HASIL_TIDAK_SAH', 'pesan', 'Hasil harus didata, menolak, atau tidak_ditemukan.');
  end if;
  if p_hasil <> 'didata' then
    v_jd := null;
  elsif o.nama_sampel is null and o.jumlah > 1 then
    if p_jumlah_didata is null or p_jumlah_didata < 1 or p_jumlah_didata > o.jumlah then
      return jsonb_build_object('ok', false, 'kode', 'JUMLAH_TIDAK_SAH', 'pesan', 'Jumlah didata harus bilangan bulat 1-' || o.jumlah || '.');
    end if;
    v_jd := p_jumlah_didata;
  else
    v_jd := o.jumlah;
  end if;
  update public.sigap_sampel_objek set hasil = p_hasil, jumlah_didata = v_jd, hasil_oleh = p_akun, hasil_at = now() where id = p_objek;
  return jsonb_build_object('ok', true, 'hasil', p_hasil, 'jumlah_didata', v_jd);
end
$function$;

-- 6. kosongkan daftar ---------------------------------------------------------------------------------------------------------------
-- Menonaktifkan semua objek aktif (riwayat dan hasil yang sudah tercatat tetap tersimpan di baris nonaktif). Dipakai sebelum mengubah profil atau kembali ke model 1.
create or replace function public.sigap_objek_kosongkan(p_kegiatan bigint) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext('sigap_alokasi:' || p_kegiatan::text));
  update public.sigap_sampel_objek set nonaktif_at = now() where kegiatan_id = p_kegiatan and nonaktif_at is null;
  get diagnostics v_n = row_count;
  update public.sigap_objek_unggah set digantikan_at = now() where kegiatan_id = p_kegiatan and digantikan_at is null;
  return jsonb_build_object('ok', true, 'dikosongkan', v_n);
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'sigap_profil_simpan(bigint, text, integer, text[], jsonb)',
    'sigap_profil_hapus(bigint)',
    'sigap_objek_impor(bigint, text, text, jsonb, jsonb, jsonb, boolean)',
    'sigap_objek_catat(bigint, bigint, text, integer)',
    'sigap_objek_kosongkan(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;

-- Verifikasi (hanya baca): tabel, RLS, fungsi.
select
  (select count(*) from public.sigap_sampel_profil) as profil,
  (select count(*) from public.sigap_sampel_objek) as objek,
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.sigap_sampel_profil'::regclass, 'public.sigap_objek_unggah'::regclass, 'public.sigap_sampel_objek'::regclass)) as rls_aktif,
  (select count(*) from pg_proc where proname in ('sigap_profil_simpan', 'sigap_profil_hapus', 'sigap_objek_impor', 'sigap_objek_catat', 'sigap_objek_kosongkan') and pronamespace = 'public'::regnamespace) as fungsi_ada;
