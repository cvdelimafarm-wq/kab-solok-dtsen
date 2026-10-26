-- =====================================================================
-- 20261026k_sigap_qc_pemahaman.sql
-- SIGAP - QC Pemahaman Petugas (26 Okt 2026)
--
-- Kuis harian wajib untuk PML dan PPL kegiatan Pendataan Pascabencana:
--  * bank soal (7 paket x 7 soal, diimpor dari Soal_QC_Pemahaman_petugas.xlsx) beserta kata kunci untuk sorotan;
--  * tiap hari 10 soal diundi SEKALI untuk semua petugas, tiap paket terwakili minimal 1 soal, sisanya dipilih dari soal
--    yang paling lama tidak dipakai (acak bila sama), jadi bank habis berputar dulu sebelum ada soal berulang;
--  * soal dirilis jam rilis (bawaan 19.00 WIB), batas bawaan 20.00 WIB; modal pemblokir TETAP berlaku sampai petugas
--    selesai (nilai 100 atau percobaan habis: 1 awal + maks_ulang), juga sampai rilis berikutnya menggantikan hari itu;
--  * rekap tim dikirim ke PML pagi berikutnya (nilai PPL, soal yang salah, ajakan briefing ulang);
--  * semua akses lewat API server (service_role); tabel tanpa kebijakan RLS, fungsi hanya untuk service_role.
--
-- Aman diulang (create if not exists / create or replace / upsert). Kegiatan bawaan dibuat NONAKTIF (aktif = false):
-- aktifkan dari Kelola Pendataan setelah kode dideploy dan jadwal Railway Cron dipasang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table if not exists public.sigap_qc_pengaturan (
  kegiatan_id   bigint primary key references public.sigap_kegiatan(id),
  aktif         boolean  not null default false,
  rilis_jam     time     not null default '19:00',
  batas_jam     time     not null default '20:00',
  soal_per_hari smallint not null default 10 check (soal_per_hari between 1 and 30),
  maks_ulang    smallint not null default 3  check (maks_ulang between 0 and 10),
  rekap_jam     time     not null default '07:00',
  ingat_menit   integer[] not null default '{30,50}',
  -- pengingat berkala SESUDAH batas (dan pada hari susulan) bagi yang belum mengisi / belum 100; menit antar pengingat, 0 = mati
  ingat_berkala_menit integer not null default 60 check (ingat_berkala_menit = 0 or ingat_berkala_menit between 15 and 720),
  mulai         date,
  akhir         date,
  diubah_oleh   text,
  diubah_at     timestamptz not null default now(),
  check (rilis_jam < batas_jam),
  check (akhir is null or mulai is null or akhir >= mulai)
);

create table if not exists public.sigap_qc_soal (
  id          text primary key,
  paket       smallint not null check (paket between 1 and 99),
  judul_paket text     not null,
  nomor       smallint not null default 1,
  pertanyaan  text     not null check (length(btrim(pertanyaan)) >= 5),
  opsi        jsonb    not null,
  kunci       text     not null check (kunci in ('A','B','C','D')),
  penjelasan  text     not null default '',
  kata_kunci  text[]   not null default '{}',
  aktif       boolean  not null default true,
  diubah_at   timestamptz not null default now(),
  check (jsonb_typeof(opsi) = 'object' and opsi ?& array['A','B','C','D'])
);

create table if not exists public.sigap_qc_hari (
  kegiatan_id bigint not null references public.sigap_kegiatan(id),
  tanggal     date   not null,
  soal_ids    text[] not null,
  dirilis_at  timestamptz not null default now(),
  -- hari SUSULAN: dirilis setelah lewat jam batas (mis. fitur baru diaktifkan malam hari). Tanpa label terlambat; tetap memblokir;
  -- pengingat berkala dihitung dari saat hari ditandai susulan. null = hari biasa.
  susulan_at  timestamptz,
  primary key (kegiatan_id, tanggal)
);

create table if not exists public.sigap_qc_percobaan (
  id          bigserial primary key,
  kegiatan_id bigint   not null references public.sigap_kegiatan(id),
  tanggal     date     not null,
  akun_id     bigint   not null,
  ke          smallint not null check (ke >= 1),
  jawaban     jsonb    not null,
  salah       text[]   not null default '{}',
  benar       smallint not null,
  jumlah      smallint not null,
  skor        smallint not null,
  terlambat   boolean  not null default false,
  selesai_at  timestamptz not null default now(),
  unique (kegiatan_id, tanggal, akun_id, ke)
);
create index if not exists sigap_qc_percobaan_hari_idx on public.sigap_qc_percobaan (kegiatan_id, tanggal, akun_id);

-- catatan pengiriman (push, rekap) agar tiap pesan terjadwal hanya sekali
create table if not exists public.sigap_qc_kirim (
  kegiatan_id bigint   not null references public.sigap_kegiatan(id),
  tanggal     date     not null,
  jenis       text     not null check (jenis in ('rilis','ingat_petugas','ingat_pml','rekap_pml')),
  akun_id     bigint   not null,
  slot        smallint not null default 0,
  dibuat_at   timestamptz not null default now(),
  primary key (kegiatan_id, tanggal, jenis, akun_id, slot)
);

-- PML sudah menutup modal rekap
create table if not exists public.sigap_qc_rekap_baca (
  kegiatan_id bigint not null references public.sigap_kegiatan(id),
  tanggal     date   not null,
  pml_akun_id bigint not null,
  dibaca_at   timestamptz not null default now(),
  primary key (kegiatan_id, tanggal, pml_akun_id)
);

-- (26 Okt 2026, malam) Penyesuaian untuk basis yang SUDAH pernah menjalankan versi awal berkas ini: `create table if not exists` di atas tidak
-- menambah kolom baru, jadi kolom hari susulan dan pengingat berkala ditambahkan secara eksplisit (aman dijalankan berulang).
alter table public.sigap_qc_pengaturan add column if not exists ingat_berkala_menit integer not null default 60;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sigap_qc_pengaturan'::regclass and conname = 'sigap_qc_pengaturan_ingat_berkala_cek') then
    alter table public.sigap_qc_pengaturan add constraint sigap_qc_pengaturan_ingat_berkala_cek check (ingat_berkala_menit = 0 or ingat_berkala_menit between 15 and 720);
  end if;
end $$;
alter table public.sigap_qc_hari add column if not exists susulan_at timestamptz;

alter table public.sigap_qc_pengaturan enable row level security;
alter table public.sigap_qc_soal       enable row level security;
alter table public.sigap_qc_hari       enable row level security;
alter table public.sigap_qc_percobaan  enable row level security;
alter table public.sigap_qc_kirim      enable row level security;
alter table public.sigap_qc_rekap_baca enable row level security;
revoke all on public.sigap_qc_pengaturan, public.sigap_qc_soal, public.sigap_qc_hari,
              public.sigap_qc_percobaan, public.sigap_qc_kirim, public.sigap_qc_rekap_baca from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Peserta: PML dan PPL aktif pada kegiatan, beserta PML tiap PPL (atasan di bencana_petugas)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_peserta(p_kegiatan bigint)
returns table (akun_id bigint, nama text, peran text, pml_akun_id bigint, pml_nama text)
language sql stable security definer set search_path = public as $$
  select p.akun_id, a.nama, p.peran, pp.akun_id, pa.nama
  from sigap_penugasan p
  join sigap_akun a on a.id = p.akun_id and a.aktif
  left join bencana_petugas bp on bp.id = a.petugas_bencana_id
  left join sigap_akun pa on p.peran = 'ppl' and pa.petugas_bencana_id = bp.atasan_id and pa.aktif
  left join sigap_penugasan pp on pp.akun_id = pa.id and pp.kegiatan_id = p_kegiatan and pp.peran = 'pml' and pp.aktif
  where p.kegiatan_id = p_kegiatan and p.aktif and p.peran in ('pml', 'ppl')
$$;

-- ---------------------------------------------------------------------
-- 3. Undian soal: tiap paket terwakili, sisanya paling lama tidak dipakai (acak bila sama)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_undi(p_kegiatan bigint, p_jumlah integer)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v_hasil text[];
begin
  select coalesce(array_agg(id), '{}') into v_hasil from (
    select x.id from (
      select s.id, s.paket,
             coalesce((select max(h.tanggal) from sigap_qc_hari h where h.kegiatan_id = p_kegiatan and s.id = any (h.soal_ids)), date '1900-01-01') as terakhir,
             row_number() over (partition by s.paket order by
               coalesce((select max(h.tanggal) from sigap_qc_hari h where h.kegiatan_id = p_kegiatan and s.id = any (h.soal_ids)), date '1900-01-01'), random()) as rn
      from sigap_qc_soal s where s.aktif
    ) x
    order by (case when x.rn = 1 then 0 else 1 end), x.terakhir, random()
    limit greatest(p_jumlah, 0)
  ) y;
  return v_hasil;
end $$;

create or replace function public.sigap_qc_hari_pastikan(p_kegiatan bigint, p_tanggal date)
returns text[]
language plpgsql security definer set search_path = public as $$
declare v_ids text[]; v_per integer;
begin
  select soal_ids into v_ids from sigap_qc_hari where kegiatan_id = p_kegiatan and tanggal = p_tanggal;
  if v_ids is not null then return v_ids; end if;
  perform pg_advisory_xact_lock(hashtext('sigap_qc_hari:' || p_kegiatan || ':' || p_tanggal));
  select soal_ids into v_ids from sigap_qc_hari where kegiatan_id = p_kegiatan and tanggal = p_tanggal;
  if v_ids is not null then return v_ids; end if;
  select soal_per_hari into v_per from sigap_qc_pengaturan where kegiatan_id = p_kegiatan;
  if v_per is null then raise exception 'Pengaturan QC belum ada' using errcode = 'P0001'; end if;
  v_ids := sigap_qc_undi(p_kegiatan, v_per);
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Bank soal kosong' using errcode = 'P0001'; end if;
  insert into sigap_qc_hari (kegiatan_id, tanggal, soal_ids) values (p_kegiatan, p_tanggal, v_ids);
  return v_ids;
