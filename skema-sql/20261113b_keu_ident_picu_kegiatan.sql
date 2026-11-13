-- skema-sql/20261113b_keu_ident_picu_kegiatan.sql
--
-- (13 Nov 2026, keputusan A Iqbal 13 Nov sore) Identifikasi yang disahkan memicu kegiatan SIGAP.
-- Saat identifikasi survei disahkan (Final, keu_ident.ver naik dengan status 'sah'), sistem sendiri MEMBUAT atau MENAUTKAN kegiatan:
--   * kegiatan pelatihan bila identifikasi memuat briefing/pelatihan (form.sesi.briefing.on atau form.sesi.pelatihan.on);
--   * kegiatan pendataan bila identifikasi memuat pendataan (form.instrumen <> 'Tanpa pendataan').
-- Satu kegiatan per fungsi per periode identifikasi (keList). Nama, tanggal, dan survei diambil dari identifikasi.
-- Aturan:
--   1. Sudah ada tautan aktif untuk (fungsi, periode) -> tidak membuat apa pun; bila tanggal identifikasi versi baru berbeda dengan kegiatan,
--      dicatat USULAN tanggal (keu_ident_kegiatan_tanggal, status 'menunggu') yang harus dikonfirmasi; tanggal kegiatan TIDAK diubah sendiri.
--   2. Belum ada tautan -> cari kegiatan cocok (aktif, jenis sama, kode anggaran memuat RO, belum tertaut ke identifikasi lain, tanggal mulai
--      paling jauh 31 hari dari rencana) -> tautkan (sumber 'otomatis'). Tidak ada -> buat kegiatan baru lalu tautkan.
--   3. Fungsi yang tautannya pernah DILEPAS dari identifikasi ini tidak ditautkan/dibuat ulang (melepas = keputusan pengguna). Melepas tidak menghapus kegiatan.
--   4. Kegagalan pemicu tidak pernah menggagalkan pengesahan: galatnya dicatat di riwayat identifikasi.
-- Migrasi menambah: 2 kolom keu_ident_kegiatan, 1 tabel, 1 view baru; kolom view keu_v_ident_kegiatan ditambah di ujung; fungsi baru; dua nama
-- fungsi ditambahkan ke daftar izin keu_jalankan (definisi lain tidak berubah).
-- Uji: supabase/tests/84_uji_picu_kegiatan.sql (selalu rollback).

begin;

-- 1. Kolom tambahan pada tautan
alter table keu_ident_kegiatan add column if not exists sumber text not null default 'manual';
alter table keu_ident_kegiatan add column if not exists periode text;
alter table keu_ident_kegiatan add column if not exists ident_ver integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'keu_ident_kegiatan_sumber_ck') then
    alter table keu_ident_kegiatan add constraint keu_ident_kegiatan_sumber_ck check (sumber in ('manual', 'otomatis'));
  end if;
end $$;

-- 2. Usulan perubahan tanggal kegiatan dari versi identifikasi baru (perlu konfirmasi)
create table if not exists keu_ident_kegiatan_tanggal (
  id bigserial primary key,
  ident_id bigint not null references keu_ident(id),
  kegiatan_id bigint not null references sigap_kegiatan(id),
  ident_ver integer not null,
  fungsi text not null check (fungsi in ('pendataan', 'pelatihan')),
  periode text,
  mulai_lama date, selesai_lama date,
  mulai_baru date, selesai_baru date,
  status text not null default 'menunggu' check (status in ('menunggu', 'diterapkan', 'ditolak', 'usang')),
  catatan text not null default '' check (char_length(catatan) <= 300),
  dibuat_at timestamptz not null default now(),
  diputus_oleh bigint references sigap_akun(id),
  diputus_at timestamptz
);
create unique index if not exists keu_ident_kegiatan_tanggal_menunggu_uq on keu_ident_kegiatan_tanggal (kegiatan_id) where status = 'menunggu';
alter table keu_ident_kegiatan_tanggal enable row level security;
revoke all on keu_ident_kegiatan_tanggal from anon, authenticated;

