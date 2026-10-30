-- =====================================================================
-- 20261030g_sampel_sls.sql
-- SIGAP - ALOKASI SAMPEL PER SLS (30 Okt 2026)
--
-- Strategi "sampel_sls" (Sakernas TW IV, Seruti TW IV, IMK): tiap PPL mendapat 1-2 SLS, tiap SLS 10 sampel utama, sampel cadangan (pengganti) opsional.
-- Alokasi dimasukkan admin lewat templat Excel (kolom: Kode Wilayah, Nama Responden, Nama Anggota Ruta Lain, Status Sampel, Latitude, Longitude, Nama PPL, Nama PML).
--
--  sigap_sampel_unggah  riwayat unggahan alokasi (satu baris per unggahan).
--  sigap_sampel         satu baris = satu sampel. Unggah ulang MENGGANTIKAN alokasi aktif (baris lama dinonaktifkan, tidak dihapus).
--                       Penggantian sampel: baris CADANGAN menunjuk sampel UTAMA yang digantikannya (menggantikan_id); satu utama paling banyak satu pengganti
--                       dan satu cadangan paling banyak menggantikan satu utama (indeks unik).
--  sigap_sampel_konfig  pengaturan per kegiatan: target sampel per SLS, maksimum SLS per PPL, apakah PPL boleh menandai penggantian.
--  sigap_sampel_impor / sigap_sampel_ganti / sigap_sampel_batal_ganti  fungsi atomik (satu transaksi, kunci baris) dipanggil dari API server.
--
-- Semua hanya service_role (API server memeriksa izin: admin bencana.admin pada kegiatan itu; PPL/PML hanya melihat sampelnya sendiri).
-- Tidak mengubah tabel yang ada. Aman diulang (create ... if not exists / create or replace). Jalankan oleh user (DDL produksi); lalu supabase/tests/82_uji_sampel_sls.sql.
-- =====================================================================

create table if not exists public.sigap_sampel_unggah (
  id            bigint generated always as identity primary key,
  kegiatan_id   bigint not null references public.sigap_kegiatan(id) on delete cascade,
  nama_berkas   text,
  oleh          text,
  jumlah        integer not null default 0,
  utama         integer not null default 0,
  cadangan      integer not null default 0,
  catatan       jsonb,
  diunggah_at   timestamptz not null default now(),
  digantikan_at timestamptz
);

create table if not exists public.sigap_sampel (
  id             bigint generated always as identity primary key,
  kegiatan_id    bigint not null references public.sigap_kegiatan(id) on delete cascade,
  unggah_id      bigint not null references public.sigap_sampel_unggah(id) on delete cascade,
  urut           integer not null,
  kode_wilayah   text not null check (kode_wilayah ~ '^[0-9]{10,16}$'),
  kode_sls       text not null check (kode_sls ~ '^[0-9]{10,14}$'),
  nama_responden text not null check (char_length(nama_responden) between 1 and 200),
  anggota_lain   text check (anggota_lain is null or char_length(anggota_lain) <= 500),
  status         text not null check (status in ('utama', 'cadangan')),
  lat            double precision check (lat is null or lat between -90 and 90),
  lng            double precision check (lng is null or lng between -180 and 180),
  ppl_akun_id    bigint not null references public.sigap_akun(id),
  pml_akun_id    bigint not null references public.sigap_akun(id),
  ppl_nama       text not null,
  pml_nama       text not null,
  menggantikan_id bigint references public.sigap_sampel(id),
  alasan         text check (alasan is null or char_length(alasan) <= 300),
  diganti_at     timestamptz,
  diganti_oleh   bigint references public.sigap_akun(id),
  nonaktif_at    timestamptz,
  dibuat_at      timestamptz not null default now(),
  check ((lat is null) = (lng is null)),
  check (menggantikan_id is null or status = 'cadangan')
);
create unique index if not exists sigap_sampel_satu_pengganti on public.sigap_sampel (menggantikan_id) where menggantikan_id is not null and nonaktif_at is null;
create index if not exists sigap_sampel_ppl on public.sigap_sampel (kegiatan_id, ppl_akun_id) where nonaktif_at is null;
create index if not exists sigap_sampel_pml on public.sigap_sampel (kegiatan_id, pml_akun_id) where nonaktif_at is null;
create index if not exists sigap_sampel_sls on public.sigap_sampel (kegiatan_id, kode_sls) where nonaktif_at is null;

