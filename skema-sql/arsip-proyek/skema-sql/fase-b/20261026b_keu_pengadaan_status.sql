-- =====================================================================
-- 20261026b_keu_pengadaan_status.sql
-- SIGAP - Tahap 35: status pengadaan per butir draf pengadaan (halaman Rekrutmen dan pengadaan, tahap 34).
-- Bergantung pada za, zc (identifikasi), zf (lanjutan). Aman diulang. Tanpa DELETE/DROP TABLE.
--
-- Isi:
--  1. keu_ident_pengadaan: satu baris per (identifikasi, butir) berisi status terkini; butir dikenal lewat KUNCI TETAP yang dibentuk
--     aplikasi (mis. "k1:paket", "rapat:evaluasi"), bukan nomor urut, supaya status tidak bergeser bila susunan draf berubah.
--     Status: belum | diajukan | diproses | selesai | batal. "belum" dipakai untuk mengembalikan (tidak ada hapus).
--  2. keu_ident_pengadaan_jejak: tiap perubahan tercatat (tidak berubah, hanya bertambah).
--  3. keu_pengadaan_catat(p_ident, p_item, p_uraian, p_status, p_rujukan, p_catatan): mencatat status. Hak: penyusun RO itu (ident_susun),
--     PPK, PBJ RO itu, atau Admin. Status "batal" wajib beralasan (minimal 5 huruf). Isian sama persis = tanpa perubahan.
--  4. Tampilan keu_v_ident_pengadaan dan keu_v_ident_pengadaan_jejak; RLS; izin gerbang.
--
-- Catatan: status ini hanya CATATAN pelacakan; metode dan nilai pengadaan tetap ditentukan PPK atau pejabat pengadaan (cek aturan).
-- Tidak ada tautan otomatis ke baris RAB; nomor permintaan, SPK, atau kontrak boleh dicatat pada kolom rujukan.
-- =====================================================================

create table if not exists keu_ident_pengadaan (
  id          bigint generated always as identity primary key,
  ident_id    bigint not null references keu_ident(id),
  item        text not null check (item ~ '^[a-z0-9:_-]{1,80}$'),
  uraian      text not null default '' check (char_length(uraian) <= 200),
  status      text not null default 'belum' check (status in ('belum','diajukan','diproses','selesai','batal')),
  rujukan     text not null default '' check (char_length(rujukan) <= 100),
  catatan     text not null default '' check (char_length(catatan) <= 300),
  diubah_oleh bigint references sigap_akun(id),
  diubah_at   timestamptz not null default now(),
  unique (ident_id, item)
);

