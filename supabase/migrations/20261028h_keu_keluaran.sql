-- =====================================================================
-- 20261028h_keu_keluaran.sql
-- SIGAP - Keluaran RAB per survei: paket beku berversi (kebutuhan dana untuk Bendahara, rencana pembayaran untuk PPK dan TU, permintaan pengadaan untuk PBJ),
-- spesifikasi butir pengadaan, dan tanda terima/pertanyaan penerima.
-- (29 Okt 2026) Bagian 2 membaca daftar jenis notifikasi dari bentuk ANY ('{...}'::text[]) sesuai tampilan produksi.
-- Bergantung pada za (identifikasi), 20261028g (status RAB per survei), zh (notifikasi). Aman diulang. Tanpa DELETE/DROP TABLE.
--
-- Isi:
--  1. keu_keluaran: satu baris per (RAB, identifikasi, versi). Isi paket (jsonb) dibentuk aplikasi dari baris RAB, lalu DIBEKUKAN (hanya tambah, tidak berubah).
--     Perubahan RAB sesudahnya tidak mengubah paket lama; pengajuan ulang membuat versi baru (isi sama persis = tanpa perubahan).
--  2. keu_keluaran_tanda: satu baris per (paket, bagian: dana | bayar | pengadaan) berisi tanda terbaru penerima: diterima atau ditanyakan (wajib catatan).
--  3. keu_keluaran_spek: spesifikasi per butir pengadaan (kode butir tetap dari draf pengadaan), dapat disunting selagi belum diajukan; yang terpakai pada paket
--     adalah salinan saat diajukan.
--  4. keu_keluaran_ajukan, keu_keluaran_tandai, keu_keluaran_spek_simpan: satu-satunya jalan menulis (penjaga keu_ident_jaga). Pengajuan hanya dari RAB per survei
--     berstatus Siap, dan jumlah serta cacah rincian pada isi paket harus sama dengan baris RAB tersimpan.
--  5. Tampilan keu_v_keluaran, keu_v_keluaran_tanda, keu_v_keluaran_spek; RLS; jenis notifikasi keluaran_diajukan dan keluaran_ditanya; izin gerbang.
--
-- Catatan: paket hanya PENYAJIAN; tidak mencairkan, memesan, atau menyetujui apa pun. Metode dan nilai pengadaan, serta tenggat resmi, ditetapkan PPK atau
-- pejabat pengadaan (cek aturan).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_keluaran (
  id          bigint generated always as identity primary key,
  rab_id      bigint not null references keu_rab(id),
  ident_id    bigint not null references keu_ident(id),
  ver         int not null check (ver >= 1),
  ident_ver   int not null,
  total       numeric(18,2) not null check (total >= 0),
  n_rincian   int not null check (n_rincian >= 1),
  isi         jsonb not null check (jsonb_typeof(isi) = 'object'),
  catatan     text not null default '' check (char_length(catatan) <= 300),
  dibuat_oleh bigint references sigap_akun(id),
  dibuat_at   timestamptz not null default now(),
  unique (rab_id, ident_id, ver)
);
create index if not exists keu_keluaran_ident_idx on keu_keluaran(ident_id, ver desc);

create table if not exists keu_keluaran_tanda (
  id          bigint generated always as identity primary key,
  keluaran_id bigint not null references keu_keluaran(id),
  bagian      text not null check (bagian in ('dana','bayar','pengadaan')),
  status      text not null check (status in ('diterima','ditanyakan')),
  catatan     text not null default '' check (char_length(catatan) <= 300),
  oleh        bigint references sigap_akun(id),
  at          timestamptz not null default now(),
  unique (keluaran_id, bagian)
);

