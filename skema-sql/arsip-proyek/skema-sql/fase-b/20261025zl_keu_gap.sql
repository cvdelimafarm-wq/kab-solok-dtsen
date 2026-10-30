-- =====================================================================
-- 20261025zl_keu_gap.sql
-- SIGAP - Tahap 32: peringatan pelaksanaan dan laporan Gap (rencana identifikasi lanjutan dibanding kenyataan pelaksanaan).
-- Bergantung pada za, zc (identifikasi), zf (lanjutan), zh (notifikasi), zj (tautan dan bahan pelaksanaan). Aman diulang. Tanpa DELETE/DROP TABLE.
--
-- Isi:
--  1. keu_gap: salinan temuan yang disimpan (versi berurutan per identifikasi, tidak pernah diubah atau dihapus). jenis 'berjalan' = peringatan
--     pelaksanaan; 'akhir' = laporan Gap akhir (hanya sesudah semua kegiatan tertaut berakhir). Temuan dihitung aplikasi (lib/keu/gap.ts) dari bahan
--     pelaksanaan lalu disimpan di sini; basis data memeriksa bentuk dan hak penyimpan, dan menyimpan jejaknya.
--  2. keu_gap_tanggapan: tanggapan PPK, KPA, atau penyusun terhadap satu temuan pada satu versi (diterima / dijelaskan / ditindaklanjuti).
--  3. keu_gap_simpan, keu_gap_tanggapi; jenis notifikasi baru 'gap_keras' (temuan keras BARU, ke PPK) dan 'gap_akhir' (laporan akhir, ke PPK dan KPA).
--  4. Tampilan keu_v_gap, keu_v_gap_tanggapan, keu_v_gap_terbaru (untuk lencana pada daftar identifikasi); izin gerbang.
--
-- Keputusan (25 Okt 2026): peringatan dan Gap tidak memblokir apa pun; temuan keras diberitahukan ke PPK lewat notifikasi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_gap (
  id           bigint generated always as identity primary key,
  ident_id     bigint not null references keu_ident(id),
  ver          int not null check (ver >= 1),
  jenis        text not null check (jenis in ('berjalan','akhir')),
  temuan       jsonb not null default '[]'::jsonb check (jsonb_typeof(temuan) = 'array'),
  ringkas      jsonb not null default '{}'::jsonb check (jsonb_typeof(ringkas) = 'object'),
  n_keras      int not null default 0 check (n_keras >= 0),
  n_sedang     int not null default 0 check (n_sedang >= 0),
  n_info       int not null default 0 check (n_info >= 0),
  lanjutan_ver int,
  dibuat_oleh  bigint references sigap_akun(id),
  dibuat_at    timestamptz not null default now(),
  unique (ident_id, ver)
);
create index if not exists keu_gap_ident_idx on keu_gap(ident_id, ver desc);

create table if not exists keu_gap_tanggapan (
  id        bigint generated always as identity primary key,
  gap_id    bigint not null references keu_gap(id),
  kunci     text not null check (char_length(kunci) between 1 and 80),
  status    text not null check (status in ('diterima','dijelaskan','ditindaklanjuti')),
  catatan   text not null default '' check (char_length(catatan) <= 500),
  oleh      bigint references sigap_akun(id),
  at        timestamptz not null default now(),
  unique (gap_id, kunci)
);

create or replace function keu_gap_tetap()
returns trigger language plpgsql as $$
begin
  raise exception 'Versi laporan Gap tidak boleh diubah atau dihapus; simpan versi baru' using errcode = '42501';
end $$;
revoke execute on function keu_gap_tetap() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_gap'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_gap for each row execute function keu_ident_jaga();
    create trigger keu_t2_tetap before update or delete on keu_gap for each row execute function keu_gap_tetap();
    create trigger keu_t9_jejak after insert on keu_gap for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_gap_tanggapan'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_gap_tanggapan for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_gap_tanggapan for each row execute function keu_jejak();
  end if;
end $$;

