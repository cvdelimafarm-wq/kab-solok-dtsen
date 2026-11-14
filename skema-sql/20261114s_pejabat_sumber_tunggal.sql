-- skema-sql/20261114s_pejabat_sumber_tunggal.sql
--
-- (14 Nov 2026) SATU SUMBER nama pejabat (putusan Ketua Tim): Kepala (KPA), PPK, Bendahara Pengeluaran, dan Pejabat Pengadaan.
-- Semua dokumen (SPJ Translok: kwitansi dan visum; kwitansi dan visum SIGAP; kontrak pengadaan; SPK dan dokumen identifikasi;
-- undangan pelatihan) membaca nama, NIP, jabatan, dan SK dari tabel ini menurut TANGGAL dokumen.
--
-- Prinsip:
--  - Menambah, tidak menimpa. Baris tidak pernah dihapus: pergantian pejabat = baris baru dengan tanggal mulai; baris lama ditutup
--    sehari sebelumnya. Dokumen bertanggal lama tetap memakai pejabat yang berlaku saat itu.
--  - Hanya mengatur NAMA YANG DICETAK. Kewenangan di aplikasi (siapa boleh mengesahkan RAB, dsb.) tetap di keu_penugasan dan
--    tidak diubah migrasi ini.
--  - Yang boleh mengubah: kewenangan "master" (Admin Aplikasi dan PPK), sama dengan master lain.
--  - Dokumen yang sudah TERBIT menyimpan salinan nama penandatangan (keu_ident_dokumen.ttd_nama) dan tidak ikut berubah.

begin;

create table if not exists keu_pejabat (
  id              bigserial primary key,
  jabatan_kode    text not null check (jabatan_kode in ('KPA', 'PPK', 'BEND', 'PP')),
  akun_id         bigint references sigap_akun(id),
  nama            text not null check (length(btrim(nama)) >= 3),
  nip             text not null default '' check (nip = '' or nip ~ '^[0-9]{18}$'),
  jabatan_teks    text not null check (length(btrim(jabatan_teks)) >= 3),
  sk_nomor        text not null default '',
  sk_tanggal      date,
  berlaku_mulai   date not null,
  berlaku_sampai  date,
  masa            daterange generated always as (daterange(berlaku_mulai, berlaku_sampai, '[]')) stored,
  ket             text not null default '',
  dibuat_oleh     bigint references sigap_akun(id),
  dibuat_at       timestamptz not null default now(),
  diubah_oleh     bigint references sigap_akun(id),
  diubah_at       timestamptz,
  dibatalkan_at   timestamptz,
  dibatalkan_oleh bigint references sigap_akun(id),
  alasan_batal    text,
  constraint pejabat_masa_sah check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  constraint pejabat_tunggal exclude using gist (jabatan_kode with =, masa with &&) where (dibatalkan_at is null)
);
comment on table keu_pejabat is 'Satu sumber nama pejabat yang dicetak di dokumen (KPA, PPK, Bendahara, Pejabat Pengadaan), berlaku per tanggal. Tanpa hapus.';

alter table keu_pejabat enable row level security;
revoke all on table keu_pejabat from anon, authenticated, public;
grant all on table keu_pejabat to service_role;
revoke all on sequence keu_pejabat_id_seq from anon, authenticated, public;
grant usage, select on sequence keu_pejabat_id_seq to service_role;

-- Nama jabatan bawaan untuk dokumen.
create or replace function keu_pejabat_jabatan_bawaan(p_kode text) returns text language sql immutable as $f$
  select case p_kode when 'KPA' then 'Kepala BPS Kabupaten Solok' when 'PPK' then 'Pejabat Pembuat Komitmen'
                     when 'BEND' then 'Bendahara Pengeluaran' when 'PP' then 'Pejabat Pengadaan' end
$f$;

-- Tampilan baca (semua baris yang tidak dibatalkan, terbaru di atas).
create or replace view keu_v_pejabat with (security_invoker = true) as
select p.id, p.jabatan_kode, p.akun_id, a.nama as akun_nama, p.nama, p.nip, p.jabatan_teks, p.sk_nomor, p.sk_tanggal,
       p.berlaku_mulai, p.berlaku_sampai, (p.masa @> current_date) as aktif_hari_ini, p.ket, p.dibuat_at, p.diubah_at
from keu_pejabat p left join sigap_akun a on a.id = p.akun_id
where p.dibatalkan_at is null;
revoke all on keu_v_pejabat from anon, authenticated, public;
grant select on keu_v_pejabat to service_role;

