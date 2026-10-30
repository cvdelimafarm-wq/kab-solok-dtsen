-- =====================================================================
-- 20261025zh_keu_notifikasi_pengecualian.sql
-- SIGAP - Tahap 30: notifikasi, keputusan KPA / izin pengecualian, dan pintu baca hilir identifikasi (keu_v_ident_acuan).
-- Bergantung pada za, zc (identifikasi), zd (lembar kebijakan), zf (lanjutan). Aman diulang. Tanpa DELETE/DROP.
--
-- Isi:
--  1. keu_notifikasi (pesan per akun) + keu_penerima (penentu penerima menurut peran; PBJ dialihkan ke PPK bila RO tidak punya PBJ) + keu_notif_kirim.
--  2. keu_pengecualian: keputusan KPA. Dibuat otomatis untuk setiap versi lanjutan SESUDAH H-15 (tidak memblokir; menjadi bahan evaluasi) dan
--     diajukan manual untuk pelanggaran kebijakan atau rangkap yang disengaja. Fungsi: ajukan, putus (hanya KPA), tarik (pengaju, manual).
--  3. Pemicu notifikasi: lanjutan Final sebelum H-15, lanjutan berubah sesudah H-15, nama petugas terisi, lembar kebijakan menunggu pengesahan.
--  4. keu_notifikasi_saya, keu_notifikasi_tandai; tampilan keu_v_pengecualian dan keu_v_ident_acuan (pintu modul hilir); RLS; izin gerbang.
--
-- Keputusan (25 Okt 2026): perubahan sesudah H-15 = keputusan KPA dicatat, tidak memblokir; notifikasi tampil di halaman Notifikasi (bukan menu baru).
-- Tidak dibangun di sini: keu_gap (diisi peringatan pelaksanaan, tahap 32) dan keu_kebijakan_rujukan (menunggu berkas SBM penginapan dan matriks SK transport).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Notifikasi
-- ---------------------------------------------------------------------
create table if not exists keu_notifikasi (
  id             bigint generated always as identity primary key,
  akun_id        bigint not null references sigap_akun(id),
  jenis          text not null check (jenis in ('ident_fix','ident_pasca_h15','nama_terisi','lembar_menunggu','pengecualian_diajukan','pengecualian_putus')),
  ident_id       bigint references keu_ident(id),
  lembar_id      bigint references keu_kebijakan_lembar(id),
  pengecualian_id bigint,
  judul          text not null check (char_length(judul) between 1 and 200),
  isi            text not null default '' check (char_length(isi) <= 1000),
  tautan         text not null default '' check (char_length(tautan) <= 300),
  pemicu         bigint references sigap_akun(id),
  dibuat_at      timestamptz not null default now(),
  dibaca_at      timestamptz
);
create index if not exists keu_notifikasi_akun_idx on keu_notifikasi(akun_id, dibaca_at, id desc);

create table if not exists keu_pengecualian (
  id             bigint generated always as identity primary key,
  ident_id       bigint not null references keu_ident(id),
  jenis          text not null check (jenis in ('perubahan_h15','kebijakan','rangkap')),
  objek          text not null check (char_length(btrim(objek)) between 1 and 300),
  alasan         text not null default '' check (char_length(alasan) <= 1000),
  lanjutan_ver   int,
  status         text not null default 'diajukan' check (status in ('diajukan','disetujui','ditolak','ditarik')),
  otomatis       boolean not null default false,
  diajukan_oleh  bigint references sigap_akun(id),
  diputus_oleh   bigint references sigap_akun(id),
  catatan_putusan text not null default '' check (char_length(catatan_putusan) <= 1000),
  diajukan_at    timestamptz not null default now(),
  diputus_at     timestamptz,
  constraint pengecualian_putus_ck check ((status in ('disetujui','ditolak')) = (diputus_oleh is not null and diputus_at is not null))
);
create index if not exists keu_pengecualian_ident_idx on keu_pengecualian(ident_id, id desc);
create unique index if not exists keu_pengecualian_h15_uq on keu_pengecualian(ident_id, lanjutan_ver) where jenis = 'perubahan_h15';
create unique index if not exists keu_pengecualian_buka_uq on keu_pengecualian(ident_id, jenis, lower(btrim(objek))) where status = 'diajukan' and jenis <> 'perubahan_h15';

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_notifikasi'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_notifikasi for each row execute function keu_ident_jaga();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_pengecualian'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_pengecualian for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_pengecualian for each row execute function keu_jejak();
  end if;
