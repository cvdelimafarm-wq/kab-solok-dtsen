-- 20261011a_pendataan_kk_dan_log.sql
--
-- (11 Okt 2026) Fase 1 Lembar Pendataan keroyokan PPL/PML (rancangan: claude/rancangan-pendataan-keroyokan.md di Project) -- permintaan user.
-- Isi: daftar KK per Sub SLS (diunggah admin), log pendataan (append-only, sumber kebenaran), status terkini per KK, fungsi mencatat hasil
-- (idempoten + tahan data offline yang tiba terlambat), fungsi akses Sub SLS per akun, dan fungsi ringkasan monitoring.
--
-- Mengikuti claude/acuan-skema-portal.md: orang = sigap_akun.id, wilayah = kode BPS (idsubsls), kegiatan = sigap_kegiatan.id; RLS aktif tanpa policy
-- (hanya server/service role); fungsi SECURITY DEFINER di-revoke dari anon/authenticated; tanpa hapus permanen (aktif = false).
-- PENGECUALIAN yang disengaja pada aturan 5 (data pribadi hanya di master): nama KK dan koordinat rumah adalah DATA SASARAN pendataan yang diunggah
-- admin, bukan data petugas; disimpan di tabel ini, hanya terbaca lewat server, dan hanya oleh tim Sub SLS terkait.
--
-- Aturan inti (keputusan user 11 Okt): HASIL TERAKHIR YANG BERLAKU, tanpa klaim lunak "sedang didata". "Terakhir" = menurut WAKTU KEJADIAN di HP,
-- bukan waktu tiba di server, supaya data yang dikirim belakangan (offline) tidak menimpa data yang lebih baru. Setiap catatan tetap disimpan di log.

-- ---------------------------------------------------------------- unggahan
create table if not exists public.bencana_pendataan_batch (
  id                  bigint generated always as identity primary key,
  kegiatan_id         bigint not null references public.sigap_kegiatan(id),
  nama_berkas         text,
  diunggah_oleh_akun  bigint references public.sigap_akun(id),
  diunggah_at         timestamptz not null default now(),
  jumlah_diterima     integer not null default 0 check (jumlah_diterima >= 0),
  jumlah_ditolak      integer not null default 0 check (jumlah_ditolak >= 0),
  ringkasan           jsonb,
  dibatalkan_at       timestamptz
);
comment on table public.bencana_pendataan_batch is 'Satu kali unggah daftar KK (Excel/CSV) oleh admin; ringkasan memuat baris yang ditolak beserta alasannya.';

-- ---------------------------------------------------------------- daftar KK + status terkini
create table if not exists public.bencana_pendataan_kk (
  id            bigint generated always as identity primary key,
  kegiatan_id   bigint not null references public.sigap_kegiatan(id),
  batch_id      bigint references public.bencana_pendataan_batch(id),
  idsubsls      text not null references public.bencana_wilayah(idsubsls),
  nama_kk       text not null check (length(btrim(nama_kk)) > 0),
  nama_kk_norm  text generated always as (lower(regexp_replace(btrim(nama_kk), '\s+', ' ', 'g'))) stored,
  anggota_lain  text,
  patokan       text,
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  aktif         boolean not null default true,
  dibuat_at     timestamptz not null default now(),
  -- status terkini: HANYA diubah fungsi bencana_pendataan_catat (turunan dari log)
  hasil         text check (hasil in ('terdampak', 'tidak_terdampak', 'tidak_ditemukan')),
  alasan        text,
  ppl_akun_id   bigint references public.sigap_akun(id),
  status_at     timestamptz,
  diperbarui_at timestamptz not null default now(),
  constraint kk_koordinat_berpasangan check ((lat is null) = (lng is null)),
  constraint kk_hasil_ada_pelaku check (hasil is null or ppl_akun_id is not null)
);
create index if not exists bencana_pendataan_kk_subsls_idx on public.bencana_pendataan_kk (idsubsls) where aktif;
create index if not exists bencana_pendataan_kk_batch_idx on public.bencana_pendataan_kk (batch_id);
create index if not exists bencana_pendataan_kk_ppl_idx on public.bencana_pendataan_kk (ppl_akun_id) where ppl_akun_id is not null;
comment on table public.bencana_pendataan_kk is 'Daftar KK sasaran pendataan per Sub SLS + status terkini (hasil terakhir menurut waktu kejadian). Data pribadi: hanya via server.';
comment on column public.bencana_pendataan_kk.status_at is 'Waktu kejadian (jam HP, dijepit ke waktu server) dari catatan yang sedang berlaku; juga kunci urutan untuk data offline.';

-- ---------------------------------------------------------------- log (append-only)
create table if not exists public.bencana_pendataan_log (
  id               bigint generated always as identity primary key,
  kk_id            bigint not null references public.bencana_pendataan_kk(id),
  akun_id          bigint not null references public.sigap_akun(id),
  hasil            text not null check (hasil in ('terdampak', 'tidak_terdampak', 'tidak_ditemukan', 'belum')),
  alasan           text,
  waktu_kejadian   timestamptz not null,
  diterima_at      timestamptz not null default now(),
  kunci            uuid not null,
  menjadi_terkini  boolean not null,
  pos_lat          double precision,
  pos_lng          double precision,
  pos_akurasi_m    real
);
create unique index if not exists bencana_pendataan_log_kunci_uq on public.bencana_pendataan_log (kunci);
create index if not exists bencana_pendataan_log_kk_idx on public.bencana_pendataan_log (kk_id, waktu_kejadian desc);
create index if not exists bencana_pendataan_log_akun_idx on public.bencana_pendataan_log (akun_id, waktu_kejadian);
comment on table public.bencana_pendataan_log is 'Setiap penandaan hasil oleh petugas (append-only). hasil=belum berarti dikembalikan ke belum didata (Urungkan). kunci = id unik dari HP supaya kirim ulang tidak menggandakan.';