end $$;

-- ---------------------------------------------------------------------
-- 4. Status petugas: hari yang berlaku, sisa percobaan, apakah wajib (memblokir)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_status(p_akun bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s record; v_peran text; v_pml bigint; v_now timestamp; v_tgl date; v_rilis timestamptz; v_batas timestamptz;
  v_n integer; v_best integer; v_lulus boolean; v_maks integer; v_perlu boolean; v_belum jsonb := '[]'::jsonb; v_susulan timestamptz;
begin
  select pg.* into s from sigap_qc_pengaturan pg
   where pg.aktif and exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun)
   order by pg.kegiatan_id limit 1;
  if not found then return jsonb_build_object('aktif', false); end if;
  select q.peran into v_peran from sigap_qc_peserta(s.kegiatan_id) q where q.akun_id = p_akun limit 1;

  v_now := now() at time zone 'Asia/Jakarta';
  v_tgl := case when v_now::time >= s.rilis_jam then v_now::date else v_now::date - 1 end;
  if (s.mulai is not null and v_tgl < s.mulai) or (s.akhir is not null and v_tgl > s.akhir) then
    return jsonb_build_object('aktif', false, 'alasan', 'di luar periode');
  end if;
  v_rilis := (v_tgl + s.rilis_jam) at time zone 'Asia/Jakarta';
  v_batas := (v_tgl + s.batas_jam) at time zone 'Asia/Jakarta';
  select h.susulan_at into v_susulan from sigap_qc_hari h where h.kegiatan_id = s.kegiatan_id and h.tanggal = v_tgl;

  select count(*), coalesce(max(skor), 0), coalesce(bool_or(benar = jumlah), false)
    into v_n, v_best, v_lulus
    from sigap_qc_percobaan where kegiatan_id = s.kegiatan_id and tanggal = v_tgl and akun_id = p_akun;
  v_maks := 1 + s.maks_ulang;
  v_perlu := (v_n = 0) or (not v_lulus and v_n < v_maks);

  if v_peran = 'pml' then
    select coalesce(jsonb_agg(q.nama order by q.nama), '[]'::jsonb) into v_belum
      from sigap_qc_peserta(s.kegiatan_id) q
     where q.peran = 'ppl' and q.pml_akun_id = p_akun
       and not exists (select 1 from sigap_qc_percobaan c where c.kegiatan_id = s.kegiatan_id and c.tanggal = v_tgl and c.akun_id = q.akun_id);
  end if;

  return jsonb_build_object(
    'aktif', true, 'kegiatan_id', s.kegiatan_id, 'peran', v_peran, 'tanggal', v_tgl,
    'rilis_at', v_rilis, 'batas_at', v_batas, 'lewat_batas', (now() > v_batas and v_susulan is null), 'susulan', v_susulan is not null, 'susulan_at', v_susulan,
    'perlu', v_perlu, 'percobaan', v_n, 'maks_percobaan', v_maks, 'sisa_ulang', greatest(v_maks - v_n, 0),
    'skor_terbaik', v_best, 'lulus', v_lulus, 'ppl_belum', v_belum);
end $$;

-- ---------------------------------------------------------------------
-- 5. Soal untuk dikerjakan (tanpa kunci dan pembahasan; urutan soal dan opsi diacak per petugas dan percobaan)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_soal_untuk(p_akun bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb; v_ids text[]; v_tgl date; v_ke integer;
begin
  st := sigap_qc_status(p_akun);
  if not coalesce((st ->> 'aktif')::boolean, false) or not coalesce((st ->> 'perlu')::boolean, false) then
    raise exception 'Tidak ada soal QC yang perlu dikerjakan' using errcode = 'P0001';
  end if;
  v_tgl := (st ->> 'tanggal')::date;
  v_ids := sigap_qc_hari_pastikan((st ->> 'kegiatan_id')::bigint, v_tgl);
  v_ke := (st ->> 'percobaan')::integer + 1;
  return jsonb_build_object(
    'tanggal', v_tgl, 'ke', v_ke, 'maks_percobaan', st -> 'maks_percobaan', 'batas_at', st -> 'batas_at', 'lewat_batas', st -> 'lewat_batas', 'susulan', st -> 'susulan',
    'soal', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'paket', s.paket, 'judul_paket', s.judul_paket, 'pertanyaan', s.pertanyaan, 'kata_kunci', to_jsonb(s.kata_kunci),
               'opsi', (select jsonb_agg(jsonb_build_object('kode', o.key, 'teks', o.value #>> '{}') order by md5(p_akun || ':' || v_tgl || ':' || v_ke || ':' || s.id || ':' || o.key))
                          from jsonb_each(s.opsi) o))
             order by md5(p_akun || ':' || v_tgl || ':' || v_ke || ':' || s.id)), '[]'::jsonb)
        from sigap_qc_soal s where s.id = any (v_ids)));
end $$;

-- ---------------------------------------------------------------------
-- 6. Tinjauan jawaban (benar/salah + pembahasan) untuk satu percobaan
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_tinjau(p_akun bigint, p_tanggal date, p_ke integer default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; st jsonb; v_keg bigint;
begin
  select pg.kegiatan_id into v_keg from sigap_qc_pengaturan pg
   where exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun) order by pg.aktif desc, pg.kegiatan_id limit 1;
  if v_keg is null then raise exception 'Bukan peserta QC' using errcode = 'P0001'; end if;
  select * into c from sigap_qc_percobaan
   where kegiatan_id = v_keg and tanggal = p_tanggal and akun_id = p_akun and (p_ke is null or ke = p_ke)
   order by ke desc limit 1;
  if not found then raise exception 'Percobaan tidak ditemukan' using errcode = 'P0001'; end if;
  st := sigap_qc_status(p_akun);
  return jsonb_build_object(
    'tanggal', c.tanggal, 'ke', c.ke, 'skor', c.skor, 'benar', c.benar, 'jumlah', c.jumlah, 'lulus', c.benar = c.jumlah, 'terlambat', c.terlambat,
    'sisa_ulang', case when (st ->> 'tanggal')::date = c.tanggal and c.ke = (st ->> 'percobaan')::integer then (st -> 'sisa_ulang') else '0'::jsonb end,
    'perlu_ulang', (st ->> 'tanggal')::date = c.tanggal and coalesce((st ->> 'perlu')::boolean, false) and c.ke = (st ->> 'percobaan')::integer,
    'tinjau', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'paket', s.paket, 'judul_paket', s.judul_paket, 'pertanyaan', s.pertanyaan, 'kata_kunci', to_jsonb(s.kata_kunci),
               'opsi', (select jsonb_agg(jsonb_build_object('kode', o.key, 'teks', o.value #>> '{}') order by o.key) from jsonb_each(s.opsi) o),
               'kunci', s.kunci, 'jawaban', c.jawaban ->> s.id, 'benar', (c.jawaban ->> s.id) = s.kunci, 'penjelasan', s.penjelasan)
             order by s.paket, s.nomor, s.id), '[]'::jsonb)
        from sigap_qc_soal s where s.id = any (select jsonb_object_keys(c.jawaban))));
end $$;

-- ---------------------------------------------------------------------
-- 7. Kirim jawaban satu percobaan (semua soal wajib dijawab)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_jawab(p_akun bigint, p_jawaban jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st jsonb; v_keg bigint; v_tgl date; v_ids text[]; v_ke integer; v_jml integer; v_benar integer; v_salah text[]; v_simpan jsonb; v_late boolean;
begin
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then raise exception 'Jawaban tidak valid' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('sigap_qc_jawab:' || p_akun));
  st := sigap_qc_status(p_akun);
  if not coalesce((st ->> 'aktif')::boolean, false) or not coalesce((st ->> 'perlu')::boolean, false) then
    raise exception 'Tidak ada soal QC yang perlu dikerjakan' using errcode = 'P0001';
  end if;
  v_keg := (st ->> 'kegiatan_id')::bigint; v_tgl := (st ->> 'tanggal')::date;
  v_ids := sigap_qc_hari_pastikan(v_keg, v_tgl);
  v_ke := (st ->> 'percobaan')::integer + 1;
  v_late := coalesce((st ->> 'lewat_batas')::boolean, false);  -- hari susulan: tidak pernah terlambat

  select count(*),
         count(*) filter (where (p_jawaban ->> s.id) = s.kunci),
         coalesce(array_agg(s.id order by s.id) filter (where (p_jawaban ->> s.id) is distinct from s.kunci), '{}'),
         jsonb_object_agg(s.id, p_jawaban ->> s.id)
    into v_jml, v_benar, v_salah, v_simpan
    from sigap_qc_soal s where s.id = any (v_ids);
  if v_jml = 0 then raise exception 'Soal hari ini tidak ditemukan' using errcode = 'P0001'; end if;
  if exists (select 1 from sigap_qc_soal s where s.id = any (v_ids) and coalesce(p_jawaban ->> s.id, '') not in ('A', 'B', 'C', 'D')) then
    raise exception 'Semua soal wajib dijawab' using errcode = 'P0001';
  end if;

  insert into sigap_qc_percobaan (kegiatan_id, tanggal, akun_id, ke, jawaban, salah, benar, jumlah, skor, terlambat)
  values (v_keg, v_tgl, p_akun, v_ke, v_simpan, v_salah, v_benar, v_jml, round(100.0 * v_benar / v_jml), v_late);
  return sigap_qc_tinjau(p_akun, v_tgl, v_ke);