-- jenis notifikasi baru; daftar lama dipertahankan
do $$
declare v_nama text;
begin
  select c.conname into v_nama from pg_constraint c
   where c.conrelid = 'public.keu_notifikasi'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%ident_fix%' limit 1;
  if v_nama is not null and (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = v_nama and c.conrelid = 'public.keu_notifikasi'::regclass) not like '%gap_akhir%' then
    execute format('alter table keu_notifikasi drop constraint %I', v_nama);
    alter table keu_notifikasi add constraint keu_notifikasi_jenis_check check (jenis in
      ('ident_fix','ident_pasca_h15','nama_terisi','lembar_menunggu','pengecualian_diajukan','pengecualian_putus','penugasan_diterapkan','gap_keras','gap_akhir'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Pembantu
-- ---------------------------------------------------------------------
-- Memeriksa bentuk larik temuan; mengembalikan {n_keras, n_sedang, n_info}. Galat bila ada butir tidak sah atau kunci ganda.
create or replace function keu_gap_periksa(p_temuan jsonb)
returns jsonb language plpgsql immutable as $$
declare e jsonb; v_keras int := 0; v_sedang int := 0; v_info int := 0; v_kunci text[] := array[]::text[]; k text;
begin
  if p_temuan is null or jsonb_typeof(p_temuan) <> 'array' then raise exception 'Temuan harus berupa larik' using errcode = '22023'; end if;
  if jsonb_array_length(p_temuan) > 300 then raise exception 'Terlalu banyak temuan (maksimal 300)' using errcode = '22023'; end if;
  for e in select x from jsonb_array_elements(p_temuan) as x loop
    if jsonb_typeof(e) <> 'object' then raise exception 'Butir temuan harus berupa objek' using errcode = '22023'; end if;
    k := e ->> 'kunci';
    if k is null or char_length(k) not between 1 and 80 then raise exception 'Kunci temuan wajib, 1-80 huruf' using errcode = '22023'; end if;
    if k = any(v_kunci) then raise exception 'Kunci temuan ganda: %', k using errcode = '22023'; end if;
    v_kunci := v_kunci || k;
    if coalesce(e ->> 'kategori', '') not in ('tautan','petugas','jadwal','laporan','biaya','evaluasi','kebijakan') then raise exception 'Kategori temuan % tidak dikenal', k using errcode = '22023'; end if;
    if coalesce(e ->> 'tingkat', '') not in ('info','sedang','keras') then raise exception 'Tingkat temuan % tidak dikenal', k using errcode = '22023'; end if;
    if char_length(coalesce(e ->> 'pesan', '')) not between 1 and 500 then raise exception 'Pesan temuan % wajib, 1-500 huruf', k using errcode = '22023'; end if;
    if e ? 'tuju' and jsonb_typeof(e -> 'tuju') not in ('string','null') then raise exception 'Tujuan temuan % tidak sah', k using errcode = '22023'; end if;
    if char_length(coalesce(e ->> 'tuju', '')) > 40 then raise exception 'Tujuan temuan % terlalu panjang', k using errcode = '22023'; end if;
    case e ->> 'tingkat' when 'keras' then v_keras := v_keras + 1; when 'sedang' then v_sedang := v_sedang + 1; else v_info := v_info + 1; end case;
  end loop;
  return jsonb_build_object('n_keras', v_keras, 'n_sedang', v_sedang, 'n_info', v_info);
end $$;
revoke execute on function keu_gap_periksa(jsonb) from public, anon, authenticated;

-- Sidik isi temuan (kunci, tingkat, pesan) tak bergantung urutan; dipakai mengenali penyimpanan tanpa perubahan.
create or replace function keu_gap_sidik(p_temuan jsonb)
returns text language sql immutable as $$
  select coalesce(md5(string_agg((e ->> 'kunci') || '|' || (e ->> 'tingkat') || '|' || (e ->> 'pesan'), E'\n' order by (e ->> 'kunci'))), '')
    from jsonb_array_elements(coalesce(p_temuan, '[]'::jsonb)) as e
$$;
revoke execute on function keu_gap_sidik(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Simpan dan tanggapi
-- ---------------------------------------------------------------------
create or replace function keu_gap_simpan(p_ident bigint, p_jenis text, p_temuan jsonb, p_ringkas jsonb default '{}'::jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; l keu_ident_lanjutan; s jsonb; prev keu_gap; v_ver int; v_id bigint; v_baru text[]; v_nama text; v_pesan text; v_ro text;
  v_ringkas jsonb := coalesce(p_ringkas, '{}'::jsonb);
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  v_ro := i.ro_kode;
  if not (keu_boleh(p_akun, 'ident_susun', v_ro) or keu_ident_punya(p_akun, 'PPK') or keu_ident_punya(p_akun, 'KPA')) then
    raise exception 'Akun % tidak berwenang menyimpan laporan Gap RO %', p_akun, v_ro using errcode = '42501';
  end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan' using errcode = '23514'; end if;
  if i.ver < 1 then raise exception 'Identifikasi awal belum disahkan' using errcode = '23514'; end if;
  if coalesce(p_jenis, '') not in ('berjalan','akhir') then raise exception 'Jenis harus berjalan atau akhir' using errcode = '22023'; end if;
  select * into l from keu_ident_lanjutan where ident_id = i.id;
  if not found then raise exception 'Laporan Gap memerlukan identifikasi lanjutan yang sudah disimpan' using errcode = '23514'; end if;
  if jsonb_typeof(v_ringkas) <> 'object' or pg_column_size(v_ringkas) > 20000 then raise exception 'Ringkasan tidak sah' using errcode = '22023'; end if;
  s := keu_gap_periksa(p_temuan);

  if p_jenis = 'akhir' then
    if not exists (select 1 from keu_ident_kegiatan where ident_id = i.id and dilepas_at is null) then
      raise exception 'Laporan Gap akhir memerlukan minimal satu kegiatan tertaut' using errcode = '23514';
    end if;
    if exists (select 1 from keu_ident_kegiatan t join sigap_kegiatan g on g.id = t.kegiatan_id
                where t.ident_id = i.id and t.dilepas_at is null and (g.tanggal_selesai is null or g.tanggal_selesai >= current_date)) then
      raise exception 'Laporan Gap akhir disusun sesudah seluruh kegiatan tertaut berakhir' using errcode = '23514';
    end if;
  end if;

  select * into prev from keu_gap where ident_id = i.id order by ver desc limit 1;
  if found and prev.jenis = p_jenis and keu_gap_sidik(prev.temuan) = keu_gap_sidik(p_temuan) then
    return jsonb_build_object('id', prev.id, 'ver', prev.ver, 'tanpa_perubahan', true, 'n_keras', prev.n_keras, 'baru_keras', 0);
  end if;
  v_ver := coalesce(prev.ver, 0) + 1;

  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_gap(ident_id, ver, jenis, temuan, ringkas, n_keras, n_sedang, n_info, lanjutan_ver, dibuat_oleh)
    values (i.id, v_ver, p_jenis, p_temuan, v_ringkas, (s ->> 'n_keras')::int, (s ->> 'n_sedang')::int, (s ->> 'n_info')::int, l.ver, p_akun) returning id into v_id;

  -- temuan keras yang BARU dibanding versi sebelumnya (kunci baru, atau naik menjadi keras)
  select coalesce(array_agg(e ->> 'pesan' order by e ->> 'kunci'), array[]::text[]) into v_baru
    from jsonb_array_elements(p_temuan) as e
   where e ->> 'tingkat' = 'keras'
     and not exists (select 1 from jsonb_array_elements(coalesce(prev.temuan, '[]'::jsonb)) as o where o ->> 'kunci' = e ->> 'kunci' and o ->> 'tingkat' = 'keras');

  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan)
    values (i.id, 'gap', null, p_jenis, i.ver, p_akun, 'Laporan Gap ' || p_jenis || ' versi ' || v_ver || ': ' || (s ->> 'n_keras') || ' keras, ' || (s ->> 'n_sedang') || ' perlu perhatian, ' || (s ->> 'n_info') || ' informasi');
  select nama into v_nama from sigap_akun where id = p_akun;

  if p_jenis = 'akhir' then
    perform keu_notif_kirim(array(select keu_penerima(array['PPK','KPA'], v_ro)), 'gap_akhir',
      'Laporan Gap akhir tersedia: ' || i.nama, 'Versi ' || v_ver || ' oleh ' || coalesce(v_nama, '-') || ': ' || (s ->> 'n_keras') || ' temuan keras, ' || (s ->> 'n_sedang') || ' perlu perhatian.',
      '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/gap', i.id, null, null, p_akun);
  elsif cardinality(v_baru) > 0 then
    v_pesan := left(array_to_string(v_baru[1:3], ' | '), 600) || case when cardinality(v_baru) > 3 then ' | dan ' || (cardinality(v_baru) - 3) || ' lainnya' else '' end;
    perform keu_notif_kirim(array(select keu_penerima(array['PPK'], v_ro)), 'gap_keras',
      cardinality(v_baru) || ' temuan keras baru pada pelaksanaan: ' || i.nama, v_pesan,
      '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/gap', i.id, null, null, p_akun);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', v_id, 'ver', v_ver, 'tanpa_perubahan', false, 'n_keras', (s ->> 'n_keras')::int, 'baru_keras', cardinality(v_baru));
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_gap_simpan(bigint, text, jsonb, jsonb, bigint) from public, anon, authenticated;

create or replace function keu_gap_tanggapi(p_gap bigint, p_kunci text, p_status text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare g keu_gap; i keu_ident; v_cat text := btrim(coalesce(p_catatan, ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into g from keu_gap where id = p_gap;
  if not found then raise exception 'Laporan Gap % tidak ada', p_gap using errcode = '23514'; end if;
  select * into i from keu_ident where id = g.ident_id;
  if not (keu_boleh(p_akun, 'ident_susun', i.ro_kode) or keu_ident_punya(p_akun, 'PPK') or keu_ident_punya(p_akun, 'KPA')) then
    raise exception 'Akun % tidak berwenang menanggapi temuan RO %', p_akun, i.ro_kode using errcode = '42501';
  end if;
  if coalesce(p_status, '') not in ('diterima','dijelaskan','ditindaklanjuti') then raise exception 'Status tanggapan tidak dikenal' using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_array_elements(g.temuan) as e where e ->> 'kunci' = p_kunci) then raise exception 'Temuan % tidak ada pada laporan ini', p_kunci using errcode = '23514'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 huruf' using errcode = '23514'; end if;
  if p_status in ('dijelaskan','ditindaklanjuti') and char_length(v_cat) < 10 then raise exception 'Penjelasan atau tindak lanjut wajib beralasan (minimal 10 huruf)' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_gap_tanggapan(gap_id, kunci, status, catatan, oleh) values (g.id, p_kunci, p_status, v_cat, p_akun)
    on conflict (gap_id, kunci) do update set status = excluded.status, catatan = excluded.catatan, oleh = excluded.oleh, at = now();
  perform set_config('keu.via_fungsi', '', true);
  return p_status;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_gap_tanggapi(bigint, text, text, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Tampilan, RLS, gerbang
-- ---------------------------------------------------------------------
create or replace view keu_v_gap with (security_invoker = true) as
select g.id, g.ident_id, i.ro_kode, i.tahun, i.nama, g.ver, g.jenis, g.temuan, g.ringkas, g.n_keras, g.n_sedang, g.n_info, g.lanjutan_ver, a.nama as dibuat_oleh_nama, g.dibuat_at
from keu_gap g join keu_ident i on i.id = g.ident_id left join sigap_akun a on a.id = g.dibuat_oleh;

create or replace view keu_v_gap_tanggapan with (security_invoker = true) as
select t.id, t.gap_id, g.ident_id, t.kunci, t.status, t.catatan, a.nama as oleh_nama, t.at
from keu_gap_tanggapan t join keu_gap g on g.id = t.gap_id left join sigap_akun a on a.id = t.oleh;

-- versi terbaru per identifikasi, untuk lencana pada daftar
create or replace view keu_v_gap_terbaru with (security_invoker = true) as
select distinct on (g.ident_id) g.ident_id, g.ver, g.jenis, g.n_keras, g.n_sedang, g.n_info, g.dibuat_at
from keu_gap g order by g.ident_id, g.ver desc;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_gap','keu_gap_tanggapan')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_gap, keu_v_gap_tanggapan, keu_v_gap_terbaru from anon, authenticated, public;
grant select on keu_v_gap, keu_v_gap_tanggapan, keu_v_gap_terbaru to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_gap_tanggapi''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_gap_simpan'',''keu_gap_tanggapi'',');
    if position('''keu_gap_tanggapi''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
