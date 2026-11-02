-- 20261102c — SATU KALI IMPOR susunan tim + wilayah sampel.
--
-- Berkas alokasi sampel (Kelola Pendataan, tab Persiapan) kini boleh memuat Nama Korwil dan Nama Supervisor. Dari berkas yang sama:
--   * sigap_sampel      : wilayah + PPL + PML per baris (fungsi sigap_sampel_impor yang sudah ada, dipakai ulang)
--   * sigap_penugasan   : petugas yang belum ditugaskan pada kegiatan itu ikut ditugaskan (sumber 'impor_tim:<id unggah>'), bila admin memilihnya
--   * sigap_tim (BARU)  : atasan langsung per petugas per kegiatan: PPL -> PML -> Korwil -> Supervisor
-- Semuanya dalam SATU transaksi (satu panggilan fungsi): gagal di mana pun = tidak ada yang tersimpan.
--
-- Aman dijalankan ulang (create if not exists / create or replace). Tidak mengubah tabel atau fungsi yang sudah ada.
-- Hak: hanya service_role (server), seperti tabel sigap_* lain. RLS aktif tanpa policy.

create table if not exists public.sigap_tim (
  kegiatan_id    bigint      not null references public.sigap_kegiatan(id) on delete cascade,
  akun_id        bigint      not null references public.sigap_akun(id),
  peran          text        not null check (peran in ('ppl', 'pml', 'korwil', 'supervisor')),
  atasan_akun_id bigint      references public.sigap_akun(id),
  sumber         text        not null default 'impor' check (sumber in ('impor', 'manual')),
  diubah_oleh    text,
  diubah_at      timestamptz not null default now(),
  primary key (kegiatan_id, akun_id),
  check (atasan_akun_id is null or atasan_akun_id <> akun_id)
);

create index if not exists sigap_tim_atasan_idx on public.sigap_tim (kegiatan_id, atasan_akun_id);

alter table public.sigap_tim enable row level security;
revoke all on table public.sigap_tim from anon, authenticated;
grant all on table public.sigap_tim to service_role;

comment on table public.sigap_tim is 'Susunan tim per kegiatan: peran dan atasan langsung (PPL > PML > Korwil > Supervisor). Diisi oleh impor alokasi sampel (sumber impor) atau manual.';

create or replace function public.sigap_tim_sampel_impor(
  p_kegiatan bigint,
  p_oleh text,
  p_berkas text,
  p_baris jsonb,
  p_catatan jsonb,
  p_paksa boolean,
  p_tim jsonb,
  p_tugaskan boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
  v_unggah bigint;
  v_sumber text;
  v_baru integer := 0;
  v_tim integer := 0;
  v_n integer;
  e jsonb;
begin
  if p_tim is null or jsonb_typeof(p_tim) <> 'array' then
    return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Susunan tim tidak terbaca.');
  end if;
  if exists (select 1 from jsonb_array_elements(p_tim) x where coalesce(x ->> 'peran', '') not in ('ppl', 'pml', 'korwil', 'supervisor')) then
    return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Ada peran yang tidak sah pada susunan tim.');
  end if;
  if (select count(*) from jsonb_array_elements(p_tim)) <> (select count(distinct x ->> 'akun_id') from jsonb_array_elements(p_tim) x) then
    return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Ada akun yang muncul lebih dari sekali pada susunan tim.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tim) x
    left join public.sigap_akun a on a.id = case when (x ->> 'akun_id') ~ '^[0-9]{1,18}$' then (x ->> 'akun_id')::bigint end
    where a.id is null or not a.aktif
  ) then
    return jsonb_build_object('ok', false, 'kode', 'AKUN_TIDAK_SAH', 'pesan', 'Ada akun pada susunan tim yang tidak ditemukan atau tidak aktif.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tim) x
    where nullif(x ->> 'atasan_akun_id', '') is not null
      and (
        (x ->> 'atasan_akun_id') = (x ->> 'akun_id')
        or not exists (select 1 from jsonb_array_elements(p_tim) y where (y ->> 'akun_id') = (x ->> 'atasan_akun_id'))
      )
  ) then
    return jsonb_build_object('ok', false, 'kode', 'TIM_TIDAK_SAH', 'pesan', 'Atasan harus anggota susunan tim yang sama dan bukan diri sendiri.');
  end if;

  perform pg_advisory_xact_lock(hashtext('sigap_tim:' || p_kegiatan::text));

  -- orang yang sudah ditugaskan dengan peran LAIN tidak diubah diam-diam
  if exists (
    select 1 from jsonb_array_elements(p_tim) x
    join public.sigap_penugasan p on p.kegiatan_id = p_kegiatan and p.akun_id = (x ->> 'akun_id')::bigint and p.aktif and p.peran <> (x ->> 'peran')
  ) then
    return jsonb_build_object('ok', false, 'kode', 'PERAN_BENTROK', 'pesan', 'Ada petugas yang sudah ditugaskan dengan peran lain pada kegiatan ini. Ubah dahulu di Penugasan dan ST.');
  end if;

  v := public.sigap_sampel_impor(p_kegiatan, p_oleh, p_berkas, p_baris, p_catatan, p_paksa);
  if coalesce((v ->> 'ok')::boolean, false) is not true then
    return v;
  end if;
  v_unggah := (v ->> 'unggah_id')::bigint;
  v_sumber := 'impor_tim:' || v_unggah;

  if coalesce(p_tugaskan, true) then
    for e in select x from jsonb_array_elements(p_tim) x loop
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
  from jsonb_array_elements(p_tim) x
  on conflict (kegiatan_id, akun_id) do nothing;
  get diagnostics v_tim = row_count;

  return v || jsonb_build_object('penugasan_baru', v_baru, 'tim', v_tim);
end
$function$;

revoke all on function public.sigap_tim_sampel_impor(bigint, text, text, jsonb, jsonb, boolean, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sigap_tim_sampel_impor(bigint, text, text, jsonb, jsonb, boolean, jsonb, boolean) to service_role;

-- Verifikasi (hanya baca): tabel ada, kosong, RLS aktif; fungsi ada.
select
  (select count(*) from public.sigap_tim) as baris_tim,
  (select relrowsecurity from pg_class where oid = 'public.sigap_tim'::regclass) as rls_aktif,
  (select count(*) from pg_proc where proname = 'sigap_tim_sampel_impor' and pronamespace = 'public'::regnamespace) as fungsi_ada;
