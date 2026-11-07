-- 20261107j_master_kk_unggah.sql  (tahap C3: KK master -- unggah per kecamatan + keputusan usulan dari lapangan)
-- Syarat: 20261107e (master_wilayah, master_kk) dan 20261107f/g (sigap_sampel_tag, sigap_sampel_ganti) sudah dijalankan. Idempoten.
--
--  1. master_kk_unggah : riwayat unggahan KK per kecamatan (siapa, kapan, berapa baru/berubah/nonaktif).
--  2. master_kk.unggah_id : unggahan terakhir yang menyentuh baris itu.
--  3. master_kk_terapkan(...) : SATU fungsi untuk pratinjau (p_terapkan=false, tidak menulis apa pun) dan penerapan (true), sehingga hasil keduanya pasti sama.
--     Pencocokan: (sub SLS, nama KK dengan huruf kecil dan spasi dirapatkan); bila ada nama kembar dalam satu sub SLS, dicocokkan menurut urutan.
--     Baru -> disisipkan (sumber 'unggahan'); sama bidang -> tidak disentuh; beda bidang -> diperbarui di tempat (id tetap, jadi tag/penggantian tetap sah);
--     tidak ada di berkas -> hanya dinonaktifkan bila diminta DAN tidak dipakai tag/penggantian; cakupan hanya sub SLS yang ADA di berkas.
--  4. sigap_sampel_ganti: kolom keputusan atas usulan pembaruan master + fungsi master_usul_putuskan (hanya usulan berstatus 'disetujui').
-- Semua tertutup untuk anon/authenticated; hanya service_role.

create table if not exists public.master_kk_unggah (
  id             bigint generated always as identity primary key,
  kd_kec         text not null,
  nama_berkas    text,
  dibuat_oleh    bigint,
  dibuat_at      timestamptz not null default now(),
  jumlah_baris   int not null default 0,
  baru           int not null default 0,
  berubah        int not null default 0,
  sama           int not null default 0,
  diaktifkan     int not null default 0,
  nonaktif       int not null default 0,
  nonaktifkan_hilang boolean not null default false
);
create index if not exists master_kk_unggah_kec_idx on public.master_kk_unggah (kd_kec, id desc);
alter table public.master_kk_unggah enable row level security;
revoke all on public.master_kk_unggah from anon, authenticated;
grant all on public.master_kk_unggah to service_role;

alter table public.master_kk add column if not exists unggah_id bigint;