create table if not exists public.sigap_sampel_konfig (
  kegiatan_id      bigint primary key references public.sigap_kegiatan(id) on delete cascade,
  target_per_sls   integer not null default 10 check (target_per_sls between 1 and 100),
  maks_sls_per_ppl integer not null default 2 check (maks_sls_per_ppl between 1 and 50),
  boleh_ganti      boolean not null default true,
  diubah_oleh      text,
  diubah_at        timestamptz not null default now()
);

alter table public.sigap_sampel_unggah enable row level security;
alter table public.sigap_sampel        enable row level security;
alter table public.sigap_sampel_konfig enable row level security;
revoke all on public.sigap_sampel_unggah, public.sigap_sampel, public.sigap_sampel_konfig from anon, authenticated;
grant select, insert, update, delete on public.sigap_sampel_unggah, public.sigap_sampel, public.sigap_sampel_konfig to service_role;

-- ---------------------------------------------------------------------
-- Unggah alokasi: menggantikan alokasi aktif kegiatan itu dalam satu transaksi.
-- p_baris = array JSON { kode_wilayah, kode_sls, nama_responden, anggota_lain, status, lat, lng, ppl_akun_id, pml_akun_id, ppl_nama, pml_nama } (sudah divalidasi API).
-- Bila ada penggantian sampel yang tercatat, unggah ulang ditolak kecuali p_paksa (tanda penggantian akan hilang karena alokasi lama dinonaktifkan).
-- ---------------------------------------------------------------------
create or replace function public.sigap_sampel_impor(p_kegiatan bigint, p_oleh text, p_berkas text, p_baris jsonb, p_catatan jsonb default null, p_paksa boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ganti integer;
  v_id bigint;
  v_n integer;
  v_utama integer;
begin
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' or jsonb_array_length(p_baris) = 0 then
    return jsonb_build_object('ok', false, 'pesan', 'Tidak ada baris sampel untuk disimpan.');
  end if;
  perform pg_advisory_xact_lock(hashtext('sigap_sampel:' || p_kegiatan::text));
  select count(*) into v_ganti from public.sigap_sampel where kegiatan_id = p_kegiatan and nonaktif_at is null and menggantikan_id is not null;
  if v_ganti > 0 and not coalesce(p_paksa, false) then
    return jsonb_build_object('ok', false, 'kode', 'ADA_PENGGANTIAN', 'n', v_ganti,
      'pesan', v_ganti || ' penggantian sampel sudah tercatat. Unggah ulang akan menghapus tanda penggantian itu.');
  end if;
  update public.sigap_sampel set nonaktif_at = now() where kegiatan_id = p_kegiatan and nonaktif_at is null;
  update public.sigap_sampel_unggah set digantikan_at = now() where kegiatan_id = p_kegiatan and digantikan_at is null;
  insert into public.sigap_sampel_unggah (kegiatan_id, nama_berkas, oleh, catatan) values (p_kegiatan, left(p_berkas, 200), left(p_oleh, 120), p_catatan) returning id into v_id;
  insert into public.sigap_sampel (kegiatan_id, unggah_id, urut, kode_wilayah, kode_sls, nama_responden, anggota_lain, status, lat, lng, ppl_akun_id, pml_akun_id, ppl_nama, pml_nama)
  select p_kegiatan, v_id, e.urut::integer,
         e.v->>'kode_wilayah', e.v->>'kode_sls', e.v->>'nama_responden', nullif(e.v->>'anggota_lain', ''), e.v->>'status',
         (e.v->>'lat')::double precision, (e.v->>'lng')::double precision,
         (e.v->>'ppl_akun_id')::bigint, (e.v->>'pml_akun_id')::bigint, e.v->>'ppl_nama', e.v->>'pml_nama'
  from jsonb_array_elements(p_baris) with ordinality as e(v, urut);
  get diagnostics v_n = row_count;
  select count(*) into v_utama from public.sigap_sampel where unggah_id = v_id and status = 'utama';
  update public.sigap_sampel_unggah set jumlah = v_n, utama = v_utama, cadangan = v_n - v_utama where id = v_id;
  return jsonb_build_object('ok', true, 'unggah_id', v_id, 'jumlah', v_n, 'utama', v_utama, 'cadangan', v_n - v_utama);
end
$fn$;

-- ---------------------------------------------------------------------
-- PPL menandai sampel utama diganti cadangan (satu SLS, satu PPL, cadangan belum terpakai). Pemeriksaan siapa PPL-nya ada di sini (p_akun harus PPL sampel itu).
-- ---------------------------------------------------------------------
create or replace function public.sigap_sampel_ganti(p_kegiatan bigint, p_akun bigint, p_utama bigint, p_cadangan bigint, p_alasan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  u public.sigap_sampel%rowtype;
  c public.sigap_sampel%rowtype;
  v_boleh boolean;
begin
  select coalesce((select boleh_ganti from public.sigap_sampel_konfig where kegiatan_id = p_kegiatan), true) into v_boleh;
  if not v_boleh then
    return jsonb_build_object('ok', false, 'pesan', 'Penggantian sampel oleh PPL dimatikan untuk kegiatan ini. Hubungi admin.');
  end if;
  if p_alasan is null or char_length(btrim(p_alasan)) < 3 then
    return jsonb_build_object('ok', false, 'pesan', 'Alasan penggantian wajib diisi.');
  end if;
  select * into u from public.sigap_sampel where id = p_utama and kegiatan_id = p_kegiatan and nonaktif_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'pesan', 'Sampel utama tidak ditemukan.'); end if;
  select * into c from public.sigap_sampel where id = p_cadangan and kegiatan_id = p_kegiatan and nonaktif_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'pesan', 'Sampel cadangan tidak ditemukan.'); end if;
  if u.ppl_akun_id <> p_akun then return jsonb_build_object('ok', false, 'pesan', 'Sampel ini bukan bagian dari tugas Anda.'); end if;
  if u.status <> 'utama' then return jsonb_build_object('ok', false, 'pesan', 'Yang diganti harus sampel utama.'); end if;
  if c.status <> 'cadangan' then return jsonb_build_object('ok', false, 'pesan', 'Pengganti harus sampel cadangan.'); end if;
  if c.kode_sls <> u.kode_sls or c.ppl_akun_id <> u.ppl_akun_id then return jsonb_build_object('ok', false, 'pesan', 'Cadangan harus dari SLS yang sama.'); end if;
  if c.menggantikan_id is not null then return jsonb_build_object('ok', false, 'pesan', 'Cadangan ini sudah dipakai.'); end if;
  if exists (select 1 from public.sigap_sampel where menggantikan_id = u.id and nonaktif_at is null) then
    return jsonb_build_object('ok', false, 'pesan', 'Sampel utama ini sudah diganti.');
  end if;
  update public.sigap_sampel set menggantikan_id = u.id, alasan = left(btrim(p_alasan), 300), diganti_at = now(), diganti_oleh = p_akun where id = c.id;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'pesan', 'Sampel utama ini sudah diganti.');
