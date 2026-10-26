-- =====================================================================
-- 20261026c_keu_delego.sql
-- SIGAP - Tahap 37: modul DELEGO (delegasi pekerjaan, laporan harian, manajemen tim, pembinaan).
-- Bergantung pada za, zc (identifikasi), zf (lanjutan), 20261025zj (penugasan), 20261026a/b. Aman diulang. Tanpa DELETE/DROP TABLE.
--
-- Struktur (keputusan pengguna): Ketua Tim mendelegasikan LANGSUNG kepada wakil, pegawai, PML, dan PPL (setara, tanpa perantara).
-- "PJ bidang" hanyalah isian peran pada sebuah delegasi, bukan jenjang. Satu baris delegasi = satu penerima.
--
-- Isi:
--  1. Kewenangan baru: delegasi_beri (KETUA, ADMIN) dan delegasi_lihat (KETUA, ADMINRO, PPK, KPA, ADMIN), diperiksa per RO lewat keu_boleh.
--  2. Jenis notifikasi baru (lonceng yang sudah ada): delegasi_baru, delegasi_ubah, delegasi_tanggapan, delegasi_pembinaan, delegasi_penghargaan.
--  3. Tabel: keu_dlg_delegasi, keu_dlg_laporan (satu per delegasi per tanggal), keu_dlg_tanggapan, keu_dlg_pembinaan,
--     keu_dlg_penghargaan, keu_dlg_penilaian. Jejak perubahan lewat trigger keu_jejak (sigap_audit); tidak ada hapus.
--  4. Fungsi tulis: keu_dlg_buat, keu_dlg_ubah, keu_dlg_terima, keu_dlg_lapor, keu_dlg_tanggapi, keu_dlg_bina, keu_dlg_bina_tutup,
--     keu_dlg_hargai, keu_dlg_nilai. Fungsi baca (jsonb): keu_dlg_hak, keu_dlg_saya, keu_dlg_bahan, keu_dlg_calon.
--  5. Semua fungsi dimasukkan ke daftar izin keu_jalankan.
--
-- Asumsi yang bisa diubah (cek aturan): kapasitas 60 poin per orang per hari, hari kerja Senin-Jumat (tanpa kalender libur),
-- laporan susulan paling lama 7 hari (lewat itu hanya pemberi), batas lapor 23:59 WIB. Sistem hanya mencatat dan menyarankan;
-- sanksi formal tetap oleh pejabat berwenang. PML boleh melapor mewakili mitra pada RO yang sama (ditandai "mewakili").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kewenangan
-- ---------------------------------------------------------------------
insert into keu_master_kewenangan(kode, nama, ket, pemberi_kode, urut, aktif) values
  ('delegasi_beri',  'Mendelegasikan pekerjaan', 'Membuat dan mengubah delegasi, menanggapi laporan, mencatat pembinaan, penghargaan, dan penilaian (Delego).', null, 94, true),
  ('delegasi_lihat', 'Melihat delegasi tim',     'Melihat papan, laporan tim, beban kerja, dan pembinaan (Delego), tanpa mengubah.', null, 95, true)
on conflict do nothing;

insert into keu_master_kewenangan_peran(kewenangan_kode, peran_kode, perlu_pemberian, ket) values
  ('delegasi_beri',  'KETUA',   false, 'Ketua Tim, per RO'),
  ('delegasi_beri',  'ADMIN',   false, 'Admin'),
  ('delegasi_lihat', 'KETUA',   false, ''),
  ('delegasi_lihat', 'ADMINRO', false, ''),
  ('delegasi_lihat', 'PPK',     false, ''),
  ('delegasi_lihat', 'KPA',     false, ''),
  ('delegasi_lihat', 'ADMIN',   false, '')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Jenis notifikasi
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_notifikasi'::regclass and conname = 'keu_notifikasi_jenis_check'
                 and pg_get_constraintdef(oid) like '%delegasi_baru%') then
    alter table keu_notifikasi drop constraint if exists keu_notifikasi_jenis_check;
    alter table keu_notifikasi add constraint keu_notifikasi_jenis_check check (jenis = any (array[
      'ident_fix','ident_pasca_h15','nama_terisi','lembar_menunggu','pengecualian_diajukan','pengecualian_putus','penugasan_diterapkan','gap_keras','gap_akhir',
      'delegasi_baru','delegasi_ubah','delegasi_tanggapan','delegasi_pembinaan','delegasi_penghargaan']::text[]));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_dlg_delegasi (
  id             bigint generated always as identity primary key,
  tahun          smallint not null,
  ident_id       bigint references keu_ident(id),
  ro_kode        text not null check (char_length(ro_kode) between 3 and 40),
  judul          text not null check (char_length(judul) between 3 and 200),
  uraian         text not null default '' check (char_length(uraian) <= 1000),
  penerima_akun  bigint not null references sigap_akun(id),
  peran_penerima text not null check (peran_penerima in ('wakil','pegawai','pml','ppl')),
  pj_bidang      text not null default '' check (char_length(pj_bidang) <= 80),
  satuan         text not null default 'poin' check (char_length(satuan) between 1 and 30),
  target_total   numeric(12,2) check (target_total is null or target_total >= 0),
  target_harian  numeric(8,2) not null default 60 check (target_harian >= 0 and target_harian <= 1000),
  bobot          smallint not null default 1 check (bobot between 1 and 5),
  hari_kerja     smallint[] not null default array[1,2,3,4,5]::smallint[] check (cardinality(hari_kerja) between 1 and 7),
  mulai          date not null,
  tenggat        date not null,
  status         text not null default 'baru' check (status in ('baru','berjalan','selesai','ditunda','batal')),
  alasan         text not null default '' check (char_length(alasan) <= 300),
  ver            integer not null default 1,
  dibuat_oleh    bigint references sigap_akun(id),
  dibuat_at      timestamptz not null default now(),
  diubah_oleh    bigint references sigap_akun(id),
  diubah_at      timestamptz not null default now(),
  check (tenggat >= mulai)
);
create index if not exists keu_dlg_delegasi_penerima_idx on keu_dlg_delegasi(penerima_akun, status);
create index if not exists keu_dlg_delegasi_ro_idx on keu_dlg_delegasi(ro_kode, status);
create index if not exists keu_dlg_delegasi_ident_idx on keu_dlg_delegasi(ident_id);