create or replace function public.master_kk_terapkan(p_akun bigint, p_kec text, p_berkas text, p_baris jsonb, p_nonaktifkan boolean, p_terapkan boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_unggah bigint;
  v_baru int; v_ubah int; v_sama int; v_aktif int; v_hilang int; v_terpakai int; v_nonaktif int; v_baris int;
  v_asing int;
  v_contoh jsonb;
begin
  if p_kec is null or p_kec !~ '^[0-9]{7}$' then raise exception 'Kode kecamatan tidak sah.'; end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then raise exception 'Isi berkas tidak sah.'; end if;

  create temp table _masuk on commit drop as
    select (t.ord)::int as ord, x.idsubsls, btrim(x.nama_kk) as nama_kk,
           lower(regexp_replace(btrim(x.nama_kk), '\s+', ' ', 'g')) as kunci,
           nullif(btrim(coalesce(x.anggota_lain, '')), '') as anggota_lain,
           nullif(btrim(coalesce(x.patokan, '')), '') as patokan,
           x.lat, x.lng
    from jsonb_array_elements(p_baris) with ordinality as t(el, ord)
    cross join lateral jsonb_to_record(t.el) as x(idsubsls text, nama_kk text, anggota_lain text, patokan text, lat double precision, lng double precision);
  select count(*) into v_baris from _masuk;
  if v_baris = 0 then raise exception 'Berkas tidak berisi baris KK.'; end if;

  select count(*) into v_asing from _masuk m left join public.master_wilayah w on w.idsubsls = m.idsubsls and w.kd_kec = p_kec where w.idsubsls is null;
  if v_asing > 0 then raise exception '% baris memuat sub SLS yang bukan milik kecamatan ini atau tidak ada di master wilayah.', v_asing; end if;

  alter table _masuk add column rn int;
  update _masuk m set rn = s.rn from (select ord, row_number() over (partition by idsubsls, kunci order by ord) rn from _masuk) s where s.ord = m.ord;

  -- baris master di sub SLS yang ada di berkas (aktif dan tidak aktif; yang tidak aktif bisa diaktifkan kembali)
  create temp table _lama on commit drop as
    select k.id, k.idsubsls, k.aktif, k.nama_kk, k.anggota_lain, k.patokan, k.lat, k.lng,
           lower(regexp_replace(btrim(k.nama_kk), '\s+', ' ', 'g')) as kunci,
           row_number() over (partition by k.idsubsls, lower(regexp_replace(btrim(k.nama_kk), '\s+', ' ', 'g')) order by k.aktif desc, k.id) as rn
    from public.master_kk k
    where k.idsubsls in (select distinct idsubsls from _masuk);

  create temp table _rencana on commit drop as
    select m.ord, m.idsubsls, m.nama_kk, m.kunci, m.anggota_lain, m.patokan, m.lat, m.lng, l.id as kk_id, l.aktif as lama_aktif,
           case
             when l.id is null then 'baru'
             when l.nama_kk is distinct from m.nama_kk or l.anggota_lain is distinct from m.anggota_lain or l.patokan is distinct from m.patokan
                  or l.lat is distinct from m.lat or l.lng is distinct from m.lng then 'berubah'
             when not l.aktif then 'diaktifkan'
             else 'sama'
           end as jenis
    from _masuk m left join _lama l on l.idsubsls = m.idsubsls and l.kunci = m.kunci and l.rn = m.rn;

  create temp table _hilang on commit drop as
    select l.id, l.idsubsls, l.nama_kk,
           exists (select 1 from public.sigap_sampel_tag t where t.kk_id = l.id)
           or exists (select 1 from public.sigap_sampel_ganti g where g.utama_kk_id = l.id or g.cadangan_kk_id = l.id) as terpakai
    from _lama l
    where l.aktif and not exists (select 1 from _rencana r where r.kk_id = l.id);

  select count(*) filter (where jenis = 'baru'), count(*) filter (where jenis = 'berubah'), count(*) filter (where jenis = 'sama'), count(*) filter (where jenis = 'diaktifkan')
    into v_baru, v_ubah, v_sama, v_aktif from _rencana;
  select count(*), count(*) filter (where terpakai) into v_hilang, v_terpakai from _hilang;
  v_nonaktif := case when p_nonaktifkan then v_hilang - v_terpakai else 0 end;

  select jsonb_build_object(
    'baru',     coalesce((select jsonb_agg(jsonb_build_object('idsubsls', idsubsls, 'nama', nama_kk)) from (select * from _rencana where jenis = 'baru' order by ord limit 5) a), '[]'::jsonb),
    'berubah',  coalesce((select jsonb_agg(jsonb_build_object('idsubsls', idsubsls, 'nama', nama_kk)) from (select * from _rencana where jenis = 'berubah' order by ord limit 5) a), '[]'::jsonb),
    'hilang',   coalesce((select jsonb_agg(jsonb_build_object('idsubsls', idsubsls, 'nama', nama_kk, 'terpakai', terpakai)) from (select * from _hilang order by id limit 5) a), '[]'::jsonb)
  ) into v_contoh;

  if p_terapkan then
    insert into public.master_kk_unggah (kd_kec, nama_berkas, dibuat_oleh, jumlah_baris, baru, berubah, sama, diaktifkan, nonaktif, nonaktifkan_hilang)
    values (p_kec, left(p_berkas, 300), p_akun, v_baris, v_baru, v_ubah, v_sama, v_aktif, v_nonaktif, coalesce(p_nonaktifkan, false))
    returning id into v_unggah;

    insert into public.master_kk (idsubsls, nama_kk, nama_kk_norm, anggota_lain, patokan, lat, lng, sumber, aktif, unggah_id)
    select idsubsls, nama_kk, lower(btrim(nama_kk)), anggota_lain, patokan, lat, lng, 'unggahan', true, v_unggah from _rencana where jenis = 'baru' order by ord;

    update public.master_kk k
       set nama_kk = r.nama_kk, nama_kk_norm = lower(btrim(r.nama_kk)), anggota_lain = r.anggota_lain, patokan = r.patokan, lat = r.lat, lng = r.lng,
           aktif = true, unggah_id = v_unggah, diubah_at = now()
      from _rencana r where r.kk_id = k.id and r.jenis in ('berubah', 'diaktifkan');

    if p_nonaktifkan then
      update public.master_kk k set aktif = false, unggah_id = v_unggah, diubah_at = now()
        from _hilang h where h.id = k.id and not h.terpakai;
    end if;
  end if;

  return jsonb_build_object('terapkan', p_terapkan, 'baris', v_baris, 'baru', v_baru, 'berubah', v_ubah, 'sama', v_sama, 'diaktifkan', v_aktif,
                            'hilang', v_hilang, 'hilang_terpakai', v_terpakai, 'nonaktif', v_nonaktif, 'unggah_id', v_unggah, 'contoh', v_contoh);
end
$fn$;
revoke all on function public.master_kk_terapkan(bigint, text, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.master_kk_terapkan(bigint, text, text, jsonb, boolean, boolean) to service_role;

-- ringkasan per kecamatan untuk layar KK master
create or replace function public.master_kk_per_kec()
returns table (kd_kec text, kecamatan text, subsls bigint, subsls_berkk bigint, kk_aktif bigint, terbaru timestamptz)
language sql stable security definer set search_path = public as $$
  select w.kd_kec, min(w.kecamatan), count(distinct w.idsubsls), count(distinct k.idsubsls), count(k.id), max(k.diubah_at)
  from public.master_wilayah w left join public.master_kk k on k.idsubsls = w.idsubsls and k.aktif
  where w.aktif
  group by w.kd_kec order by min(w.kecamatan)
$$;
revoke all on function public.master_kk_per_kec() from public, anon, authenticated;
grant execute on function public.master_kk_per_kec() to service_role;

-- keputusan atas usulan pembaruan master (dari penggantian sampel yang ditandai usul_master) -------------------------------------
alter table public.sigap_sampel_ganti add column if not exists usul_putusan text;
alter table public.sigap_sampel_ganti add column if not exists usul_diputus_oleh bigint;
alter table public.sigap_sampel_ganti add column if not exists usul_diputus_at timestamptz;
alter table public.sigap_sampel_ganti add column if not exists usul_catatan text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sigap_sampel_ganti_usul_putusan_ck') then
    alter table public.sigap_sampel_ganti add constraint sigap_sampel_ganti_usul_putusan_ck check (usul_putusan is null or usul_putusan in ('diterapkan', 'ditolak'));
  end if;
end $$;

create or replace function public.master_usul_putuskan(p_ganti bigint, p_akun bigint, p_putusan text, p_catatan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare g record;
begin
  if p_putusan not in ('diterapkan', 'ditolak') then raise exception 'Keputusan tidak sah.'; end if;
  select * into g from public.sigap_sampel_ganti where id = p_ganti for update;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if not g.usul_master then raise exception 'Penggantian ini tidak ditandai sebagai usulan pembaruan master.'; end if;
  if g.status <> 'disetujui' then raise exception 'Hanya usulan dari penggantian yang sudah disetujui yang bisa diputuskan (status sekarang: %).', g.status; end if;
  if g.usul_putusan is not null then raise exception 'Usulan ini sudah diputuskan (%).', g.usul_putusan; end if;
  if p_putusan = 'diterapkan' then
    update public.master_kk set aktif = false, diubah_at = now() where id = g.utama_kk_id;
  end if;
  update public.sigap_sampel_ganti
     set usul_putusan = p_putusan, usul_diputus_oleh = p_akun, usul_diputus_at = now(), usul_catatan = nullif(left(btrim(coalesce(p_catatan, '')), 500), '')
   where id = p_ganti;
  return jsonb_build_object('id', p_ganti, 'putusan', p_putusan, 'kk_id', g.utama_kk_id);
end
$fn$;
revoke all on function public.master_usul_putuskan(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.master_usul_putuskan(bigint, bigint, text, text) to service_role;

-- verifikasi ---------------------------------------------------------------------------------------------------------------------
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'master_kk_unggah') as tabel_unggah,
  (select count(*) from information_schema.columns where table_name = 'master_kk' and column_name = 'unggah_id') as kolom_unggah_id,
  (select count(*) from information_schema.columns where table_name = 'sigap_sampel_ganti' and column_name = 'usul_putusan') as kolom_usul,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('master_kk_terapkan', 'master_kk_per_kec', 'master_usul_putuskan')) as fungsi_ada,
  (select bool_and(relrowsecurity) from pg_class where oid = 'public.master_kk_unggah'::regclass) as rls_aktif;