end $$;

-- penerima: akun aktif yang memegang salah satu peran pada tanggal ini (peran lingkup RO hanya untuk RO yang bersangkutan).
-- PBJ dialihkan ke PPK bila tidak ada pemegang PBJ untuk RO itu.
create or replace function keu_penerima(p_peran text[], p_ro text default null)
returns setof bigint language plpgsql stable security definer set search_path = public as $$
declare v_peran text[] := coalesce(p_peran, array[]::text[]);
begin
  if 'PBJ' = any(v_peran) and not exists (
       select 1 from keu_penugasan t join keu_master_peran pr on pr.kode = t.peran_kode and pr.aktif join sigap_akun a on a.id = t.akun_id and a.aktif
        where t.peran_kode = 'PBJ' and t.dibatalkan_at is null and t.masa @> current_date and (pr.lingkup = 'global' or p_ro is null or t.ro_kode = p_ro)) then
    v_peran := v_peran || array['PPK'];
  end if;
  return query
    select distinct t.akun_id
      from keu_penugasan t join keu_master_peran pr on pr.kode = t.peran_kode and pr.aktif join sigap_akun a on a.id = t.akun_id and a.aktif
     where t.peran_kode = any(v_peran) and t.dibatalkan_at is null and t.masa @> current_date and (pr.lingkup = 'global' or p_ro is null or t.ro_kode = p_ro);
end $$;
revoke execute on function keu_penerima(text[], text) from public, anon, authenticated;

create or replace function keu_notif_kirim(p_penerima bigint[], p_jenis text, p_judul text, p_isi text, p_tautan text, p_ident bigint, p_lembar bigint, p_pengecualian bigint, p_pelaku bigint)
returns int language plpgsql security definer set search_path = public as $$
declare v_prev text := coalesce(current_setting('keu.via_fungsi', true), ''); v_n int;
begin
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_notifikasi(akun_id, jenis, ident_id, lembar_id, pengecualian_id, judul, isi, tautan, pemicu)
    select distinct x, p_jenis, p_ident, p_lembar, p_pengecualian, left(p_judul, 200), left(coalesce(p_isi, ''), 1000), left(coalesce(p_tautan, ''), 300), p_pelaku
      from unnest(coalesce(p_penerima, array[]::bigint[])) as x;
  get diagnostics v_n = row_count;
  perform set_config('keu.via_fungsi', v_prev, true);
  return v_n;