create table if not exists keu_dlg_laporan (
  id           bigint generated always as identity primary key,
  delegasi_id  bigint not null references keu_dlg_delegasi(id),
  tanggal      date not null,
  poin         numeric(8,2) not null check (poin >= 0 and poin <= 1000),
  uraian       text not null default '' check (char_length(uraian) <= 1000),
  kendala      text not null default '' check (char_length(kendala) <= 500),
  bukti        jsonb not null default '[]'::jsonb check (jsonb_typeof(bukti) = 'array' and jsonb_array_length(bukti) <= 5),
  dikirim_oleh bigint references sigap_akun(id),
  mewakili     boolean not null default false,
  terlambat    boolean not null default false,
  dikirim_at   timestamptz not null default now(),
  diubah_at    timestamptz not null default now(),
  unique (delegasi_id, tanggal)
);
create index if not exists keu_dlg_laporan_tgl_idx on keu_dlg_laporan(tanggal);

create table if not exists keu_dlg_tanggapan (
  id          bigint generated always as identity primary key,
  delegasi_id bigint not null references keu_dlg_delegasi(id),
  laporan_id  bigint references keu_dlg_laporan(id),
  dari_akun   bigint not null references sigap_akun(id),
  isi         text not null check (char_length(isi) between 1 and 500),
  dibuat_at   timestamptz not null default now()
);
create index if not exists keu_dlg_tanggapan_idx on keu_dlg_tanggapan(delegasi_id, id);

create table if not exists keu_dlg_pembinaan (
  id            bigint generated always as identity primary key,
  penerima_akun bigint not null references sigap_akun(id),
  ro_kode       text not null check (char_length(ro_kode) between 3 and 40),
  delegasi_id   bigint references keu_dlg_delegasi(id),
  langkah       smallint not null check (langkah between 1 and 5),
  alasan        text not null check (char_length(alasan) between 5 and 500),
  tinjau        date,
  status        text not null default 'berjalan' check (status in ('berjalan','selesai','dibatalkan')),
  catatan_tutup text not null default '' check (char_length(catatan_tutup) <= 300),
  dicatat_oleh  bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now()
);
create index if not exists keu_dlg_pembinaan_idx on keu_dlg_pembinaan(penerima_akun, status);

create table if not exists keu_dlg_penghargaan (
  id            bigint generated always as identity primary key,
  penerima_akun bigint not null references sigap_akun(id),
  ro_kode       text not null check (char_length(ro_kode) between 3 and 40),
  delegasi_id   bigint references keu_dlg_delegasi(id),
  alasan        text not null check (char_length(alasan) between 5 and 300),
  dicatat_oleh  bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now()
);
create index if not exists keu_dlg_penghargaan_idx on keu_dlg_penghargaan(penerima_akun, id);

create table if not exists keu_dlg_penilaian (
  id            bigint generated always as identity primary key,
  penerima_akun bigint not null references sigap_akun(id),
  ro_kode       text not null check (char_length(ro_kode) between 3 and 40),
  periode       date not null,
  kualitas      smallint not null check (kualitas between 0 and 100),
  kepatuhan     smallint not null check (kepatuhan between 0 and 100),
  catatan       text not null default '' check (char_length(catatan) <= 300),
  dinilai_oleh  bigint not null references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  unique (penerima_akun, ro_kode, periode, dinilai_oleh)
);

do $$
declare t text;
begin
  foreach t in array array['keu_dlg_delegasi','keu_dlg_laporan','keu_dlg_tanggapan','keu_dlg_pembinaan','keu_dlg_penghargaan','keu_dlg_penilaian']
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
-- 4. Pembantu (tidak masuk daftar izin gerbang)
-- ---------------------------------------------------------------------
create or replace function keu_dlg_hari_ini() returns date language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

