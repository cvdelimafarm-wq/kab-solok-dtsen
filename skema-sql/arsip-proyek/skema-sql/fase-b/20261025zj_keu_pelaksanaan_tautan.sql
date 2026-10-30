-- =====================================================================
-- 20261025zj_keu_pelaksanaan_tautan.sql
-- SIGAP - Tahap 31: tautan identifikasi ke kegiatan pelaksanaan, usulan penugasan (acuan Delego), bahan pelaksanaan (laporan harian, evaluasi, Bendahara).
-- Bergantung pada za, zc (identifikasi), zf (lanjutan), zh (notifikasi). Aman diulang. Tanpa DELETE/DROP TABLE.
--
-- Isi:
--  1. keu_ident_kegiatan: tautan identifikasi <-> kegiatan pelaksanaan (sigap_kegiatan). Dipilih manual oleh penyusun identifikasi; sistem hanya
--     menyarankan kegiatan yang kode anggarannya memuat kode RO. Satu kegiatan boleh ditautkan ke beberapa identifikasi (survei terintegrasi).
--     Tautan tidak dihapus, hanya dilepas (jejak tetap ada).
--  2. keu_usulan_penugasan: daftar petugas lanjutan Final dipadankan dengan master akun (nama persis, tanpa beda huruf besar/spasi ganda),
--     lengkap dengan status tiap baris. keu_usulan_terapkan: menambah penugasan (sigap_penugasan) HANYA untuk baris berstatus 'siap'; tidak pernah
--     mengubah atau menghapus penugasan yang sudah ada.
--  3. keu_pelaksanaan_bahan: fakta pelaksanaan untuk satu identifikasi (penugasan, hari kerja, laporan harian, presensi, rapat evaluasi, tarif kegiatan,
--     pagu dan realisasi per akun). Dipakai halaman Pelaksanaan (tahap 31) dan laporan Gap (tahap 32). Hanya membaca.
--  4. Tampilan keu_v_ident_kegiatan dan keu_v_kegiatan_calon; jenis notifikasi baru 'penugasan_diterapkan'; izin gerbang.
--
-- Keputusan (25 Okt 2026): tautan dipilih manual dengan saran otomatis; Delego satu kesatuan dengan SIGAP (tanpa ekspor); peringatan tidak memblokir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tautan identifikasi <-> kegiatan
-- ---------------------------------------------------------------------
create table if not exists keu_ident_kegiatan (
  id             bigint generated always as identity primary key,
  ident_id       bigint not null references keu_ident(id),
  kegiatan_id    bigint not null references sigap_kegiatan(id),
  fungsi         text not null default 'pendataan' check (fungsi in ('pendataan','pelatihan','lain')),
  disarankan     boolean not null default false,
  catatan        text not null default '' check (char_length(catatan) <= 300),
  ditautkan_oleh bigint references sigap_akun(id),
  ditautkan_at   timestamptz not null default now(),
  dilepas_oleh   bigint references sigap_akun(id),
  dilepas_at     timestamptz,
  constraint ident_kegiatan_lepas_ck check ((dilepas_at is null) = (dilepas_oleh is null))
);
create unique index if not exists keu_ident_kegiatan_aktif_uq on keu_ident_kegiatan(ident_id, kegiatan_id) where dilepas_at is null;
create index if not exists keu_ident_kegiatan_keg_idx on keu_ident_kegiatan(kegiatan_id) where dilepas_at is null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_kegiatan'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_kegiatan for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_ident_kegiatan for each row execute function keu_jejak();
  end if;
end $$;

-- jenis notifikasi baru (penugasan diterapkan); daftar lama dipertahankan
do $$
declare v_nama text;
begin
  select c.conname into v_nama from pg_constraint c
   where c.conrelid = 'public.keu_notifikasi'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%ident_fix%' limit 1;
  if v_nama is not null and (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = v_nama and c.conrelid = 'public.keu_notifikasi'::regclass) not like '%penugasan_diterapkan%' then
    execute format('alter table keu_notifikasi drop constraint %I', v_nama);
    alter table keu_notifikasi add constraint keu_notifikasi_jenis_check check (jenis in
      ('ident_fix','ident_pasca_h15','nama_terisi','lembar_menunggu','pengecualian_diajukan','pengecualian_putus','penugasan_diterapkan'));
  end if;
