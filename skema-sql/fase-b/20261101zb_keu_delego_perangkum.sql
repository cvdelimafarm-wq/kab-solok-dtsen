-- =====================================================================
-- 20261101zb_keu_delego_perangkum.sql
-- Delego sebagai perangkum seluruh pekerjaan pegawai (rancangan 1 Nov 2026).
-- Bergantung pada 20261026c, g, i (Delego), 20261025zj (penugasan), za/zf (identifikasi/lanjutan). Aman diulang. Tanpa DELETE/DROP TABLE.
--
-- Isi:
--  1. Kewenangan: delegasi_beri juga untuk KPA (perintah langsung Kepala); delegasi_putus (Kepala memutuskan sanggahan) untuk KPA dan ADMIN.
--  2. Jenis notifikasi baru.
--  3. keu_dlg_delegasi: status 'usulan' (usulan pegawai tertaut kegiatan tim), kelas pekerjaan, kegiatan_id (rekap lintas kegiatan),
--     asal sumber (idempoten), mode tutup, induk, terhalang, usulan.
--  4. keu_dlg_jenis: status skor (usulan/disetujui/ditolak), kertas kerja perhitungan beban, alasan skor.
--  5. keu_dlg_laporan: status tinjau (menunggu/disetujui/ditolak/disanggah/tidak_diakui), poin diakui, jam kerja nyata.
--  6. Tabel baru: keu_dlg_tinjau (jejak keputusan tinjau), keu_dlg_sanggah, keu_dlg_ketersediaan.
--  7. Fungsi tulis: keu_dlg_usul, keu_dlg_usul_putus, keu_dlg_tinjau, keu_dlg_sanggah_jawab, keu_dlg_sanggah_putus, keu_dlg_terhalang,
--     keu_dlg_skor_ajukan, keu_dlg_skor_putus, keu_dlg_ketersediaan_catat, keu_dlg_ketersediaan_putus.
--  8. Fungsi baca: keu_dlg_tinjau_bahan, keu_dlg_katalog_skor, keu_dlg_rekap, keu_dlg_monitor.
--  9. Izin gerbang keu_jalankan (hanya menambah).
-- Sistem menyarankan, manusia memutuskan. Delego bukan dasar sanksi otomatis.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kewenangan
-- ---------------------------------------------------------------------
insert into keu_master_kewenangan(kode, nama, ket, pemberi_kode, urut, aktif) values
  ('delegasi_putus', 'Memutuskan sanggahan laporan', 'Kepala memutuskan sanggahan Ketua Tim atas laporan pegawai dan meninjau laporan bila perlu (Delego).', null, 96, true)
on conflict do nothing;

insert into keu_master_kewenangan_peran(kewenangan_kode, peran_kode, perlu_pemberian, ket) values
  ('delegasi_beri',  'KPA',   false, 'Kepala: perintah langsung'),
  ('delegasi_putus', 'KPA',   false, 'Kepala memutuskan sanggahan'),
  ('delegasi_putus', 'ADMIN', false, '')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Jenis notifikasi baru (menambah ke daftar yang ADA saat ini)