-- 3. Rencana kegiatan dari formulir identifikasi yang sah: satu baris per (fungsi, periode).
create or replace function keu_ident_rencana_kegiatan(p_form jsonb, p_tahun int, p_upd jsonb default '{}'::jsonb)
returns table (fungsi text, periode text, mulai date, selesai date)
language plpgsql stable set search_path to 'public' as $f$
declare k text; w date[]; s jsonb; t jsonb; m date; e date; v_ke text[]; v_tanpa boolean;
begin
  if p_form is null then return; end if;
  v_tanpa := coalesce(p_form ->> 'periode', '') = 'Tanpa periode';
  v_ke := case when v_tanpa then array['Kegiatan'] else array(select jsonb_array_elements_text(coalesce(p_form -> 'keList', '[]'::jsonb))) end;
  foreach k in array v_ke loop
    -- pelatihan: briefing dan/atau pelatihan yang dinyalakan; tanggal hanya bila mode 'tgl' (perkiraan -> menyusul)
    if coalesce((p_form #>> '{sesi,briefing,on}')::boolean, false) or coalesce((p_form #>> '{sesi,pelatihan,on}')::boolean, false) then
      m := null; e := null;
      for s in select x from (values (p_form #> '{sesi,briefing}'), (p_form #> '{sesi,pelatihan}')) v(x) where coalesce((x ->> 'on')::boolean, false) loop
        t := s -> 'tgl' -> k;
        if t is not null and coalesce(t ->> 'mode', 'tgl') = 'tgl' and coalesce(t ->> 'mulai', '') ~ '^\d{4}-\d\d-\d\d$' then
          m := least(coalesce(m, (t ->> 'mulai')::date), (t ->> 'mulai')::date);
          if coalesce(t ->> 'selesai', '') ~ '^\d{4}-\d\d-\d\d$' then e := greatest(coalesce(e, (t ->> 'selesai')::date), (t ->> 'selesai')::date); end if;
        end if;
      end loop;
      fungsi := 'pelatihan'; periode := case when v_tanpa then null else k end; mulai := m; selesai := coalesce(e, m); return next;
    end if;
    -- pendataan: jendela identifikasi, kecuali sudah diperbarui lewat penegasan H-15 (upd)
    if coalesce(p_form ->> 'instrumen', '') <> 'Tanpa pendataan' then
      if p_upd ? k and coalesce(p_upd -> k ->> 'mulai', '') ~ '^\d{4}-\d\d-\d\d$' and coalesce(p_upd -> k ->> 'selesai', '') ~ '^\d{4}-\d\d-\d\d$' then
        w := array[(p_upd -> k ->> 'mulai')::date, (p_upd -> k ->> 'selesai')::date];
      else
        w := keu_ident_jendela(p_form, k, p_tahun);
      end if;
      fungsi := 'pendataan'; periode := case when v_tanpa then null else k end; mulai := w[1]; selesai := w[2]; return next;
    end if;
  end loop;
end $f$;
revoke execute on function keu_ident_rencana_kegiatan(jsonb, int, jsonb) from public, anon, authenticated;

create or replace function keu_kode_kegiatan(p_dasar text) returns text
language plpgsql stable set search_path to 'public' as $f$
declare v text := left(trim(both '_' from regexp_replace(lower(coalesce(p_dasar, 'kegiatan')), '[^a-z0-9]+', '_', 'g')), 60); n int := 1; c text;
begin
  if v = '' then v := 'kegiatan'; end if;
  c := v;
  while exists (select 1 from sigap_kegiatan where kode = c) loop n := n + 1; c := v || '_' || n; end loop;
  return c;
end $f$;
revoke execute on function keu_kode_kegiatan(text) from public, anon, authenticated;

-- 4. Pemicu inti. Tidak memeriksa hak (dipanggil pemicu pengesahan atau fungsi manual yang sudah memeriksa hak).
create or replace function keu_ident_picu_kegiatan(p_ident bigint, p_akun bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare
  i keu_ident; v_form jsonb; r record; t keu_ident_kegiatan; g sigap_kegiatan; v_kid bigint; v_nama text; v_hasil jsonb := '[]'::jsonb;
  v_satu boolean; v_akun bigint; v_lama text := coalesce(current_setting('keu.via_fungsi', true), '');
begin
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if i.status <> 'sah' or i.ver < 1 then return jsonb_build_object('ident', i.id, 'aksi', '[]'::jsonb, 'catatan', 'Identifikasi belum sah'); end if;
  select form into v_form from keu_ident_versi where ident_id = i.id and ver = i.ver;
  v_form := coalesce(v_form, i.form);
  v_akun := coalesce(p_akun, i.disetujui_ketua_oleh, i.diajukan_oleh, i.dibuat_oleh);
  v_satu := (select count(distinct x.periode) <= 1 from keu_ident_rencana_kegiatan(v_form, i.tahun, coalesce(i.upd, '{}'::jsonb)) x);
  perform set_config('keu.via_fungsi', '1', true);

  for r in select * from keu_ident_rencana_kegiatan(v_form, i.tahun, coalesce(i.upd, '{}'::jsonb)) loop
    -- tautan aktif untuk fungsi + periode (tautan lama tanpa periode dianggap cocok bila identifikasi hanya satu periode)
    select * into t from keu_ident_kegiatan k
     where k.ident_id = i.id and k.fungsi = r.fungsi and k.dilepas_at is null
       and (k.periode is not distinct from r.periode or (k.periode is null and v_satu))
     order by k.id limit 1;
    if found then
      select * into g from sigap_kegiatan where id = t.kegiatan_id;
      update keu_ident_kegiatan set ident_ver = i.ver, periode = coalesce(periode, r.periode) where id = t.id;
      if r.mulai is not null and (g.tanggal_mulai is distinct from r.mulai or g.tanggal_selesai is distinct from r.selesai) then
        update keu_ident_kegiatan_tanggal set status = 'usang', diputus_at = now() where kegiatan_id = g.id and status = 'menunggu';
        insert into keu_ident_kegiatan_tanggal(ident_id, kegiatan_id, ident_ver, fungsi, periode, mulai_lama, selesai_lama, mulai_baru, selesai_baru)
          values (i.id, g.id, i.ver, r.fungsi, r.periode, g.tanggal_mulai, g.tanggal_selesai, r.mulai, r.selesai);
        v_hasil := v_hasil || jsonb_build_object('fungsi', r.fungsi, 'periode', r.periode, 'aksi', 'usul_tanggal', 'kegiatan', g.id);
      else
        v_hasil := v_hasil || jsonb_build_object('fungsi', r.fungsi, 'periode', r.periode, 'aksi', 'sudah_tertaut', 'kegiatan', g.id);
      end if;
      continue;
    end if;

    -- pernah dilepas untuk fungsi ini -> hormati keputusan pengguna
    if exists (select 1 from keu_ident_kegiatan k where k.ident_id = i.id and k.fungsi = r.fungsi and k.dilepas_at is not null
                and (k.periode is not distinct from r.periode or k.periode is null)) then
      v_hasil := v_hasil || jsonb_build_object('fungsi', r.fungsi, 'periode', r.periode, 'aksi', 'dilewati_pernah_dilepas');
      continue;
    end if;

    -- kegiatan cocok yang sudah ada
    select x.id into v_kid from sigap_kegiatan x
     where x.aktif and x.jenis = r.fungsi and position(i.ro_kode in coalesce(x.kode_anggaran, '')) > 0
       and not exists (select 1 from keu_ident_kegiatan k where k.kegiatan_id = x.id and k.dilepas_at is null)
       and (r.mulai is null or x.tanggal_mulai is null or abs(x.tanggal_mulai - r.mulai) <= 31)
       and (r.mulai is not null or extract(year from coalesce(x.tanggal_mulai, x.dibuat_at::date)) = i.tahun)
     order by abs(coalesce(x.tanggal_mulai - r.mulai, 0)), x.id
     limit 1;
    if v_kid is not null then
      insert into keu_ident_kegiatan(ident_id, kegiatan_id, fungsi, disarankan, catatan, ditautkan_oleh, sumber, periode, ident_ver)
        values (i.id, v_kid, r.fungsi, true, 'Ditautkan otomatis saat identifikasi v' || i.ver || ' disahkan', v_akun, 'otomatis', r.periode, i.ver);
      insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan)
        values (i.id, 'kegiatan', null, 'ditautkan', i.ver, v_akun, 'Kegiatan ditautkan otomatis: ' || left((select nama from sigap_kegiatan where id = v_kid), 150) || ' (' || r.fungsi || ')');
      v_hasil := v_hasil || jsonb_build_object('fungsi', r.fungsi, 'periode', r.periode, 'aksi', 'ditautkan', 'kegiatan', v_kid);
      v_kid := null;
      continue;
    end if;

    -- buat kegiatan baru
    v_nama := left(case when r.fungsi = 'pelatihan' then 'Pelatihan Petugas ' else '' end || coalesce(nullif(btrim(v_form ->> 'nama'), ''), i.nama)
              || case when not v_satu and r.periode is not null and position(r.periode in coalesce(v_form ->> 'nama', i.nama)) = 0 then ' ' || r.periode else '' end, 200);
    insert into sigap_kegiatan(kode, nama, kode_anggaran, tanggal_mulai, tanggal_selesai, aktif, jenis, strategi, satuan_realisasi, wajib_laporan)
      values (keu_kode_kegiatan(left(trim(both '_' from regexp_replace(lower(v_nama), '[^a-z0-9]+', '_', 'g')), 50) || '_' || i.tahun),
              v_nama, '054.01.GG.' || i.ro_kode || case when r.fungsi = 'pelatihan' then '.051' else '.052' end,
              r.mulai, r.selesai, true, r.fungsi,
              case when r.fungsi = 'pelatihan' then 'pelatihan' else 'umum' end,
              case when r.fungsi = 'pelatihan' then 'peserta' else 'ruta' end,
              r.fungsi <> 'pelatihan')
      returning id into v_kid;
    insert into keu_ident_kegiatan(ident_id, kegiatan_id, fungsi, disarankan, catatan, ditautkan_oleh, sumber, periode, ident_ver)
      values (i.id, v_kid, r.fungsi, true, 'Dibuat otomatis saat identifikasi v' || i.ver || ' disahkan', v_akun, 'otomatis', r.periode, i.ver);
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan)
      values (i.id, 'kegiatan', null, 'dibuat', i.ver, v_akun, 'Kegiatan dibuat otomatis: ' || left(v_nama, 150) || ' (' || r.fungsi || ')');
    v_hasil := v_hasil || jsonb_build_object('fungsi', r.fungsi, 'periode', r.periode, 'aksi', 'dibuat', 'kegiatan', v_kid);
    v_kid := null;
  end loop;

  -- dikembalikan ke nilai semula: pemicu berjalan di dalam keu_ident_aksi yang masih menulis riwayat sesudahnya
  perform set_config('keu.via_fungsi', v_lama, true);
  return jsonb_build_object('ident', i.id, 'ver', i.ver, 'aksi', v_hasil);
exception when others then
  perform set_config('keu.via_fungsi', v_lama, true);
  raise;
end $f$;
revoke execute on function keu_ident_picu_kegiatan(bigint, bigint) from public, anon, authenticated;

-- 5. Pemicu pada pengesahan (ver naik dengan status sah). Galat dicatat, pengesahan tetap jalan.
create or replace function keu_ident_picu_kegiatan_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
declare v_lama text := coalesce(current_setting('keu.via_fungsi', true), '');
begin
  begin
    perform keu_ident_picu_kegiatan(new.id, coalesce(keu_akun_sesi(), new.disetujui_ketua_oleh, new.diajukan_oleh, new.dibuat_oleh));
  exception when others then
    perform set_config('keu.via_fungsi', '1', true);
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan)
      values (new.id, 'kegiatan', null, 'gagal', new.ver, coalesce(keu_akun_sesi(), new.dibuat_oleh), left('Pemicu kegiatan gagal: ' || sqlerrm, 300));
    perform set_config('keu.via_fungsi', v_lama, true);
  end;
  return null;
end $f$;
drop trigger if exists keu_t8_picu_kegiatan on keu_ident;
create trigger keu_t8_picu_kegiatan after update of status, ver on keu_ident
  for each row when (new.status = 'sah' and new.ver > old.ver) execute function keu_ident_picu_kegiatan_trg();

-- 6. Jalankan pemicu dari aplikasi (identifikasi yang sudah sah sebelum fitur ini ada)
create or replace function keu_ident_picu_kegiatan_manual(p_ident bigint, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare i keu_ident;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang untuk RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status <> 'sah' then raise exception 'Hanya identifikasi yang sah yang dapat memicu kegiatan' using errcode = '23514'; end if;
  return keu_ident_picu_kegiatan(i.id, p_akun);
end $f$;
revoke execute on function keu_ident_picu_kegiatan_manual(bigint, bigint) from public, anon, authenticated;

-- 7. Konfirmasi usulan tanggal
create or replace function keu_ident_kegiatan_tanggal_putus(p_id bigint, p_terapkan boolean, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path to 'public' as $f$
declare u keu_ident_kegiatan_tanggal; i keu_ident; v_cat text := btrim(coalesce(p_catatan, ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into u from keu_ident_kegiatan_tanggal where id = p_id for update;
  if not found or u.status <> 'menunggu' then raise exception 'Usulan tanggal tidak ada atau sudah diputus' using errcode = '23514'; end if;
  select * into i from keu_ident where id = u.ident_id;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang untuk RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if not keu_boleh_penugasan_kegiatan(p_akun, u.kegiatan_id) then raise exception 'Akun % tidak berwenang mengelola kegiatan %', p_akun, u.kegiatan_id using errcode = '42501'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 huruf' using errcode = '23514'; end if;
  if not p_terapkan and char_length(v_cat) < 5 then raise exception 'Alasan menolak wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  if p_terapkan then
    update sigap_kegiatan set tanggal_mulai = u.mulai_baru, tanggal_selesai = u.selesai_baru,
           periode_diubah_oleh = coalesce((select nama from sigap_akun where id = p_akun), 'akun ' || p_akun) || ' (identifikasi v' || u.ident_ver || ')', periode_diubah_at = now()
     where id = u.kegiatan_id;
  end if;
  update keu_ident_kegiatan_tanggal set status = case when p_terapkan then 'diterapkan' else 'ditolak' end, catatan = v_cat, diputus_oleh = p_akun, diputus_at = now() where id = u.id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan)
    values (u.ident_id, 'kegiatan', 'usul_tanggal', case when p_terapkan then 'diterapkan' else 'ditolak' end, u.ident_ver, p_akun,
            left('Tanggal kegiatan ' || coalesce(to_char(u.mulai_lama, 'DD/MM'), '-') || '–' || coalesce(to_char(u.selesai_lama, 'DD/MM'), '-') || ' → '
                 || coalesce(to_char(u.mulai_baru, 'DD/MM'), '-') || '–' || coalesce(to_char(u.selesai_baru, 'DD/MM'), '-') || case when v_cat <> '' then '. ' || v_cat else '' end, 300));
  perform set_config('keu.via_fungsi', '', true);
  return case when p_terapkan then 'diterapkan' else 'ditolak' end;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $f$;
revoke execute on function keu_ident_kegiatan_tanggal_putus(bigint, boolean, text, bigint) from public, anon, authenticated;

-- 8. View: kolom baru di ujung keu_v_ident_kegiatan, dan daftar usulan tanggal
create or replace view keu_v_ident_kegiatan as
 select t.id, t.ident_id, t.kegiatan_id, t.fungsi, t.disarankan, t.catatan, t.ditautkan_at, a.nama as ditautkan_oleh_nama,
    g.kode, g.nama, g.kode_anggaran, g.jenis, g.aktif, g.tanggal_mulai as mulai, g.tanggal_selesai as selesai,
    ((select count(*) from sigap_penugasan s where s.kegiatan_id = g.id and s.aktif))::integer as n_penugasan,
    t.sumber, t.periode, t.ident_ver
   from keu_ident_kegiatan t
   join sigap_kegiatan g on g.id = t.kegiatan_id
   left join sigap_akun a on a.id = t.ditautkan_oleh
  where t.dilepas_at is null;

create or replace view keu_v_ident_kegiatan_tanggal as
 select u.id, u.ident_id, u.kegiatan_id, u.ident_ver, u.fungsi, u.periode, u.mulai_lama, u.selesai_lama, u.mulai_baru, u.selesai_baru,
        u.status, u.catatan, u.dibuat_at, u.diputus_at, a.nama as diputus_oleh_nama, g.nama as kegiatan_nama, g.kode as kegiatan_kode
   from keu_ident_kegiatan_tanggal u
   join sigap_kegiatan g on g.id = u.kegiatan_id
   left join sigap_akun a on a.id = u.diputus_oleh;
revoke all on keu_v_ident_kegiatan_tanggal from anon, authenticated;

-- 9. Izin gerbang keu_jalankan: tambahkan dua fungsi (sisa definisi tidak berubah)
do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_ident_picu_kegiatan_manual''' in d) = 0 then
    d := replace(d, '''keu_usulan_buat''];', '''keu_usulan_buat'',''keu_ident_picu_kegiatan_manual'',''keu_ident_kegiatan_tanggal_putus''];');
    if position('''keu_ident_picu_kegiatan_manual''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