create or replace function keu_dlg_beri(p_akun bigint, p_ro text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(keu_boleh(p_akun, 'delegasi_beri', p_ro), false)
$$;

create or replace function keu_dlg_lihat(p_akun bigint, p_ro text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(keu_boleh(p_akun, 'delegasi_beri', p_ro), false) or coalesce(keu_boleh(p_akun, 'delegasi_lihat', p_ro), false)
$$;

-- PML aktif pada RO ini (punya delegasi berperan PML yang masih berjalan)
create or replace function keu_dlg_pml(p_akun bigint, p_ro text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from keu_dlg_delegasi d where d.penerima_akun = p_akun and d.peran_penerima = 'pml' and d.ro_kode = p_ro and d.status in ('baru','berjalan'))
$$;

create or replace function keu_dlg_hk(p jsonb) returns smallint[] language plpgsql immutable as $$
declare v smallint[];
begin
  if p is null or jsonb_typeof(p) = 'null' then return array[1,2,3,4,5]::smallint[]; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'Hari kerja harus larik angka 1 (Senin) sampai 7 (Minggu)' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}'::smallint[]) into v from jsonb_array_elements_text(p) x;
  if cardinality(v) = 0 or exists (select 1 from unnest(v) u where u not between 1 and 7) then
    raise exception 'Hari kerja harus berisi angka 1 (Senin) sampai 7 (Minggu), minimal satu hari' using errcode = '22023';
  end if;
  return v;
end $$;

create or replace function keu_dlg_notif(p_akun bigint, p_jenis text, p_ident bigint, p_judul text, p_isi text, p_pemicu bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_akun is null or p_akun = p_pemicu then return; end if;
  insert into keu_notifikasi(akun_id, jenis, ident_id, judul, isi, tautan, pemicu)
  values (p_akun, p_jenis, p_ident, left(p_judul, 200), left(coalesce(p_isi, ''), 1000), '/sigap/delego/saya', p_pemicu);
end $$;

create or replace function keu_dlg_lingkup(p_akun bigint, p_ident bigint, p_ro text) returns setof keu_dlg_delegasi
language sql stable security definer set search_path = public as $$
  select d.* from keu_dlg_delegasi d
   where (p_ident is null or d.ident_id = p_ident) and (p_ro is null or d.ro_kode = p_ro) and keu_dlg_lihat(p_akun, d.ro_kode)
$$;

-- ---------------------------------------------------------------------
-- 5. Menulis
-- ---------------------------------------------------------------------
-- p_data: { ident_id?, ro_kode? (wajib bila tanpa ident_id), judul, uraian?, satuan?, target_total?, target_harian?, bobot?, hari_kerja?[], mulai?, tenggat,
--           penerima: [ { akun, peran: wakil|pegawai|pml|ppl, pj_bidang? } ... ] }
create or replace function keu_dlg_buat(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; v_ident bigint; v_ro text; v_judul text; v_ura text; v_sat text; v_th numeric; v_tt numeric; v_bobot int; v_mulai date; v_tenggat date;
  v_hk smallint[]; r jsonb; v_akun bigint; v_peran text; v_pj text; a sigap_akun; v_ids bigint[] := '{}'; v_id bigint; v_hari date := keu_dlg_hari_ini(); v_pemberi text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian delegasi harus objek JSON' using errcode = '22023'; end if;
  v_ident := nullif(p_data ->> 'ident_id', '')::bigint;
  if v_ident is not null then
    select * into i from keu_ident where id = v_ident;
    if not found then raise exception 'Identifikasi % tidak ada', v_ident using errcode = '23514'; end if;
    if i.status = 'dibatalkan' or i.ver < 1 then raise exception 'Identifikasi belum disahkan atau sudah dibatalkan' using errcode = '23514'; end if;
    v_ro := i.ro_kode;
  else
    v_ro := btrim(coalesce(p_data ->> 'ro_kode', ''));
    if char_length(v_ro) < 3 then raise exception 'Kode RO wajib diisi bila tanpa identifikasi' using errcode = '23514'; end if;
  end if;
  if not keu_dlg_beri(p_akun, v_ro) then raise exception 'Akun % tidak berwenang mendelegasikan pekerjaan pada RO %', p_akun, v_ro using errcode = '42501'; end if;

  v_judul := btrim(coalesce(p_data ->> 'judul', ''));
  if char_length(v_judul) < 3 or char_length(v_judul) > 200 then raise exception 'Judul delegasi 3 sampai 200 huruf' using errcode = '23514'; end if;
  v_ura := btrim(coalesce(p_data ->> 'uraian', ''));
  if char_length(v_ura) > 1000 then raise exception 'Uraian maksimal 1000 huruf' using errcode = '23514'; end if;
  v_sat := coalesce(nullif(btrim(p_data ->> 'satuan'), ''), 'poin');
  v_th := coalesce(nullif(p_data ->> 'target_harian', '')::numeric, 60);
  v_tt := nullif(p_data ->> 'target_total', '')::numeric;
  v_bobot := coalesce(nullif(p_data ->> 'bobot', '')::int, 1);
  v_mulai := coalesce(nullif(p_data ->> 'mulai', '')::date, v_hari);
  v_tenggat := nullif(p_data ->> 'tenggat', '')::date;
  if v_tenggat is null then raise exception 'Tenggat wajib diisi' using errcode = '23514'; end if;
  if v_tenggat < v_mulai then raise exception 'Tenggat tidak boleh sebelum tanggal mulai' using errcode = '23514'; end if;
  if v_tenggat > v_mulai + 400 then raise exception 'Rentang delegasi maksimal 400 hari' using errcode = '23514'; end if;
  if v_th < 0 or v_th > 1000 then raise exception 'Target harian 0 sampai 1000' using errcode = '23514'; end if;
  if v_bobot not between 1 and 5 then raise exception 'Bobot 1 sampai 5' using errcode = '23514'; end if;
  v_hk := keu_dlg_hk(p_data -> 'hari_kerja');

  if jsonb_typeof(p_data -> 'penerima') is distinct from 'array' or jsonb_array_length(p_data -> 'penerima') not between 1 and 40 then
    raise exception 'Pilih 1 sampai 40 penerima' using errcode = '23514';
  end if;
  if (select count(distinct x ->> 'akun') from jsonb_array_elements(p_data -> 'penerima') x) <> jsonb_array_length(p_data -> 'penerima') then
    raise exception 'Satu penerima hanya boleh muncul sekali dalam satu pembuatan' using errcode = '23514';
  end if;
  select nama into v_pemberi from sigap_akun where id = p_akun;

  perform set_config('keu.via_fungsi', '1', true);
  for r in select * from jsonb_array_elements(p_data -> 'penerima') loop
    v_akun := nullif(r ->> 'akun', '')::bigint;
    v_peran := coalesce(r ->> 'peran', '');
    v_pj := left(btrim(coalesce(r ->> 'pj_bidang', '')), 80);
    select * into a from sigap_akun where id = v_akun and aktif;
    if not found then raise exception 'Penerima % tidak ditemukan atau tidak aktif', v_akun using errcode = '23514'; end if;
    if v_akun = p_akun then raise exception 'Pemberi tidak dapat mendelegasikan kepada dirinya sendiri' using errcode = '23514'; end if;
    if v_peran not in ('wakil','pegawai','pml','ppl') then raise exception 'Peran penerima harus wakil, pegawai, pml, atau ppl' using errcode = '23514'; end if;
    if a.jenis = 'mitra' and v_peran not in ('pml','ppl') then raise exception 'Mitra hanya dapat berperan PML atau PPL (%)', a.nama using errcode = '23514'; end if;
    insert into keu_dlg_delegasi(tahun, ident_id, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot,
                                 hari_kerja, mulai, tenggat, dibuat_oleh, diubah_oleh)
    values (extract(year from v_mulai)::smallint, v_ident, v_ro, v_judul, v_ura, v_akun, v_peran, v_pj, v_sat, v_tt, v_th, v_bobot, v_hk, v_mulai, v_tenggat, p_akun, p_akun)
    returning id into v_id;
    v_ids := v_ids || v_id;
    perform keu_dlg_notif(v_akun, 'delegasi_baru', v_ident, 'Delegasi baru: ' || v_judul,
      'Dari ' || coalesce(v_pemberi, 'Ketua Tim') || ', tenggat ' || to_char(v_tenggat, 'DD-MM-YYYY') || '. Buka Delego untuk melihat dan memulai.', p_akun);
  end loop;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('dibuat', to_jsonb(v_ids));
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- p_data (semua opsional): judul, uraian, pj_bidang, peran_penerima, target_total, target_harian, bobot, hari_kerja[], tenggat, status, alasan
create or replace function keu_dlg_ubah(p_id bigint, p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; n keu_dlg_delegasi; a sigap_akun;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian harus objek JSON' using errcode = '22023'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berwenang mengubah delegasi RO %', p_akun, d.ro_kode using errcode = '42501'; end if;
  n := d;
  if p_data ? 'judul' then n.judul := btrim(coalesce(p_data ->> 'judul', '')); end if;
  if p_data ? 'uraian' then n.uraian := btrim(coalesce(p_data ->> 'uraian', '')); end if;
  if p_data ? 'pj_bidang' then n.pj_bidang := left(btrim(coalesce(p_data ->> 'pj_bidang', '')), 80); end if;
  if p_data ? 'peran_penerima' then n.peran_penerima := coalesce(p_data ->> 'peran_penerima', ''); end if;
  if p_data ? 'target_total' then n.target_total := nullif(p_data ->> 'target_total', '')::numeric; end if;
  if p_data ? 'target_harian' then n.target_harian := coalesce(nullif(p_data ->> 'target_harian', '')::numeric, d.target_harian); end if;
  if p_data ? 'bobot' then n.bobot := coalesce(nullif(p_data ->> 'bobot', '')::int, d.bobot); end if;
  if p_data ? 'hari_kerja' then n.hari_kerja := keu_dlg_hk(p_data -> 'hari_kerja'); end if;
  if p_data ? 'tenggat' then n.tenggat := coalesce(nullif(p_data ->> 'tenggat', '')::date, d.tenggat); end if;
  if p_data ? 'status' then n.status := coalesce(p_data ->> 'status', ''); end if;
  if p_data ? 'alasan' then n.alasan := left(btrim(coalesce(p_data ->> 'alasan', '')), 300); end if;

  if char_length(n.judul) < 3 or char_length(n.judul) > 200 then raise exception 'Judul delegasi 3 sampai 200 huruf' using errcode = '23514'; end if;
  if char_length(n.uraian) > 1000 then raise exception 'Uraian maksimal 1000 huruf' using errcode = '23514'; end if;
  if n.peran_penerima not in ('wakil','pegawai','pml','ppl') then raise exception 'Peran penerima tidak sah' using errcode = '23514'; end if;
  select * into a from sigap_akun where id = n.penerima_akun;
  if a.jenis = 'mitra' and n.peran_penerima not in ('pml','ppl') then raise exception 'Mitra hanya dapat berperan PML atau PPL' using errcode = '23514'; end if;
  if n.target_harian < 0 or n.target_harian > 1000 then raise exception 'Target harian 0 sampai 1000' using errcode = '23514'; end if;
  if n.bobot not between 1 and 5 then raise exception 'Bobot 1 sampai 5' using errcode = '23514'; end if;
  if n.tenggat < n.mulai then raise exception 'Tenggat tidak boleh sebelum tanggal mulai' using errcode = '23514'; end if;
  if n.status not in ('baru','berjalan','selesai','ditunda','batal') then raise exception 'Status tidak sah' using errcode = '23514'; end if;
  if n.status in ('ditunda','batal') and n.status <> d.status and char_length(n.alasan) < 5 then
    raise exception 'Menunda atau membatalkan delegasi wajib disertai alasan (minimal 5 huruf)' using errcode = '23514';
  end if;
  if n is not distinct from d then return jsonb_build_object('hasil', 'tetap', 'ver', d.ver); end if;

  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_delegasi set judul = n.judul, uraian = n.uraian, pj_bidang = n.pj_bidang, peran_penerima = n.peran_penerima, target_total = n.target_total,
         target_harian = n.target_harian, bobot = n.bobot, hari_kerja = n.hari_kerja, tenggat = n.tenggat, status = n.status, alasan = n.alasan,
         ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now()
   where id = d.id;
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_ubah', d.ident_id, 'Delegasi diperbarui: ' || n.judul,
    case when n.status <> d.status then 'Status sekarang: ' || n.status || '. ' else '' end || 'Tenggat ' || to_char(n.tenggat, 'DD-MM-YYYY') || '.', p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('hasil', 'diubah', 'ver', d.ver + 1);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Penerima menerima delegasi: baru -> berjalan
create or replace function keu_dlg_terima(p_id bigint, p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if d.penerima_akun <> p_akun then raise exception 'Hanya penerima yang dapat menerima delegasi ini' using errcode = '42501'; end if;
  if d.status <> 'baru' then return d.status; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_delegasi set status = 'berjalan', ver = ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  perform set_config('keu.via_fungsi', '', true);
  return 'berjalan';
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Laporan harian: satu per delegasi per tanggal (mengirim lagi = memperbarui). Terlambat hanya DITANDAI, tidak diblokir.
create or replace function keu_dlg_lapor(p_delegasi bigint, p_tanggal date, p_poin numeric, p_uraian text default '', p_kendala text default '',
                                         p_bukti jsonb default '[]'::jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d keu_dlg_delegasi; l keu_dlg_laporan; v_hari date := keu_dlg_hari_ini(); v_tgl date := coalesce(p_tanggal, keu_dlg_hari_ini());
  v_pemberi boolean; v_wakil boolean; v_ura text := btrim(coalesce(p_uraian, '')); v_ken text := btrim(coalesce(p_kendala, '')); v_terlambat boolean; v_id bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_delegasi for update;
  if not found then raise exception 'Delegasi % tidak ada', p_delegasi using errcode = '23514'; end if;
  v_pemberi := keu_dlg_beri(p_akun, d.ro_kode);
  if p_akun = d.penerima_akun then v_wakil := false;
  elsif keu_dlg_pml(p_akun, d.ro_kode) and exists (select 1 from sigap_akun x where x.id = d.penerima_akun and x.jenis = 'mitra') then v_wakil := true;
  elsif v_pemberi then v_wakil := true;
  else raise exception 'Akun % tidak berhak melapor untuk delegasi ini', p_akun using errcode = '42501';
  end if;
  if d.status not in ('baru','berjalan') then raise exception 'Delegasi berstatus % tidak menerima laporan baru', d.status using errcode = '23514'; end if;
  if v_tgl > v_hari then raise exception 'Laporan tidak dapat dibuat untuk tanggal mendatang' using errcode = '23514'; end if;
  if v_tgl < d.mulai or v_tgl > d.tenggat then raise exception 'Tanggal di luar masa delegasi (% sampai %)', d.mulai, d.tenggat using errcode = '23514'; end if;
  if not v_pemberi and v_tgl < v_hari - 7 then raise exception 'Laporan susulan lebih dari 7 hari harus lewat pemberi delegasi' using errcode = '23514'; end if;
  if p_poin is null or p_poin < 0 or p_poin > 1000 then raise exception 'Poin 0 sampai 1000' using errcode = '23514'; end if;
  if char_length(v_ura) > 1000 then raise exception 'Uraian maksimal 1000 huruf' using errcode = '23514'; end if;
  if char_length(v_ken) > 500 then raise exception 'Kendala maksimal 500 huruf' using errcode = '23514'; end if;
  if p_bukti is null or jsonb_typeof(p_bukti) <> 'array' or jsonb_array_length(p_bukti) > 5 or char_length(p_bukti::text) > 3000 then
    raise exception 'Bukti harus larik paling banyak 5 butir' using errcode = '23514';
  end if;

  perform set_config('keu.via_fungsi', '1', true);
  select * into l from keu_dlg_laporan where delegasi_id = d.id and tanggal = v_tgl for update;
  if found then
    update keu_dlg_laporan set poin = p_poin, uraian = v_ura, kendala = v_ken, bukti = p_bukti, dikirim_oleh = p_akun, mewakili = v_wakil, diubah_at = now() where id = l.id;
    v_id := l.id; v_terlambat := l.terlambat;
  else
    v_terlambat := v_tgl < v_hari;
    insert into keu_dlg_laporan(delegasi_id, tanggal, poin, uraian, kendala, bukti, dikirim_oleh, mewakili, terlambat)
    values (d.id, v_tgl, p_poin, v_ura, v_ken, p_bukti, p_akun, v_wakil, v_terlambat) returning id into v_id;
  end if;
  if d.status = 'baru' then
    update keu_dlg_delegasi set status = 'berjalan', ver = ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', v_id, 'tanggal', v_tgl, 'terlambat', v_terlambat, 'mewakili', v_wakil);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Tanggapan atas delegasi atau laporan: pemberi, atau PML untuk mitra pada RO yang sama
create or replace function keu_dlg_tanggapi(p_delegasi bigint, p_isi text, p_laporan bigint default null, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; v_isi text := btrim(coalesce(p_isi, '')); v_id bigint; v_nama text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_delegasi;
  if not found then raise exception 'Delegasi % tidak ada', p_delegasi using errcode = '23514'; end if;
  if not (keu_dlg_beri(p_akun, d.ro_kode)
          or (keu_dlg_pml(p_akun, d.ro_kode) and exists (select 1 from sigap_akun x where x.id = d.penerima_akun and x.jenis = 'mitra'))) then
    raise exception 'Akun % tidak berwenang menanggapi delegasi ini', p_akun using errcode = '42501';
  end if;
  if char_length(v_isi) < 1 or char_length(v_isi) > 500 then raise exception 'Tanggapan 1 sampai 500 huruf' using errcode = '23514'; end if;
  if p_laporan is not null and not exists (select 1 from keu_dlg_laporan where id = p_laporan and delegasi_id = d.id) then
    raise exception 'Laporan bukan milik delegasi ini' using errcode = '23514';
  end if;
  select nama into v_nama from sigap_akun where id = p_akun;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_tanggapan(delegasi_id, laporan_id, dari_akun, isi) values (d.id, p_laporan, p_akun, v_isi) returning id into v_id;
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_tanggapan', d.ident_id, 'Tanggapan dari ' || coalesce(v_nama, 'pemberi delegasi'), left(v_isi, 300), p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Catatan pembinaan, tangga 1 pengingat, 2 catatan lisan, 3 percakapan tertulis, 4 rencana perbaikan, 5 rujuk ke pejabat berwenang (cek aturan)
create or replace function keu_dlg_bina(p_penerima bigint, p_ro text, p_langkah integer, p_alasan text, p_tinjau date default null, p_delegasi bigint default null,
                                        p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_al text := btrim(coalesce(p_alasan, '')); v_id bigint; d keu_dlg_delegasi;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_ro is null or not keu_dlg_beri(p_akun, p_ro) then raise exception 'Akun % tidak berwenang membina pada RO %', p_akun, p_ro using errcode = '42501'; end if;
  if p_penerima = p_akun then raise exception 'Pembinaan atas diri sendiri tidak dicatat di sini' using errcode = '23514'; end if;
  if not exists (select 1 from sigap_akun where id = p_penerima and aktif) then raise exception 'Penerima pembinaan tidak ditemukan atau tidak aktif' using errcode = '23514'; end if;
  if p_langkah is null or p_langkah not between 1 and 5 then raise exception 'Langkah pembinaan 1 sampai 5' using errcode = '23514'; end if;
  if char_length(v_al) < 5 or char_length(v_al) > 500 then raise exception 'Alasan 5 sampai 500 huruf' using errcode = '23514'; end if;
  if p_tinjau is not null and p_tinjau < keu_dlg_hari_ini() then raise exception 'Tanggal tinjau tidak boleh di masa lalu' using errcode = '23514'; end if;
  if p_delegasi is not null then
    select * into d from keu_dlg_delegasi where id = p_delegasi;
    if not found or d.penerima_akun <> p_penerima or d.ro_kode <> p_ro then raise exception 'Delegasi tidak sesuai dengan penerima dan RO' using errcode = '23514'; end if;
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_pembinaan(penerima_akun, ro_kode, delegasi_id, langkah, alasan, tinjau, dicatat_oleh)
  values (p_penerima, p_ro, p_delegasi, p_langkah, v_al, p_tinjau, p_akun) returning id into v_id;
  perform keu_dlg_notif(p_penerima, 'delegasi_pembinaan', null, 'Catatan pembinaan dari pemberi delegasi', 'Ada catatan tindak lanjut. Buka Delego untuk membacanya.', p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

create or replace function keu_dlg_bina_tutup(p_id bigint, p_status text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare b keu_dlg_pembinaan; v_cat text := left(btrim(coalesce(p_catatan, '')), 300);
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into b from keu_dlg_pembinaan where id = p_id for update;
  if not found then raise exception 'Catatan pembinaan % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, b.ro_kode) then raise exception 'Akun % tidak berwenang menutup pembinaan ini', p_akun using errcode = '42501'; end if;
  if p_status not in ('selesai','dibatalkan') then raise exception 'Status penutup harus selesai atau dibatalkan' using errcode = '23514'; end if;
  if b.status <> 'berjalan' then return b.status; end if;
  if p_status = 'dibatalkan' and char_length(v_cat) < 5 then raise exception 'Pembatalan wajib beralasan (minimal 5 huruf)' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_pembinaan set status = p_status, catatan_tutup = v_cat, diubah_at = now() where id = b.id;
  perform set_config('keu.via_fungsi', '', true);
  return p_status;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

create or replace function keu_dlg_hargai(p_penerima bigint, p_ro text, p_alasan text, p_delegasi bigint default null, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_al text := btrim(coalesce(p_alasan, '')); v_id bigint; d keu_dlg_delegasi;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_ro is null or not keu_dlg_beri(p_akun, p_ro) then raise exception 'Akun % tidak berwenang memberi penghargaan pada RO %', p_akun, p_ro using errcode = '42501'; end if;
  if p_penerima = p_akun then raise exception 'Penghargaan untuk diri sendiri tidak dicatat di sini' using errcode = '23514'; end if;
  if not exists (select 1 from sigap_akun where id = p_penerima and aktif) then raise exception 'Penerima penghargaan tidak ditemukan atau tidak aktif' using errcode = '23514'; end if;
  if char_length(v_al) < 5 or char_length(v_al) > 300 then raise exception 'Alasan 5 sampai 300 huruf' using errcode = '23514'; end if;
  if p_delegasi is not null then
    select * into d from keu_dlg_delegasi where id = p_delegasi;
    if not found or d.penerima_akun <> p_penerima or d.ro_kode <> p_ro then raise exception 'Delegasi tidak sesuai dengan penerima dan RO' using errcode = '23514'; end if;
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_penghargaan(penerima_akun, ro_kode, delegasi_id, alasan, dicatat_oleh) values (p_penerima, p_ro, p_delegasi, v_al, p_akun) returning id into v_id;
  perform keu_dlg_notif(p_penerima, 'delegasi_penghargaan', null, 'Penghargaan atas kinerja Anda', left(v_al, 300), p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Penilaian kualitas data dan kepatuhan prosedur (0-100) per bulan; pemberi, atau PML pada RO yang sama untuk penerima yang punya delegasi di RO itu
create or replace function keu_dlg_nilai(p_penerima bigint, p_ro text, p_periode date, p_kualitas integer, p_kepatuhan integer, p_catatan text default '',
                                         p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_per date := date_trunc('month', coalesce(p_periode, keu_dlg_hari_ini()))::date; v_cat text := left(btrim(coalesce(p_catatan, '')), 300); v_id bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_ro is null or not (keu_dlg_beri(p_akun, p_ro) or keu_dlg_pml(p_akun, p_ro)) then
    raise exception 'Akun % tidak berwenang menilai pada RO %', p_akun, p_ro using errcode = '42501';
  end if;
  if p_penerima = p_akun then raise exception 'Tidak dapat menilai diri sendiri' using errcode = '23514'; end if;
  if not exists (select 1 from keu_dlg_delegasi where penerima_akun = p_penerima and ro_kode = p_ro) then
    raise exception 'Penerima belum memiliki delegasi pada RO %', p_ro using errcode = '23514';
  end if;
  if p_kualitas is null or p_kualitas not between 0 and 100 or p_kepatuhan is null or p_kepatuhan not between 0 and 100 then
    raise exception 'Nilai 0 sampai 100' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_penilaian(penerima_akun, ro_kode, periode, kualitas, kepatuhan, catatan, dinilai_oleh)
  values (p_penerima, p_ro, v_per, p_kualitas, p_kepatuhan, v_cat, p_akun)
  on conflict (penerima_akun, ro_kode, periode, dinilai_oleh)
  do update set kualitas = excluded.kualitas, kepatuhan = excluded.kepatuhan, catatan = excluded.catatan, diubah_at = now()
  returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- 6. Membaca (jsonb; dipanggil lewat gerbang, juga aman untuk mode masuk-sebagai)
-- ---------------------------------------------------------------------
-- Hak akun ini di Delego: RO yang boleh diberi/dilihat, apakah punya tugas, daftar identifikasi sah yang dapat dijadikan asal delegasi.
create or replace function keu_dlg_hak(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_semua boolean; v_beri text[]; v_lihat text[]; v_pml text[]; v_ident jsonb; a sigap_akun;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into a from sigap_akun where id = p_akun;
  v_semua := coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false);
  if v_semua then
    select coalesce(array_agg(distinct ro_kode order by ro_kode), '{}') into v_beri from keu_ident;
  else
    select coalesce(array_agg(distinct t.ro_kode order by t.ro_kode), '{}') into v_beri from keu_penugasan t
     where t.akun_id = p_akun and t.ro_kode is not null and t.dibatalkan_at is null and t.masa @> current_date and keu_dlg_beri(p_akun, t.ro_kode);
  end if;
  select coalesce(array_agg(distinct x.ro_kode order by x.ro_kode), '{}') into v_lihat from (
    select t.ro_kode from keu_penugasan t where t.akun_id = p_akun and t.ro_kode is not null and t.dibatalkan_at is null and t.masa @> current_date and keu_dlg_lihat(p_akun, t.ro_kode)
    union select unnest(v_beri)
  ) x;
  select coalesce(array_agg(distinct d.ro_kode order by d.ro_kode), '{}') into v_pml from keu_dlg_delegasi d
   where d.penerima_akun = p_akun and d.peran_penerima = 'pml' and d.status in ('baru','berjalan');
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nama', i.nama, 'ro_kode', i.ro_kode, 'tahun', i.tahun,
           'lanjutan_final', exists (select 1 from keu_ident_lanjutan l where l.ident_id = i.id and l.status = 'final')) order by i.ro_kode, i.id), '[]'::jsonb)
    into v_ident from keu_ident i where i.status = 'sah' and (v_semua or i.ro_kode = any (v_beri));
  return jsonb_build_object(
    'akun', jsonb_build_object('id', a.id, 'nama', a.nama, 'jenis', a.jenis),
    'hari_ini', keu_dlg_hari_ini(), 'semua', v_semua, 'beri_ro', to_jsonb(v_beri), 'lihat_ro', to_jsonb(v_lihat), 'pml_ro', to_jsonb(v_pml),
    'ada_tugas', exists (select 1 from keu_dlg_delegasi d where d.penerima_akun = p_akun and d.status in ('baru','berjalan','ditunda')),
    'ident', v_ident);
end $$;

-- Tampilan penerima: delegasi saya, laporan 35 hari, tanggapan, pembinaan, penghargaan, penilaian; serta delegasi mitra yang boleh saya laporkan (PML).
create or replace function keu_dlg_saya(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  with s as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
     where d.penerima_akun = p_akun and (d.status in ('baru','berjalan','ditunda') or d.diubah_at > now() - interval '120 days')
  ), w as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
     where d.status in ('baru','berjalan') and a.jenis = 'mitra' and d.penerima_akun <> p_akun and keu_dlg_pml(p_akun, d.ro_kode)
  )
  select jsonb_build_object(
    'hari_ini', v_hari,
    'akun', (select jsonb_build_object('id', x.id, 'nama', x.nama, 'jenis', x.jenis) from sigap_akun x where x.id = p_akun),
    'delegasi', (select coalesce(jsonb_agg(to_jsonb(s) order by s.tenggat, s.id), '[]'::jsonb) from s),
    'laporan', (select coalesce(jsonb_agg(to_jsonb(l) order by l.tanggal desc, l.id desc), '[]'::jsonb) from keu_dlg_laporan l
                 where l.tanggal >= v_hari - 35 and l.delegasi_id in (select id from s)),
    'diwakili', (select coalesce(jsonb_agg(to_jsonb(w) order by w.penerima_nama, w.id), '[]'::jsonb) from w),
    'laporan_diwakili', (select coalesce(jsonb_agg(to_jsonb(l) order by l.tanggal desc, l.id desc), '[]'::jsonb) from keu_dlg_laporan l
                 where l.tanggal >= v_hari - 35 and l.delegasi_id in (select id from w)),
    'tanggapan', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'delegasi_id', t.delegasi_id, 'laporan_id', t.laporan_id, 'isi', t.isi, 'dibuat_at', t.dibuat_at,
                    'dari_nama', u.nama) order by t.id desc), '[]'::jsonb)
                  from (select * from keu_dlg_tanggapan where delegasi_id in (select id from s) order by id desc limit 30) t left join sigap_akun u on u.id = t.dari_akun),
    'pembinaan', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id desc), '[]'::jsonb)
                  from (select id, ro_kode, delegasi_id, langkah, alasan, tinjau, status, catatan_tutup, dibuat_at from keu_dlg_pembinaan
                         where penerima_akun = p_akun order by id desc limit 20) b),
    'penghargaan', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc), '[]'::jsonb)
                  from (select id, ro_kode, delegasi_id, alasan, dibuat_at from keu_dlg_penghargaan where penerima_akun = p_akun order by id desc limit 20) h),
    'penilaian', (select coalesce(jsonb_agg(to_jsonb(n) order by n.periode desc), '[]'::jsonb)
                  from (select ro_kode, periode, kualitas, kepatuhan, catatan from keu_dlg_penilaian where penerima_akun = p_akun and periode >= v_hari - 400 order by periode desc limit 24) n)
  ) into r;
  return r;
