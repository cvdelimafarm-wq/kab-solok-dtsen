-- 20261107i_master_batas_versi.sql
-- Tahap C2 rancangan "sampel lintas survei": unggah shapefile batas sub SLS di Master, berversi.
--
--  1. Bucket Storage `peta-batas` (pribadi; hanya server yang membaca/menulis): isi tiap versi = `<versi>/manifest.json` + `<versi>/batas-<7 digit kecamatan>.json`.
--  2. Tabel `master_batas_versi`: riwayat versi (siapa, kapan, berkas asal, ringkasan pemeriksaan) dan versi yang AKTIF (paling banyak satu).
--     Tidak ada versi aktif = aplikasi memakai berkas bawaan (public/peta/batas). Versi lama tidak dihapus; "kembalikan" = aktifkan versi lama.
--  3. Fungsi `master_batas_aktifkan(versi, akun)`: pindah versi aktif secara atomik; versi kosong = kembali ke berkas bawaan.
--
-- Tidak mengubah tabel/fungsi yang ada. Peta di HP tidak berubah sampai Ketua mengaktifkan sebuah versi. Aman dijalankan ulang.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('peta-batas', 'peta-batas', false, 10485760)
on conflict (id) do nothing;

create table if not exists public.master_batas_versi (
  id              bigint generated always as identity primary key,
  versi           text   not null unique check (versi ~ '^[0-9A-Za-z]{6,20}$'),
  dibuat_at       timestamptz not null default now(),
  dibuat_oleh     bigint references public.sigap_akun(id),
  nama_asal       text,
  catatan         text,
  jumlah_subsls   int    not null check (jumlah_subsls >= 0),
  jumlah_kec      int    not null check (jumlah_kec >= 0),
  ukuran_byte     bigint not null default 0,
  ringkas         jsonb  not null default '{}'::jsonb,
  aktif           boolean not null default false,
  diaktifkan_at   timestamptz,
  diaktifkan_oleh bigint references public.sigap_akun(id)
);
create unique index if not exists master_batas_versi_satu_aktif on public.master_batas_versi ((true)) where aktif;
create index if not exists master_batas_versi_urut on public.master_batas_versi (id desc);

alter table public.master_batas_versi enable row level security;
revoke all on table public.master_batas_versi from anon, authenticated;
grant all on table public.master_batas_versi to service_role;
grant usage, select on all sequences in schema public to service_role;
comment on table public.master_batas_versi is 'Riwayat versi batas sub SLS (shapefile) yang diunggah di Master; satu versi aktif. Tanpa versi aktif = berkas bawaan aplikasi.';

create or replace function public.master_batas_aktifkan(p_versi text, p_akun bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.master_batas_versi;
begin
  if p_versi is null or btrim(p_versi) = '' then
    update public.master_batas_versi set aktif = false where aktif;
    return jsonb_build_object('ok', true, 'aktif', null);
  end if;
  select * into v from public.master_batas_versi where versi = p_versi for update;
  if not found then
    return jsonb_build_object('ok', false, 'pesan', 'Versi tidak ditemukan.');
  end if;
  update public.master_batas_versi set aktif = false where aktif and versi <> p_versi;
  update public.master_batas_versi set aktif = true, diaktifkan_at = now(), diaktifkan_oleh = p_akun where versi = p_versi;
  return jsonb_build_object('ok', true, 'aktif', p_versi);
end;
$$;
revoke all on function public.master_batas_aktifkan(text, bigint) from public, anon, authenticated;
grant execute on function public.master_batas_aktifkan(text, bigint) to service_role;

commit;

-- Verifikasi (harus: bucket 1, tabel 1, fungsi 1, versi_aktif 0, tertutup true) ---------------------------------------------------------
select
  (select count(*) from storage.buckets where id = 'peta-batas') as bucket,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'master_batas_versi') as tabel,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'master_batas_aktifkan') as fungsi,
  (select count(*) from public.master_batas_versi where aktif) as versi_aktif,
  not has_table_privilege('anon', 'public.master_batas_versi', 'select') and not has_table_privilege('authenticated', 'public.master_batas_versi', 'select') as tertutup;