end $$;

-- ---------------------------------------------------------------------
-- 8. Rekap tim per PML: nilai tiap PPL, soal yang salah (percobaan pertama = pemahaman awal), yang belum mengisi
--    p_pml null = semua PML (untuk Kelola); PPL tanpa PML dikelompokkan pada pml_akun_id 0
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_rekap(p_kegiatan bigint, p_tanggal date, p_pml bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hasil jsonb;
begin
  with pes as (select * from sigap_qc_peserta(p_kegiatan)),
  pc as (
    select c.akun_id, count(*) as n, max(c.skor) as terbaik, bool_or(c.benar = c.jumlah) as lulus, bool_or(c.terlambat) as terlambat,
           max(c.skor) filter (where c.ke = 1) as awal, (select c1.salah from sigap_qc_percobaan c1
             where c1.kegiatan_id = p_kegiatan and c1.tanggal = p_tanggal and c1.akun_id = c.akun_id and c1.ke = 1) as salah_awal
      from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal group by c.akun_id),
  ppl as (
    select coalesce(q.pml_akun_id, 0) as pml, q.pml_nama, q.akun_id, q.nama, coalesce(pc.n, 0) as n, pc.terbaik, pc.awal, coalesce(pc.lulus, false) as lulus,
           coalesce(pc.terlambat, false) as terlambat, coalesce(pc.salah_awal, '{}') as salah_awal
      from pes q left join pc on pc.akun_id = q.akun_id
     where q.peran = 'ppl' and (p_pml is null or coalesce(q.pml_akun_id, 0) = p_pml)),
  grup as (
    select coalesce(p.pml, 0) as pml, max(p.pml_nama) as pml_nama from ppl p group by p.pml
    union
    select q.akun_id, q.nama from pes q where q.peran = 'pml' and (p_pml is null or q.akun_id = p_pml)),
  grup1 as (select g.pml, max(g.pml_nama) as pml_nama from grup g group by g.pml),
  salah as (
    select p.pml, s.id as soal_id, s.pertanyaan, s.penjelasan, s.opsi ->> s.kunci as kunci_teks, s.kunci, count(*) as jumlah, jsonb_agg(p.nama order by p.nama) as nama
      from ppl p cross join lateral unnest(p.salah_awal) as sid(x) join sigap_qc_soal s on s.id = sid.x
     group by p.pml, s.id, s.pertanyaan, s.penjelasan, s.opsi, s.kunci)
  select coalesce(jsonb_agg(jsonb_build_object(
           'pml_akun_id', g.pml,
           'pml_nama', coalesce(g.pml_nama, case when g.pml = 0 then 'Tanpa PML' else null end),
           'pml_sendiri', (select jsonb_build_object('percobaan', coalesce(pc.n, 0), 'skor_terbaik', pc.terbaik, 'lulus', coalesce(pc.lulus, false)) from pc where pc.akun_id = g.pml),
           'jumlah_ppl', (select count(*) from ppl p where p.pml = g.pml),
           'sudah', (select count(*) from ppl p where p.pml = g.pml and p.n > 0),
           'belum_mengisi', (select count(*) from ppl p where p.pml = g.pml and p.n = 0),
           'lulus', (select count(*) from ppl p where p.pml = g.pml and p.lulus),
           'rata_awal', (select round(avg(p.awal)) from ppl p where p.pml = g.pml and p.n > 0),
           'rata_terbaik', (select round(avg(p.terbaik)) from ppl p where p.pml = g.pml and p.n > 0),
           'ppl', (select coalesce(jsonb_agg(jsonb_build_object('akun_id', p.akun_id, 'nama', p.nama, 'percobaan', p.n, 'skor_awal', p.awal, 'skor_terbaik', p.terbaik,
                     'lulus', p.lulus, 'terlambat', p.terlambat, 'status', case when p.n = 0 then 'belum_mengisi' when p.lulus then 'lulus' else 'belum_100' end)
                     order by (p.n = 0) desc, p.terbaik nulls first, p.nama), '[]'::jsonb) from ppl p where p.pml = g.pml),
           'salah', (select coalesce(jsonb_agg(jsonb_build_object('soal_id', z.soal_id, 'pertanyaan', z.pertanyaan, 'kunci', z.kunci, 'kunci_teks', z.kunci_teks,
                     'penjelasan', z.penjelasan, 'jumlah', z.jumlah, 'nama', z.nama) order by z.jumlah desc, z.soal_id), '[]'::jsonb) from salah z where z.pml = g.pml)
         ) order by g.pml_nama nulls last), '[]'::jsonb)
    into v_hasil
    from grup1 g;
  return v_hasil;
end $$;

-- ---------------------------------------------------------------------
-- 9. Modal rekap untuk PML (hari terakhir yang rekapnya sudah waktunya, belum ditutup) dan penandaan baca
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_rekap_untuk(p_akun bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; v_now timestamp; v_tgl date; v_rekap jsonb;
begin
  select pg.* into s from sigap_qc_pengaturan pg
   where pg.aktif and exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun and q.peran = 'pml') limit 1;
  if not found then return jsonb_build_object('ada', false); end if;
  v_now := now() at time zone 'Asia/Jakarta';
  -- rekap hari D tersedia mulai rekap_jam hari D+1; sebelum itu hari terakhir yang sudah lewat adalah D-1
  v_tgl := case when v_now::time >= s.rekap_jam then v_now::date - 1 else v_now::date - 2 end;
  if (s.mulai is not null and v_tgl < s.mulai) or not exists (select 1 from sigap_qc_hari h where h.kegiatan_id = s.kegiatan_id and h.tanggal = v_tgl) then
    return jsonb_build_object('ada', false);
  end if;
  if exists (select 1 from sigap_qc_rekap_baca b where b.kegiatan_id = s.kegiatan_id and b.tanggal = v_tgl and b.pml_akun_id = p_akun) then
    return jsonb_build_object('ada', false, 'tanggal', v_tgl, 'dibaca', true);
  end if;
  v_rekap := sigap_qc_rekap(s.kegiatan_id, v_tgl, p_akun);
  return jsonb_build_object('ada', jsonb_array_length(v_rekap) > 0, 'tanggal', v_tgl, 'kegiatan_id', s.kegiatan_id, 'tim', v_rekap -> 0);
end $$;

create or replace function public.sigap_qc_rekap_baca_tandai(p_akun bigint, p_tanggal date)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_keg bigint;
begin
  select pg.kegiatan_id into v_keg from sigap_qc_pengaturan pg
   where exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun and q.peran = 'pml') limit 1;
  if v_keg is null then return false; end if;
  insert into sigap_qc_rekap_baca (kegiatan_id, tanggal, pml_akun_id) values (v_keg, p_tanggal, p_akun) on conflict do nothing;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 10. Bantuan jadwal push: yang belum selesai, catatan kirim sekali
-- ---------------------------------------------------------------------
-- tipe kembalian berubah (kolom skor_terbaik bertambah): fungsi lama harus dibuang dulu (create or replace tidak boleh mengubah tipe kembalian)
drop function if exists public.sigap_qc_belum(bigint, date);
create or replace function public.sigap_qc_belum(p_kegiatan bigint, p_tanggal date)
returns table (akun_id bigint, nama text, peran text, pml_akun_id bigint, pml_nama text, percobaan integer, skor_terbaik integer)
language sql stable security definer set search_path = public as $$
  select q.akun_id, q.nama, q.peran, q.pml_akun_id, q.pml_nama,
         coalesce((select count(*)::integer from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id), 0),
         coalesce((select max(c.skor)::integer from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id), 0)
    from sigap_qc_peserta(p_kegiatan) q
   where not exists (select 1 from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id and c.benar = c.jumlah)
     and (select count(*) from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id)
         < 1 + (select maks_ulang from sigap_qc_pengaturan where kegiatan_id = p_kegiatan)
$$;

create or replace function public.sigap_qc_kirim_catat(p_kegiatan bigint, p_tanggal date, p_jenis text, p_akun bigint, p_slot integer default 0)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into sigap_qc_kirim (kegiatan_id, tanggal, jenis, akun_id, slot) values (p_kegiatan, p_tanggal, p_jenis, p_akun, p_slot) on conflict do nothing;
  get diagnostics v = row_count;
  return v > 0;
end $$;

-- ---------------------------------------------------------------------
-- 11. Pengaturan dan bank soal (dipakai menu Kelola; hak ditegakkan API)
-- ---------------------------------------------------------------------
-- Menandai / mencabut tanda hari SUSULAN (hari yang terlewat jam batas). Hari dibuat (diundi) bila belum ada.
create or replace function public.sigap_qc_hari_susulan(p_kegiatan bigint, p_tanggal date, p_susulan boolean)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  perform sigap_qc_hari_pastikan(p_kegiatan, p_tanggal);
  update sigap_qc_hari set susulan_at = case when p_susulan then coalesce(susulan_at, now()) else null end
   where kegiatan_id = p_kegiatan and tanggal = p_tanggal
  returning susulan_at into v;
  return v;