create table if not exists keu_keluaran_spek (
  ident_id    bigint not null references keu_ident(id),
  butir       text not null check (butir ~ '^[a-z0-9:_-]{1,80}$'),
  jenis       text not null check (jenis in ('Paket meeting','Konsumsi','Perlengkapan','Pulsa','Penggandaan','Cetak buku')),
  spek        jsonb not null check (jsonb_typeof(spek) = 'object'),
  diubah_oleh bigint references sigap_akun(id),
  diubah_at   timestamptz not null default now(),
  primary key (ident_id, butir)
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_keluaran'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_keluaran for each row execute function keu_ident_jaga();
    create trigger keu_t2_catat before update or delete on keu_keluaran for each row execute function keu_catat_saja();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_keluaran_tanda'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_keluaran_tanda for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_keluaran_tanda for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_keluaran_spek'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_keluaran_spek for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_keluaran_spek for each row execute function keu_jejak();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Jenis notifikasi baru (daftar yang ada dipertahankan)
-- ---------------------------------------------------------------------
do $$
declare v_nama text; v_def text; v_daftar text;
begin
  select c.conname, pg_get_constraintdef(c.oid) into v_nama, v_def from pg_constraint c
   where c.conrelid = 'public.keu_notifikasi'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%ident_fix%' limit 1;
  if v_nama is not null and v_def not like '%keluaran_diajukan%' then
    -- PostgreSQL menampilkan CHECK daftar sebagai ANY ('{a,b,c}'::text[]); bentuk lama IN ('a'::text, 'b'::text) juga didukung
    if v_def like '%{%}%' then
      select string_agg(quote_literal(btrim(x)), ',') into v_daftar from unnest(string_to_array((regexp_match(v_def, '\{([^}]*)\}'))[1], ',')) as x;
    else
      select string_agg(quote_literal(m[1]), ',') into v_daftar from regexp_matches(v_def, '''([a-z0-9_]+)''::text', 'g') as m;
    end if;
    if v_daftar is null then raise exception 'Daftar jenis notifikasi tidak terbaca dari %', v_def; end if;
    execute format('alter table keu_notifikasi drop constraint %I', v_nama);
    execute format('alter table keu_notifikasi add constraint keu_notifikasi_jenis_check check (jenis in (%s,%L,%L))', v_daftar, 'keluaran_diajukan', 'keluaran_ditanya');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Fungsi tulis
-- ---------------------------------------------------------------------
-- hak menyusun/mengajukan: penyusun RAB atau identifikasi RO itu, PPK, Admin
create or replace function keu_keluaran_boleh_susun(p_akun bigint, p_ro text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_akun is not null and (keu_boleh(p_akun, 'rab', p_ro) or keu_boleh(p_akun, 'draf', p_ro) or keu_boleh(p_akun, 'ident_susun', p_ro)
         or keu_ident_punya(p_akun, 'PPK') or keu_ident_punya(p_akun, 'ADMIN'))
$$;
revoke execute on function keu_keluaran_boleh_susun(bigint, text) from public, anon, authenticated;

create or replace function keu_keluaran_ajukan(p_ident bigint, p_rab bigint, p_isi jsonb, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; r keu_rab; v_status text; v_n int; v_jumlah numeric; v_lama keu_keluaran; v_ver int; v_id bigint; v_cat text := btrim(coalesce(p_catatan, '')); v_nama text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  select * into r from keu_rab where id = p_rab;
  if not found then raise exception 'RAB % tidak ada', p_rab using errcode = '23514'; end if;
  if r.ro_kode is distinct from i.ro_kode then raise exception 'RAB % bukan milik RO % dari identifikasi ini', p_rab, i.ro_kode using errcode = '23514'; end if;
  if not keu_keluaran_boleh_susun(p_akun, i.ro_kode) then raise exception 'Akun % tidak berwenang mengajukan keluaran RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan' using errcode = '23514'; end if;
  if i.ver < 1 then raise exception 'Identifikasi awal belum disahkan' using errcode = '23514'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 huruf' using errcode = '23514'; end if;
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' or jsonb_typeof(p_isi -> 'dana') is distinct from 'object' or jsonb_typeof(p_isi -> 'bayar') is distinct from 'object'
     or jsonb_typeof(p_isi -> 'pengadaan') is distinct from 'array' or (p_isi ->> 'v') is distinct from '1' then
    raise exception 'Isi paket tidak sah (harus v=1 dengan dana, bayar, dan pengadaan)' using errcode = '22023';
  end if;
  if jsonb_typeof(p_isi -> 'n') is distinct from 'number' or jsonb_typeof(p_isi -> 'total') is distinct from 'number' then
    raise exception 'Isi paket tidak memuat cacah rincian dan total' using errcode = '22023';
  end if;
  if octet_length(p_isi::text) > 800000 then raise exception 'Isi paket terlalu besar' using errcode = '23514'; end if;

  select status into v_status from keu_rab_survei where rab_id = r.id and ident_id = i.id;
  if v_status is distinct from 'siap' then raise exception 'Keluaran hanya dapat diajukan dari RAB per survei yang berstatus Siap' using errcode = '23514'; end if;
  select count(*), coalesce(sum(b.jumlah), 0) into v_n, v_jumlah from keu_rab_baris b join keu_rab_item it on it.id = b.item_id where it.rab_id = r.id and b.ident_id = i.id;
  if v_n = 0 then raise exception 'Belum ada rincian RAB dari identifikasi ini' using errcode = '23514'; end if;
  if (p_isi ->> 'n')::numeric <> v_n or abs((p_isi ->> 'total')::numeric - v_jumlah) >= 1 then
    raise exception 'Isi paket tidak sama dengan RAB tersimpan (% rincian, jumlah %); muat ulang halaman lalu ajukan lagi', v_n, v_jumlah using errcode = '23514';
  end if;

  select * into v_lama from keu_keluaran where rab_id = r.id and ident_id = i.id order by ver desc limit 1;
  if found and v_lama.isi = p_isi and v_lama.ident_ver = i.ver then
    return jsonb_build_object('id', v_lama.id, 'ver', v_lama.ver, 'tanpa_perubahan', true);
  end if;
  v_ver := coalesce(v_lama.ver, 0) + 1;

  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_keluaran(rab_id, ident_id, ver, ident_ver, total, n_rincian, isi, catatan, dibuat_oleh)
    values (r.id, i.id, v_ver, i.ver, v_jumlah, v_n, p_isi, v_cat, p_akun) returning id into v_id;
  insert into sigap_audit(akun_id, aksi, detail) values (p_akun, 'keu.keluaran.ajukan', jsonb_build_object('ident_id', i.id, 'rab_id', r.id, 'ver', v_ver, 'total', v_jumlah, 'n', v_n));
  select nama into v_nama from sigap_akun where id = p_akun;
  perform keu_notif_kirim(array(select keu_penerima(array['BEND','PPK','TU','PBJ'], i.ro_kode)), 'keluaran_diajukan',
    left('Keluaran ' || i.nama || ' versi ' || v_ver || ' diajukan', 200),
    'Kebutuhan dana, rencana pembayaran, dan permintaan pengadaan (' || v_n || ' rincian, jumlah Rp ' || to_char(v_jumlah, 'FM999G999G999G999') || '), oleh ' || coalesce(v_nama, '-') || '. Mohon ditandai diterima atau ditanyakan.',
    '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/keluaran', i.id, null, null, p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', v_id, 'ver', v_ver, 'tanpa_perubahan', false);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_keluaran_ajukan(bigint, bigint, jsonb, text, bigint) from public, anon, authenticated;

create or replace function keu_keluaran_tandai(p_keluaran bigint, p_bagian text, p_status text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  k keu_keluaran; i keu_ident; t keu_keluaran_tanda; v_cat text := btrim(coalesce(p_catatan, '')); v_nama text; v_ada boolean; v_boleh boolean;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into k from keu_keluaran where id = p_keluaran;
  if not found then raise exception 'Paket keluaran % tidak ada', p_keluaran using errcode = '23514'; end if;
  select * into i from keu_ident where id = k.ident_id;
  if p_bagian is null or p_bagian not in ('dana','bayar','pengadaan') then raise exception 'Bagian harus dana, bayar, atau pengadaan' using errcode = '22023'; end if;
  if p_status is null or p_status not in ('diterima','ditanyakan') then raise exception 'Tanda harus diterima atau ditanyakan' using errcode = '22023'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 huruf' using errcode = '23514'; end if;
  if p_status = 'ditanyakan' and char_length(v_cat) < 5 then raise exception 'Pertanyaan wajib ditulis pada catatan (minimal 5 huruf)' using errcode = '23514'; end if;
  v_boleh := keu_ident_punya(p_akun, 'ADMIN') or keu_ident_punya(p_akun, 'PPK') or case p_bagian
      when 'dana' then keu_ident_punya(p_akun, 'BEND')
      when 'bayar' then keu_ident_punya(p_akun, 'TU')
      else keu_ident_punya(p_akun, 'PBJ', i.ro_kode) end;
  if not v_boleh then raise exception 'Akun % tidak berwenang menandai bagian % keluaran RO %', p_akun, p_bagian, i.ro_kode using errcode = '42501'; end if;
  if exists (select 1 from keu_keluaran x where x.rab_id = k.rab_id and x.ident_id = k.ident_id and x.ver > k.ver) then
    raise exception 'Paket ini sudah digantikan versi yang lebih baru; tandai versi terbaru' using errcode = '23514';
  end if;

  select * into t from keu_keluaran_tanda where keluaran_id = k.id and bagian = p_bagian for update;
  v_ada := found;
  if v_ada and t.status = p_status and t.catatan = v_cat then return 'tetap'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  if v_ada then
    update keu_keluaran_tanda set status = p_status, catatan = v_cat, oleh = p_akun, at = now() where id = t.id;
  else
    insert into keu_keluaran_tanda(keluaran_id, bagian, status, catatan, oleh) values (k.id, p_bagian, p_status, v_cat, p_akun);
  end if;
  if p_status = 'ditanyakan' and k.dibuat_oleh is not null then
    select nama into v_nama from sigap_akun where id = p_akun;
    perform keu_notif_kirim(array[k.dibuat_oleh], 'keluaran_ditanya', left('Pertanyaan atas keluaran ' || i.nama || ' (' || p_bagian || ')', 200),
      left(coalesce(v_nama, '-') || ': ' || v_cat, 1000), '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/keluaran', i.id, null, null, p_akun);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return p_status;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_keluaran_tandai(bigint, text, text, text, bigint) from public, anon, authenticated;

create or replace function keu_keluaran_spek_simpan(p_ident bigint, p_butir text, p_jenis text, p_spek jsonb, p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; s keu_keluaran_spek; v_ada boolean;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not (keu_keluaran_boleh_susun(p_akun, i.ro_kode) or keu_ident_punya(p_akun, 'PBJ', i.ro_kode)) then
    raise exception 'Akun % tidak berwenang mengisi spesifikasi RO %', p_akun, i.ro_kode using errcode = '42501';
  end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan' using errcode = '23514'; end if;
  if i.ver < 1 then raise exception 'Identifikasi awal belum disahkan' using errcode = '23514'; end if;
  if p_butir is null or p_butir !~ '^[a-z0-9:_-]{1,80}$' then raise exception 'Kode butir pengadaan tidak sah' using errcode = '22023'; end if;
  if p_jenis is null or p_jenis not in ('Paket meeting','Konsumsi','Perlengkapan','Pulsa','Penggandaan','Cetak buku') then raise exception 'Jenis pengadaan tidak sah' using errcode = '22023'; end if;
  if p_spek is null or jsonb_typeof(p_spek) <> 'object' then raise exception 'Spesifikasi harus objek JSON' using errcode = '22023'; end if;
  if octet_length(p_spek::text) > 30000 then raise exception 'Spesifikasi terlalu besar (maksimal 30 KB)' using errcode = '23514'; end if;

  select * into s from keu_keluaran_spek where ident_id = i.id and butir = p_butir for update;
  v_ada := found;
  if v_ada and s.spek = p_spek and s.jenis = p_jenis then return 'tetap'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  if v_ada then
    update keu_keluaran_spek set spek = p_spek, jenis = p_jenis, diubah_oleh = p_akun, diubah_at = now() where ident_id = i.id and butir = p_butir;
  else
    insert into keu_keluaran_spek(ident_id, butir, jenis, spek, diubah_oleh) values (i.id, p_butir, p_jenis, p_spek, p_akun);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return 'tersimpan';
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_keluaran_spek_simpan(bigint, text, text, jsonb, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Tampilan, RLS, gerbang
-- ---------------------------------------------------------------------
create or replace view keu_v_keluaran with (security_invoker = true) as
select k.id, k.rab_id, k.ident_id, k.ver, k.ident_ver, k.total, k.n_rincian, k.catatan, k.dibuat_at, a.nama as dibuat_oleh_nama,
       i.ro_kode, i.nama as ident_nama, i.tahun, r.nomor as rab_nomor, r.status as rab_status, k.isi
from keu_keluaran k
join keu_ident i on i.id = k.ident_id
join keu_rab r on r.id = k.rab_id
left join sigap_akun a on a.id = k.dibuat_oleh;

create or replace view keu_v_keluaran_tanda with (security_invoker = true) as
select t.keluaran_id, t.bagian, t.status, t.catatan, t.at, a.nama as oleh_nama
from keu_keluaran_tanda t left join sigap_akun a on a.id = t.oleh;

create or replace view keu_v_keluaran_spek with (security_invoker = true) as
select s.ident_id, s.butir, s.jenis, s.spek, s.diubah_at, a.nama as diubah_oleh_nama
from keu_keluaran_spek s left join sigap_akun a on a.id = s.diubah_oleh;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_keluaran', 'keu_keluaran_tanda', 'keu_keluaran_spek')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_keluaran, keu_v_keluaran_tanda, keu_v_keluaran_spek from anon, authenticated, public;
grant select on keu_v_keluaran, keu_v_keluaran_tanda, keu_v_keluaran_spek to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_keluaran_ajukan''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_keluaran_ajukan'',''keu_keluaran_tandai'',''keu_keluaran_spek_simpan'',');
    if position('''keu_keluaran_ajukan''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