-- Pejabat yang berlaku pada satu tanggal: { "KPA": {...}, "PPK": {...}, "BEND": {...}, "PP": {...} } (jabatan tanpa pejabat tidak muncul).
create or replace function keu_pejabat_pada(p_tanggal date default null, p_akun bigint default keu_akun_sesi())
returns jsonb language sql stable security definer set search_path = public as $f$
  select coalesce(jsonb_object_agg(p.jabatan_kode, jsonb_build_object(
           'id', p.id, 'akun_id', p.akun_id, 'nama', p.nama, 'nip', p.nip, 'jabatan', p.jabatan_teks,
           'sk_nomor', p.sk_nomor, 'sk_tanggal', p.sk_tanggal, 'mulai', p.berlaku_mulai, 'sampai', p.berlaku_sampai)), '{}'::jsonb)
  from keu_pejabat p
  where p.dibatalkan_at is null and p.masa @> coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date)
$f$;
revoke execute on function keu_pejabat_pada(date, bigint) from public, anon, authenticated;
grant execute on function keu_pejabat_pada(date, bigint) to service_role;

-- Menetapkan pejabat (baru atau pengganti) mulai satu tanggal. Pejabat sebelumnya ditutup sehari sebelumnya.
create or replace function keu_pejabat_tetapkan(
  p_jabatan text, p_akun_pejabat bigint, p_nama text, p_nip text, p_jabatan_teks text,
  p_sk_nomor text default '', p_sk_tanggal date default null, p_mulai date default null, p_ket text default '',
  p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  v_mulai date := coalesce(p_mulai, (now() at time zone 'Asia/Jakarta')::date);
  v_nip text := regexp_replace(coalesce(p_nip, ''), '\D', '', 'g');
  v_nama text := btrim(coalesce(p_nama, ''));
  v_jab text := btrim(coalesce(nullif(btrim(coalesce(p_jabatan_teks, '')), ''), keu_pejabat_jabatan_bawaan(p_jabatan), ''));
  v_id bigint;
begin
  if not coalesce(keu_boleh(p_akun, 'master'), false) then
    raise exception 'Hanya Admin Aplikasi atau PPK yang dapat mengatur pejabat' using errcode = '42501';
  end if;
  if p_jabatan is null or p_jabatan not in ('KPA', 'PPK', 'BEND', 'PP') then raise exception 'Jabatan tidak dikenal' using errcode = '22023'; end if;
  if p_akun_pejabat is not null and not exists (select 1 from sigap_akun where id = p_akun_pejabat and aktif) then
    raise exception 'Akun pejabat tidak dikenal atau tidak aktif' using errcode = '23514';
  end if;
  if length(v_nama) < 3 then raise exception 'Nama pejabat wajib diisi (gelar boleh ditulis)' using errcode = '23514'; end if;
  if v_nip <> '' and v_nip !~ '^[0-9]{18}$' then raise exception 'NIP harus 18 angka' using errcode = '23514'; end if;
  if exists (select 1 from keu_pejabat where jabatan_kode = p_jabatan and dibatalkan_at is null and berlaku_mulai >= v_mulai) then
    raise exception 'Sudah ada pejabat % yang mulai pada atau sesudah tanggal itu. Batalkan atau perbaiki baris itu lebih dulu.', p_jabatan using errcode = '23514';
  end if;
  update keu_pejabat set berlaku_sampai = v_mulai - 1, diubah_oleh = p_akun, diubah_at = now()
   where jabatan_kode = p_jabatan and dibatalkan_at is null and masa @> v_mulai;
  insert into keu_pejabat(jabatan_kode, akun_id, nama, nip, jabatan_teks, sk_nomor, sk_tanggal, berlaku_mulai, ket, dibuat_oleh)
  values (p_jabatan, p_akun_pejabat, v_nama, v_nip, v_jab, btrim(coalesce(p_sk_nomor, '')), p_sk_tanggal, v_mulai, btrim(coalesce(p_ket, '')), p_akun)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'mulai', v_mulai);
end $f$;
revoke execute on function keu_pejabat_tetapkan(text, bigint, text, text, text, text, date, date, text, bigint) from public, anon, authenticated;
grant execute on function keu_pejabat_tetapkan(text, bigint, text, text, text, text, date, date, text, bigint) to service_role;