end $$;

-- akun yang boleh MELIHAT bahan pelaksanaan sebuah identifikasi: penyusun RO itu, KPA, PPK, TU, Bendahara, PBJ RO itu, Admin
create or replace function keu_ident_lihat(p_akun bigint, p_ro text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sigap_akun a where a.id = p_akun and a.aktif)
     and (keu_boleh(p_akun, 'ident_susun', p_ro) or keu_ident_punya(p_akun, 'KPA') or keu_ident_punya(p_akun, 'PPK') or keu_ident_punya(p_akun, 'TU')
          or keu_ident_punya(p_akun, 'BEND') or keu_ident_punya(p_akun, 'PBJ', p_ro) or keu_ident_punya(p_akun, 'ADMIN'))
$$;
revoke execute on function keu_ident_lihat(bigint, text) from public, anon, authenticated;

create or replace function keu_norm_nama(p text)
returns text language sql immutable as $$ select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;
revoke execute on function keu_norm_nama(text) from public, anon, authenticated;

create or replace function keu_ident_kegiatan_tautkan(p_ident bigint, p_kegiatan bigint, p_fungsi text default 'pendataan', p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare i keu_ident; g sigap_kegiatan; v_id bigint; v_cat text := btrim(coalesce(p_catatan, '')); v_fungsi text := coalesce(p_fungsi, 'pendataan');
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang menautkan kegiatan untuk RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan' using errcode = '23514'; end if;
  if i.ver < 1 then raise exception 'Identifikasi awal belum disahkan; kegiatan dapat ditautkan sesudah disahkan' using errcode = '23514'; end if;
  if v_fungsi not in ('pendataan','pelatihan','lain') then raise exception 'Fungsi kegiatan harus pendataan, pelatihan, atau lain' using errcode = '22023'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 huruf' using errcode = '23514'; end if;
  select * into g from sigap_kegiatan where id = p_kegiatan;
  if not found then raise exception 'Kegiatan % tidak ada', p_kegiatan using errcode = '23514'; end if;
  if exists (select 1 from keu_ident_kegiatan where ident_id = i.id and kegiatan_id = g.id and dilepas_at is null) then
    raise exception 'Kegiatan % sudah ditautkan ke identifikasi ini', g.nama using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_ident_kegiatan(ident_id, kegiatan_id, fungsi, disarankan, catatan, ditautkan_oleh)
    values (i.id, g.id, v_fungsi, position(i.ro_kode in coalesce(g.kode_anggaran, '')) > 0, v_cat, p_akun) returning id into v_id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'kegiatan', null, 'ditautkan', i.ver, p_akun, 'Kegiatan ditautkan: ' || left(g.nama, 150) || ' (' || v_fungsi || ')');
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_kegiatan_tautkan(bigint, bigint, text, text, bigint) from public, anon, authenticated;