create table if not exists keu_ident_pengadaan_jejak (
  id        bigint generated always as identity primary key,
  ident_id  bigint not null references keu_ident(id),
  item      text not null,
  uraian    text not null default '',
  dari      text not null,
  ke        text not null,
  rujukan   text not null default '',
  catatan   text not null default '',
  oleh      bigint references sigap_akun(id),
  at        timestamptz not null default now()
);
create index if not exists keu_ident_pengadaan_jejak_idx on keu_ident_pengadaan_jejak(ident_id, item, id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_pengadaan'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_pengadaan for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_ident_pengadaan for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_pengadaan_jejak'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_pengadaan_jejak for each row execute function keu_ident_jaga();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Mencatat status
-- ---------------------------------------------------------------------
create or replace function keu_pengadaan_catat(p_ident bigint, p_item text, p_uraian text, p_status text, p_rujukan text default '', p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; b keu_ident_pengadaan; v_ruj text := btrim(coalesce(p_rujukan, '')); v_cat text := btrim(coalesce(p_catatan, ''));
  v_ur text := left(btrim(coalesce(p_uraian, '')), 200); v_dari text; v_ada boolean;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not (keu_boleh(p_akun, 'ident_susun', i.ro_kode) or keu_ident_punya(p_akun, 'PPK') or keu_ident_punya(p_akun, 'PBJ', i.ro_kode) or keu_ident_punya(p_akun, 'ADMIN')) then
    raise exception 'Akun % tidak berwenang mencatat status pengadaan RO %', p_akun, i.ro_kode using errcode = '42501';
  end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan' using errcode = '23514'; end if;
  if i.ver < 1 then raise exception 'Identifikasi awal belum disahkan; status pengadaan dapat dicatat sesudah disahkan' using errcode = '23514'; end if;
  if p_item is null or p_item !~ '^[a-z0-9:_-]{1,80}$' then raise exception 'Kode butir pengadaan tidak sah' using errcode = '22023'; end if;
  if p_status is null or p_status not in ('belum','diajukan','diproses','selesai','batal') then raise exception 'Status harus belum, diajukan, diproses, selesai, atau batal' using errcode = '22023'; end if;
  if char_length(v_ruj) > 100 then raise exception 'Rujukan maksimal 100 huruf' using errcode = '23514'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 huruf' using errcode = '23514'; end if;
  if p_status = 'batal' and char_length(v_cat) < 5 then raise exception 'Status batal wajib disertai alasan pada catatan (minimal 5 huruf)' using errcode = '23514'; end if;

  select * into b from keu_ident_pengadaan where ident_id = i.id and item = p_item for update;
  v_ada := found;
  v_dari := case when v_ada then b.status else 'belum' end;
  if v_ada and b.status = p_status and b.rujukan = v_ruj and b.catatan = v_cat then return 'tetap'; end if;
  if not v_ada and p_status = 'belum' and v_ruj = '' and v_cat = '' then return 'tetap'; end if;

  perform set_config('keu.via_fungsi', '1', true);
  if v_ada then
    update keu_ident_pengadaan set status = p_status, rujukan = v_ruj, catatan = v_cat, uraian = case when v_ur <> '' then v_ur else uraian end, diubah_oleh = p_akun, diubah_at = now() where id = b.id;
  else
    insert into keu_ident_pengadaan(ident_id, item, uraian, status, rujukan, catatan, diubah_oleh) values (i.id, p_item, v_ur, p_status, v_ruj, v_cat, p_akun);
  end if;
  insert into keu_ident_pengadaan_jejak(ident_id, item, uraian, dari, ke, rujukan, catatan, oleh) values (i.id, p_item, v_ur, v_dari, p_status, v_ruj, v_cat, p_akun);
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'pengadaan', v_dari, p_status, i.ver, p_akun,
    left('Pengadaan ' || coalesce(nullif(v_ur, ''), p_item) || ': ' || v_dari || ' -> ' || p_status || case when v_ruj <> '' then ' (' || v_ruj || ')' else '' end, 300));
  perform set_config('keu.via_fungsi', '', true);
  return p_status;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_pengadaan_catat(bigint, text, text, text, text, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Tampilan, RLS, gerbang
-- ---------------------------------------------------------------------
create or replace view keu_v_ident_pengadaan with (security_invoker = true) as
select p.id, p.ident_id, p.item, p.uraian, p.status, p.rujukan, p.catatan, p.diubah_at, a.nama as diubah_oleh_nama
from keu_ident_pengadaan p left join sigap_akun a on a.id = p.diubah_oleh;

create or replace view keu_v_ident_pengadaan_jejak with (security_invoker = true) as
select j.id, j.ident_id, j.item, j.uraian, j.dari, j.ke, j.rujukan, j.catatan, j.at as waktu, a.nama as oleh_nama
from keu_ident_pengadaan_jejak j left join sigap_akun a on a.id = j.oleh;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_ident_pengadaan', 'keu_ident_pengadaan_jejak')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_ident_pengadaan, keu_v_ident_pengadaan_jejak from anon, authenticated, public;
grant select on keu_v_ident_pengadaan, keu_v_ident_pengadaan_jejak to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_pengadaan_catat''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_pengadaan_catat'',');
    if position('''keu_pengadaan_catat''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