-- Memperbaiki data pejabat yang sama (salah ketik nama atau NIP, SK menyusul). Tanggal tidak diubah di sini.
create or replace function keu_pejabat_perbaiki(
  p_id bigint, p_nama text, p_nip text, p_jabatan_teks text, p_sk_nomor text default '', p_sk_tanggal date default null,
  p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  v_nip text := regexp_replace(coalesce(p_nip, ''), '\D', '', 'g');
  v_nama text := btrim(coalesce(p_nama, ''));
begin
  if not coalesce(keu_boleh(p_akun, 'master'), false) then
    raise exception 'Hanya Admin Aplikasi atau PPK yang dapat mengatur pejabat' using errcode = '42501';
  end if;
  if length(v_nama) < 3 then raise exception 'Nama pejabat wajib diisi' using errcode = '23514'; end if;
  if v_nip <> '' and v_nip !~ '^[0-9]{18}$' then raise exception 'NIP harus 18 angka' using errcode = '23514'; end if;
  if length(btrim(coalesce(p_jabatan_teks, ''))) < 3 then raise exception 'Jabatan wajib diisi' using errcode = '23514'; end if;
  update keu_pejabat set nama = v_nama, nip = v_nip, jabatan_teks = btrim(p_jabatan_teks), sk_nomor = btrim(coalesce(p_sk_nomor, '')),
         sk_tanggal = p_sk_tanggal, diubah_oleh = p_akun, diubah_at = now()
   where id = p_id and dibatalkan_at is null;
  if not found then raise exception 'Baris pejabat tidak ada atau sudah dibatalkan' using errcode = '23514'; end if;
  return jsonb_build_object('id', p_id);
end $f$;
revoke execute on function keu_pejabat_perbaiki(bigint, text, text, text, text, date, bigint) from public, anon, authenticated;
grant execute on function keu_pejabat_perbaiki(bigint, text, text, text, text, date, bigint) to service_role;

-- Membatalkan penetapan terakhir suatu jabatan (salah input). Pejabat sebelumnya dibuka kembali sampai batas lamanya.
create or replace function keu_pejabat_batal(p_id bigint, p_alasan text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $f$
declare r keu_pejabat;
begin
  if not coalesce(keu_boleh(p_akun, 'master'), false) then
    raise exception 'Hanya Admin Aplikasi atau PPK yang dapat mengatur pejabat' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_alasan, ''))) < 10 then raise exception 'Alasan pembatalan minimal 10 huruf' using errcode = '23514'; end if;
  select * into r from keu_pejabat where id = p_id and dibatalkan_at is null for update;
  if not found then raise exception 'Baris pejabat tidak ada atau sudah dibatalkan' using errcode = '23514'; end if;
  if exists (select 1 from keu_pejabat where jabatan_kode = r.jabatan_kode and dibatalkan_at is null and berlaku_mulai > r.berlaku_mulai) then
    raise exception 'Hanya penetapan terakhir yang dapat dibatalkan' using errcode = '23514';
  end if;
  update keu_pejabat set dibatalkan_at = now(), dibatalkan_oleh = p_akun, alasan_batal = btrim(p_alasan) where id = p_id;
  update keu_pejabat set berlaku_sampai = r.berlaku_sampai, diubah_oleh = p_akun, diubah_at = now()
   where id = (select id from keu_pejabat where jabatan_kode = r.jabatan_kode and dibatalkan_at is null and berlaku_sampai = r.berlaku_mulai - 1
               order by berlaku_mulai desc limit 1);
  return jsonb_build_object('id', p_id);
end $f$;
revoke execute on function keu_pejabat_batal(bigint, text, bigint) from public, anon, authenticated;
grant execute on function keu_pejabat_batal(bigint, text, bigint) to service_role;

-- Bahan halaman: daftar, akun organik untuk dipilih, hak ubah.
create or replace function keu_pejabat_bahan(p_akun bigint default keu_akun_sesi())
returns jsonb language sql stable security definer set search_path = public as $f$
  select jsonb_build_object(
    'boleh', coalesce(keu_boleh(p_akun, 'master'), false),
    'hari_ini', (now() at time zone 'Asia/Jakarta')::date,
    'pejabat', coalesce((select jsonb_agg(to_jsonb(v) order by v.jabatan_kode, v.berlaku_mulai desc) from keu_v_pejabat v), '[]'::jsonb),
    'organik', coalesce((select jsonb_agg(jsonb_build_object('akun_id', a.id, 'nama', a.nama) order by a.nama)
                           from sigap_akun a where a.aktif and a.jenis = 'organik'), '[]'::jsonb))
$f$;
revoke execute on function keu_pejabat_bahan(bigint) from public, anon, authenticated;
grant execute on function keu_pejabat_bahan(bigint) to service_role;