create or replace function keu_ident_kegiatan_lepas(p_ident bigint, p_kegiatan bigint, p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare i keu_ident; t keu_ident_kegiatan; g sigap_kegiatan;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang melepas kegiatan untuk RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  select * into t from keu_ident_kegiatan where ident_id = i.id and kegiatan_id = p_kegiatan and dilepas_at is null for update;
  if not found then raise exception 'Tautan kegiatan tidak ada atau sudah dilepas' using errcode = '23514'; end if;
  select * into g from sigap_kegiatan where id = p_kegiatan;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_ident_kegiatan set dilepas_at = now(), dilepas_oleh = p_akun where id = t.id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'kegiatan', 'ditautkan', 'dilepas', i.ver, p_akun, 'Tautan kegiatan dilepas: ' || left(coalesce(g.nama, '?'), 150));
  perform set_config('keu.via_fungsi', '', true);
  return 'dilepas';
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_kegiatan_lepas(bigint, bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Usulan penugasan dari lanjutan
-- ---------------------------------------------------------------------
-- Hasil: larik JSON, satu butir per petugas pada lanjutan. status: siap | sudah_ada | menyusul | peran_kosong | tidak_ada | ambigu | tarif_belum.
-- Padanan memakai nama persis (huruf besar-kecil dan spasi ganda diabaikan) terhadap akun aktif; yang meragukan tidak pernah dipilihkan.
create or replace function keu_usulan_penugasan(p_ident bigint, p_kegiatan bigint, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i keu_ident; l keu_ident_lanjutan; v_hasil jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_ident_lihat(p_akun, i.ro_kode) then raise exception 'Akun % tidak berwenang melihat usulan penugasan RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if not exists (select 1 from keu_ident_kegiatan where ident_id = i.id and kegiatan_id = p_kegiatan and dilepas_at is null) then
    raise exception 'Kegiatan belum ditautkan ke identifikasi ini' using errcode = '23514';
  end if;
  select * into l from keu_ident_lanjutan where ident_id = i.id;
  if not found then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.urut), '[]'::jsonb) into v_hasil from (
    select q.urut, q.kode, q.nama, q.peran as peran_lanjutan, q.peran_sigap, q.calon, q.akun_id, q.akun_nama,
           q.status,
           case q.status
             when 'siap' then 'Siap diterapkan'
             when 'sudah_ada' then 'Sudah memiliki penugasan pada kegiatan ini'
             when 'menyusul' then 'Nama masih menyusul'
             when 'peran_kosong' then 'Peran belum dipilih pada lanjutan'
             when 'tidak_ada' then 'Nama tidak ditemukan di master akun; periksa ejaan atau daftarkan akunnya'
             when 'ambigu' then 'Ada beberapa akun bernama sama; tambahkan manual di Kelola translok'
             else 'Peran ' || q.peran_sigap || ' belum punya tarif pada kegiatan ini (isi di Kegiatan dan Tarif)'
           end as catatan
      from (
        select p.urut, p.kode, p.nama, p.peran, p.peran_sigap, c.n as calon, case when c.n = 1 then c.id1 end as akun_id, case when c.n = 1 then c.nama1 end as akun_nama,
               case
                 when p.menyusul or p.nama = '' then 'menyusul'
                 when p.peran is null then 'peran_kosong'
                 when c.n = 0 then 'tidak_ada'
                 when c.n > 1 then 'ambigu'
                 when exists (select 1 from sigap_penugasan s where s.kegiatan_id = p_kegiatan and s.akun_id = c.id1) then 'sudah_ada'
                 when not exists (select 1 from sigap_kegiatan_tarif t where t.kegiatan_id = p_kegiatan and t.peran = p.peran_sigap) then 'tarif_belum'
                 else 'siap'
               end as status
          from (
            select o.ord::int as urut, o.e ->> 'id' as kode, btrim(coalesce(o.e ->> 'nama', '')) as nama, coalesce((o.e ->> 'menyusul')::boolean, false) as menyusul,
                   nullif(o.e ->> 'peran', '') as peran,
                   case nullif(o.e ->> 'peran', '') when 'kortim' then 'korwil' else nullif(o.e ->> 'peran', '') end as peran_sigap
              from jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) with ordinality as o(e, ord)
          ) p
          left join lateral (
            select count(*)::int as n, min(a.id) as id1, min(a.nama) as nama1 from sigap_akun a where a.aktif and p.nama <> '' and keu_norm_nama(a.nama) = keu_norm_nama(p.nama)
          ) c on true
      ) q
  ) z;
  return v_hasil;
end $$;
revoke execute on function keu_usulan_penugasan(bigint, bigint, bigint) from public, anon, authenticated;