alter table public.bencana_pendataan_batch enable row level security;
alter table public.bencana_pendataan_kk    enable row level security;
alter table public.bencana_pendataan_log   enable row level security;

-- ---------------------------------------------------------------- akses Sub SLS per akun
-- Keroyokan: seluruh anggota tim (PML + semua PPL di bawahnya) melihat semua Sub SLS yang dialokasikan ke PML tim itu.
-- PML = bencana_petugas.peran 'pml' (pml_id di alokasi = id petugasnya); PPL = atasan_id-nya.
create or replace function public.bencana_pendataan_subsls_akun(p_akun bigint)
returns setof text
language sql stable security definer set search_path = public as $$
  select distinct a.idsubsls
  from public.sigap_akun s
  join public.bencana_petugas p on p.id = s.petugas_bencana_id and p.aktif
  join public.bencana_alokasi_subsls a on a.pml_id = case when p.peran = 'pml' then p.id else p.atasan_id end
  where s.id = p_akun and s.aktif
$$;

-- ---------------------------------------------------------------- catat hasil
create or replace function public.bencana_pendataan_catat(
  p_akun bigint, p_kk bigint, p_hasil text, p_alasan text, p_waktu timestamptz, p_kunci uuid,
  p_pos_lat double precision default null, p_pos_lng double precision default null, p_pos_akurasi real default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kk public.bencana_pendataan_kk%rowtype;
  v_waktu timestamptz;
  v_terkini boolean;
  v_baris bigint;
begin
  if p_hasil not in ('terdampak', 'tidak_terdampak', 'tidak_ditemukan', 'belum') then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'hasil_tidak_dikenal');
  end if;
  select * into v_kk from public.bencana_pendataan_kk where id = p_kk and aktif for update;
  if not found then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'kk_tidak_ada');
  end if;
  if not exists (select 1 from public.bencana_pendataan_subsls_akun(p_akun) x where x = v_kk.idsubsls) then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'bukan_wilayah_tim');
  end if;
  -- jam HP bisa meleset: tidak boleh di masa depan
  v_waktu := least(coalesce(p_waktu, now()), now());
  v_terkini := v_kk.status_at is null or v_waktu >= v_kk.status_at;

  insert into public.bencana_pendataan_log (kk_id, akun_id, hasil, alasan, waktu_kejadian, kunci, menjadi_terkini, pos_lat, pos_lng, pos_akurasi_m)
  values (p_kk, p_akun, p_hasil, nullif(btrim(p_alasan), ''), v_waktu, p_kunci, v_terkini, p_pos_lat, p_pos_lng, p_pos_akurasi)
  on conflict (kunci) do nothing
  returning id into v_baris;
  if v_baris is null then
    return jsonb_build_object('status', 'duplikat');
  end if;

  if v_terkini then
    update public.bencana_pendataan_kk set
      hasil = case when p_hasil = 'belum' then null else p_hasil end,
      alasan = case when p_hasil = 'belum' then null else nullif(btrim(p_alasan), '') end,
      ppl_akun_id = case when p_hasil = 'belum' then null else p_akun end,
      status_at = v_waktu,
      diperbarui_at = now()
    where id = p_kk;
  end if;
  return jsonb_build_object('status', 'tercatat', 'terkini', v_terkini, 'log_id', v_baris);
end $$;

-- ---------------------------------------------------------------- ringkasan monitoring tim
-- Per Sub SLS dan per PPL: jumlah menurut hasil terkini; hasil NULL = belum didata (ppl NULL). "Hari ini" = tanggal WIB dari waktu kejadian.
-- Catatan: dihitung dari status terkini, jadi KK yang kemudian ditimpa PPL lain pindah ke PPL itu. Realisasi harian untuk translok (fase 4) dihitung dari log.
create or replace function public.bencana_pendataan_ringkas(p_pml bigint)
returns table (idsubsls text, ppl_akun_id bigint, hasil text, jumlah integer, hari_ini integer)
language sql stable security definer set search_path = public as $$
  select k.idsubsls, k.ppl_akun_id, k.hasil,
         count(*)::int,
         (count(*) filter (where (k.status_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date))::int
  from public.bencana_pendataan_kk k
  where k.aktif and k.idsubsls in (select a.idsubsls from public.bencana_alokasi_subsls a where a.pml_id = p_pml)
  group by k.idsubsls, k.ppl_akun_id, k.hasil
$$;

revoke execute on function public.bencana_pendataan_subsls_akun(bigint) from public, anon, authenticated;
revoke execute on function public.bencana_pendataan_catat(bigint, bigint, text, text, timestamptz, uuid, double precision, double precision, real) from public, anon, authenticated;
revoke execute on function public.bencana_pendataan_ringkas(bigint) from public, anon, authenticated;
grant execute on function public.bencana_pendataan_subsls_akun(bigint) to service_role;
grant execute on function public.bencana_pendataan_catat(bigint, bigint, text, text, timestamptz, uuid, double precision, double precision, real) to service_role;
grant execute on function public.bencana_pendataan_ringkas(bigint) to service_role;