end $$;

-- Tampilan pemberi/pelihat: seluruh delegasi dalam lingkup hak (opsional disaring identifikasi atau RO) beserta laporan 35 hari, tanggapan, pembinaan, dst.
create or replace function keu_dlg_bahan(p_ident bigint default null, p_ro text default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  with s as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari
      from keu_dlg_lingkup(p_akun, p_ident, p_ro) d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
  )
  select jsonb_build_object(
    'hari_ini', v_hari,
    'delegasi', (select coalesce(jsonb_agg(to_jsonb(s) order by s.tenggat, s.id), '[]'::jsonb) from s),
    'laporan', (select coalesce(jsonb_agg(to_jsonb(l) order by l.tanggal desc, l.id desc), '[]'::jsonb) from keu_dlg_laporan l
                 where l.tanggal >= v_hari - 35 and l.delegasi_id in (select id from s)),
    'tanggapan', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'delegasi_id', t.delegasi_id, 'laporan_id', t.laporan_id, 'isi', t.isi, 'dibuat_at', t.dibuat_at,
                    'dari_nama', u.nama) order by t.id desc), '[]'::jsonb)
                  from (select * from keu_dlg_tanggapan where delegasi_id in (select id from s) order by id desc limit 200) t left join sigap_akun u on u.id = t.dari_akun),
    'pembinaan', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'penerima_akun', b.penerima_akun, 'penerima_nama', a.nama, 'ro_kode', b.ro_kode, 'delegasi_id', b.delegasi_id,
                    'langkah', b.langkah, 'alasan', b.alasan, 'tinjau', b.tinjau, 'status', b.status, 'catatan_tutup', b.catatan_tutup, 'dibuat_at', b.dibuat_at,
                    'dicatat_nama', c.nama) order by b.id desc), '[]'::jsonb)
                  from keu_dlg_pembinaan b join sigap_akun a on a.id = b.penerima_akun left join sigap_akun c on c.id = b.dicatat_oleh
                 where b.dibuat_at > now() - interval '400 days' and keu_dlg_lihat(p_akun, b.ro_kode) and (p_ro is null or b.ro_kode = p_ro)),
    'penghargaan', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'penerima_akun', h.penerima_akun, 'penerima_nama', a.nama, 'ro_kode', h.ro_kode, 'delegasi_id', h.delegasi_id,
                    'alasan', h.alasan, 'dibuat_at', h.dibuat_at) order by h.id desc), '[]'::jsonb)
                  from keu_dlg_penghargaan h join sigap_akun a on a.id = h.penerima_akun
                 where h.dibuat_at > now() - interval '400 days' and keu_dlg_lihat(p_akun, h.ro_kode) and (p_ro is null or h.ro_kode = p_ro)),
    'penilaian', (select coalesce(jsonb_agg(jsonb_build_object('penerima_akun', n.penerima_akun, 'ro_kode', n.ro_kode, 'periode', n.periode, 'kualitas', n.kualitas,
                    'kepatuhan', n.kepatuhan, 'catatan', n.catatan, 'dinilai_oleh', n.dinilai_oleh) order by n.periode desc), '[]'::jsonb)
                  from keu_dlg_penilaian n where n.periode >= v_hari - 400 and keu_dlg_lihat(p_akun, n.ro_kode) and (p_ro is null or n.ro_kode = p_ro))
  ) into r;
  return r;