create or replace function keu_usulan_terapkan(p_ident bigint, p_kegiatan bigint, p_kode text[], p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; l keu_ident_lanjutan; g sigap_kegiatan; r jsonb; v_n int := 0; v_tambah int := 0; v_lewat jsonb := '[]'::jsonb; v_kode text[] := coalesce(p_kode, array[]::text[]); v_nama text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang menerapkan penugasan RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan' using errcode = '23514'; end if;
  select * into l from keu_ident_lanjutan where ident_id = i.id;
  if not found or l.status <> 'final' then raise exception 'Usulan penugasan hanya dapat diterapkan dari identifikasi lanjutan yang Final' using errcode = '23514'; end if;
  select * into g from sigap_kegiatan where id = p_kegiatan;
  if not found then raise exception 'Kegiatan % tidak ada', p_kegiatan using errcode = '23514'; end if;
  if not g.aktif then raise exception 'Kegiatan % tidak aktif', g.nama using errcode = '23514'; end if;
  if cardinality(v_kode) = 0 then raise exception 'Pilih minimal satu petugas' using errcode = '23514'; end if;
  if cardinality(v_kode) > 400 then raise exception 'Terlalu banyak petugas dalam satu penerapan (maksimal 400)' using errcode = '23514'; end if;

  for r in select e from jsonb_array_elements(keu_usulan_penugasan(i.id, g.id, p_akun)) as e where (e ->> 'kode') = any(v_kode) loop
    v_n := v_n + 1;
    if (r ->> 'status') = 'siap' then
      insert into sigap_penugasan(kegiatan_id, akun_id, peran, aktif, sumber)
        values (g.id, (r ->> 'akun_id')::bigint, r ->> 'peran_sigap', true, 'lanjutan:' || i.id || ' v' || l.ver)
        on conflict (kegiatan_id, akun_id) do nothing;
      if found then v_tambah := v_tambah + 1; else v_lewat := v_lewat || jsonb_build_array(jsonb_build_object('kode', r ->> 'kode', 'status', 'sudah_ada')); end if;
    else
      v_lewat := v_lewat || jsonb_build_array(jsonb_build_object('kode', r ->> 'kode', 'status', r ->> 'status'));
    end if;
  end loop;
  if v_n < cardinality(v_kode) then
    v_lewat := v_lewat || jsonb_build_array(jsonb_build_object('kode', '*', 'status', 'kode_tak_dikenal', 'jumlah', cardinality(v_kode) - v_n));
  end if;

  insert into sigap_audit(akun_id, aksi, detail) values (p_akun, 'keu.usulan_penugasan.terapkan', jsonb_build_object('ident_id', i.id, 'kegiatan_id', g.id, 'lanjutan_ver', l.ver, 'ditambah', v_tambah, 'dilewati', v_lewat));
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'penugasan', null, 'diterapkan', i.ver, p_akun,
    v_tambah || ' penugasan ditambahkan ke ' || left(g.nama, 120) || ' dari lanjutan versi ' || l.ver);
  select nama into v_nama from sigap_akun where id = p_akun;
  if v_tambah > 0 then
    perform keu_notif_kirim(array(select keu_penerima(array['PPK'], i.ro_kode)), 'penugasan_diterapkan',
      v_tambah || ' penugasan ditambahkan: ' || g.nama, 'Dari identifikasi lanjutan ' || i.nama || ' versi ' || l.ver || ', oleh ' || coalesce(v_nama, '-') || '. Penugasan yang sudah ada tidak diubah.',
      '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/pelaksanaan', i.id, null, null, p_akun);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('ditambah', v_tambah, 'dilewati', v_lewat, 'lanjutan_ver', l.ver);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_usulan_terapkan(bigint, bigint, text[], bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Bahan pelaksanaan (hanya membaca)
-- ---------------------------------------------------------------------
create or replace function keu_pelaksanaan_bahan(p_ident bigint, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i keu_ident; v_keg jsonb; v_real jsonb; v_sampai date;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_ident_lihat(p_akun, i.ro_kode) then raise exception 'Akun % tidak berwenang melihat bahan pelaksanaan RO %', p_akun, i.ro_kode using errcode = '42501'; end if;

  select coalesce(jsonb_agg(q.k order by q.urut), '[]'::jsonb) into v_keg from (
    select g.id as urut, jsonb_build_object(
      'id', g.id, 'kode', g.kode, 'nama', g.nama, 'kode_anggaran', g.kode_anggaran, 'jenis', g.jenis, 'aktif', g.aktif,
      'mulai', g.tanggal_mulai, 'selesai', g.tanggal_selesai, 'fungsi', t.fungsi,
      'tarif', coalesce((select jsonb_agg(jsonb_build_object('peran', x.peran, 'tarif', x.tarif, 'maks_hari', x.maks_hari_default) order by x.urutan, x.id)
                           from sigap_kegiatan_tarif x where x.kegiatan_id = g.id), '[]'::jsonb),
      'rapat_evaluasi', (select count(*) from sigap_rapat r where r.sasaran_kegiatan_id = g.id and r.aktif and r.judul ilike '%evaluasi%'),
      'presensi', (select count(distinct pr.akun_id) from sigap_pelatihan_presensi pr where pr.kegiatan_id = g.id and pr.diterima),
      'petugas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'akun_id', s.akun_id, 'nama', a.nama, 'peran', s.peran, 'aktif', s.aktif, 'maks_hari', s.maks_hari, 'kelas', s.kelas,
                 'hari_kerja', (select count(*) from sigap_hari_kerja h where h.penugasan_id = s.id),
                 'laporan', lp.n, 'lapor_pertama', lp.awal, 'lapor_terakhir', lp.akhir) order by s.id)
          from sigap_penugasan s
          join sigap_akun a on a.id = s.akun_id
          left join lateral (
            select count(distinct r.tanggal)::int as n, min(r.tanggal) as awal, max(r.tanggal) as akhir from sigap_realisasi r
             where r.kegiatan_id = s.kegiatan_id and (r.penugasan_id = s.id or (r.penugasan_id is null and r.petugas_id = s.akun_id))
          ) lp on true
         where s.kegiatan_id = g.id), '[]'::jsonb)
    ) as k
      from keu_ident_kegiatan t join sigap_kegiatan g on g.id = t.kegiatan_id
     where t.ident_id = i.id and t.dilepas_at is null
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object('akun', z.akun_kode, 'pagu', z.pagu, 'real_sd', z.real_sd, 'sisa', z.sisa) order by z.akun_kode), '[]'::jsonb), max(z.sampai)
    into v_real, v_sampai
    from (select r.akun_kode, sum(r.pagu) as pagu, sum(r.real_sd) as real_sd, sum(r.sisa) as sisa, max(r.sampai_tanggal) as sampai
            from keu_v_realisasi_terbaru r where r.ro_kode = i.ro_kode and r.tahun = i.tahun group by r.akun_kode) z;

  return jsonb_build_object('ident_id', i.id, 'ro_kode', i.ro_kode, 'tahun', i.tahun, 'dibuat_at', now(), 'kegiatan', v_keg, 'realisasi', v_real, 'realisasi_sampai', v_sampai);