-- Data awal (putusan Ketua Tim 14 Nov 2026): berlaku sejak 1 Januari 2026. NIP dari contoh dokumen resmi (kwitansi, visum, kontrak).
insert into keu_pejabat(jabatan_kode, akun_id, nama, nip, jabatan_teks, sk_nomor, berlaku_mulai, ket)
select v.kode, a.id, v.nama, v.nip, keu_pejabat_jabatan_bawaan(v.kode), '', date '2026-01-01', 'Data awal 14 Nov 2026 atas putusan Ketua Tim'
from (values
  ('KPA',  'Bambang Suryanggono', 'Bambang Suryanggono, SST., M.Ec.Dev', '198209282004121001'),
  ('PPK',  'Novriady',            'Novriady, S.Ak',                      '198011132006041003'),
  ('BEND', 'Alex Kandria',        'Alex Kandria',                        '198406062007011004'),
  ('PP',   'M. Iqbal Hadi',       'M. Iqbal Hadi, SST',                  '199410062017011001')
) as v(kode, cari, nama, nip)
left join lateral (select id from sigap_akun where aktif and nama ilike v.cari || '%' order by id limit 1) a on true
where not exists (select 1 from keu_pejabat p where p.jabatan_kode = v.kode and p.dibatalkan_at is null);

-- Calon penandatangan SPK dan dokumen identifikasi: Kepala dan PPK dari keu_pejabat; ketua tim (per RO) dan Tata Usaha dari penugasan.
create or replace view keu_v_ident_ttd with (security_invoker = true) as
select t.akun_id, a.nama as akun_nama, t.peran_kode, t.ro_kode
from keu_penugasan t join sigap_akun a on a.id = t.akun_id and a.aktif
where t.dibatalkan_at is null and t.masa @> current_date and t.peran_kode in ('KETUA', 'TU')
union all
select p.akun_id, a.nama as akun_nama, p.jabatan_kode as peran_kode, null::text as ro_kode
from keu_pejabat p join sigap_akun a on a.id = p.akun_id and a.aktif
where p.dibatalkan_at is null and p.masa @> current_date and p.jabatan_kode in ('KPA', 'PPK');

-- keu_ident_dokumen_simpan: Kepala/PPK sah bila tercatat di keu_pejabat pada tanggal dokumen; nama yang disimpan = nama resmi di keu_pejabat.
do $$
declare
  d text := pg_get_functiondef('keu_ident_dokumen_simpan'::regproc);
  lama1 text := 'if v_nama is null then raise exception ''Penandatangan tidak dikenal atau tidak aktif'' using errcode = ''23514''; end if;';
  baru1 text := lama1 || E'\n      select coalesce((select pj.nama from keu_pejabat pj where pj.akun_id = p_ttd_akun and pj.dibatalkan_at is null and pj.masa @> coalesce(p_tanggal, current_date) and pj.jabatan_kode in (''KPA'',''PPK'') order by pj.jabatan_kode limit 1), v_nama) into v_nama;';
  lama2 text := 't.peran_kode in (''KETUA'',''PPK'',''KPA'',''TU'')';
  baru2 text := 't.peran_kode in (''KETUA'',''TU'')';
  lama3 text := 'and (pr.lingkup = ''global'' or t.ro_kode = i.ro_kode)) then';
  baru3 text := 'and (pr.lingkup = ''global'' or t.ro_kode = i.ro_kode))'
             || E'\n                     and not exists (select 1 from keu_pejabat pj where pj.akun_id = p_ttd_akun and pj.dibatalkan_at is null and pj.masa @> coalesce(p_tanggal, current_date) and pj.jabatan_kode in (''KPA'',''PPK'')) then';
begin
  if position('keu_pejabat' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, lama1, ''))) / length(lama1) <> 1
     or (length(d) - length(replace(d, lama2, ''))) / length(lama2) <> 1
     or (length(d) - length(replace(d, lama3, ''))) / length(lama3) <> 1 then
    raise exception 'Isi keu_ident_dokumen_simpan tidak dikenali; migrasi dihentikan';
  end if;
  d := replace(replace(replace(d, lama1, baru1), lama2, baru2), lama3, baru3);
  execute d;
end $$;

-- Daftar izin gerbang.
do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_pejabat_bahan''' in d) = 0 then
    d := replace(d, '''keu_ruang_keputusan''];', '''keu_ruang_keputusan'',''keu_pejabat_bahan'',''keu_pejabat_pada'',''keu_pejabat_tetapkan'',''keu_pejabat_perbaiki'',''keu_pejabat_batal''];');
    if position('''keu_pejabat_bahan''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