end $$;

-- Calon penerima untuk formulir Buat: petugas dari lanjutan Final (dicocokkan ke akun bila nama tepat satu), seluruh pegawai organik aktif, dan pencarian nama.
create or replace function keu_dlg_calon(p_ro text, p_ident bigint default null, p_q text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := btrim(coalesce(p_q, '')); v_lanj jsonb := '[]'::jsonb; v_org jsonb; v_cari jsonb := '[]'::jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_ro is null or not keu_dlg_beri(p_akun, p_ro) then raise exception 'Akun % tidak berwenang mendelegasikan pada RO %', p_akun, p_ro using errcode = '42501'; end if;
  if p_ident is not null then
    select coalesce(jsonb_agg(jsonb_build_object('nama', x ->> 'nama', 'peran', x ->> 'peran', 'jenis', x ->> 'status',
             'akun_id', (select case when count(*) = 1 then min(a.id) end from sigap_akun a where a.aktif and lower(a.nama) = lower(x ->> 'nama'))) order by x ->> 'nama'), '[]'::jsonb)
      into v_lanj
      from keu_ident_lanjutan l,
           lateral jsonb_array_elements(case when jsonb_typeof(l.isi -> 'petugas') = 'array' then l.isi -> 'petugas' else '[]'::jsonb end) x
     where l.ident_id = p_ident and l.status = 'final' and coalesce(x ->> 'nama', '') <> '';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nama', a.nama, 'jenis', a.jenis) order by a.nama), '[]'::jsonb) into v_org
    from sigap_akun a where a.aktif and a.jenis = 'organik' and a.id <> p_akun and not a.super;
  if char_length(v_q) >= 2 then
    select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'nama', z.nama, 'jenis', z.jenis, 'kecamatan', z.alamat_kecamatan) order by z.nama), '[]'::jsonb) into v_cari
      from (select a.id, a.nama, a.jenis, a.alamat_kecamatan from sigap_akun a where a.aktif and a.id <> p_akun and not a.super
             and a.nama ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%' order by a.nama limit 20) z;
  end if;
  return jsonb_build_object('lanjutan', v_lanj, 'organik', v_org, 'cari', v_cari);
end $$;

-- ---------------------------------------------------------------------
-- 7. Izin gerbang dan hak eksekusi
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
declare d text; v_baru text := '''keu_dlg_buat'',''keu_dlg_ubah'',''keu_dlg_terima'',''keu_dlg_lapor'',''keu_dlg_tanggapi'',''keu_dlg_bina'',''keu_dlg_bina_tutup'',''keu_dlg_hargai'',''keu_dlg_nilai'',''keu_dlg_hak'',''keu_dlg_saya'',''keu_dlg_bahan'',''keu_dlg_calon'',';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_dlg_buat''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',' || v_baru);
    if position('''keu_dlg_buat''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