end $$;
revoke execute on function keu_pelaksanaan_bahan(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Tampilan, RLS, gerbang
-- ---------------------------------------------------------------------
create or replace view keu_v_ident_kegiatan with (security_invoker = true) as
select t.id, t.ident_id, t.kegiatan_id, t.fungsi, t.disarankan, t.catatan, t.ditautkan_at, a.nama as ditautkan_oleh_nama,
       g.kode, g.nama, g.kode_anggaran, g.jenis, g.aktif, g.tanggal_mulai as mulai, g.tanggal_selesai as selesai,
       (select count(*) from sigap_penugasan s where s.kegiatan_id = g.id and s.aktif)::int as n_penugasan
from keu_ident_kegiatan t
join sigap_kegiatan g on g.id = t.kegiatan_id
left join sigap_akun a on a.id = t.ditautkan_oleh
where t.dilepas_at is null;

-- semua kegiatan sebagai calon tautan untuk tiap identifikasi yang sudah sah; disarankan = kode anggaran memuat kode RO
create or replace view keu_v_kegiatan_calon with (security_invoker = true) as
select i.id as ident_id, g.id as kegiatan_id, g.kode, g.nama, g.kode_anggaran, g.jenis, g.aktif, g.tanggal_mulai as mulai, g.tanggal_selesai as selesai,
       position(i.ro_kode in coalesce(g.kode_anggaran, '')) > 0 as disarankan,
       exists (select 1 from keu_ident_kegiatan t where t.ident_id = i.id and t.kegiatan_id = g.id and t.dilepas_at is null) as tertaut
from keu_ident i cross join sigap_kegiatan g
where i.ver >= 1 and i.status <> 'dibatalkan';

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'keu_ident_kegiatan'
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke all on keu_v_ident_kegiatan, keu_v_kegiatan_calon from anon, authenticated, public;
grant select on keu_v_ident_kegiatan, keu_v_kegiatan_calon to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_usulan_terapkan''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_ident_kegiatan_tautkan'',''keu_ident_kegiatan_lepas'',''keu_usulan_penugasan'',''keu_usulan_terapkan'',''keu_pelaksanaan_bahan'',');
    if position('''keu_usulan_terapkan''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