end $$;
revoke execute on function keu_notif_kirim(bigint[], text, text, text, text, bigint, bigint, bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Pemicu notifikasi dan keputusan KPA otomatis
-- ---------------------------------------------------------------------
create or replace function keu_lanjutan_versi_notif()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; p keu_ident_lanjutan_versi; v_nama text; v_tautan text; v_pel bigint; v_baru int; v_lama int; v_prev text := coalesce(current_setting('keu.via_fungsi', true), '');
begin
  select * into i from keu_ident where id = new.ident_id;
  if not found then return null; end if;
  select * into p from keu_ident_lanjutan_versi where ident_id = new.ident_id and ver = new.ver - 1;
  select nama into v_nama from sigap_akun where id = new.oleh;
  v_tautan := '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/lanjutan';
  select count(*) into v_baru from jsonb_array_elements(coalesce(new.isi -> 'petugas', '[]'::jsonb)) e where (e ->> 'menyusul') = 'true';
  select count(*) into v_lama from jsonb_array_elements(coalesce(p.isi -> 'petugas', '[]'::jsonb)) e where (e ->> 'menyusul') = 'true';

  if new.pasca_h15 then
    -- keputusan KPA dicatat (tidak memblokir pemakaian versi) dan KPA serta PPK diberi tahu
    perform set_config('keu.via_fungsi', '1', true);
    insert into keu_pengecualian(ident_id, jenis, objek, alasan, lanjutan_ver, otomatis, diajukan_oleh)
      values (i.id, 'perubahan_h15', 'Identifikasi lanjutan versi ' || new.ver || case when new.ver = 1 then ' (dibuat sesudah H-15)' else ' (diubah sesudah H-15)' end,
              left(coalesce(nullif(new.alasan, ''), '(tanpa alasan; versi pertama)'), 1000), new.ver, true, new.oleh)
      on conflict do nothing
      returning id into v_pel;
    perform set_config('keu.via_fungsi', v_prev, true);
    perform keu_notif_kirim(array(select keu_penerima(array['KPA','PPK'], i.ro_kode)), 'ident_pasca_h15',
      'Lanjutan ' || i.nama || (case when new.ver = 1 then ' dibuat' else ' diubah' end) || ' sesudah H-15 (versi ' || new.ver || ')',
      'Oleh ' || coalesce(v_nama, '-') || '. Alasan: ' || coalesce(nullif(new.alasan, ''), '-') || '. KPA diminta mencatat keputusan; versi tetap dipakai modul hilir.',
      v_tautan || '#lj-pengecualian', i.id, null, v_pel, new.oleh);
  elsif new.status = 'final' and (p.ver is null or p.status = 'draf') then
    perform keu_notif_kirim(array(select keu_penerima(array['PPK','TU','BEND','KPA','PBJ'], i.ro_kode)), 'ident_fix',
      'Lanjutan ' || i.nama || ' menjadi Final (versi ' || new.ver || ')',
      'Kelas, jumlah, dan nama petugas sudah Fix (oleh ' || coalesce(v_nama, '-') || '). Rincian biaya dan dokumen turunan siap dibaca.',
      v_tautan, i.id, null, null, new.oleh);
  end if;

  if p.ver is not null and v_baru < v_lama then
    perform keu_notif_kirim(array(select keu_penerima(array['PPK'], i.ro_kode)), 'nama_terisi',
      (v_lama - v_baru) || ' nama petugas ' || i.nama || ' terisi',
      'Sisa nama menyusul: ' || v_baru || '. Dicatat pada versi ' || new.ver || ' oleh ' || coalesce(v_nama, '-') || '.',
      v_tautan || '#lj-petugas', i.id, null, null, new.oleh);
  end if;
  return null;
end $$;
revoke execute on function keu_lanjutan_versi_notif() from public, anon, authenticated;

create or replace function keu_lembar_menunggu_notif()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'menunggu' and old.status is distinct from 'menunggu' then
    perform keu_notif_kirim(array(select p.akun_id from keu_kebijakan_pengesah p where p.lembar_id = new.id and p.aktif and p.setuju_at is null), 'lembar_menunggu',
      'Lembar kebijakan ' || new.tahun || ' versi ' || new.ver || ' menunggu pengesahan Anda',
      'Rapat ' || coalesce(to_char(new.tanggal_rapat, 'DD/MM/YYYY'), '-') || ', ' || coalesce(nullif(new.nomor_notulen, ''), '-') || '. Semua ketua tim, PPK, dan Kepala wajib menyetujui.',
      '/sigap/kelola/perencanaan/kebijakan', null, new.id, null, new.diajukan_oleh);
  end if;
  return null;
end $$;
revoke execute on function keu_lembar_menunggu_notif() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_lanjutan_versi'::regclass and tgname = 'keu_t5_notif') then
    create trigger keu_t5_notif after insert on keu_ident_lanjutan_versi for each row execute function keu_lanjutan_versi_notif();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kebijakan_lembar'::regclass and tgname = 'keu_t5_notif') then
    create trigger keu_t5_notif after update of status on keu_kebijakan_lembar for each row execute function keu_lembar_menunggu_notif();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Fungsi alur pengecualian
-- ---------------------------------------------------------------------
create or replace function keu_pengecualian_ajukan(p_ident bigint, p_jenis text, p_objek text, p_alasan text, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare i keu_ident; v_objek text := btrim(coalesce(p_objek, '')); v_alasan text := btrim(coalesce(p_alasan, '')); v_id bigint; v_nama text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_jenis is null or p_jenis not in ('kebijakan','rangkap') then raise exception 'Jenis pengecualian harus kebijakan atau rangkap' using errcode = '22023'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang mengajukan pengecualian RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan' using errcode = '23514'; end if;
  if char_length(v_objek) < 3 or char_length(v_objek) > 300 then raise exception 'Hal yang dikecualikan wajib diisi (3 sampai 300 huruf)' using errcode = '23514'; end if;
  if char_length(v_alasan) < 10 then raise exception 'Alasan pengecualian wajib diisi (minimal 10 huruf)' using errcode = '23514'; end if;
  if exists (select 1 from keu_pengecualian where ident_id = i.id and jenis = p_jenis and lower(btrim(objek)) = lower(v_objek) and status = 'diajukan') then
    raise exception 'Pengecualian yang sama masih menunggu keputusan KPA' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_pengecualian(ident_id, jenis, objek, alasan, lanjutan_ver, diajukan_oleh)
    values (i.id, p_jenis, v_objek, v_alasan, (select ver from keu_ident_lanjutan where ident_id = i.id), p_akun) returning id into v_id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'pengecualian', null, 'diajukan', i.ver, p_akun, 'Pengecualian ' || p_jenis || ' diajukan: ' || left(v_objek, 120));
  select nama into v_nama from sigap_akun where id = p_akun;
  perform keu_notif_kirim(array(select keu_penerima(array['KPA'], i.ro_kode)), 'pengecualian_diajukan',
    'Pengecualian ' || p_jenis || ' menunggu keputusan: ' || i.nama, left(v_objek, 200) || ' (diajukan ' || coalesce(v_nama, '-') || ')',
    '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/lanjutan#lj-pengecualian', i.id, null, v_id, p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_pengecualian_ajukan(bigint, text, text, text, bigint) from public, anon, authenticated;

create or replace function keu_pengecualian_putus(p_id bigint, p_setuju boolean, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare x keu_pengecualian; i keu_ident; v_cat text := btrim(coalesce(p_catatan, '')); v_ke text; v_nama text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_setuju is null then raise exception 'Keputusan wajib dipilih (setuju atau tolak)' using errcode = '22023'; end if;
  select * into x from keu_pengecualian where id = p_id for update;
  if not found then raise exception 'Pengecualian % tidak ada', p_id using errcode = '23514'; end if;
  select * into i from keu_ident where id = x.ident_id;
  if not (keu_ident_punya(p_akun, 'KPA') and exists (select 1 from sigap_akun where id = p_akun and aktif)) then
    raise exception 'Hanya KPA yang dapat memutuskan pengecualian' using errcode = '42501';
  end if;
  if x.status <> 'diajukan' then raise exception 'Pengecualian sudah berstatus %', x.status using errcode = '23514'; end if;
  if not p_setuju and char_length(v_cat) < 5 then raise exception 'Catatan penolakan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
  v_ke := case when p_setuju then 'disetujui' else 'ditolak' end;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_pengecualian set status = v_ke, diputus_oleh = p_akun, diputus_at = now(), catatan_putusan = v_cat where id = x.id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'pengecualian', 'diajukan', v_ke, i.ver, p_akun,
    'Keputusan KPA atas ' || x.jenis || ': ' || v_ke || ' (' || left(x.objek, 100) || ')' || case when v_cat <> '' then ': ' || v_cat else '' end);
  select nama into v_nama from sigap_akun where id = p_akun;
  perform keu_notif_kirim(array(select distinct y from unnest(array[x.diajukan_oleh] || array(select keu_penerima(array['PPK'], i.ro_kode))) as y where y is not null), 'pengecualian_putus',
    'KPA ' || v_ke || ' ' || case x.jenis when 'perubahan_h15' then 'perubahan sesudah H-15' else 'pengecualian ' || x.jenis end || ': ' || i.nama,
    left(x.objek, 200) || ' (oleh ' || coalesce(v_nama, '-') || ')' || case when v_cat <> '' then '. ' || v_cat else '' end,
    '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/lanjutan#lj-pengecualian', i.id, null, x.id, p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return v_ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_pengecualian_putus(bigint, boolean, text, bigint) from public, anon, authenticated;

create or replace function keu_pengecualian_tarik(p_id bigint, p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare x keu_pengecualian; i keu_ident;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into x from keu_pengecualian where id = p_id for update;
  if not found then raise exception 'Pengecualian % tidak ada', p_id using errcode = '23514'; end if;
  select * into i from keu_ident where id = x.ident_id;
  if x.otomatis then raise exception 'Keputusan otomatis sesudah H-15 tidak dapat ditarik' using errcode = '23514'; end if;
  if x.diajukan_oleh is distinct from p_akun then raise exception 'Hanya pengaju yang dapat menarik pengecualian' using errcode = '42501'; end if;
  if x.status <> 'diajukan' then raise exception 'Pengecualian sudah berstatus %', x.status using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_pengecualian set status = 'ditarik' where id = x.id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'pengecualian', 'diajukan', 'ditarik', i.ver, p_akun, 'Pengecualian ' || x.jenis || ' ditarik: ' || left(x.objek, 120));
  perform set_config('keu.via_fungsi', '', true);
  return 'ditarik';
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_pengecualian_tarik(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Baca notifikasi, tandai dibaca
-- ---------------------------------------------------------------------
create or replace function keu_notifikasi_saya(p_belum boolean default false, p_batas int default 100, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_n int; v_daftar jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select count(*) into v_n from keu_notifikasi where akun_id = p_akun and dibaca_at is null;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb) into v_daftar
    from (select n.id, n.jenis, n.ident_id, n.lembar_id, n.pengecualian_id, n.judul, n.isi, n.tautan, n.dibuat_at, n.dibaca_at, a.nama as pemicu_nama
            from keu_notifikasi n left join sigap_akun a on a.id = n.pemicu
           where n.akun_id = p_akun and (not coalesce(p_belum, false) or n.dibaca_at is null)
           order by n.id desc limit least(greatest(coalesce(p_batas, 100), 1), 300)) x;
  return jsonb_build_object('belum', v_n, 'daftar', v_daftar);
end $$;
revoke execute on function keu_notifikasi_saya(boolean, int, bigint) from public, anon, authenticated;

create or replace function keu_notifikasi_tandai(p_id bigint default null, p_akun bigint default keu_akun_sesi())
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_notifikasi set dibaca_at = now() where akun_id = p_akun and dibaca_at is null and (p_id is null or id = p_id);
  get diagnostics v_n = row_count;
  perform set_config('keu.via_fungsi', '', true);
  return v_n;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_notifikasi_tandai(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Tampilan, RLS, gerbang
-- ---------------------------------------------------------------------
create or replace view keu_v_pengecualian with (security_invoker = true) as
select x.id, x.ident_id, i.tahun, i.ro_kode, i.nama, x.jenis, x.objek, x.alasan, x.lanjutan_ver, x.status, x.otomatis,
       x.diajukan_oleh, a.nama as diajukan_oleh_nama, d.nama as diputus_oleh_nama, x.catatan_putusan, x.diajukan_at, x.diputus_at
from keu_pengecualian x join keu_ident i on i.id = x.ident_id
left join sigap_akun a on a.id = x.diajukan_oleh left join sigap_akun d on d.id = x.diputus_oleh;

-- Pintu modul hilir (RAB, pengadaan, rencana realisasi, rekrutmen, Delego): identifikasi awal/terupdate yang sah, lanjutan bila ada, dan lembar kebijakan yang dipakai.
create or replace view keu_v_ident_acuan with (security_invoker = true) as
select i.id as ident_id, i.tahun, i.ro_kode, i.nama, i.ver as ident_ver,
       (select v.form from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver) as form_sah, i.upd,
       l.id is not null as lanjutan_ada, l.ver as lanjutan_ver, l.status as lanjutan_status, l.pasca_h15, l.isi as lanjutan_isi,
       l.kebijakan_id, kb.ver as kebijakan_ver,
       case when l.id is null then 'awal' else 'lanjutan' end as sumber
from keu_ident i
left join keu_ident_lanjutan l on l.ident_id = i.id
left join keu_kebijakan_lembar kb on kb.id = l.kebijakan_id
where i.ver >= 1 and i.status <> 'dibatalkan';

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_notifikasi','keu_pengecualian')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_pengecualian, keu_v_ident_acuan from anon, authenticated, public;
grant select on keu_v_pengecualian, keu_v_ident_acuan to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_notifikasi_saya''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_notifikasi_saya'',''keu_notifikasi_tandai'',''keu_pengecualian_ajukan'',''keu_pengecualian_putus'',''keu_pengecualian_tarik'',');
    if position('''keu_notifikasi_saya''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