-- ---------------------------------------------------------------------
do $$
declare v_def text; v_ada text[]; v_baru text[] := array['delegasi_usulan','delegasi_usulan_putus','delegasi_laporan_tinjau','delegasi_sanggah','delegasi_sanggah_jawab',
  'delegasi_putusan','delegasi_skor','delegasi_ketersediaan']::text[]; v_all text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conrelid = 'public.keu_notifikasi'::regclass and conname = 'keu_notifikasi_jenis_check';
  if v_def is null then raise exception 'Batasan keu_notifikasi_jenis_check tidak ditemukan'; end if;
  -- bentuk ARRAY['a'::text, 'b'::text] atau literal '{a,b}'::text[]; keduanya dibaca agar daftar yang ada tidak hilang
  if v_def ~ '\{[a-z0-9_,]+\}' then
    v_ada := string_to_array((regexp_match(v_def, '\{([a-z0-9_,]+)\}'))[1], ',');
  else
    select array_agg(t.m[1]) into v_ada from regexp_matches(v_def, '''([a-z0-9_]+)''::text', 'g') as t(m);
  end if;
  if v_ada is null then raise exception 'Daftar jenis notifikasi yang ada tidak terbaca dari batasan; penambahan dibatalkan'; end if;
  if not (v_baru <@ v_ada) then
    select array_agg(distinct x order by x) into v_all from unnest(coalesce(v_ada, array[]::text[]) || v_baru) x;
    alter table keu_notifikasi drop constraint keu_notifikasi_jenis_check;
    execute format('alter table keu_notifikasi add constraint keu_notifikasi_jenis_check check (jenis = any (%L::text[]))', v_all);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. keu_dlg_delegasi
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_delegasi'::regclass and conname = 'keu_dlg_delegasi_status_check'
                 and pg_get_constraintdef(oid) like '%usulan%') then
    alter table keu_dlg_delegasi drop constraint if exists keu_dlg_delegasi_status_check;
    alter table keu_dlg_delegasi add constraint keu_dlg_delegasi_status_check check (status in ('usulan','baru','berjalan','selesai','ditunda','batal'));
  end if;
end $$;

alter table keu_dlg_delegasi add column if not exists kelas text not null default 'langsung';
alter table keu_dlg_delegasi add column if not exists kegiatan_id bigint references sigap_kegiatan(id);
alter table keu_dlg_delegasi add column if not exists sumber_jenis text;
alter table keu_dlg_delegasi add column if not exists sumber_id text;
alter table keu_dlg_delegasi add column if not exists sumber_varian text not null default '';
alter table keu_dlg_delegasi add column if not exists mode_tutup text not null default 'tinjau';
alter table keu_dlg_delegasi add column if not exists induk_id bigint references keu_dlg_delegasi(id);
alter table keu_dlg_delegasi add column if not exists terhalang_oleh text;
alter table keu_dlg_delegasi add column if not exists terhalang_sejak timestamptz;
alter table keu_dlg_delegasi add column if not exists menit_tetap integer;
alter table keu_dlg_delegasi add column if not exists usulan_oleh bigint references sigap_akun(id);
alter table keu_dlg_delegasi add column if not exists usulan_at timestamptz;
alter table keu_dlg_delegasi add column if not exists usulan_putus_oleh bigint references sigap_akun(id);
alter table keu_dlg_delegasi add column if not exists usulan_putus_at timestamptz;
alter table keu_dlg_delegasi add column if not exists usulan_catatan text not null default '';
alter table keu_dlg_delegasi add column if not exists skor_alasan text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_delegasi'::regclass and conname = 'keu_dlg_delegasi_kelas_check') then
    alter table keu_dlg_delegasi add constraint keu_dlg_delegasi_kelas_check
      check (kelas in ('langsung','penunjang','proses','lapangan','perintah','rutin'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_delegasi'::regclass and conname = 'keu_dlg_delegasi_mode_tutup_check') then
    alter table keu_dlg_delegasi add constraint keu_dlg_delegasi_mode_tutup_check check (mode_tutup in ('tinjau','ringan','sumber'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_delegasi'::regclass and conname = 'keu_dlg_delegasi_menit_tetap_check') then
    alter table keu_dlg_delegasi add constraint keu_dlg_delegasi_menit_tetap_check check (menit_tetap is null or menit_tetap between 1 and 1440);
  end if;
end $$;

create unique index if not exists keu_dlg_delegasi_sumber_uq on keu_dlg_delegasi (sumber_jenis, sumber_id, sumber_varian) where sumber_jenis is not null;
create index if not exists keu_dlg_delegasi_kegiatan_ix on keu_dlg_delegasi (kegiatan_id) where kegiatan_id is not null;
create index if not exists keu_dlg_delegasi_usulan_ix on keu_dlg_delegasi (status) where status = 'usulan';

-- ---------------------------------------------------------------------
-- 4. keu_dlg_jenis (katalog skor)
-- ---------------------------------------------------------------------
alter table keu_dlg_jenis add column if not exists kertas_kerja jsonb;
alter table keu_dlg_jenis add column if not exists skor_status text not null default 'disetujui';
alter table keu_dlg_jenis add column if not exists skor_alasan text not null default '';
alter table keu_dlg_jenis add column if not exists diusulkan_oleh bigint references sigap_akun(id);
alter table keu_dlg_jenis add column if not exists disetujui_oleh bigint references sigap_akun(id);
alter table keu_dlg_jenis add column if not exists disetujui_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_jenis'::regclass and conname = 'keu_dlg_jenis_skor_status_check') then
    alter table keu_dlg_jenis add constraint keu_dlg_jenis_skor_status_check check (skor_status in ('usulan','disetujui','ditolak'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_jenis'::regclass and conname = 'keu_dlg_jenis_kertas_check') then
    alter table keu_dlg_jenis add constraint keu_dlg_jenis_kertas_check check (kertas_kerja is null or (jsonb_typeof(kertas_kerja) = 'object' and char_length(kertas_kerja::text) <= 4000));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. keu_dlg_laporan (status tinjau)
-- ---------------------------------------------------------------------
alter table keu_dlg_laporan add column if not exists tinjau_status text not null default 'menunggu';
alter table keu_dlg_laporan add column if not exists tinjau_oleh bigint references sigap_akun(id);
alter table keu_dlg_laporan add column if not exists tinjau_at timestamptz;
alter table keu_dlg_laporan add column if not exists tinjau_alasan text not null default '';
alter table keu_dlg_laporan add column if not exists poin_diakui numeric(10,2);
alter table keu_dlg_laporan add column if not exists menit_nyata integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_laporan'::regclass and conname = 'keu_dlg_laporan_tinjau_status_check') then
    alter table keu_dlg_laporan add constraint keu_dlg_laporan_tinjau_status_check
      check (tinjau_status in ('menunggu','disetujui','ditolak','disanggah','tidak_diakui'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_laporan'::regclass and conname = 'keu_dlg_laporan_menit_check') then
    alter table keu_dlg_laporan add constraint keu_dlg_laporan_menit_check check (menit_nyata is null or menit_nyata between 1 and 1440);
  end if;
end $$;
create index if not exists keu_dlg_laporan_tinjau_ix on keu_dlg_laporan (tinjau_status) where tinjau_status <> 'disetujui';

-- Laporan baru: mode tutup 'ringan' atau 'sumber' tidak perlu tinjau. Laporan yang diubah isinya kembali menunggu tinjau; yang sedang disanggah atau sudah diputus tidak dapat diubah.
create or replace function keu_dlg_laporan_tinjau_awal() returns trigger language plpgsql as $$
declare v_mode text; v_isi boolean; v_ulang boolean;
begin
  select mode_tutup into v_mode from keu_dlg_delegasi where id = new.delegasi_id;
  if tg_op = 'INSERT' then
    if v_mode in ('ringan','sumber') then
      new.tinjau_status := 'disetujui'; new.tinjau_alasan := 'Tanpa tinjau (mode ' || v_mode || ')'; new.tinjau_at := now();
    else
      new.tinjau_status := 'menunggu';
    end if;
    return new;
  end if;
  v_isi := new.poin is distinct from old.poin or new.uraian is distinct from old.uraian or new.bukti is distinct from old.bukti
           or new.jumlah is distinct from old.jumlah or new.kendala is distinct from old.kendala;
  v_ulang := old.tinjau_status = 'ditolak' and new.tinjau_status = old.tinjau_status and new.diubah_at is distinct from old.diubah_at;
  if (v_isi or v_ulang) and new.tinjau_status = old.tinjau_status then
    if old.tinjau_status in ('disanggah','tidak_diakui') then
      raise exception 'Laporan tanggal % sedang disanggah atau sudah diputus Kepala; isinya tidak dapat diubah', old.tanggal using errcode = '23514';
    end if;
    new.poin_diakui := null;
    if v_mode in ('ringan','sumber') then
      new.tinjau_status := 'disetujui';
    else
      new.tinjau_status := 'menunggu'; new.tinjau_oleh := null; new.tinjau_at := null; new.tinjau_alasan := '';
    end if;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_dlg_laporan'::regclass and tgname = 'keu_t5_tinjau_awal') then
    create trigger keu_t5_tinjau_awal before insert or update on keu_dlg_laporan for each row execute function keu_dlg_laporan_tinjau_awal();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Tabel baru
-- ---------------------------------------------------------------------
create table if not exists keu_dlg_tinjau (
  id          bigint generated always as identity primary key,
  laporan_id  bigint not null references keu_dlg_laporan(id),
  delegasi_id bigint not null references keu_dlg_delegasi(id),
  putusan     text not null check (putusan in ('setuju','tolak','sanggah')),
  alasan      text not null default '' check (char_length(alasan) <= 1000),
  oleh        bigint not null references sigap_akun(id),
  dibuat_at   timestamptz not null default now()
);
create index if not exists keu_dlg_tinjau_laporan_ix on keu_dlg_tinjau (laporan_id);

create table if not exists keu_dlg_sanggah (
  id             bigint generated always as identity primary key,
  laporan_id     bigint not null references keu_dlg_laporan(id),
  delegasi_id    bigint not null references keu_dlg_delegasi(id),
  alasan         text not null check (char_length(alasan) between 20 and 1000),
  bukti          jsonb not null default '[]'::jsonb check (jsonb_typeof(bukti) = 'array' and jsonb_array_length(bukti) <= 5),
  diajukan_oleh  bigint not null references sigap_akun(id),
  diajukan_at    timestamptz not null default now(),
  batas_jawab    date not null,
  jawaban        text check (jawaban is null or char_length(jawaban) between 10 and 1000),
  jawaban_bukti  jsonb not null default '[]'::jsonb check (jsonb_typeof(jawaban_bukti) = 'array' and jsonb_array_length(jawaban_bukti) <= 5),
  dijawab_at     timestamptz,
  status         text not null default 'menunggu_jawab' check (status in ('menunggu_jawab','menunggu_putusan','diputus')),
  putusan        text check (putusan is null or putusan in ('benar','sebagian','salah')),
  poin_diakui    numeric(10,2) check (poin_diakui is null or poin_diakui >= 0),
  catatan_putusan text not null default '' check (char_length(catatan_putusan) <= 1000),
  diputus_oleh   bigint references sigap_akun(id),
  diputus_at     timestamptz,
  pembinaan_id   bigint references keu_dlg_pembinaan(id),
  check ((status = 'diputus') = (putusan is not null))
);
create unique index if not exists keu_dlg_sanggah_terbuka_uq on keu_dlg_sanggah (laporan_id) where status in ('menunggu_jawab','menunggu_putusan');
create index if not exists keu_dlg_sanggah_delegasi_ix on keu_dlg_sanggah (delegasi_id);

create table if not exists keu_dlg_ketersediaan (
  id            bigint generated always as identity primary key,
  akun_id       bigint not null references sigap_akun(id),
  jenis         text not null check (jenis in ('cuti','izin','sakit','dinas_luar','lainnya')),
  mulai         date not null,
  selesai       date not null,
  fraksi        numeric(3,2) not null default 1 check (fraksi > 0 and fraksi <= 1),
  catatan       text not null default '' check (char_length(catatan) <= 200),
  status        text not null default 'diajukan' check (status in ('diajukan','disetujui','ditolak')),
  diajukan_oleh bigint references sigap_akun(id),
  diputus_oleh  bigint references sigap_akun(id),
  diputus_at    timestamptz,
  dibuat_at     timestamptz not null default now(),
  check (selesai >= mulai),
  check (fraksi = 1 or mulai = selesai)
);
create index if not exists keu_dlg_ketersediaan_akun_ix on keu_dlg_ketersediaan (akun_id, mulai, selesai);

do $$
declare t text;
begin
  foreach t in array array['keu_dlg_tinjau','keu_dlg_sanggah','keu_dlg_ketersediaan']
  loop
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass and tgname = 'keu_t1_jaga') then
      execute format('create trigger keu_t1_jaga before insert or update or delete on %I for each row execute function keu_ident_jaga()', t);
      execute format('create trigger keu_t9_jejak after insert or update on %I for each row execute function keu_jejak()', t);
    end if;
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
    execute format('grant all on table %I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Pembantu (tidak masuk daftar izin gerbang)
-- ---------------------------------------------------------------------
-- Kode RO (mis. 2906.BMA.006) dari kode anggaran kegiatan SIGAP (mis. 054.01.GG.2906.BMA.006.052.A.524114).
create or replace function keu_dlg_ro_kegiatan(p_kegiatan bigint) returns text language sql stable security definer set search_path = public as $$
  select (regexp_match(k.kode_anggaran, '([0-9]{4}\.[A-Z]{3}\.[0-9A-Z]{3})'))[1] from sigap_kegiatan k where k.id = p_kegiatan
$$;

-- Tanggal setelah p_n hari kerja (Senin sampai Jumat, tanpa libur aktif) dari p_dari.
create or replace function keu_dlg_hk_tambah(p_dari date, p_n integer) returns date language plpgsql stable security definer set search_path = public as $$
declare d date := p_dari; n int := 0;
begin
  while n < greatest(p_n, 0) loop
    d := d + 1;
    if extract(isodow from d) <= 5 and not exists (select 1 from keu_dlg_libur l where l.tanggal = d and l.aktif) then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Hari kerja yang telah berlalu sejak p_dari (tidak termasuk hari itu) sampai p_sampai (termasuk).
create or replace function keu_dlg_hk_lewat(p_dari date, p_sampai date) returns integer language sql stable security definer set search_path = public as $$
  select case when p_sampai > p_dari then keu_dlg_hitung_hk(p_dari + 1, p_sampai, array[1,2,3,4,5]::smallint[]) else 0 end
$$;

-- Ketua Tim sebuah RO: penugasan KETUA aktif pada RO itu, ditambah petugas berjabatan "ketua" pada identifikasi lanjutan Final RO itu (nama cocok tepat satu akun).
create or replace function keu_dlg_ketua_ro(p_ro text) returns setof bigint language sql stable security definer set search_path = public as $$
  select t.akun_id from keu_penugasan t where t.peran_kode = 'KETUA' and t.ro_kode = p_ro and t.dibatalkan_at is null and t.masa @> current_date
  union
  select a.id
    from keu_ident i
    join keu_ident_lanjutan l on l.ident_id = i.id and l.status = 'final'
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l.isi -> 'petugas') = 'array' then l.isi -> 'petugas' else '[]'::jsonb end) x
    join sigap_akun a on a.aktif and lower(a.nama) = lower(x ->> 'nama')
   where i.ro_kode = p_ro and jsonb_typeof(x -> 'jabatan') = 'array' and (x -> 'jabatan') ? 'ketua'
     and (select count(*) from sigap_akun b where b.aktif and lower(b.nama) = lower(x ->> 'nama')) = 1
$$;

-- Pemutus sanggahan (Kepala dan Admin): penugasan global yang memegang kewenangan delegasi_putus.
create or replace function keu_dlg_pemutus() returns setof bigint language sql stable security definer set search_path = public as $$
  select distinct t.akun_id from keu_penugasan t
   where t.dibatalkan_at is null and t.masa @> current_date and t.ro_kode is null
     and t.peran_kode in (select kp.peran_kode from keu_master_kewenangan_peran kp where kp.kewenangan_kode = 'delegasi_putus')
$$;

create or replace function keu_dlg_putus_ok(p_akun bigint) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(keu_boleh(p_akun, 'delegasi_putus', null), false)
$$;

-- Boleh meninjau laporan sebuah delegasi: pemberinya, pemberi tingkat RO, atau pemutus; penerima sendiri hanya bila ia pemutus (peran Kepala).
create or replace function keu_dlg_boleh_tinjau(p_akun bigint, p_delegasi bigint) returns boolean language plpgsql stable security definer set search_path = public as $$
declare d keu_dlg_delegasi;
begin
  select * into d from keu_dlg_delegasi where id = p_delegasi;
  if not found or p_akun is null then return false; end if;
  if p_akun = d.penerima_akun then return keu_dlg_putus_ok(p_akun); end if;
  return p_akun = d.dibuat_oleh or keu_dlg_beri(p_akun, d.ro_kode) or keu_dlg_putus_ok(p_akun);
end $$;

-- Pesan dengan tautan sendiri (hanya alamat dalam SIGAP).
create or replace function keu_dlg_notif2(p_akun bigint, p_jenis text, p_judul text, p_isi text, p_tautan text, p_pemicu bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_lama text := coalesce(current_setting('keu.via_fungsi', true), '');
begin
  if p_akun is null or p_akun = p_pemicu then return; end if;
  if p_tautan !~ '^/sigap/[A-Za-z0-9/_-]*$' then p_tautan := '/sigap/delego/saya'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_notifikasi(akun_id, jenis, ident_id, judul, isi, tautan, pemicu)
  values (p_akun, p_jenis, null, left(p_judul, 200), left(coalesce(p_isi, ''), 1000), p_tautan, p_pemicu);
  perform set_config('keu.via_fungsi', v_lama, true);
end $$;

-- ---------------------------------------------------------------------
-- 8. Usulan pegawai tertaut kegiatan tim
-- ---------------------------------------------------------------------
-- p_data: { judul, uraian?, kegiatan_id? (tautan kegiatan SIGAP) | kelompok? (Pekerjaan kantor, kode TIM-XXXX), jenis_id?, satuan, volume, poin_per_satuan,
--           mulai?, tenggat, hari_kerja?[], bobot?, kelas?, skor_alasan? }
-- Akun pelaku menjadi penerima. Butir berstatus 'usulan' sampai Ketua Tim kegiatan menyetujui; pemberi menjadi Ketua Tim saat disetujui.
create or replace function keu_dlg_usul(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a sigap_akun; v_keg bigint; v_ro text; v_kel text; v_judul text; v_ura text; v_sat text; v_vol numeric; v_pps numeric; v_total numeric; v_th numeric;
  v_mulai date; v_tenggat date; v_hk smallint[]; v_nhk int; v_bobot int; v_kelas text; v_jenis bigint; v_alasan text; v_id bigint;
  v_hari date := keu_dlg_hari_ini(); v_med numeric; v_n int; v_rasio numeric; w bigint; v_nama_keg text; v_dst int := 0; v_jsat text; v_jpps numeric;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into a from sigap_akun where id = p_akun and aktif;
  if not found then raise exception 'Akun tidak aktif' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian usulan harus objek JSON' using errcode = '22023'; end if;

  v_keg := nullif(p_data ->> 'kegiatan_id', '')::bigint;
  if v_keg is not null then
    select k.nama into v_nama_keg from sigap_kegiatan k where k.id = v_keg and k.aktif;
    if not found then raise exception 'Kegiatan % tidak ada atau tidak aktif', v_keg using errcode = '23514'; end if;
    v_ro := keu_dlg_ro_kegiatan(v_keg);
    if v_ro is null then raise exception 'Kegiatan % belum punya kode RO pada kode anggarannya; tautkan ke Pekerjaan kantor', v_keg using errcode = '23514'; end if;
  else
    v_kel := coalesce(nullif(btrim(p_data ->> 'kelompok'), ''), (select z.kode from keu_dlg_kelompok z where z.aktif order by z.urut, z.kode limit 1));
    if v_kel is null or not exists (select 1 from keu_dlg_kelompok z where z.kode = v_kel and z.aktif) then
      raise exception 'Pilih kegiatan tim atau kelompok Pekerjaan kantor yang aktif' using errcode = '23514';
    end if;
    v_ro := v_kel;
  end if;

  v_judul := btrim(coalesce(p_data ->> 'judul', ''));
  if char_length(v_judul) < 3 or char_length(v_judul) > 200 then raise exception 'Judul 3 sampai 200 huruf' using errcode = '23514'; end if;
  v_ura := left(btrim(coalesce(p_data ->> 'uraian', '')), 1000);

  v_jenis := nullif(p_data ->> 'jenis_id', '')::bigint;
  if v_jenis is not null then
    select z.satuan, z.poin_per_satuan into v_jsat, v_jpps from keu_dlg_jenis z where z.id = v_jenis and z.aktif and z.skor_status = 'disetujui';
    if not found then raise exception 'Jenis pekerjaan % tidak ada atau belum disetujui', v_jenis using errcode = '23514'; end if;
  end if;
  v_sat := btrim(coalesce(p_data ->> 'satuan', v_jsat, ''));
  if char_length(v_sat) < 1 or char_length(v_sat) > 30 then raise exception 'Satuan 1 sampai 30 huruf' using errcode = '23514'; end if;
  v_vol := nullif(p_data ->> 'volume', '')::numeric;
  if v_vol is null or v_vol <= 0 or v_vol > 100000 then raise exception 'Volume harus lebih dari 0' using errcode = '23514'; end if;
  v_pps := coalesce(nullif(p_data ->> 'poin_per_satuan', '')::numeric, v_jpps);
  if v_pps is null or v_pps <= 0 or v_pps > 1000 then raise exception 'Skor per satuan harus lebih dari 0 dan paling banyak 1000' using errcode = '23514'; end if;
  v_alasan := left(btrim(coalesce(p_data ->> 'skor_alasan', '')), 300);

  -- skor yang jauh dari pekerjaan sejenis (satuan sama) wajib beralasan
  select percentile_cont(0.5) within group (order by z.poin_per_satuan), count(*) into v_med, v_n
    from keu_dlg_jenis z where z.aktif and z.skor_status = 'disetujui' and lower(z.satuan) = lower(v_sat);
  if v_n > 0 and v_med > 0 then
    v_rasio := v_pps / v_med;
    if (v_rasio > 2 or v_rasio < 0.5) and char_length(v_alasan) < 10 then
      raise exception 'Skor % per % berbeda jauh dari pekerjaan sejenis (median %); isi alasan skor (minimal 10 huruf)', v_pps, v_sat, round(v_med, 2) using errcode = '23514';
    end if;
  end if;

  v_mulai := coalesce(nullif(p_data ->> 'mulai', '')::date, v_hari);
  v_tenggat := nullif(p_data ->> 'tenggat', '')::date;
  if v_tenggat is null then raise exception 'Tenggat wajib diisi' using errcode = '23514'; end if;
  if v_tenggat < v_mulai then raise exception 'Tenggat tidak boleh sebelum tanggal mulai' using errcode = '23514'; end if;
  v_hk := keu_dlg_hk(p_data -> 'hari_kerja');
  v_nhk := keu_dlg_hitung_hk(v_mulai, v_tenggat, v_hk);
  if v_nhk < 1 then raise exception 'Tidak ada hari kerja antara % dan %', v_mulai, v_tenggat using errcode = '23514'; end if;
  v_bobot := coalesce(nullif(p_data ->> 'bobot', '')::int, 1);
  if v_bobot not between 1 and 5 then raise exception 'Bobot 1 sampai 5' using errcode = '23514'; end if;
  v_kelas := coalesce(nullif(p_data ->> 'kelas', ''), case when v_keg is not null then 'lapangan' else 'langsung' end);
  if v_kelas not in ('langsung','penunjang','proses','lapangan','perintah','rutin') then raise exception 'Kelas pekerjaan tidak dikenal' using errcode = '23514'; end if;

  v_total := round(v_vol * v_pps, 2);
  v_th := round(v_total / v_nhk, 2);
  if v_th > 1000 then raise exception 'Beban per hari (% poin) terlalu besar; perpanjang tenggat atau kurangi volume', v_th using errcode = '23514'; end if;

  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_delegasi(tahun, ident_id, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot, hari_kerja, mulai, tenggat,
                               status, dibuat_oleh, jenis_id, poin_per_satuan, perlu_hasil, perlu_tinjau, kelas, kegiatan_id, mode_tutup, usulan_oleh, usulan_at, skor_alasan)
  values (extract(year from v_mulai)::smallint, null, v_ro, v_judul, v_ura, p_akun, 'pegawai', '', v_sat, v_total, v_th, v_bobot, v_hk, v_mulai, v_tenggat,
          'usulan', p_akun, v_jenis, v_pps, false, false, v_kelas, v_keg, 'tinjau', p_akun, now(), v_alasan)
  returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);

  -- beri tahu Ketua Tim kegiatan itu; bila tidak ada, pemutus (Kepala)
  for w in select distinct x from keu_dlg_ketua_ro(v_ro) x loop
    perform keu_dlg_notif2(w, 'delegasi_usulan', 'Usulan pekerjaan dari ' || a.nama, v_judul || ' (' || v_vol || ' ' || v_sat || ', ' || v_total || ' poin)', '/sigap/delego/tinjau', p_akun);
    v_dst := v_dst + 1;
  end loop;
  if v_dst = 0 then
    for w in select * from keu_dlg_pemutus() loop
      perform keu_dlg_notif2(w, 'delegasi_usulan', 'Usulan pekerjaan dari ' || a.nama, v_judul || ' (' || v_vol || ' ' || v_sat || ', ' || v_total || ' poin)', '/sigap/delego/tinjau', p_akun);
    end loop;
  end if;
  return jsonb_build_object('id', v_id, 'status', 'usulan', 'ro_kode', v_ro, 'poin_total', v_total, 'target_harian', v_th, 'hari_kerja', v_nhk, 'median', v_med, 'pembanding', v_n);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- p_putusan: setuju | tolak. Pada setuju, p_data boleh mengubah { volume, poin_per_satuan, mulai, tenggat }. Perubahan skor wajib beralasan.
create or replace function keu_dlg_usul_putus(p_id bigint, p_putusan text, p_data jsonb default null, p_alasan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d keu_dlg_delegasi; v_alasan text := btrim(coalesce(p_alasan, '')); v_vol numeric; v_pps numeric; v_mulai date; v_tenggat date; v_nhk int; v_total numeric; v_th numeric;
  v_vol0 numeric;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_putusan not in ('setuju','tolak') then raise exception 'Putusan harus setuju atau tolak' using errcode = '22023'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Usulan % tidak ada', p_id using errcode = '23514'; end if;
  if d.status <> 'usulan' then raise exception 'Butir ini berstatus %, bukan usulan', d.status using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % bukan Ketua Tim atau pemberi delegasi untuk %', p_akun, d.ro_kode using errcode = '42501'; end if;
  if p_akun = d.usulan_oleh and not keu_dlg_putus_ok(p_akun) then
    raise exception 'Usulan sendiri hanya dapat diputus oleh Kepala atau pemberi lain' using errcode = '42501';
  end if;

  perform set_config('keu.via_fungsi', '1', true);
  if p_putusan = 'tolak' then
    if char_length(v_alasan) < 5 then raise exception 'Alasan penolakan minimal 5 huruf' using errcode = '23514'; end if;
    update keu_dlg_delegasi set status = 'batal', alasan = left('Usulan ditolak: ' || v_alasan, 300), usulan_putus_oleh = p_akun, usulan_putus_at = now(),
           usulan_catatan = left(v_alasan, 300), ver = ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
    perform keu_dlg_notif2(d.usulan_oleh, 'delegasi_usulan_putus', 'Usulan ditolak: ' || d.judul, v_alasan, '/sigap/delego/saya', p_akun);
  else
    v_vol0 := case when coalesce(d.poin_per_satuan, 0) > 0 then d.target_total / d.poin_per_satuan else null end;
    v_vol := coalesce(nullif(p_data ->> 'volume', '')::numeric, v_vol0);
    v_pps := coalesce(nullif(p_data ->> 'poin_per_satuan', '')::numeric, d.poin_per_satuan);
    v_mulai := coalesce(nullif(p_data ->> 'mulai', '')::date, d.mulai);
    v_tenggat := coalesce(nullif(p_data ->> 'tenggat', '')::date, d.tenggat);
    if v_vol is null or v_vol <= 0 or v_pps is null or v_pps <= 0 or v_pps > 1000 then raise exception 'Volume dan skor harus lebih dari 0' using errcode = '23514'; end if;
    if v_tenggat < v_mulai then raise exception 'Tenggat tidak boleh sebelum tanggal mulai' using errcode = '23514'; end if;
    if v_pps is distinct from d.poin_per_satuan and char_length(v_alasan) < 5 then raise exception 'Perubahan skor wajib beralasan (minimal 5 huruf)' using errcode = '23514'; end if;
    v_nhk := keu_dlg_hitung_hk(v_mulai, v_tenggat, d.hari_kerja);
    if v_nhk < 1 then raise exception 'Tidak ada hari kerja antara % dan %', v_mulai, v_tenggat using errcode = '23514'; end if;
    v_total := round(v_vol * v_pps, 2);
    v_th := round(v_total / v_nhk, 2);
    if v_th > 1000 then raise exception 'Beban per hari (% poin) terlalu besar', v_th using errcode = '23514'; end if;
    update keu_dlg_delegasi set status = 'baru', dibuat_oleh = p_akun, poin_per_satuan = v_pps, target_total = v_total, target_harian = v_th, mulai = v_mulai, tenggat = v_tenggat,
           usulan_putus_oleh = p_akun, usulan_putus_at = now(), usulan_catatan = left(v_alasan, 300),
           skor_alasan = case when v_pps is distinct from d.poin_per_satuan then left(v_alasan, 300) else d.skor_alasan end,
           ver = ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
    perform keu_dlg_notif2(d.usulan_oleh, 'delegasi_usulan_putus', 'Usulan disetujui: ' || d.judul,
      'Menjadi delegasi dari Ketua Tim: ' || v_vol || ' ' || d.satuan || ', ' || v_total || ' poin, tenggat ' || v_tenggat || '.', '/sigap/delego/saya', p_akun);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', d.id, 'putusan', p_putusan);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- 9. Tinjau laporan, sanggah, jawab, putus
-- ---------------------------------------------------------------------
-- p_putusan: setuju | tolak | sanggah. Tolak: alasan minimal 5 huruf. Sanggah: alasan minimal 20 huruf (diteruskan ke Kepala, pegawai berhak menjawab 2 hari kerja).
create or replace function keu_dlg_tinjau(p_laporan bigint, p_putusan text, p_alasan text default '', p_bukti jsonb default '[]'::jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l keu_dlg_laporan; d keu_dlg_delegasi; v_alasan text := btrim(coalesce(p_alasan, '')); v_sid bigint; v_batas date; w bigint; v_nama text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_putusan not in ('setuju','tolak','sanggah') then raise exception 'Putusan harus setuju, tolak, atau sanggah' using errcode = '22023'; end if;
  select * into l from keu_dlg_laporan where id = p_laporan for update;
  if not found then raise exception 'Laporan % tidak ada', p_laporan using errcode = '23514'; end if;
  select * into d from keu_dlg_delegasi where id = l.delegasi_id;
  if not keu_dlg_boleh_tinjau(p_akun, d.id) then raise exception 'Akun % tidak berwenang meninjau laporan ini', p_akun using errcode = '42501'; end if;
  if l.tinjau_status <> 'menunggu' then raise exception 'Laporan ini berstatus %, tidak sedang menunggu tinjau', l.tinjau_status using errcode = '23514'; end if;
  if p_bukti is null or jsonb_typeof(p_bukti) <> 'array' or jsonb_array_length(p_bukti) > 5 then raise exception 'Bukti harus larik paling banyak 5 butir' using errcode = '23514'; end if;
  select nama into v_nama from sigap_akun where id = d.penerima_akun;

  perform set_config('keu.via_fungsi', '1', true);
  if p_putusan = 'setuju' then
    update keu_dlg_laporan set tinjau_status = 'disetujui', tinjau_oleh = p_akun, tinjau_at = now(), tinjau_alasan = left(v_alasan, 1000) where id = l.id;
    perform keu_dlg_notif2(d.penerima_akun, 'delegasi_laporan_tinjau', 'Laporan disetujui: ' || d.judul, 'Laporan ' || l.tanggal || ' disetujui.', '/sigap/delego/saya', p_akun);
  elsif p_putusan = 'tolak' then
    if char_length(v_alasan) < 5 then raise exception 'Alasan penolakan minimal 5 huruf' using errcode = '23514'; end if;
    update keu_dlg_laporan set tinjau_status = 'ditolak', tinjau_oleh = p_akun, tinjau_at = now(), tinjau_alasan = left(v_alasan, 1000) where id = l.id;
    perform keu_dlg_notif2(d.penerima_akun, 'delegasi_laporan_tinjau', 'Laporan perlu revisi: ' || d.judul, v_alasan, '/sigap/delego/lapor', p_akun);
  else
    if char_length(v_alasan) < 20 then raise exception 'Alasan sanggahan minimal 20 huruf' using errcode = '23514'; end if;
    if p_akun = d.penerima_akun then raise exception 'Laporan sendiri tidak dapat disanggah' using errcode = '23514'; end if;
    v_batas := keu_dlg_hk_tambah(keu_dlg_hari_ini(), 2);
    update keu_dlg_laporan set tinjau_status = 'disanggah', tinjau_oleh = p_akun, tinjau_at = now(), tinjau_alasan = left(v_alasan, 1000) where id = l.id;
    insert into keu_dlg_sanggah(laporan_id, delegasi_id, alasan, bukti, diajukan_oleh, batas_jawab)
    values (l.id, d.id, left(v_alasan, 1000), p_bukti, p_akun, v_batas) returning id into v_sid;
    perform keu_dlg_notif2(d.penerima_akun, 'delegasi_sanggah', 'Laporan Anda disanggah: ' || d.judul,
      'Ketua Tim menyanggah laporan ' || l.tanggal || '. Anda berhak menjawab sampai ' || v_batas || '.', '/sigap/delego/saya', p_akun);
    for w in select * from keu_dlg_pemutus() loop
      perform keu_dlg_notif2(w, 'delegasi_sanggah', 'Sanggahan perlu klarifikasi: ' || v_nama, d.judul || ' (' || l.tanggal || '): ' || left(v_alasan, 200), '/sigap/delego/monitor', p_akun);
    end loop;
  end if;
  insert into keu_dlg_tinjau(laporan_id, delegasi_id, putusan, alasan, oleh) values (l.id, d.id, p_putusan, left(v_alasan, 1000), p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('laporan', l.id, 'putusan', p_putusan, 'sanggah', v_sid, 'batas_jawab', v_batas);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

create or replace function keu_dlg_sanggah_jawab(p_sanggah bigint, p_jawaban text, p_bukti jsonb default '[]'::jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare s keu_dlg_sanggah; d keu_dlg_delegasi; v_j text := btrim(coalesce(p_jawaban, '')); w bigint; v_nama text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into s from keu_dlg_sanggah where id = p_sanggah for update;
  if not found then raise exception 'Sanggahan % tidak ada', p_sanggah using errcode = '23514'; end if;
  select * into d from keu_dlg_delegasi where id = s.delegasi_id;
  if p_akun <> d.penerima_akun then raise exception 'Hanya penerima delegasi yang dapat menjawab sanggahan' using errcode = '42501'; end if;
  if s.status <> 'menunggu_jawab' then raise exception 'Sanggahan ini sudah dijawab atau diputus' using errcode = '23514'; end if;
  if char_length(v_j) < 10 then raise exception 'Jawaban minimal 10 huruf' using errcode = '23514'; end if;
  if p_bukti is null or jsonb_typeof(p_bukti) <> 'array' or jsonb_array_length(p_bukti) > 5 then raise exception 'Bukti harus larik paling banyak 5 butir' using errcode = '23514'; end if;
  select nama into v_nama from sigap_akun where id = d.penerima_akun;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_sanggah set jawaban = left(v_j, 1000), jawaban_bukti = p_bukti, dijawab_at = now(), status = 'menunggu_putusan' where id = s.id;
  perform set_config('keu.via_fungsi', '', true);
  for w in select * from keu_dlg_pemutus() loop
    perform keu_dlg_notif2(w, 'delegasi_sanggah_jawab', v_nama || ' menjawab sanggahan', d.judul || ': ' || left(v_j, 200), '/sigap/delego/monitor', p_akun);
  end loop;
  perform keu_dlg_notif2(s.diajukan_oleh, 'delegasi_sanggah_jawab', v_nama || ' menjawab sanggahan', d.judul, '/sigap/delego/tinjau', p_akun);
  return jsonb_build_object('id', s.id, 'status', 'menunggu_putusan');
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- p_putusan: benar | sebagian | salah. Hanya pemutus (Kepala). Sebagian wajib menyebut poin diakui (0 sampai kurang dari poin laporan).
create or replace function keu_dlg_sanggah_putus(p_sanggah bigint, p_putusan text, p_poin numeric default null, p_catatan text default '', p_pembinaan boolean default false,
                                                 p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s keu_dlg_sanggah; l keu_dlg_laporan; d keu_dlg_delegasi; v_cat text := btrim(coalesce(p_catatan, '')); v_poin numeric; v_bid bigint; v_tinjau text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_dlg_putus_ok(p_akun) then raise exception 'Hanya Kepala yang memutuskan sanggahan' using errcode = '42501'; end if;
  if p_putusan not in ('benar','sebagian','salah') then raise exception 'Putusan harus benar, sebagian, atau salah' using errcode = '22023'; end if;
  select * into s from keu_dlg_sanggah where id = p_sanggah for update;
  if not found then raise exception 'Sanggahan % tidak ada', p_sanggah using errcode = '23514'; end if;
  if s.status = 'diputus' then raise exception 'Sanggahan ini sudah diputus' using errcode = '23514'; end if;
  if s.status = 'menunggu_jawab' and s.batas_jawab >= keu_dlg_hari_ini() then
    raise exception 'Pegawai masih berhak menjawab sampai %; putusan menunggu jawaban atau batas waktu', s.batas_jawab using errcode = '23514';
  end if;
  if char_length(v_cat) < 10 then raise exception 'Catatan putusan minimal 10 huruf' using errcode = '23514'; end if;
  select * into l from keu_dlg_laporan where id = s.laporan_id for update;
  select * into d from keu_dlg_delegasi where id = s.delegasi_id;

  v_poin := case p_putusan when 'benar' then l.poin when 'salah' then 0 else p_poin end;
  if p_putusan = 'sebagian' and (p_poin is null or p_poin < 0 or p_poin >= l.poin) then
    raise exception 'Poin yang diakui harus 0 sampai kurang dari % poin laporan', l.poin using errcode = '23514';
  end if;
  v_tinjau := case when p_putusan = 'salah' then 'tidak_diakui' else 'disetujui' end;

  -- keu_dlg_bina mengatur bendera penjaga sendiri (menutupnya di akhir), jadi dipanggil sebelum bendera dipasang di sini
  if p_pembinaan then
    v_bid := keu_dlg_bina(p_penerima => d.penerima_akun, p_ro => d.ro_kode, p_langkah => 1, p_alasan => left('Putusan sanggahan (' || p_putusan || '): ' || v_cat, 500),
                          p_delegasi => d.id, p_akun => p_akun);
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_laporan set tinjau_status = v_tinjau, poin_diakui = v_poin, tinjau_alasan = left('Putusan Kepala: ' || v_cat, 1000), tinjau_at = now() where id = l.id;
  update keu_dlg_sanggah set status = 'diputus', putusan = p_putusan, poin_diakui = v_poin, catatan_putusan = left(v_cat, 1000), diputus_oleh = p_akun, diputus_at = now(),
         pembinaan_id = v_bid where id = s.id;
  perform set_config('keu.via_fungsi', '', true);
  perform keu_dlg_notif2(d.penerima_akun, 'delegasi_putusan', 'Putusan sanggahan: ' || d.judul, 'Putusan ' || p_putusan || ', poin diakui ' || v_poin || '. ' || left(v_cat, 300), '/sigap/delego/saya', p_akun);
  perform keu_dlg_notif2(s.diajukan_oleh, 'delegasi_putusan', 'Putusan sanggahan: ' || d.judul, 'Putusan ' || p_putusan || ', poin diakui ' || v_poin || '.', '/sigap/delego/tinjau', p_akun);
  return jsonb_build_object('id', s.id, 'putusan', p_putusan, 'poin_diakui', v_poin, 'pembinaan', v_bid);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- 10. Terhalang
-- ---------------------------------------------------------------------
-- p_oleh kosong = hapus tanda. Boleh oleh penerima atau pemberi.
create or replace function keu_dlg_terhalang(p_id bigint, p_oleh text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; v_oleh text := btrim(coalesce(p_oleh, ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if p_akun <> d.penerima_akun and not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berhak mengubah status terhalang', p_akun using errcode = '42501'; end if;
  if d.status not in ('baru','berjalan') then raise exception 'Delegasi berstatus % tidak dapat ditandai terhalang', d.status using errcode = '23514'; end if;
  if char_length(v_oleh) > 120 then raise exception 'Penghalang maksimal 120 huruf' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_delegasi set terhalang_oleh = nullif(v_oleh, ''), terhalang_sejak = case when v_oleh = '' then null else coalesce(d.terhalang_sejak, now()) end,
         diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', d.id, 'terhalang_oleh', nullif(v_oleh, ''));
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- 11. Katalog skor beban kerja
-- ---------------------------------------------------------------------
-- p_data: { nama, satuan, poin_per_satuan, uraian?, kertas_kerja? (objek), skor_alasan? }. Siapa pun yang aktif dapat mengajukan; Ketua Tim menyetujui.
create or replace function keu_dlg_skor_ajukan(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nama text; v_sat text; v_pps numeric; v_ura text; v_kk jsonb; v_alasan text; v_med numeric; v_n int; v_rasio numeric; v_id bigint; v_kode text; w bigint; v_peringatan boolean := false; a sigap_akun;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into a from sigap_akun where id = p_akun and aktif;
  if not found then raise exception 'Akun tidak aktif' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian harus objek JSON' using errcode = '22023'; end if;
  v_nama := btrim(coalesce(p_data ->> 'nama', ''));
  if char_length(v_nama) < 3 or char_length(v_nama) > 80 then raise exception 'Nama pekerjaan 3 sampai 80 huruf' using errcode = '23514'; end if;
  v_sat := btrim(coalesce(p_data ->> 'satuan', ''));
  if char_length(v_sat) < 1 or char_length(v_sat) > 30 then raise exception 'Satuan 1 sampai 30 huruf' using errcode = '23514'; end if;
  v_pps := nullif(p_data ->> 'poin_per_satuan', '')::numeric;
  if v_pps is null or v_pps <= 0 or v_pps > 1000 then raise exception 'Skor per satuan harus lebih dari 0 dan paling banyak 1000' using errcode = '23514'; end if;
  v_ura := left(btrim(coalesce(p_data ->> 'uraian', '')), 300);
  v_kk := p_data -> 'kertas_kerja';
  if v_kk is not null and (jsonb_typeof(v_kk) <> 'object' or char_length(v_kk::text) > 4000) then raise exception 'Kertas kerja harus objek JSON paling banyak 4000 karakter' using errcode = '23514'; end if;
  v_alasan := left(btrim(coalesce(p_data ->> 'skor_alasan', '')), 300);

  select percentile_cont(0.5) within group (order by z.poin_per_satuan), count(*) into v_med, v_n
    from keu_dlg_jenis z where z.aktif and z.skor_status = 'disetujui' and lower(z.satuan) = lower(v_sat);
  if v_n > 0 and v_med > 0 then
    v_rasio := round(v_pps / v_med, 2);
    v_peringatan := v_rasio > 2 or v_rasio < 0.5;
    if v_peringatan and char_length(v_alasan) < 10 then
      raise exception 'Skor % per % sekitar % kali median pekerjaan sejenis (% poin); isi alasan (minimal 10 huruf)', v_pps, v_sat, v_rasio, round(v_med, 2) using errcode = '23514';
    end if;
  end if;

  v_kode := 'u_' || substr(md5(random()::text || clock_timestamp()::text || p_akun::text), 1, 10);
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_jenis(kode, nama, satuan, poin_per_satuan, uraian, perlu_hasil, perlu_tinjau, langkah_bawaan, urut, aktif, dicatat_oleh, kertas_kerja, skor_status, skor_alasan, diusulkan_oleh)
  values (v_kode, v_nama, v_sat, v_pps, v_ura, false, false, '[]'::jsonb, 900, false, p_akun, v_kk, 'usulan', v_alasan, p_akun) returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);
  for w in select distinct t.akun_id from keu_penugasan t where t.peran_kode = 'KETUA' and t.dibatalkan_at is null and t.masa @> current_date loop
    perform keu_dlg_notif2(w, 'delegasi_skor', 'Usulan skor beban: ' || v_nama, v_pps || ' poin per ' || v_sat || ' dari ' || a.nama, '/sigap/delego/skor', p_akun);
  end loop;
  return jsonb_build_object('id', v_id, 'kode', v_kode, 'median', v_med, 'pembanding', coalesce(v_n, 0), 'rasio', v_rasio, 'peringatan', v_peringatan);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- p_putusan: setuju | tolak. Pada setuju, p_poin boleh mengubah skor (alasan wajib).
create or replace function keu_dlg_skor_putus(p_id bigint, p_putusan text, p_poin numeric default null, p_alasan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare j keu_dlg_jenis; v_alasan text := btrim(coalesce(p_alasan, '')); v_pps numeric;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) then raise exception 'Hanya pemberi delegasi tingkat tim yang memutuskan skor' using errcode = '42501'; end if;
  if p_putusan not in ('setuju','tolak') then raise exception 'Putusan harus setuju atau tolak' using errcode = '22023'; end if;
  select * into j from keu_dlg_jenis where id = p_id for update;
  if not found then raise exception 'Jenis pekerjaan % tidak ada', p_id using errcode = '23514'; end if;
  if j.skor_status <> 'usulan' then raise exception 'Skor ini berstatus %, bukan usulan', j.skor_status using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  if p_putusan = 'tolak' then
    if char_length(v_alasan) < 5 then raise exception 'Alasan penolakan minimal 5 huruf' using errcode = '23514'; end if;
    update keu_dlg_jenis set skor_status = 'ditolak', aktif = false, disetujui_oleh = p_akun, disetujui_at = now(), skor_alasan = left(skor_alasan || ' | Ditolak: ' || v_alasan, 300), diubah_at = now() where id = j.id;
  else
    v_pps := coalesce(p_poin, j.poin_per_satuan);
    if v_pps <= 0 or v_pps > 1000 then raise exception 'Skor harus lebih dari 0 dan paling banyak 1000' using errcode = '23514'; end if;
    if v_pps <> j.poin_per_satuan and char_length(v_alasan) < 5 then raise exception 'Perubahan skor wajib beralasan (minimal 5 huruf)' using errcode = '23514'; end if;
    update keu_dlg_jenis set skor_status = 'disetujui', aktif = true, poin_per_satuan = v_pps, disetujui_oleh = p_akun, disetujui_at = now(),
           skor_alasan = case when v_pps <> j.poin_per_satuan then left(skor_alasan || ' | Diubah Ketua Tim: ' || v_alasan, 300) else skor_alasan end, diubah_at = now() where id = j.id;
  end if;
  perform set_config('keu.via_fungsi', '', true);
  perform keu_dlg_notif2(j.diusulkan_oleh, 'delegasi_skor', case when p_putusan = 'setuju' then 'Skor disetujui: ' else 'Skor ditolak: ' end || j.nama, v_alasan, '/sigap/delego/skor', p_akun);
  return jsonb_build_object('id', j.id, 'putusan', p_putusan);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- 12. Ketersediaan (cuti, izin, sakit, dinas luar)
-- ---------------------------------------------------------------------
-- p_data: { akun? (hanya pemberi tingkat tim yang boleh untuk orang lain), jenis, mulai, selesai?, fraksi? (0,5 hanya untuk satu hari), catatan? }
create or replace function keu_dlg_ketersediaan_catat(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_akun bigint; v_jenis text; v_mulai date; v_selesai date; v_fraksi numeric; v_cat text; v_id bigint; v_semua boolean; v_status text; w bigint; a sigap_akun;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian harus objek JSON' using errcode = '22023'; end if;
  v_semua := coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false);
  v_akun := coalesce(nullif(p_data ->> 'akun', '')::bigint, p_akun);
  if v_akun <> p_akun and not v_semua then raise exception 'Hanya pemberi tingkat tim yang mencatat ketersediaan orang lain' using errcode = '42501'; end if;
  select * into a from sigap_akun where id = v_akun and aktif;
  if not found then raise exception 'Akun % tidak aktif', v_akun using errcode = '23514'; end if;
  v_jenis := coalesce(p_data ->> 'jenis', '');
  if v_jenis not in ('cuti','izin','sakit','dinas_luar','lainnya') then raise exception 'Jenis harus cuti, izin, sakit, dinas_luar, atau lainnya' using errcode = '23514'; end if;
  v_mulai := nullif(p_data ->> 'mulai', '')::date;
  if v_mulai is null then raise exception 'Tanggal mulai wajib diisi' using errcode = '23514'; end if;
  v_selesai := coalesce(nullif(p_data ->> 'selesai', '')::date, v_mulai);
  if v_selesai < v_mulai or v_selesai - v_mulai > 120 then raise exception 'Rentang tanggal tidak sah (paling lama 120 hari)' using errcode = '23514'; end if;
  v_fraksi := coalesce(nullif(p_data ->> 'fraksi', '')::numeric, 1);
  if v_fraksi <= 0 or v_fraksi > 1 or (v_fraksi <> 1 and v_mulai <> v_selesai) then raise exception 'Fraksi 0,5 hanya untuk satu hari; selain itu 1' using errcode = '23514'; end if;
  v_cat := left(btrim(coalesce(p_data ->> 'catatan', '')), 200);
  v_status := case when v_semua then 'disetujui' else 'diajukan' end;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_ketersediaan(akun_id, jenis, mulai, selesai, fraksi, catatan, status, diajukan_oleh, diputus_oleh, diputus_at)
  values (v_akun, v_jenis, v_mulai, v_selesai, v_fraksi, v_cat, v_status, p_akun, case when v_semua then p_akun end, case when v_semua then now() end) returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);
  if v_status = 'diajukan' then
    for w in select distinct t.akun_id from keu_penugasan t where t.peran_kode in ('KETUA','KPA') and t.dibatalkan_at is null and t.masa @> current_date loop
      perform keu_dlg_notif2(w, 'delegasi_ketersediaan', a.nama || ' mengajukan ' || replace(v_jenis, '_', ' '), v_mulai || ' sampai ' || v_selesai, '/sigap/delego/beban', p_akun);
    end loop;
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

create or replace function keu_dlg_ketersediaan_putus(p_id bigint, p_putusan text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare k keu_dlg_ketersediaan;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) then raise exception 'Hanya pemberi tingkat tim yang memutuskan ketersediaan' using errcode = '42501'; end if;
  if p_putusan not in ('setuju','tolak') then raise exception 'Putusan harus setuju atau tolak' using errcode = '22023'; end if;
  select * into k from keu_dlg_ketersediaan where id = p_id for update;
  if not found then raise exception 'Ketersediaan % tidak ada', p_id using errcode = '23514'; end if;
  if k.status <> 'diajukan' then raise exception 'Pengajuan ini sudah %', k.status using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_ketersediaan set status = case when p_putusan = 'setuju' then 'disetujui' else 'ditolak' end, diputus_oleh = p_akun, diputus_at = now() where id = k.id;
  perform set_config('keu.via_fungsi', '', true);
  perform keu_dlg_notif2(k.akun_id, 'delegasi_ketersediaan', case when p_putusan = 'setuju' then 'Pengajuan disetujui' else 'Pengajuan ditolak' end, k.mulai || ' sampai ' || k.selesai, '/sigap/delego/saya', p_akun);
  return jsonb_build_object('id', k.id, 'putusan', p_putusan);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- 13a. Jam kerja nyata pada laporan (bahan kalibrasi skor; tidak mengubah poin)
-- ---------------------------------------------------------------------
create or replace function keu_dlg_menit_nyata(p_laporan bigint, p_menit integer, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare l keu_dlg_laporan; d keu_dlg_delegasi;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into l from keu_dlg_laporan where id = p_laporan for update;
  if not found then raise exception 'Laporan % tidak ada', p_laporan using errcode = '23514'; end if;
  select * into d from keu_dlg_delegasi where id = l.delegasi_id;
  if p_akun <> d.penerima_akun and p_akun <> l.dikirim_oleh then raise exception 'Hanya pelapor yang mengisi jam kerja nyata' using errcode = '42501'; end if;
  if p_menit is not null and (p_menit < 1 or p_menit > 1440) then raise exception 'Jam kerja nyata 1 sampai 1440 menit' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_laporan set menit_nyata = p_menit where id = l.id;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', l.id, 'menit_nyata', p_menit);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- 13. Membaca
-- ---------------------------------------------------------------------
-- Bahan tinjau: antrean laporan yang dapat saya tinjau, laporan perlu revisi, usulan pegawai, sanggahan, dan bahan saya sebagai pegawai.
create or replace function keu_dlg_tinjau_bahan(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); v_putus boolean; v_beri boolean; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  v_putus := keu_dlg_putus_ok(p_akun);
  v_beri := coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false);
  with lp as (
    select l.id, l.delegasi_id, l.tanggal, l.poin, l.uraian, l.kendala, l.bukti, l.jumlah, l.menit_nyata, l.dikirim_at, l.tinjau_status, l.tinjau_alasan, l.mewakili,
           d.judul, d.ro_kode, d.satuan, d.poin_per_satuan, d.target_total, d.target_harian, d.tenggat, d.penerima_akun, d.dibuat_oleh as pemberi_akun, d.kegiatan_id,
           a.nama as penerima_nama, k.nama as kegiatan_nama,
           keu_dlg_hk_lewat((l.dikirim_at at time zone 'Asia/Jakarta')::date, v_hari) as hk_lewat,
           (select coalesce(sum(x.poin), 0) from keu_dlg_laporan x where x.delegasi_id = d.id) as poin_total
      from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id join sigap_akun a on a.id = d.penerima_akun left join sigap_kegiatan k on k.id = d.kegiatan_id
     where l.tinjau_status in ('menunggu','ditolak') and l.tanggal >= v_hari - 120 and keu_dlg_boleh_tinjau(p_akun, d.id)
  ), us as (
    select d.id, d.judul, d.uraian, d.ro_kode, d.satuan, d.poin_per_satuan, d.target_total, d.target_harian, d.mulai, d.tenggat, d.penerima_akun, d.usulan_oleh, d.usulan_at,
           d.kegiatan_id, d.kelas, d.skor_alasan, d.hari_kerja, a.nama as penerima_nama, k.nama as kegiatan_nama,
           keu_dlg_hk_lewat((d.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) as hk_lewat
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_kegiatan k on k.id = d.kegiatan_id
     where d.status = 'usulan' and keu_dlg_beri(p_akun, d.ro_kode) and (d.usulan_oleh <> p_akun or v_putus)
  ), sg as (
    select s.id, s.laporan_id, s.delegasi_id, s.alasan, s.bukti, s.diajukan_oleh, s.diajukan_at, s.batas_jawab, s.jawaban, s.jawaban_bukti, s.dijawab_at, s.status, s.putusan,
           s.poin_diakui, s.catatan_putusan, s.diputus_at, pj.nama as pengaju_nama, a.nama as penerima_nama, d.penerima_akun, d.judul, d.ro_kode, d.satuan,
           l.tanggal, l.poin, l.uraian, l.kendala, l.bukti as bukti_laporan, l.jumlah
      from keu_dlg_sanggah s join keu_dlg_delegasi d on d.id = s.delegasi_id join keu_dlg_laporan l on l.id = s.laporan_id
           join sigap_akun a on a.id = d.penerima_akun join sigap_akun pj on pj.id = s.diajukan_oleh
     where (v_putus or d.penerima_akun = p_akun or keu_dlg_boleh_tinjau(p_akun, d.id)) and (s.status <> 'diputus' or s.diputus_at > now() - interval '60 days')
  )
  select jsonb_build_object(
    'hari_ini', v_hari, 'pemutus', v_putus, 'beri', v_beri,
    'antrean', (select coalesce(jsonb_agg(to_jsonb(lp) order by lp.dikirim_at), '[]'::jsonb) from lp where lp.tinjau_status = 'menunggu'),
    'revisi',  (select coalesce(jsonb_agg(to_jsonb(lp) order by lp.dikirim_at), '[]'::jsonb) from lp where lp.tinjau_status = 'ditolak'),
    'usulan',  (select coalesce(jsonb_agg(to_jsonb(us) order by us.usulan_at), '[]'::jsonb) from us),
    'sanggah', (select coalesce(jsonb_agg(to_jsonb(sg) order by (sg.status = 'diputus'), sg.diajukan_at desc), '[]'::jsonb) from sg),
    'saya', jsonb_build_object(
      'usulan', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'judul', d.judul, 'status', d.status, 'ro_kode', d.ro_kode, 'kegiatan_id', d.kegiatan_id, 'kegiatan_nama', k.nama,
                    'satuan', d.satuan, 'poin_per_satuan', d.poin_per_satuan, 'target_total', d.target_total, 'tenggat', d.tenggat, 'usulan_at', d.usulan_at,
                    'alasan', d.alasan, 'usulan_catatan', d.usulan_catatan) order by d.id desc), '[]'::jsonb)
                   from keu_dlg_delegasi d left join sigap_kegiatan k on k.id = d.kegiatan_id
                  where d.usulan_oleh = p_akun and (d.status = 'usulan' or (d.status = 'batal' and d.usulan_putus_at > now() - interval '30 days'))),
      'laporan', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'delegasi_id', l.delegasi_id, 'tanggal', l.tanggal, 'poin', l.poin, 'tinjau_status', l.tinjau_status,
                    'tinjau_alasan', l.tinjau_alasan, 'poin_diakui', l.poin_diakui) order by l.tanggal desc, l.id desc), '[]'::jsonb)
                   from (select x.* from keu_dlg_laporan x join keu_dlg_delegasi d on d.id = x.delegasi_id where d.penerima_akun = p_akun and x.tanggal >= v_hari - 60
                          order by x.tanggal desc, x.id desc limit 80) l),
      'skor', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'nama', j.nama, 'satuan', j.satuan, 'poin_per_satuan', j.poin_per_satuan, 'skor_status', j.skor_status,
                    'skor_alasan', j.skor_alasan) order by j.id desc), '[]'::jsonb) from keu_dlg_jenis j where j.diusulkan_oleh = p_akun)
    )
  ) into r;
  return r;
end $$;

-- Katalog skor beserta pilihan untuk layar Catat pekerjaan (kegiatan SIGAP yang punya kode RO, kelompok Pekerjaan kantor).
create or replace function keu_dlg_katalog_skor(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); v_beri boolean; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  v_beri := coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false);
  select jsonb_build_object(
    'hari_ini', v_hari, 'boleh_putus', v_beri,
    'jenis', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'kode', j.kode, 'nama', j.nama, 'satuan', j.satuan, 'poin_per_satuan', j.poin_per_satuan, 'uraian', j.uraian,
                  'aktif', j.aktif, 'skor_status', j.skor_status, 'skor_alasan', j.skor_alasan, 'kertas_kerja', j.kertas_kerja, 'diusulkan_oleh', j.diusulkan_oleh,
                  'diusulkan_nama', u.nama, 'urut', j.urut) order by j.skor_status desc, j.urut, j.id), '[]'::jsonb)
               from keu_dlg_jenis j left join sigap_akun u on u.id = j.diusulkan_oleh
              where (j.skor_status = 'disetujui' and (j.aktif or v_beri)) or (j.skor_status in ('usulan','ditolak') and (j.diusulkan_oleh = p_akun or v_beri))),
    'kegiatan', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'nama', k.nama, 'jenis', k.jenis, 'ro_kode', keu_dlg_ro_kegiatan(k.id),
                  'tanggal_mulai', k.tanggal_mulai, 'tanggal_selesai', k.tanggal_selesai) order by k.tanggal_mulai nulls last, k.id), '[]'::jsonb)
               from sigap_kegiatan k where k.aktif and keu_dlg_ro_kegiatan(k.id) is not null and coalesce(k.tanggal_selesai, v_hari) >= v_hari - 30),
    'kelompok', (select coalesce(jsonb_agg(jsonb_build_object('kode', z.kode, 'nama', z.nama) order by z.urut, z.kode), '[]'::jsonb) from keu_dlg_kelompok z where z.aktif)
  ) into r;
  return r;
end $$;

-- Rekap beban dari sumber selain delegasi: hari kerja terpilih (pendataan), hari pelatihan, dan ketersediaan; untuk matriks beban kantor.
create or replace function keu_dlg_rekap(p_dari date default null, p_sampai date default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); v_dari date; v_sampai date; v_semua boolean; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  v_semua := coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) or coalesce(keu_boleh(p_akun, 'delegasi_lihat', null), false);
  -- pegawai tanpa wewenang tim hanya melihat barisnya sendiri (tampilan Pekerjaan saya); pemberi/pelihat melihat lingkupnya
  v_dari := coalesce(p_dari, v_hari - (extract(isodow from v_hari)::int - 1));
  v_sampai := coalesce(p_sampai, v_dari + 6);
  if v_sampai < v_dari or v_sampai - v_dari > 62 then raise exception 'Rentang tanggal 1 sampai 63 hari' using errcode = '23514'; end if;
  with orang as (
    select a.id, a.nama, a.jenis from sigap_akun a
     where a.aktif and a.jenis = 'organik' and (v_semua or a.id = p_akun or a.id in (select z.penerima_akun from keu_dlg_lingkup(p_akun, null, null) z))
  ), lap as (
    select p.akun_id as akun, h.tanggal, k.id as kid, k.nama as knama, k.jenis as kjenis, p.peran
      from sigap_hari_kerja h join sigap_penugasan p on p.id = h.penugasan_id join sigap_kegiatan k on k.id = p.kegiatan_id
     where h.batal_at is null and p.aktif and k.aktif and k.jenis <> 'pelatihan' and h.tanggal between v_dari and v_sampai and p.akun_id in (select id from orang)
    union all
    select p.akun_id, g::date, k.id, k.nama, k.jenis, p.peran
      from sigap_penugasan p join sigap_kegiatan k on k.id = p.kegiatan_id
           cross join lateral generate_series(greatest(coalesce(k.tanggal_mulai, v_dari), v_dari)::timestamp, least(coalesce(k.tanggal_selesai, v_dari - 1), v_sampai)::timestamp, interval '1 day') g
     where p.aktif and k.aktif and k.jenis = 'pelatihan' and p.akun_id in (select id from orang) and extract(isodow from g) <= 5
  )
  select jsonb_build_object(
    'hari_ini', v_hari, 'dari', v_dari, 'sampai', v_sampai,
    'orang', (select coalesce(jsonb_agg(jsonb_build_object('akun', o.id, 'nama', o.nama, 'jenis', o.jenis) order by o.nama), '[]'::jsonb) from orang o),
    'lapangan', (select coalesce(jsonb_agg(jsonb_build_object('akun', x.akun, 'tanggal', x.tanggal, 'kegiatan_id', x.kid, 'kegiatan', x.knama, 'jenis', x.kjenis, 'peran', x.peran)
                  order by x.akun, x.tanggal), '[]'::jsonb) from lap x),
    'ketersediaan', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'akun', t.akun_id, 'jenis', t.jenis, 'mulai', t.mulai, 'selesai', t.selesai, 'fraksi', t.fraksi,
                       'status', t.status, 'catatan', t.catatan) order by t.mulai), '[]'::jsonb)
                     from keu_dlg_ketersediaan t where t.status in ('disetujui','diajukan') and t.mulai <= v_sampai and t.selesai >= v_dari and t.akun_id in (select id from orang))
  ) into r;
  return r;
end $$;

-- Monitoring Kepala: tiga angka capaian per pegawai, antrean tinjau per pemberi, hambatan, ketepatan waktu, dan sanggahan terbuka.
create or replace function keu_dlg_monitor(p_dari date default null, p_sampai date default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); v_dari date; v_sampai date; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not exists (select 1 from keu_dlg_lingkup(p_akun, null, null) limit 1) and not coalesce(keu_boleh(p_akun, 'delegasi_lihat', null), false)
     and not coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) then
    raise exception 'Akun % tidak berwenang melihat monitoring', p_akun using errcode = '42501';
  end if;
  v_dari := coalesce(p_dari, date_trunc('month', v_hari)::date);
  v_sampai := coalesce(p_sampai, v_hari);
  if v_sampai < v_dari or v_sampai - v_dari > 400 then raise exception 'Rentang tanggal tidak sah' using errcode = '23514'; end if;
  with dl as (select d.* from keu_dlg_lingkup(p_akun, null, null) d),
  lap as (select l.*, d.penerima_akun, d.dibuat_oleh as pemberi from keu_dlg_laporan l join dl d on d.id = l.delegasi_id where l.tanggal between v_dari and v_sampai),
  cap as (
    select lap.penerima_akun as akun, coalesce(sum(lap.poin), 0) as mandiri,
           coalesce(sum(case when lap.tinjau_status = 'disetujui' then coalesce(lap.poin_diakui, lap.poin) else 0 end), 0) as terverifikasi,
           coalesce(sum(case when lap.tinjau_status = 'disanggah' then lap.poin else 0 end), 0) as disanggah,
           coalesce(sum(case when lap.tinjau_status in ('menunggu','ditolak') then lap.poin else 0 end), 0) as belum,
           coalesce(sum(case when lap.tinjau_status = 'tidak_diakui' then lap.poin else 0 end), 0) as tidak_diakui,
           coalesce(sum(case when lap.tinjau_status = 'disetujui' and lap.poin_diakui is not null then lap.poin - lap.poin_diakui else 0 end), 0) as dikoreksi,
           count(*) as n_laporan
      from lap group by lap.penerima_akun
  ), tunggu as (
    select d.dibuat_oleh as akun, count(*) filter (where l.tinjau_status = 'menunggu') as menunggu,
           count(*) filter (where l.tinjau_status = 'menunggu' and keu_dlg_hk_lewat((l.dikirim_at at time zone 'Asia/Jakarta')::date, v_hari) > 3) as lewat3
      from keu_dlg_laporan l join dl d on d.id = l.delegasi_id where l.tinjau_status in ('menunggu','ditolak') group by d.dibuat_oleh
  ), sgh as (
    select s.diajukan_oleh as akun, count(*) as diajukan, count(*) filter (where s.putusan = 'benar') as ditolak
      from keu_dlg_sanggah s join dl d on d.id = s.delegasi_id group by s.diajukan_oleh
  ), peninjau as (
    select coalesce(t.akun, g.akun) as akun, coalesce(t.menunggu, 0) as menunggu, coalesce(t.lewat3, 0) as lewat3, coalesce(g.diajukan, 0) as sanggah_diajukan, coalesce(g.ditolak, 0) as sanggah_ditolak
      from tunggu t full join sgh g on g.akun = t.akun
  )
  select jsonb_build_object(
    'hari_ini', v_hari, 'dari', v_dari, 'sampai', v_sampai, 'pemutus', keu_dlg_putus_ok(p_akun),
    'capaian', (select coalesce(jsonb_agg(jsonb_build_object('akun', c.akun, 'nama', a.nama, 'mandiri', c.mandiri, 'terverifikasi', c.terverifikasi, 'disanggah', c.disanggah,
                  'belum', c.belum, 'tidak_diakui', c.tidak_diakui, 'dikoreksi', c.dikoreksi, 'n_laporan', c.n_laporan) order by a.nama), '[]'::jsonb)
                from cap c join sigap_akun a on a.id = c.akun),
    'peninjau', (select coalesce(jsonb_agg(jsonb_build_object('akun', p.akun, 'nama', a.nama, 'menunggu', p.menunggu, 'lewat3', p.lewat3, 'sanggah_diajukan', p.sanggah_diajukan,
                  'sanggah_ditolak', p.sanggah_ditolak) order by a.nama), '[]'::jsonb)
                from peninjau p join sigap_akun a on a.id = p.akun),
    'terhalang', (select coalesce(jsonb_agg(jsonb_build_object('oleh', z.terhalang_oleh, 'jumlah', z.n) order by z.n desc), '[]'::jsonb)
                  from (select d.terhalang_oleh, count(*) as n from dl d where d.status in ('baru','berjalan') and d.terhalang_oleh is not null group by d.terhalang_oleh) z),
    'tepat_waktu', (select jsonb_build_object('selesai', count(*), 'tepat', count(*) filter (where (d.diubah_at at time zone 'Asia/Jakarta')::date <= d.tenggat))
                    from dl d where d.status = 'selesai' and (d.diubah_at at time zone 'Asia/Jakarta')::date between v_dari and v_sampai),
    'usulan', (select jsonb_build_object('menunggu', count(*), 'lewat3', count(*) filter (where keu_dlg_hk_lewat((d.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) > 3))
               from dl d where d.status = 'usulan'),
    'sanggah', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'penerima_akun', d.penerima_akun, 'penerima_nama', a.nama, 'judul', d.judul, 'ro_kode', d.ro_kode,
                  'tanggal', l.tanggal, 'poin', l.poin, 'uraian', l.uraian, 'alasan', s.alasan, 'pengaju_nama', pj.nama, 'diajukan_at', s.diajukan_at, 'batas_jawab', s.batas_jawab,
                  'jawaban', s.jawaban, 'dijawab_at', s.dijawab_at, 'putusan', s.putusan, 'poin_diakui', s.poin_diakui, 'catatan_putusan', s.catatan_putusan)
                  order by (s.status = 'diputus'), s.diajukan_at desc), '[]'::jsonb)
                from keu_dlg_sanggah s join dl d on d.id = s.delegasi_id join keu_dlg_laporan l on l.id = s.laporan_id join sigap_akun a on a.id = d.penerima_akun
                     join sigap_akun pj on pj.id = s.diajukan_oleh
               where s.status <> 'diputus' or s.diputus_at > now() - interval '60 days')
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 14. Hak eksekusi dan izin gerbang (daftar izin dibaca dari definisi keu_jalankan YANG ADA SAAT INI, hanya menambah)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'keu\_dlg\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

do $$
declare d text; v_baru text := '''keu_dlg_usul'',''keu_dlg_usul_putus'',''keu_dlg_tinjau'',''keu_dlg_sanggah_jawab'',''keu_dlg_sanggah_putus'',''keu_dlg_terhalang'',''keu_dlg_skor_ajukan'',''keu_dlg_skor_putus'',''keu_dlg_ketersediaan_catat'',''keu_dlg_ketersediaan_putus'',''keu_dlg_menit_nyata'',''keu_dlg_tinjau_bahan'',''keu_dlg_katalog_skor'',''keu_dlg_rekap'',''keu_dlg_monitor'',';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_dlg_tinjau_bahan''' in d) = 0 then
    d := replace(d, '''keu_dlg_hasil_serah'',', '''keu_dlg_hasil_serah'',' || v_baru);
    if position('''keu_dlg_tinjau_bahan''' in d) = 0 then raise exception 'Penambahan izin gagal: jalankan 20261026i dulu'; end if;
    execute d;
  end if;
end $$;