end
$fn$;

-- Membatalkan penggantian: PPL pemilik atau admin (p_admin = true).
create or replace function public.sigap_sampel_batal_ganti(p_kegiatan bigint, p_akun bigint, p_cadangan bigint, p_admin boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c public.sigap_sampel%rowtype;
begin
  select * into c from public.sigap_sampel where id = p_cadangan and kegiatan_id = p_kegiatan and nonaktif_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'pesan', 'Sampel tidak ditemukan.'); end if;
  if c.menggantikan_id is null then return jsonb_build_object('ok', false, 'pesan', 'Cadangan ini belum dipakai.'); end if;
  if not coalesce(p_admin, false) and c.ppl_akun_id <> p_akun then return jsonb_build_object('ok', false, 'pesan', 'Sampel ini bukan bagian dari tugas Anda.'); end if;
  update public.sigap_sampel set menggantikan_id = null, alasan = null, diganti_at = null, diganti_oleh = null where id = c.id;
  return jsonb_build_object('ok', true);
end
$fn$;

revoke all on function public.sigap_sampel_impor(bigint, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.sigap_sampel_ganti(bigint, bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.sigap_sampel_batal_ganti(bigint, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.sigap_sampel_impor(bigint, text, text, jsonb, jsonb, boolean) to service_role;
grant execute on function public.sigap_sampel_ganti(bigint, bigint, bigint, bigint, text) to service_role;
grant execute on function public.sigap_sampel_batal_ganti(bigint, bigint, bigint, boolean) to service_role;

comment on table public.sigap_sampel is 'Alokasi sampel per SLS (strategi sampel_sls). Satu baris = satu sampel; cadangan menunjuk utama yang digantikannya. Hanya service role.';
comment on table public.sigap_sampel_unggah is 'Riwayat unggahan alokasi sampel (templat Excel).';
comment on table public.sigap_sampel_konfig is 'Pengaturan alokasi sampel per kegiatan: target per SLS, maksimum SLS per PPL, izin ganti oleh PPL.';