end $$;

create or replace function public.sigap_qc_pengaturan_simpan(p_kegiatan bigint, p_data jsonb, p_oleh text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r sigap_qc_pengaturan%rowtype; v_menit integer[]; v_sel integer; v_aktif_lama boolean; v_now timestamp;
begin
  if not exists (select 1 from sigap_kegiatan where id = p_kegiatan) then raise exception 'Kegiatan tidak ditemukan' using errcode = 'P0001'; end if;
  insert into sigap_qc_pengaturan (kegiatan_id) values (p_kegiatan) on conflict do nothing;
  select * into r from sigap_qc_pengaturan where kegiatan_id = p_kegiatan;
  v_aktif_lama := r.aktif;
  if p_data ? 'aktif'         then r.aktif := (p_data ->> 'aktif')::boolean; end if;
  if p_data ? 'rilis_jam'     then r.rilis_jam := (p_data ->> 'rilis_jam')::time; end if;
  if p_data ? 'batas_jam'     then r.batas_jam := (p_data ->> 'batas_jam')::time; end if;
  if p_data ? 'soal_per_hari' then r.soal_per_hari := (p_data ->> 'soal_per_hari')::smallint; end if;
  if p_data ? 'maks_ulang'    then r.maks_ulang := (p_data ->> 'maks_ulang')::smallint; end if;
  if p_data ? 'rekap_jam'     then r.rekap_jam := (p_data ->> 'rekap_jam')::time; end if;
  if p_data ? 'ingat_berkala_menit' then r.ingat_berkala_menit := (p_data ->> 'ingat_berkala_menit')::integer; end if;
  if p_data ? 'mulai'         then r.mulai := nullif(p_data ->> 'mulai', '')::date; end if;
  if p_data ? 'akhir'         then r.akhir := nullif(p_data ->> 'akhir', '')::date; end if;
  if p_data ? 'ingat_menit'   then
    select coalesce(array_agg(distinct x::integer order by x::integer), '{}') into v_menit from jsonb_array_elements_text(p_data -> 'ingat_menit') x;
    r.ingat_menit := v_menit;
  end if;
  if r.rilis_jam >= r.batas_jam then raise exception 'Jam batas harus sesudah jam rilis' using errcode = 'P0001'; end if;
  v_sel := (extract(epoch from (r.batas_jam - r.rilis_jam)) / 60)::integer;
  if exists (select 1 from unnest(r.ingat_menit) m where m < 1 or m >= v_sel) then
    raise exception 'Menit pengingat harus di antara jam rilis dan jam batas' using errcode = 'P0001';
  end if;
  if r.ingat_berkala_menit <> 0 and r.ingat_berkala_menit not between 15 and 720 then raise exception 'Pengingat berkala harus 0 (mati) atau 15-720 menit' using errcode = 'P0001'; end if;
  if r.aktif and (select count(*) from sigap_qc_soal where aktif) < 1 then raise exception 'Bank soal kosong' using errcode = 'P0001'; end if;
  update sigap_qc_pengaturan set aktif = r.aktif, rilis_jam = r.rilis_jam, batas_jam = r.batas_jam, soal_per_hari = r.soal_per_hari, maks_ulang = r.maks_ulang,
         rekap_jam = r.rekap_jam, ingat_menit = r.ingat_menit, ingat_berkala_menit = r.ingat_berkala_menit, mulai = r.mulai, akhir = r.akhir, diubah_oleh = p_oleh, diubah_at = now()
   where kegiatan_id = p_kegiatan;
  -- QC baru DINYALAKAN sesudah jam batas hari itu (mis. fitur baru aktif malam hari): hari itu otomatis hari SUSULAN
  -- (tanpa label terlambat, tetap memblokir, diingatkan berkala sampai 100). Hanya bila belum ada jawaban hari itu.
  if r.aktif and not coalesce(v_aktif_lama, false) then
    v_now := now() at time zone 'Asia/Jakarta';
    if v_now::time >= r.batas_jam and (r.mulai is null or v_now::date >= r.mulai) and (r.akhir is null or v_now::date <= r.akhir)
       and not exists (select 1 from sigap_qc_percobaan where kegiatan_id = p_kegiatan and tanggal = v_now::date) then
      perform sigap_qc_hari_susulan(p_kegiatan, v_now::date, true);
    end if;
  end if;
  return to_jsonb((select x from sigap_qc_pengaturan x where x.kegiatan_id = p_kegiatan));
end $$;

create or replace function public.sigap_qc_soal_simpan(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text := btrim(p_data ->> 'id'); v_opsi jsonb; v_kata text[];
begin
  if v_id is null or v_id = '' then raise exception 'Kode soal wajib diisi' using errcode = 'P0001'; end if;
  v_opsi := p_data -> 'opsi';
  if v_opsi is null or jsonb_typeof(v_opsi) <> 'object' or not (v_opsi ?& array['A','B','C','D']) then
    raise exception 'Opsi A sampai D wajib diisi' using errcode = 'P0001';
  end if;
  if p_data ? 'kata_kunci' then
    select coalesce(array_agg(btrim(x) order by btrim(x)), '{}') into v_kata
      from (select distinct x from jsonb_array_elements_text(p_data -> 'kata_kunci') x where btrim(x) <> '') t;
  end if;
  insert into sigap_qc_soal (id, paket, judul_paket, nomor, pertanyaan, opsi, kunci, penjelasan, kata_kunci, aktif)
  values (v_id, (p_data ->> 'paket')::smallint, coalesce(p_data ->> 'judul_paket', 'Paket ' || (p_data ->> 'paket')), coalesce((p_data ->> 'nomor')::smallint, 1),
          p_data ->> 'pertanyaan', v_opsi, upper(p_data ->> 'kunci'), coalesce(p_data ->> 'penjelasan', ''), coalesce(v_kata, '{}'), coalesce((p_data ->> 'aktif')::boolean, true))
  on conflict (id) do update set paket = excluded.paket, judul_paket = excluded.judul_paket, nomor = excluded.nomor, pertanyaan = excluded.pertanyaan,
     opsi = excluded.opsi, kunci = excluded.kunci, penjelasan = excluded.penjelasan,
     kata_kunci = case when p_data ? 'kata_kunci' then excluded.kata_kunci else sigap_qc_soal.kata_kunci end,
     aktif = case when p_data ? 'aktif' then excluded.aktif else sigap_qc_soal.aktif end, diubah_at = now();
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.sigap_qc_soal_impor(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; n integer := 0;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data impor harus berupa daftar' using errcode = 'P0001'; end if;
  for x in select * from jsonb_array_elements(p_data) loop perform sigap_qc_soal_simpan(x); n := n + 1; end loop;
  return jsonb_build_object('diimpor', n);
end $$;

-- undi ulang hari ini: hanya bila belum ada satu pun jawaban pada hari itu
create or replace function public.sigap_qc_hari_undi_ulang(p_kegiatan bigint, p_tanggal date)
returns text[]
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from sigap_qc_percobaan where kegiatan_id = p_kegiatan and tanggal = p_tanggal) then
    raise exception 'Sudah ada jawaban pada hari itu; tidak bisa diundi ulang' using errcode = 'P0001';
  end if;
  delete from sigap_qc_hari where kegiatan_id = p_kegiatan and tanggal = p_tanggal;
  return sigap_qc_hari_pastikan(p_kegiatan, p_tanggal);
end $$;

-- ---------------------------------------------------------------------
-- 12. Hak eksekusi: hanya service_role
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'sigap\_qc\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 13. Pengaturan bawaan kegiatan Pendataan Pascabencana (NONAKTIF sampai diaktifkan di Kelola)
-- ---------------------------------------------------------------------
insert into public.sigap_qc_pengaturan (kegiatan_id, aktif, mulai)
select id, false, null from public.sigap_kegiatan where kode = 'pascabencana_2026'
on conflict (kegiatan_id) do nothing;

-- ---------------------------------------------------------------------
-- 14. Bank soal awal (49 soal, 7 paket) + kata kunci sorotan; aman diulang (upsert)
-- ---------------------------------------------------------------------
select public.sigap_qc_soal_impor($qc$[{"id": "LAT-11", "paket": 1, "judul_paket": "Cakupan dan SLS Terdampak", "nomor": 1, "pertanyaan": "Bencana yang menjadi rujukan PSP Pascabencana Sumatera 2026 adalah ...", "opsi": {"A": "Banjir, banjir bandang, dan tanah longsor November–Desember 2025", "B": "Banjir dan longsor yang terjadi sepanjang tahun 2026", "C": "Seluruh bencana yang dialami keluarga dalam 5 tahun terakhir", "D": "Gempa bumi dan tsunami tahun 2024"}, "kunci": "A", "penjelasan": "Rujukan PSP adalah bencana hidrometeorologi akhir 2025 (November–Desember 2025). Kerusakan akibat bencana susulan sesudahnya tidak dicatat.", "kata_kunci": ["November–Desember 2025", "hidrometeorologi", "bencana susulan"]}, {"id": "LAT-12", "paket": 1, "judul_paket": "Cakupan dan SLS Terdampak", "nomor": 2, "pertanyaan": "Dalam identifikasi SLS, yang dimaksud SLS terdampak adalah ...", "opsi": {"A": "SLS yang sempat mengalami pemadaman listrik saat bencana", "B": "SLS yang wilayahnya terkena bencana secara fisik (rumah, sawah, kebun, ternak, kolam, jalan, dll), termasuk SLS yang ada huntara/huntap yang sudah dihuni", "C": "SLS yang seluruh warganya menerima bantuan pemerintah", "D": "SLS yang ditetapkan BPBD sebagai zona merah rawan bencana"}, "kunci": "B", "penjelasan": "SLS terdampak dilihat dari dampak fisik di wilayah SLS. SLS yang tidak terkena bencana tetapi ada huntara/huntap berpenghuni juga dianggap terdampak.", "kata_kunci": ["terkena bencana secara fisik", "huntara/huntap", "sudah dihuni", "dampak fisik"]}, {"id": "LAT-13", "paket": 1, "judul_paket": "Cakupan dan SLS Terdampak", "nomor": 3, "pertanyaan": "Di sebuah jorong, permukiman aman tetapi hamparan sawahnya terendam banjir. Status jorong tersebut adalah ...", "opsi": {"A": "Terdampak tidak langsung, sehingga tidak diberi prelist", "B": "Ditentukan setelah menghitung berapa keluarga pemilik sawah", "C": "SLS terdampak, karena sawah adalah bagian wilayah SLS yang terkena bencana", "D": "Tidak terdampak, karena tidak ada rumah yang terendam"}, "kunci": "C", "penjelasan": "Yang terdampak tidak harus permukiman. Sawah, kebun, jalan, atau objek wisata di dalam SLS yang terkena bencana sudah cukup menjadikan SLS terdampak.", "kata_kunci": ["sawah", "tidak harus permukiman", "bagian wilayah"]}, {"id": "LAT-14", "paket": 1, "judul_paket": "Cakupan dan SLS Terdampak", "nomor": 4, "pertanyaan": "Di sebuah jorong sedang dibangun huntap, tetapi belum ada yang menempati, dan wilayah jorong itu tidak terkena bencana. Statusnya ...", "opsi": {"A": "Termasuk SLS terdampak jika lokasinya sudah ditetapkan Pemda", "B": "Termasuk SLS terdampak sejak pembangunan dimulai", "C": "Termasuk SLS terdampak jika SK penerima huntap sudah terbit", "D": "Belum termasuk SLS terdampak"}, "kunci": "D", "penjelasan": "Huntara/huntap baru menjadikan SLS terdampak jika sudah dihuni. Yang masih dalam proses pembangunan belum dihitung.", "kata_kunci": ["belum ada yang menempati", "sudah dihuni", "belum dihitung"]}, {"id": "LAT-15", "paket": 1, "judul_paket": "Cakupan dan SLS Terdampak", "nomor": 5, "pertanyaan": "Siapa yang mengisi kuesioner identifikasi SLS di FASIH?", "opsi": {"A": "PML pendataan keluarga, berdasarkan keterangan ketua SLS, aparat nagari, atau pihak berwenang", "B": "Admin FASIH kabupaten, berdasarkan data DTSEN", "C": "PPL keluarga, berdasarkan pengamatan sendiri", "D": "Wali nagari, melalui akun FASIH desa"}, "kunci": "A", "penjelasan": "Identifikasi SLS dilakukan PML keluarga. Jika daerah sudah punya daftar SLS terdampak, tidak perlu turun lapangan, tetapi PML tetap mengisi FASIH identifikasi SLS.", "kata_kunci": ["PML", "FASIH", "tetap mengisi"]}, {"id": "LAT-16", "paket": 1, "judul_paket": "Cakupan dan SLS Terdampak", "nomor": 6, "pertanyaan": "Pilihan status yang diisikan PML untuk setiap SLS pada kuesioner identifikasi SLS adalah ...", "opsi": {"A": "Terdampak langsung atau terdampak tidak langsung", "B": "Terdampak, tidak terdampak, atau tidak terdampak tetapi ada huntara/huntap", "C": "Prioritas 1, prioritas 2, atau prioritas 3", "D": "Rusak ringan, rusak sedang, atau rusak berat"}, "kunci": "B", "penjelasan": "Hasil identifikasi menjadi penanda (flag) SLS. Hanya SLS terdampak yang diberi prelist keluarga oleh Admin Pusat.", "kata_kunci": ["flag", "prelist", "Hanya SLS terdampak"]}, {"id": "LAT-17", "paket": 1, "judul_paket": "Cakupan dan SLS Terdampak", "nomor": 7, "pertanyaan": "Keluarga Pak Hasan tinggal di SLS yang aman, tetapi sawahnya ada di SLS lain yang terendam. Bagaimana perlakuannya?", "opsi": {"A": "Keluarga didata di SLS lokasi sawahnya", "B": "SLS tempat tinggalnya otomatis berubah menjadi terdampak", "C": "Keluarga hanya tercakup jika SLS tempat tinggalnya ikut diidentifikasi sebagai terdampak", "D": "Keluarga otomatis didata karena punya sawah terdampak"}, "kunci": "C", "penjelasan": "Pendataan keluarga berpatokan pada SLS tempat tinggal. Jika SLS itu tidak terdampak, keluarga tidak didata; dampak pada sawahnya tertangkap di kuesioner desa.", "kata_kunci": ["SLS tempat tinggal", "kuesioner desa", "sawahnya"]}, {"id": "LAT-21", "paket": 2, "judul_paket": "Keluarga dan Kriteria Terdampak", "nomor": 1, "pertanyaan": "Bagaimana mengisi R4 (apakah keluarga terdampak bencana akhir 2025)?", "opsi": {"A": "Petugas wajib memilih terdampak langsung atau tidak langsung", "B": "Terdampak hanya jika nama keluarga ada di SK bantuan", "C": "Hanya dampak langsung yang diisi Terdampak", "D": "Cukup Terdampak atau Tidak terdampak; mencakup dampak langsung maupun tidak langsung tanpa perlu dirinci"}, "kunci": "D", "penjelasan": "R4 tidak membedakan jenis dampak. Tingkat dampaknya terlihat dari pertanyaan-pertanyaan berikutnya.", "kata_kunci": ["R4", "tanpa perlu dirinci", "tidak membedakan"]}, {"id": "LAT-22", "paket": 2, "judul_paket": "Keluarga dan Kriteria Terdampak", "nomor": 2, "pertanyaan": "Berikut contoh dampak LANGSUNG pada keluarga, KECUALI ...", "opsi": {"A": "Sulit berangkat kerja karena jalan menuju kantor tergenang", "B": "Ada anggota keluarga luka atau meninggal", "C": "Sawah atau ternak tertimbun longsor", "D": "Rumah rusak atau terendam"}, "kunci": "A", "penjelasan": "Dampak langsung mengenai fisik atau aset keluarga (korban jiwa, hunian, lahan, ternak, aset usaha). Kesulitan akses bekerja termasuk dampak tidak langsung, dan keluarga tetap dicatat Terdampak.", "kata_kunci": ["LANGSUNG", "KECUALI", "dampak tidak langsung"]}, {"id": "LAT-23", "paket": 2, "judul_paket": "Keluarga dan Kriteria Terdampak", "nomor": 3, "pertanyaan": "Berikut contoh dampak TIDAK LANGSUNG, KECUALI ...", "opsi": {"A": "Rumah menjadi tempat menumpang kerabat yang mengungsi", "B": "Rumah keluarga terendam banjir", "C": "Akses ke sekolah atau puskesmas terganggu akibat bencana", "D": "Listrik, BBM, atau LPG sulit didapat akibat bencana"}, "kunci": "B", "penjelasan": "Dampak tidak langsung: fisik dan aset aman, tetapi fungsi kehidupan terganggu (energi, air, layanan dasar, pekerjaan, perbankan, psikologis, menampung pengungsi). Rumah terendam adalah dampak langsung.", "kata_kunci": ["TIDAK LANGSUNG", "KECUALI", "dampak langsung"]}, {"id": "LAT-24", "paket": 2, "judul_paket": "Keluarga dan Kriteria Terdampak", "nomor": 4, "pertanyaan": "Responden mengaku terdampak, padahal menurut pengamatan petugas rumah dan pekerjaannya baik-baik saja. Sikap petugas yang tepat ...", "opsi": {"A": "Menghentikan wawancara", "B": "Meminta responden menunjukkan bukti foto kerusakan", "C": "Mengikuti jawaban responden; jika sangat meragukan, boleh konfirmasi ke ketua SLS", "D": "Mengisi Tidak terdampak sesuai pengamatan petugas"}, "kunci": "C", "penjelasan": "Setelah hampir setahun, dampak sulit dibuktikan secara fisik. Isian mengikuti pengakuan responden, dan tingkat dampaknya terlihat dari pertanyaan berikutnya.", "kata_kunci": ["pengakuan responden", "Mengikuti jawaban responden", "ketua SLS"]}, {"id": "LAT-25", "paket": 2, "judul_paket": "Keluarga dan Kriteria Terdampak", "nomor": 5, "pertanyaan": "Satu rumah berisi 2 KK. KK orang tua rumahnya terendam, KK anak hanya terganggu pekerjaannya. Pencatatannya ...", "opsi": {"A": "Hanya KK orang tua yang dicatat Terdampak", "B": "Kedua KK digabung menjadi satu keluarga", "C": "KK anak dicatat Tidak terdampak", "D": "Dua keluarga didata terpisah dan keduanya dicatat Terdampak"}, "kunci": "D", "penjelasan": "Setiap KK adalah keluarga tersendiri. Karena R4 mencakup dampak langsung dan tidak langsung, keduanya Terdampak.", "kata_kunci": ["2 KK", "keluarga tersendiri", "Terdampak"]}, {"id": "LAT-26", "paket": 2, "judul_paket": "Keluarga dan Kriteria Terdampak", "nomor": 6, "pertanyaan": "PPL menemukan keluarga di SLS terdampak yang tidak ada di prelist. Tindakannya ...", "opsi": {"A": "Tetap didata sebagai keluarga ditemukan baru (R3f kode 4)", "B": "Dilaporkan ke Admin agar ditambahkan bulan depan", "C": "Didata hanya jika punya KK nagari setempat", "D": "Tidak didata karena prelist adalah batas sasaran"}, "kunci": "A", "penjelasan": "Prelist adalah daftar awal, bukan batas sasaran. Keluarga baru di wilayah terdampak tetap didata, dengan memastikan tidak tercatat ganda.", "kata_kunci": ["prelist", "bukan batas sasaran", "R3f kode 4", "tidak tercatat ganda"]}, {"id": "LAT-27", "paket": 2, "judul_paket": "Keluarga dan Kriteria Terdampak", "nomor": 7, "pertanyaan": "Saat bencana keluarga tinggal di SLS A; kini tinggal di SLS B tetapi masih punya rumah di SLS A dan berniat kembali. PPL kedua SLS BERBEDA. Keluarga didata di ...", "opsi": {"A": "Kedua SLS", "B": "SLS B, tempat tinggal saat pendataan", "C": "SLS yang lebih dulu dikunjungi", "D": "SLS A sesuai prelist"}, "kunci": "B", "penjelasan": "Sesuai penegasan: jika petugas berbeda, keluarga didata di SLS tempat tinggal saat pendataan. Jika petugasnya sama dan keluarga ada di prelist SLS A, keluarga didata di SLS A dengan alamat SLS B.", "kata_kunci": ["BERBEDA", "tempat tinggal saat pendataan"]}, {"id": "LAT-31", "paket": 3, "judul_paket": "Hunian dan Pekerjaan", "nomor": 1, "pertanyaan": "Rumah sempat terendam tetapi setelah dibersihkan tidak perlu perbaikan. R5 diisi kode 2. Pertanyaan berikutnya adalah ...", "opsi": {"A": "R6 (sumber biaya perbaikan)", "B": "R9 (anggota meninggal)", "C": "R7 (tipe hunian saat ini)", "D": "R8 (status kepemilikan)"}, "kunci": "C", "penjelasan": "R5 kode 1 dan 2 langsung lanjut ke R7. R6 hanya untuk R5 kode 3, 4, atau 5.", "kata_kunci": ["R5", "R7", "R6"]}, {"id": "LAT-32", "paket": 3, "judul_paket": "Hunian dan Pekerjaan", "nomor": 2, "pertanyaan": "Rumah diperbaiki dengan tabungan sendiri dan pinjaman koperasi. Isian R6 yang tepat ...", "opsi": {"A": "R6d (bantuan pemerintah) = Ya", "B": "R6g (lainnya) ditulis koperasi", "C": "Hanya R6b = Ya", "D": "R6b (biaya sendiri) = Ya dan R6f (hutang/pinjaman) = Ya"}, "kunci": "D", "penjelasan": "R6 boleh lebih dari satu jawaban. Pinjaman masuk R6f. Ingat: pinjaman bukan bantuan, jadi tidak dicatat di R14.", "kata_kunci": ["R6f", "pinjaman", "bukan bantuan", "R14"]}, {"id": "LAT-33", "paket": 3, "judul_paket": "Hunian dan Pekerjaan", "nomor": 3, "pertanyaan": "Mengecat ulang rumah setelah banjir, padahal rumahnya tidak rusak, apakah termasuk perbaikan?", "opsi": {"A": "Tidak, mengecat hanya memperindah", "B": "Ya, termasuk perbaikan ringan", "C": "Ya, jika biayanya di atas Rp1 juta", "D": "Ya, jika dilakukan dalam 3 bulan setelah bencana"}, "kunci": "A", "penjelasan": "Perbaikan berarti memulihkan kerusakan akibat bencana. Mengecat rumah yang tidak rusak bukan perbaikan.", "kata_kunci": ["Mengecat", "memulihkan kerusakan", "bukan perbaikan"]}, {"id": "LAT-34", "paket": 3, "judul_paket": "Hunian dan Pekerjaan", "nomor": 4, "pertanyaan": "Anggota keluarga sudah sakit sebelum bencana, lalu meninggal karena kondisinya memburuk selama mengungsi. Apakah dicatat di R9a?", "opsi": {"A": "Tidak, karena tidak meninggal di lokasi bencana", "B": "Ya, termasuk meninggal akibat bencana", "C": "Tidak, karena sakitnya sudah ada sebelumnya", "D": "Hanya jika ada surat keterangan BNPB"}, "kunci": "B", "penjelasan": "Bencana yang memperparah kondisi kesehatan sampai meninggal termasuk meninggal akibat bencana.", "kata_kunci": ["R9a", "memperparah", "meninggal akibat bencana"]}, {"id": "LAT-35", "paket": 3, "judul_paket": "Hunian dan Pekerjaan", "nomor": 5, "pertanyaan": "Ayah meninggal akibat longsor; anaknya kini sudah punya KK sendiri. Kematian ayah dicatat di R9 pada ...", "opsi": {"A": "Kedua keluarga", "B": "Tidak dicatat di mana pun", "C": "Keluarga KK induk saja", "D": "Keluarga anak saja"}, "kunci": "C", "penjelasan": "Acuannya anggota 1 KK sebelum bencana. Di keluarga anak, R9a diisi Tidak.", "kata_kunci": ["1 KK sebelum bencana", "KK induk", "R9a diisi Tidak"]}, {"id": "LAT-36", "paket": 3, "judul_paket": "Hunian dan Pekerjaan", "nomor": 6, "pertanyaan": "Petani sempat jadi buruh bangunan sebulan setelah sawahnya terendam, tetapi kini sudah kembali bertani. R11 (perubahan pekerjaan) diisi ...", "opsi": {"A": "Dicatat di R10a sebagai kehilangan pekerjaan", "B": "Ya, karena sempat berganti pekerjaan", "C": "Dicatat di R12", "D": "Tidak, karena saat pendataan pekerjaannya sudah kembali normal"}, "kunci": "D", "penjelasan": "Sesuai penegasan: jika sempat berubah tetapi saat pendataan sudah kembali normal, dianggap tidak mengalami perubahan pekerjaan.", "kata_kunci": ["kembali normal", "R11", "perubahan pekerjaan"]}, {"id": "LAT-37", "paket": 3, "judul_paket": "Hunian dan Pekerjaan", "nomor": 7, "pertanyaan": "Konsep \"bekerja\" yang dipakai pada R10c (apakah sudah kembali bekerja) adalah ...", "opsi": {"A": "Konsep survei BPS: bekerja dalam seminggu terakhir", "B": "Punya kontrak kerja tertulis", "C": "Bekerja minimal 6 bulan terakhir", "D": "Pernah bekerja sejak bencana terjadi"}, "kunci": "A", "penjelasan": "R10c mengikuti konsep bekerja seperti Sakernas, yaitu dilihat seminggu terakhir.", "kata_kunci": ["Sakernas", "seminggu terakhir", "R10c"]}, {"id": "LAT-41", "paket": 4, "judul_paket": "Aset Hilang", "nomor": 1, "pertanyaan": "Aset yang dicatat pada R13 adalah ...", "opsi": {"A": "Semua aset yang dimiliki keluarga saat ini", "B": "Aset yang hilang akibat bencana secara langsung", "C": "Semua aset yang rusak akibat bencana", "D": "Aset yang dijual setelah bencana"}, "kunci": "B", "penjelasan": "Sesuai penegasan, R13 hanya mencakup aset yang hilang akibat bencana. Aset yang rusak tetapi masih ada tidak termasuk.", "kata_kunci": ["R13", "hilang akibat bencana", "tidak termasuk"]}, {"id": "LAT-42", "paket": 4, "judul_paket": "Aset Hilang", "nomor": 2, "pertanyaan": "Motor terendam dan sempat mati, tetapi setelah diservis bisa dipakai lagi walau harga jualnya turun. R13i diisi ...", "opsi": {"A": "Ya, dengan jumlah hilang 1 unit", "B": "Ya, karena nilainya turun", "C": "Tidak, karena motornya masih ada dan masih dimiliki", "D": "Ya, dicatat di alat produksi usaha"}, "kunci": "C", "penjelasan": "Aset yang rusak tetapi bisa diperbaiki dan dipakai lagi masih dianggap dimiliki, jadi tidak dicatat sebagai hilang.", "kata_kunci": ["R13i", "masih dimiliki", "tidak dicatat sebagai hilang"]}, {"id": "LAT-43", "paket": 4, "judul_paket": "Aset Hilang", "nomor": 3, "pertanyaan": "Lahan sawah tertimbun batu dan lumpur, belum ada dana untuk membersihkan, tetapi lahannya masih ada. Apakah dicatat hilang?", "opsi": {"A": "Ya, karena belum bisa ditanami", "B": "Ya, jika sudah lebih dari 6 bulan tidak digarap", "C": "Ya, sebesar bagian yang tertimbun", "D": "Tidak, karena lahan masih ada dan masih bisa dipulihkan"}, "kunci": "D", "penjelasan": "Lahan dianggap hilang jika benar-benar lenyap, misalnya hanyut menjadi bagian sungai atau danau. Lahan yang tertimbun tetapi masih ada belum hilang.", "kata_kunci": ["tertimbun", "benar-benar lenyap", "masih ada"]}, {"id": "LAT-44", "paket": 4, "judul_paket": "Aset Hilang", "nomor": 4, "pertanyaan": "Ternak dijual dua bulan setelah bencana untuk kebutuhan hidup. Bagaimana pencatatannya di R13?", "opsi": {"A": "Tidak dicatat sebagai aset hilang", "B": "Dicatat hilang sesuai jumlah yang dijual", "C": "Dicatat di R13 dan R14", "D": "Dicatat hilang tanpa nilai"}, "kunci": "A", "penjelasan": "Sesuai penegasan, aset yang dijual setelah bencana untuk memenuhi kebutuhan tidak termasuk aset hilang. Penjualan aset bisa tercermin di R17 (strategi bertahan hidup).", "kata_kunci": ["dijual", "R17", "aset hilang"]}, {"id": "LAT-45", "paket": 4, "judul_paket": "Aset Hilang", "nomor": 5, "pertanyaan": "Motor yang hanyut dipakai untuk keluarga sekaligus ngojek. Dicatat di rincian ...", "opsi": {"A": "h. Alat produksi usaha", "B": "b. Motor", "C": "Motor dan alat produksi usaha sekaligus", "D": "Tidak dicatat karena dipakai usaha"}, "kunci": "B", "penjelasan": "Motor cukup dicatat di rincian motor, tidak perlu dicatat lagi di alat produksi usaha.", "kata_kunci": ["rincian motor", "alat produksi usaha"]}, {"id": "LAT-46", "paket": 4, "judul_paket": "Aset Hilang", "nomor": 6, "pertanyaan": "Emas 15 gram hanyut terbawa banjir. Pada R13g isian yang dicatat adalah ...", "opsi": {"A": "Jumlah gram saja", "B": "Tidak dicatat karena bukan aset produktif", "C": "Ya, dengan nilai yang hilang dalam rupiah (jumlah unit tidak diisi)", "D": "Jumlah unit dan nilai rupiah"}, "kunci": "C", "penjelasan": "Untuk emas/perhiasan (minimal 10 gram) dan alat produksi usaha, kolom jumlah unit tidak diisi; yang dicatat status hilang dan nilainya.", "kata_kunci": ["Emas", "10 gram", "jumlah unit tidak diisi"]}, {"id": "LAT-47", "paket": 4, "judul_paket": "Aset Hilang", "nomor": 7, "pertanyaan": "Keluarga menggarap sawah bagi hasil/gadai milik orang lain, lalu sawah itu hanyut. Di keluarga penggarap, sawah itu ...", "opsi": {"A": "Dicatat setengah nilainya", "B": "Dicatat di alat produksi usaha", "C": "Dicatat sebagai aset hilang keluarga penggarap", "D": "Tidak dicatat sebagai aset keluarga; lahan dicatat pada pemilik yang memegang bukti kepemilikan"}, "kunci": "D", "penjelasan": "Tanah/lahan yang dicatat adalah yang bukti kepemilikannya atas nama anggota keluarga. Dampaknya bagi penggarap tetap tertangkap di R4, R10, dan catatan.", "kata_kunci": ["bagi hasil", "bukti kepemilikan", "penggarap"]}, {"id": "LAT-51", "paket": 5, "judul_paket": "Bantuan", "nomor": 1, "pertanyaan": "R14 bagian I hanya diisi untuk bantuan dari ...", "opsi": {"A": "Pemerintah", "B": "Kerabat dan perantau", "C": "Pemerintah, swasta, dan NGO", "D": "Siapa saja asalkan berupa uang"}, "kunci": "A", "penjelasan": "Sesuai penegasan, R14 bagian I hanya untuk bantuan pemerintah. Bantuan dari pihak lain dicatat di bagian II.", "kata_kunci": ["R14 bagian I", "bantuan pemerintah", "bagian II"]}, {"id": "LAT-52", "paket": 5, "judul_paket": "Bantuan", "nomor": 2, "pertanyaan": "Keluarga menerima Rp600.000 per bulan dari pemerintah untuk menyewa tempat tinggal sambil menunggu huntap selesai. Ini termasuk ...", "opsi": {"A": "Stimulan ekonomi", "B": "Dana Tunggu Hunian (DTH), R14 bagian I", "C": "Jaminan hidup", "D": "Stimulan hunian"}, "kunci": "B", "penjelasan": "DTH adalah dana untuk mencari tempat tinggal sementara selama menunggu hunian tetap atau rumah selesai dibangun. Nominal diisi sesuai yang benar-benar diterima.", "kata_kunci": ["Dana Tunggu Hunian", "DTH", "hunian tetap"]}, {"id": "LAT-53", "paket": 5, "judul_paket": "Bantuan", "nomor": 3, "pertanyaan": "Keluarga menerima Rp15.000.000 dari pemerintah karena anggota keluarganya meninggal akibat banjir. Ini termasuk ...", "opsi": {"A": "Jaminan hidup", "B": "Stimulan ekonomi", "C": "Santunan ahli waris, R14 bagian I", "D": "Bantuan kesehatan di bagian II"}, "kunci": "C", "penjelasan": "Santunan ahli waris diberikan kepada ahli waris korban meninggal (Rp15 juta per korban sesuai bahan ajar). Dicatat di keluarga yang menerimanya.", "kata_kunci": ["Santunan ahli waris", "meninggal", "ahli waris"]}, {"id": "LAT-54", "paket": 5, "judul_paket": "Bantuan", "nomor": 4, "pertanyaan": "Kiriman uang dari dunsanak di rantau dan sumbangan ikatan perantau untuk perbaikan rumah dicatat di ...", "opsi": {"A": "R14 bagian I stimulan hunian", "B": "Tidak dicatat karena bukan dari pemerintah", "C": "R14 bagian I lainnya", "D": "R14 bagian II"}, "kunci": "D", "penjelasan": "Bantuan selain dari pemerintah, termasuk dari kerabat, perantau, swasta, atau NGO, dicatat di R14 bagian II.", "kata_kunci": ["perantau", "R14 bagian II", "selain dari pemerintah"]}, {"id": "LAT-55", "paket": 5, "judul_paket": "Bantuan", "nomor": 5, "pertanyaan": "Keluarga menerima kompor dan kasur dari pemerintah. Ini dicatat sebagai ...", "opsi": {"A": "Isi hunian (bantuan perabotan), nilainya diperkirakan bersama responden", "B": "Tidak dicatat karena berupa barang", "C": "Stimulan hunian", "D": "Bantuan sandang di bagian II"}, "kunci": "A", "penjelasan": "Bantuan perabotan termasuk isi hunian. Jika responden tidak tahu nilainya, nominal bisa diperkirakan bersama responden.", "kata_kunci": ["isi hunian", "perabotan", "diperkirakan"]}, {"id": "LAT-56", "paket": 5, "judul_paket": "Bantuan", "nomor": 6, "pertanyaan": "Jaminan hidup diterima dalam 2 tahap meskipun nilainya untuk 12 bulan. Isian \"berapa kali diterima\" adalah ...", "opsi": {"A": "6 kali", "B": "2 kali", "C": "1 kali", "D": "12 kali"}, "kunci": "B", "penjelasan": "Frekuensi dihitung sesuai tahap penerimaan. Jika tidak menerima sama sekali, isi 0 dan kolom nominal otomatis nonaktif.", "kata_kunci": ["2 tahap", "tahap penerimaan", "isi 0"]}, {"id": "LAT-57", "paket": 5, "judul_paket": "Bantuan", "nomor": 7, "pertanyaan": "Keluarga meminjam uang ke bank untuk membangun kembali warungnya. Apakah dicatat sebagai bantuan?", "opsi": {"A": "Ya, jika bunganya rendah", "B": "Ya, di R14 bagian II", "C": "Tidak, hutang/pinjaman bukan bantuan", "D": "Ya, di R14 bagian I modal usaha"}, "kunci": "C", "penjelasan": "Bantuan tidak termasuk hutang/pinjaman. Pinjaman untuk perbaikan rumah tercatat di R6f, dan meminjam uang untuk bertahan hidup tercatat di R17e.", "kata_kunci": ["hutang/pinjaman", "R6f", "R17e"]}, {"id": "LAT-61", "paket": 6, "judul_paket": "Dampak Lanjutan", "nomor": 1, "pertanyaan": "Layanan ATM di nagari sempat mati seminggu saat bencana, tetapi sekarang sudah normal. R22a diisi ...", "opsi": {"A": "Ya, dengan penyebab layanan perbankan rusak", "B": "Kode 3, tidak pernah mengakses perbankan", "C": "Ya, karena sempat terganggu", "D": "Tidak, karena R20–R22 ditanyakan untuk kondisi sampai saat ini"}, "kunci": "D", "penjelasan": "Akses pendidikan, kesehatan, dan perbankan (R20–R22) mengacu pada kondisi saat pendataan yang masih terkait bencana.", "kata_kunci": ["R20–R22", "kondisi saat pendataan", "sudah normal"]}, {"id": "LAT-62", "paket": 6, "judul_paket": "Dampak Lanjutan", "nomor": 2, "pertanyaan": "Harga kebutuhan pokok naik setelah bencana dan sampai sekarang tidak turun lagi. R23b diisi ...", "opsi": {"A": "Kode 3, lebih dari 3 bulan", "B": "Tidak diisi karena harga sudah stabil", "C": "Kode 1, kurang dari 1 bulan", "D": "Kode 2, 1–3 bulan"}, "kunci": "A", "penjelasan": "R23 adalah satu-satunya yang ditanyakan historis. Kenaikan yang tidak kembali ke harga semula menunjukkan efek bencana masih terasa.", "kata_kunci": ["R23b", "historis", "tidak kembali"]}, {"id": "LAT-63", "paket": 6, "judul_paket": "Dampak Lanjutan", "nomor": 3, "pertanyaan": "Kenaikan harga yang dicakup pada R23 adalah ...", "opsi": {"A": "Hanya kenaikan harga beras", "B": "Kenaikan akibat bencana, mencakup kebutuhan sandang, pangan, dan papan", "C": "Semua kenaikan harga sepanjang 2026, termasuk menjelang Lebaran", "D": "Kenaikan akibat kondisi ekonomi global"}, "kunci": "B", "penjelasan": "Kenaikan karena faktor lain seperti Lebaran atau kondisi global tidak dicakup.", "kata_kunci": ["R23", "akibat bencana", "Lebaran"]}, {"id": "LAT-64", "paket": 6, "judul_paket": "Dampak Lanjutan", "nomor": 4, "pertanyaan": "Responden bilang anggota keluarganya mengalami gangguan psikologis akibat bencana, tetapi tetangga bilang gangguan itu sudah ada sebelum bencana. Isiannya ...", "opsi": {"A": "Sesuai keterangan tetangga", "B": "Dikosongkan sampai ada surat dokter", "C": "Sesuai jawaban responden; keterangan tetangga ditulis di catatan", "D": "Diisi Tidak karena informasinya bertentangan"}, "kunci": "C", "penjelasan": "Isian mengikuti jawaban responden. Informasi dari pihak lain dicatat sebagai keterangan tambahan.", "kata_kunci": ["jawaban responden", "catatan", "keterangan tambahan"]}, {"id": "LAT-65", "paket": 6, "judul_paket": "Dampak Lanjutan", "nomor": 5, "pertanyaan": "Seorang anak batal mendaftar kuliah karena menjadi yatim piatu akibat bencana. Apakah termasuk putus sekolah di R20?", "opsi": {"A": "Ya, karena batal kuliah akibat bencana", "B": "Ya, jika sudah membayar pendaftaran", "C": "Ya, dengan penyebab tidak ada biaya", "D": "Tidak, putus sekolah hanya untuk yang sudah bersekolah lalu berhenti"}, "kunci": "D", "penjelasan": "Putus sekolah berlaku bagi yang sudah mengikuti jenjang pendidikan formal lalu berhenti, bukan yang batal masuk.", "kata_kunci": ["putus sekolah", "yatim piatu", "batal masuk"]}, {"id": "LAT-66", "paket": 6, "judul_paket": "Dampak Lanjutan", "nomor": 6, "pertanyaan": "Setelah banjir, keluarga membeli mesin pompa air untuk berjaga-jaga jika banjir datang lagi. Pencatatannya ...", "opsi": {"A": "R18 (kesiapsiagaan) pilihan Lainnya, kolom Sesudah bencana = Ya", "B": "R25 sebagai perubahan tradisi", "C": "R13 sebagai aset baru", "D": "Tidak dicatat di mana pun"}, "kunci": "A", "penjelasan": "Pompa air adalah upaya kesiapsiagaan, bukan adat istiadat. R18 punya kolom sebelum dan sesudah bencana; pompa yang dibeli setelah banjir masuk kolom sesudah.", "kata_kunci": ["R18", "kesiapsiagaan", "Sesudah bencana"]}, {"id": "LAT-67", "paket": 6, "judul_paket": "Dampak Lanjutan", "nomor": 7, "pertanyaan": "Setelah banjir, keluarga mulai ikut gotong royong membersihkan bandar sebulan sekali, padahal sebelumnya tidak pernah. Di R25 dicatat ...", "opsi": {"A": "Tidak ada perubahan tradisi", "B": "Perubahan pada gotong royong/kegiatan sosial, bentuknya muncul kebiasaan baru", "C": "Perubahan upacara/ritual adat", "D": "Hanya dicatat di kuesioner desa"}, "kunci": "B", "penjelasan": "Perubahan dilihat per keluarga. Keikutsertaan baru dalam gotong royong adalah perubahan kebiasaan dengan bentuk muncul tradisi/kebiasaan baru.", "kata_kunci": ["R25", "gotong royong", "kebiasaan baru"]}, {"id": "LAT-71", "paket": 7, "judul_paket": "Alur Kerja dan Etika", "nomor": 1, "pertanyaan": "Responden tidak tahu Nomor KK karena dokumennya hanyut. Nomor KK diisi ...", "opsi": {"A": "7777", "B": "0000", "C": "9999", "D": "8888"}, "kunci": "C", "penjelasan": "9999: tidak bisa memberi atau tidak tahu Nomor KK. 8888: belum punya KK. 7777: jumlah digit tidak 16.", "kata_kunci": ["9999", "8888", "7777", "Nomor KK"]}, {"id": "LAT-72", "paket": 7, "judul_paket": "Alur Kerja dan Etika", "nomor": 2, "pertanyaan": "Pasangan muda yang baru menikah dan tinggal terpisah belum mengurus KK sendiri. Nomor KK diisi ...", "opsi": {"A": "9999", "B": "Nomor KK orang tuanya", "C": "7777", "D": "8888"}, "kunci": "D", "penjelasan": "Anak yang sudah menikah dihitung keluarga sendiri. Jika belum punya KK, diisi 8888.", "kata_kunci": ["8888", "keluarga sendiri"]}, {"id": "LAT-73", "paket": 7, "judul_paket": "Alur Kerja dan Etika", "nomor": 3, "pertanyaan": "Kepala keluarga di prelist meninggal dan kini istrinya menjadi kepala keluarga. Perubahan ini ...", "opsi": {"A": "Ditulis di catatan", "B": "Keluarga dihapus dan ditambah keluarga baru", "C": "Dicatat R3f kode 3 lalu STOP", "D": "Tidak perlu dicatat"}, "kunci": "A", "penjelasan": "Sesuai penegasan, perubahan nama kepala keluarga karena meninggal atau sebab lain ditulis pada catatan. Kode 3 hanya jika seluruh anggota keluarga meninggal.", "kata_kunci": ["catatan", "kode 3", "seluruh anggota keluarga meninggal"]}, {"id": "LAT-74", "paket": 7, "judul_paket": "Alur Kerja dan Etika", "nomor": 4, "pertanyaan": "Keluarga menolak didata karena jenuh setelah SE2026 dan Susenas. Langkah yang benar ...", "opsi": {"A": "Isi semua jawaban Tidak", "B": "Jelaskan tujuan dan kerahasiaan data, laporkan berjenjang ke PML; jika tetap menolak sampai akhir pendataan, isi kategori tidak dapat ditemui sampai akhir pendataan dan tulis di catatan", "C": "Lewati keluarga tanpa dicatat", "D": "Isi kuesioner berdasarkan keterangan tetangga"}, "kunci": "B", "penjelasan": "Tidak ada kode khusus menolak. Penolakan diselesaikan berjenjang, dan alasannya dicatat.", "kata_kunci": ["berjenjang", "kerahasiaan data", "tidak dapat ditemui sampai akhir pendataan"]}, {"id": "LAT-75", "paket": 7, "judul_paket": "Alur Kerja dan Etika", "nomor": 5, "pertanyaan": "Rumah keluarga sasaran kosong pada kunjungan pertama karena semua ke ladang. Tindakannya ...", "opsi": {"A": "Langsung catat pindah/mengungsi", "B": "Wawancarai tetangga sebagai pengganti", "C": "Cari informasi lewat tetangga atau ketua SLS, lalu kunjungi ulang saat keluarga bisa ditemui", "D": "Keluarkan dari cakupan pendataan"}, "kunci": "C", "penjelasan": "Keluarga yang belum ditemui tetap dalam cakupan. Kunjungan ulang dilakukan sampai batas waktu pendataan.", "kata_kunci": ["kunjungi ulang", "ketua SLS", "tetap dalam cakupan"]}, {"id": "LAT-76", "paket": 7, "judul_paket": "Alur Kerja dan Etika", "nomor": 6, "pertanyaan": "Sebelum submit, PPL melihat R9a = Ya tetapi R9b belum terisi. Yang dilakukan PPL ...", "opsi": {"A": "Langsung submit, biar PML yang melengkapi", "B": "Mengisi R9b dengan perkiraan sendiri", "C": "Mengubah R9a menjadi Tidak", "D": "Melengkapi isian atau konfirmasi ulang ke responden sebelum submit"}, "kunci": "D", "penjelasan": "PPL wajib melakukan pemeriksaan awal: kelengkapan, konsistensi, dan kode jawaban, sebelum mengirim ke PML.", "kata_kunci": ["R9a", "R9b", "pemeriksaan awal"]}, {"id": "LAT-77", "paket": 7, "judul_paket": "Alur Kerja dan Etika", "nomor": 7, "pertanyaan": "Urutan pemeriksaan data yang benar adalah ...", "opsi": {"A": "PPL submit → PML periksa → reject jika ada masalah → PPL perbaiki dan submit ulang → PML approve", "B": "PPL submit → Admin approve → PML periksa", "C": "PML approve dulu → perbaikan saat cleaning", "D": "PPL approve sendiri → PML memantau"}, "kunci": "A", "penjelasan": "Approval adalah kewenangan PML setelah data lengkap, konsisten, wajar, dan sesuai konsep definisi.", "kata_kunci": ["reject", "approve", "kewenangan PML"]}]$qc$::jsonb);
