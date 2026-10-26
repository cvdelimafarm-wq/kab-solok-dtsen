-- =====================================================================
-- 20261026g_keu_delego_lanjutan.sql
-- SIGAP - Delego lanjutan: kalender libur, target berlaku per tanggal, bobot skor, penanda perubahan identifikasi.
-- Bergantung pada 20261026c, e, f. Aman diulang. Tanpa DELETE/DROP TABLE (libur dinonaktifkan, bukan dihapus).
--
--  1. keu_dlg_libur   : tanggal libur (nasional, cuti bersama, lainnya) + isi bawaan 2026 dan 2027 (SKB 3 Menteri; cek aturan). Cuti bersama aktif secara bawaan;
--                       pemberi dapat menonaktifkan per tanggal. Hari libur tidak dihitung hari kerja (target, hutang, beban, skor, pengingat).
--  2. keu_dlg_target  : riwayat target harian per delegasi. Perubahan target BERLAKU MULAI TANGGAL tertentu (tidak surut). Baris pertama = target awal.
--  3. keu_dlg_bobot   : bobot empat komponen skor (jumlah harus 100). Satu baris.
--  4. keu_dlg_delegasi.ident_ver : versi identifikasi saat delegasi dibuat/ditinjau -> lencana "Identifikasi berubah".
--  5. fungsi baru: keu_dlg_libur_atur, keu_dlg_bobot_atur, keu_dlg_target_atur, keu_dlg_tinjau_ident; pembantu keu_dlg_target_pada.
--  6. fungsi diganti: keu_dlg_hak (libur, bobot), keu_dlg_saya dan keu_dlg_bahan (target_harian efektif hari ini, riwayat_target, ident_ver_kini),
--     keu_dlg_buat (ident_ver), keu_dlg_ubah (perubahan target lewat riwayat), keu_dlg_pindah (target efektif, ident_ver).
--  7. jenis notifikasi baru 'delegasi_pengingat' (dipakai 20261026h).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-3. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_dlg_libur (
  tanggal     date primary key,
  nama        text not null check (char_length(nama) between 3 and 100),
  jenis       text not null default 'lainnya' check (jenis in ('nasional','cuti_bersama','lainnya')),
  aktif       boolean not null default true,
  dicatat_oleh bigint references sigap_akun(id),
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now()
);

create table if not exists keu_dlg_target (
  id            bigint generated always as identity primary key,
  delegasi_id   bigint not null references keu_dlg_delegasi(id),
  berlaku_mulai date not null,
  target_harian numeric(8,2) not null check (target_harian >= 0 and target_harian <= 1000),
  alasan        text not null default '' check (char_length(alasan) <= 300),
  dicatat_oleh  bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  unique (delegasi_id, berlaku_mulai)
);
create index if not exists keu_dlg_target_idx on keu_dlg_target(delegasi_id, berlaku_mulai);

create table if not exists keu_dlg_bobot (
  id         smallint primary key check (id = 1),
  ketepatan  smallint not null check (ketepatan between 0 and 100),
  capaian    smallint not null check (capaian between 0 and 100),
  kualitas   smallint not null check (kualitas between 0 and 100),
  kepatuhan  smallint not null check (kepatuhan between 0 and 100),
  diubah_oleh bigint references sigap_akun(id),
  diubah_at  timestamptz not null default now(),
  check (ketepatan + capaian + kualitas + kepatuhan = 100)
);
insert into keu_dlg_bobot(id, ketepatan, capaian, kualitas, kepatuhan) values (1, 25, 25, 25, 25) on conflict (id) do nothing;

alter table keu_dlg_delegasi add column if not exists ident_ver integer;

do $$
declare t text;
begin
  foreach t in array array['keu_dlg_libur','keu_dlg_target','keu_dlg_bobot']
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

-- jenis notifikasi baru
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'keu_notifikasi'::regclass and conname = 'keu_notifikasi_jenis_check')
     and not exists (select 1 from pg_constraint where conrelid = 'keu_notifikasi'::regclass and conname = 'keu_notifikasi_jenis_check' and pg_get_constraintdef(oid) like '%delegasi_pengingat%') then
    alter table keu_notifikasi drop constraint keu_notifikasi_jenis_check;
    alter table keu_notifikasi add constraint keu_notifikasi_jenis_check check (jenis = any (array[
      'ident_fix','ident_pasca_h15','nama_terisi','lembar_menunggu','pengecualian_diajukan','pengecualian_putus','penugasan_diterapkan','gap_keras','gap_akhir',
      'delegasi_baru','delegasi_ubah','delegasi_tanggapan','delegasi_pembinaan','delegasi_penghargaan','delegasi_pengingat']));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Isi bawaan kalender libur (cek aturan: SKB 3 Menteri 2026 dan 2027; bila ada perubahan, atur di halaman Kalender libur)
-- ---------------------------------------------------------------------
insert into keu_dlg_libur(tanggal, nama, jenis) values
 ('2026-01-01','Tahun Baru Masehi','nasional'),('2026-01-16','Isra Mikraj Nabi Muhammad SAW','nasional'),('2026-02-17','Tahun Baru Imlek','nasional'),
 ('2026-03-19','Hari Suci Nyepi','nasional'),('2026-03-21','Idul Fitri 1447 H','nasional'),('2026-03-22','Idul Fitri 1447 H','nasional'),
 ('2026-04-03','Wafat Yesus Kristus','nasional'),('2026-04-05','Paskah','nasional'),('2026-05-01','Hari Buruh','nasional'),
 ('2026-05-14','Kenaikan Yesus Kristus','nasional'),('2026-05-27','Idul Adha 1447 H','nasional'),('2026-05-31','Hari Raya Waisak','nasional'),
 ('2026-06-01','Hari Lahir Pancasila','nasional'),('2026-06-16','Tahun Baru Islam 1448 H','nasional'),('2026-08-17','Hari Kemerdekaan RI','nasional'),
 ('2026-08-25','Maulid Nabi Muhammad SAW','nasional'),('2026-12-25','Hari Raya Natal','nasional'),
 ('2026-02-16','Cuti bersama Imlek','cuti_bersama'),('2026-03-18','Cuti bersama Nyepi','cuti_bersama'),('2026-03-20','Cuti bersama Idul Fitri','cuti_bersama'),
 ('2026-03-23','Cuti bersama Idul Fitri','cuti_bersama'),('2026-03-24','Cuti bersama Idul Fitri','cuti_bersama'),('2026-05-15','Cuti bersama Kenaikan Yesus Kristus','cuti_bersama'),
 ('2026-05-28','Cuti bersama Idul Adha','cuti_bersama'),('2026-12-24','Cuti bersama Natal','cuti_bersama'),
 ('2027-01-01','Tahun Baru Masehi','nasional'),('2027-01-05','Isra Mikraj Nabi Muhammad SAW','nasional'),('2027-02-06','Tahun Baru Imlek','nasional'),
 ('2027-03-08','Idul Fitri 1448 H','nasional'),('2027-03-10','Hari Suci Nyepi','nasional'),('2027-03-11','Idul Fitri 1448 H','nasional'),
 ('2027-03-26','Wafat Yesus Kristus','nasional'),('2027-03-28','Paskah','nasional'),('2027-05-01','Hari Buruh','nasional'),('2027-05-06','Kenaikan Yesus Kristus','nasional'),
 ('2027-05-17','Idul Adha 1448 H','nasional'),('2027-05-20','Hari Raya Waisak','nasional'),('2027-06-01','Hari Lahir Pancasila','nasional'),
 ('2027-06-06','Tahun Baru Islam 1449 H','nasional'),('2027-08-15','Maulid Nabi Muhammad SAW','nasional'),('2027-08-17','Hari Kemerdekaan RI','nasional'),
 ('2027-12-25','Hari Raya Natal','nasional'),('2027-12-26','Isra Mikraj Nabi Muhammad SAW','nasional'),
 ('2027-02-05','Cuti bersama Imlek','cuti_bersama'),('2027-03-09','Cuti bersama Idul Fitri','cuti_bersama'),('2027-03-12','Cuti bersama Idul Fitri','cuti_bersama'),
 ('2027-03-15','Cuti bersama Idul Fitri','cuti_bersama'),('2027-03-25','Cuti bersama Nyepi','cuti_bersama'),('2027-05-18','Cuti bersama Idul Adha','cuti_bersama'),
 ('2027-05-19','Cuti bersama Idul Adha','cuti_bersama'),('2027-12-24','Cuti bersama Natal','cuti_bersama')
on conflict (tanggal) do nothing;

-- ---------------------------------------------------------------------
-- Pembantu
-- ---------------------------------------------------------------------
-- target harian yang berlaku pada sebuah tanggal (riwayat bila ada, selain itu kolom target_harian delegasi)
create or replace function keu_dlg_target_pada(p_id bigint, p_tgl date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.target_harian from keu_dlg_target t where t.delegasi_id = p_id and t.berlaku_mulai <= p_tgl order by t.berlaku_mulai desc limit 1),
    (select d.target_harian from keu_dlg_delegasi d where d.id = p_id))
$$;

-- ---------------------------------------------------------------------
-- Fungsi tulis baru
-- ---------------------------------------------------------------------
create or replace function keu_dlg_libur_atur(p_tanggal date, p_nama text, p_jenis text default 'lainnya', p_aktif boolean default true, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nama text := btrim(coalesce(p_nama, '')); v_ada keu_dlg_libur;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat mengatur kalender libur' using errcode = '42501'; end if;
  if p_tanggal is null or p_tanggal < date '2024-01-01' or p_tanggal > date '2035-12-31' then raise exception 'Tanggal libur harus antara 2024 dan 2035' using errcode = '23514'; end if;
  if p_jenis not in ('nasional','cuti_bersama','lainnya') then raise exception 'Jenis libur tidak sah' using errcode = '23514'; end if;
  select * into v_ada from keu_dlg_libur where tanggal = p_tanggal for update;
  if char_length(v_nama) < 3 or char_length(v_nama) > 100 then
    if found then v_nama := v_ada.nama; else raise exception 'Nama libur 3 sampai 100 huruf' using errcode = '23514'; end if;
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_libur(tanggal, nama, jenis, aktif, dicatat_oleh) values (p_tanggal, v_nama, p_jenis, coalesce(p_aktif, true), p_akun)
  on conflict (tanggal) do update set nama = excluded.nama, jenis = excluded.jenis, aktif = excluded.aktif, dicatat_oleh = p_akun, diubah_at = now();
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('tanggal', p_tanggal, 'aktif', coalesce(p_aktif, true));
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

create or replace function keu_dlg_bobot_atur(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_k int; v_c int; v_q int; v_p int;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat mengatur bobot skor' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian bobot harus objek JSON' using errcode = '22023'; end if;
  v_k := (p_data ->> 'ketepatan')::int; v_c := (p_data ->> 'capaian')::int; v_q := (p_data ->> 'kualitas')::int; v_p := (p_data ->> 'kepatuhan')::int;
  if v_k is null or v_c is null or v_q is null or v_p is null then raise exception 'Keempat bobot wajib diisi' using errcode = '23514'; end if;
  if least(v_k, v_c, v_q, v_p) < 0 or greatest(v_k, v_c, v_q, v_p) > 100 then raise exception 'Setiap bobot 0 sampai 100' using errcode = '23514'; end if;
  if v_k + v_c + v_q + v_p <> 100 then raise exception 'Jumlah bobot harus 100 (sekarang %)', v_k + v_c + v_q + v_p using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_bobot set ketepatan = v_k, capaian = v_c, kualitas = v_q, kepatuhan = v_p, diubah_oleh = p_akun, diubah_at = now() where id = 1;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('ketepatan', v_k, 'capaian', v_c, 'kualitas', v_q, 'kepatuhan', v_p);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ubah target harian mulai tanggal tertentu (tidak surut): perubahan hanya berlaku dari p_mulai, tanggal sebelumnya tetap memakai target lama
create or replace function keu_dlg_target_atur(p_id bigint, p_mulai date, p_target numeric, p_alasan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; v_hari date := keu_dlg_hari_ini(); v_al text := btrim(coalesce(p_alasan, '')); v_lama numeric;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berwenang mengubah target delegasi RO %', p_akun, d.ro_kode using errcode = '42501'; end if;
  if d.status not in ('baru','berjalan','ditunda') then raise exception 'Delegasi berstatus % tidak dapat diubah targetnya', d.status using errcode = '23514'; end if;
  if p_mulai is null or p_target is null then raise exception 'Tanggal berlaku dan target wajib diisi' using errcode = '23514'; end if;
  if p_target < 0 or p_target > 1000 then raise exception 'Target harian 0 sampai 1000' using errcode = '23514'; end if;
  if p_mulai < v_hari then raise exception 'Perubahan target tidak berlaku surut: tanggal berlaku paling cepat hari ini' using errcode = '23514'; end if;
  if p_mulai > d.tenggat then raise exception 'Tanggal berlaku melewati tenggat delegasi' using errcode = '23514'; end if;
  if char_length(v_al) < 5 or char_length(v_al) > 300 then raise exception 'Alasan perubahan target 5 sampai 300 huruf' using errcode = '23514'; end if;
  v_lama := keu_dlg_target_pada(d.id, greatest(p_mulai, d.mulai));
  perform set_config('keu.via_fungsi', '1', true);
  if not exists (select 1 from keu_dlg_target where delegasi_id = d.id) then
    insert into keu_dlg_target(delegasi_id, berlaku_mulai, target_harian, alasan, dicatat_oleh) values (d.id, d.mulai, d.target_harian, 'Target awal', d.dibuat_oleh);
  end if;
  insert into keu_dlg_target(delegasi_id, berlaku_mulai, target_harian, alasan, dicatat_oleh) values (d.id, greatest(p_mulai, d.mulai), p_target, v_al, p_akun)
  on conflict (delegasi_id, berlaku_mulai) do update set target_harian = excluded.target_harian, alasan = excluded.alasan, dicatat_oleh = p_akun, dibuat_at = now();
  update keu_dlg_delegasi set ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_ubah', d.ident_id, 'Target harian diubah: ' || d.judul,
    'Mulai ' || to_char(greatest(p_mulai, d.mulai), 'DD-MM-YYYY') || ' target harian menjadi ' || trim(to_char(p_target, 'FM999990.##')) || ' poin (sebelumnya ' || trim(to_char(v_lama, 'FM999990.##')) || '). Alasan: ' || v_al, p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('delegasi', d.id, 'berlaku_mulai', greatest(p_mulai, d.mulai), 'target_harian', p_target, 'ver', d.ver + 1);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- tandai bahwa pemberi sudah meninjau perubahan identifikasi
create or replace function keu_dlg_tinjau_ident(p_id bigint, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; v_ver integer;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berwenang meninjau delegasi RO %', p_akun, d.ro_kode using errcode = '42501'; end if;
  if d.ident_id is null then raise exception 'Delegasi ini tidak terkait identifikasi' using errcode = '23514'; end if;
  select ver into v_ver from keu_ident where id = d.ident_id;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_delegasi set ident_ver = v_ver, ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('delegasi', d.id, 'ident_ver', v_ver);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Fungsi yang diganti
-- ---------------------------------------------------------------------
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
    'ident', v_ident,
    'libur', (select coalesce(jsonb_agg(jsonb_build_object('tanggal', l.tanggal, 'nama', l.nama, 'jenis', l.jenis, 'aktif', l.aktif) order by l.tanggal), '[]'::jsonb) from keu_dlg_libur l),
    'bobot', (select jsonb_build_object('ketepatan', b.ketepatan, 'capaian', b.capaian, 'kualitas', b.kualitas, 'kepatuhan', b.kepatuhan) from keu_dlg_bobot b where b.id = 1));
end $$;

create or replace function keu_dlg_saya(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  with s as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari,
           keu_dlg_target_pada(d.id, v_hari) as target_kini,
           (select coalesce(jsonb_agg(jsonb_build_object('berlaku_mulai', t.berlaku_mulai, 'target_harian', t.target_harian, 'alasan', t.alasan) order by t.berlaku_mulai), '[]'::jsonb)
              from keu_dlg_target t where t.delegasi_id = d.id) as riwayat_target,
           (select i.ver from keu_ident i where i.id = d.ident_id) as ident_ver_kini
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
     where d.penerima_akun = p_akun and (d.status in ('baru','berjalan','ditunda') or d.diubah_at > now() - interval '120 days')
  ), w as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari,
           keu_dlg_target_pada(d.id, v_hari) as target_kini,
           (select coalesce(jsonb_agg(jsonb_build_object('berlaku_mulai', t.berlaku_mulai, 'target_harian', t.target_harian, 'alasan', t.alasan) order by t.berlaku_mulai), '[]'::jsonb)
              from keu_dlg_target t where t.delegasi_id = d.id) as riwayat_target,
           (select i.ver from keu_ident i where i.id = d.ident_id) as ident_ver_kini
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
     where d.status in ('baru','berjalan') and d.penerima_akun <> p_akun
       and ((a.jenis = 'mitra' and keu_dlg_pml(p_akun, d.ro_kode)) or keu_dlg_beri(p_akun, d.ro_kode))
  )
  select jsonb_build_object(
    'hari_ini', v_hari,
    'akun', (select jsonb_build_object('id', x.id, 'nama', x.nama, 'jenis', x.jenis) from sigap_akun x where x.id = p_akun),
    'delegasi', (select coalesce(jsonb_agg((to_jsonb(s) - 'target_kini') || jsonb_build_object('target_harian', s.target_kini) order by s.tenggat, s.id), '[]'::jsonb) from s),
    'laporan', (select coalesce(jsonb_agg(to_jsonb(l) order by l.tanggal desc, l.id desc), '[]'::jsonb) from keu_dlg_laporan l
                 where l.tanggal >= v_hari - 35 and l.delegasi_id in (select id from s)),
    'diwakili', (select coalesce(jsonb_agg((to_jsonb(w) - 'target_kini') || jsonb_build_object('target_harian', w.target_kini) order by w.penerima_nama, w.id), '[]'::jsonb) from w),
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

create or replace function keu_dlg_bahan(p_ident bigint default null, p_ro text default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  with s as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari,
           keu_dlg_target_pada(d.id, v_hari) as target_kini,
           (select coalesce(jsonb_agg(jsonb_build_object('berlaku_mulai', t.berlaku_mulai, 'target_harian', t.target_harian, 'alasan', t.alasan) order by t.berlaku_mulai), '[]'::jsonb)
              from keu_dlg_target t where t.delegasi_id = d.id) as riwayat_target,
           (select i.ver from keu_ident i where i.id = d.ident_id) as ident_ver_kini
      from keu_dlg_lingkup(p_akun, p_ident, p_ro) d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
  )
  select jsonb_build_object(
    'hari_ini', v_hari,
    'delegasi', (select coalesce(jsonb_agg((to_jsonb(s) - 'target_kini') || jsonb_build_object('target_harian', s.target_kini) order by s.tenggat, s.id), '[]'::jsonb) from s),
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

-- buat: mencatat versi identifikasi saat delegasi dibuat
create or replace function keu_dlg_buat(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; v_ident bigint; v_ro text; v_judul text; v_ura text; v_sat text; v_th numeric; v_tt numeric; v_bobot int; v_mulai date; v_tenggat date;
  v_hk smallint[]; r jsonb; v_akun bigint; v_peran text; v_pj text; a sigap_akun; v_ids bigint[] := '{}'; v_id bigint; v_hari date := keu_dlg_hari_ini(); v_pemberi text;
  v_iv integer;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian delegasi harus objek JSON' using errcode = '22023'; end if;
  v_ident := nullif(p_data ->> 'ident_id', '')::bigint;
  if v_ident is not null then
    select * into i from keu_ident where id = v_ident;
    if not found then raise exception 'Identifikasi % tidak ada', v_ident using errcode = '23514'; end if;
    if i.status = 'dibatalkan' or i.ver < 1 then raise exception 'Identifikasi belum disahkan atau sudah dibatalkan' using errcode = '23514'; end if;
    v_ro := i.ro_kode; v_iv := i.ver;
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
  v_th := coalesce(nullif(p_data ->> 'target_harian', '')::numeric, 70);
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
    insert into keu_dlg_delegasi(tahun, ident_id, ident_ver, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot,
                                 hari_kerja, mulai, tenggat, dibuat_oleh, diubah_oleh)
    values (extract(year from v_mulai)::smallint, v_ident, v_iv, v_ro, v_judul, v_ura, v_akun, v_peran, v_pj, v_sat, v_tt, v_th, v_bobot, v_hk, v_mulai, v_tenggat, p_akun, p_akun)
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

-- ubah: perubahan target_harian pada delegasi yang sudah berjalan masuk riwayat (berlaku mulai hari ini), bukan menimpa masa lalu
create or replace function keu_dlg_ubah(p_id bigint, p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; n keu_dlg_delegasi; a sigap_akun; v_hari date := keu_dlg_hari_ini(); v_tbaru numeric; v_tmulai date; v_ada_riwayat boolean; v_efektif numeric; v_lewat_riwayat boolean := false;
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

  -- perubahan target harian: bandingkan dengan target efektif hari ini; bila delegasi sudah mulai atau punya riwayat, catat di riwayat (tidak surut)
  v_efektif := keu_dlg_target_pada(d.id, greatest(v_hari, d.mulai));
  select exists (select 1 from keu_dlg_target where delegasi_id = d.id) into v_ada_riwayat;
  if p_data ? 'target_harian' then
    v_tbaru := n.target_harian;
    if v_tbaru is distinct from v_efektif then
      if d.mulai >= v_hari and not v_ada_riwayat then
        null; -- belum mulai dan belum ada riwayat: ubah langsung di kolom
      else
        v_lewat_riwayat := true; v_tmulai := greatest(v_hari, d.mulai);
        n.target_harian := d.target_harian; -- kolom tetap target awal; perubahan masuk riwayat
      end if;
    else
      n.target_harian := d.target_harian; -- sama dengan target efektif: tidak ada perubahan
    end if;
  end if;

  if n is not distinct from d and not v_lewat_riwayat then return jsonb_build_object('hasil', 'tetap', 'ver', d.ver); end if;

  perform set_config('keu.via_fungsi', '1', true);
  if v_lewat_riwayat then
    if not v_ada_riwayat then
      insert into keu_dlg_target(delegasi_id, berlaku_mulai, target_harian, alasan, dicatat_oleh) values (d.id, d.mulai, d.target_harian, 'Target awal', d.dibuat_oleh);
    end if;
    insert into keu_dlg_target(delegasi_id, berlaku_mulai, target_harian, alasan, dicatat_oleh) values (d.id, v_tmulai, v_tbaru, 'Diubah lewat menu Ubah', p_akun)
    on conflict (delegasi_id, berlaku_mulai) do update set target_harian = excluded.target_harian, dicatat_oleh = p_akun, dibuat_at = now();
  end if;
  update keu_dlg_delegasi set judul = n.judul, uraian = n.uraian, pj_bidang = n.pj_bidang, peran_penerima = n.peran_penerima, target_total = n.target_total,
         target_harian = n.target_harian, bobot = n.bobot, hari_kerja = n.hari_kerja, tenggat = n.tenggat, status = n.status, alasan = n.alasan,
         ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now()
   where id = d.id;
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_ubah', d.ident_id, 'Delegasi diperbarui: ' || n.judul,
    case when n.status <> d.status then 'Status sekarang: ' || n.status || '. ' else '' end
    || case when v_lewat_riwayat then 'Target harian ' || trim(to_char(v_tbaru, 'FM999990.##')) || ' mulai ' || to_char(v_tmulai, 'DD-MM-YYYY') || '. ' else '' end
    || 'Tenggat ' || to_char(n.tenggat, 'DD-MM-YYYY') || '.', p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('hasil', 'diubah', 'ver', d.ver + 1);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- pindah: salinan memakai target efektif pada tanggal mulai baru, dan membawa penanda ident_ver
create or replace function keu_dlg_pindah(p_id bigint, p_ke bigint, p_ver integer default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d keu_dlg_delegasi; a sigap_akun; v_hari date := keu_dlg_hari_ini(); v_mulai date; v_poin numeric; v_sisa numeric; v_baru bigint;
  v_dari text; v_ke text; v_pemberi text; v_status_lama text; v_alasan text; v_th numeric;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berwenang memindahkan delegasi RO %', p_akun, d.ro_kode using errcode = '42501'; end if;
  if d.status not in ('baru','berjalan') then raise exception 'Hanya delegasi berstatus baru atau berjalan yang dapat dipindahkan (sekarang: %)', d.status using errcode = '23514'; end if;
  if p_ver is not null and p_ver <> d.ver then raise exception 'Delegasi sudah berubah sejak usulan dihitung. Muat ulang halaman, lalu coba lagi.' using errcode = '23514'; end if;
  if p_ke is null then raise exception 'Penampung wajib dipilih' using errcode = '23514'; end if;
  if p_ke = d.penerima_akun then raise exception 'Penampung sama dengan penerima sekarang' using errcode = '23514'; end if;
  if p_ke = p_akun then raise exception 'Pemberi tidak dapat mendelegasikan kepada dirinya sendiri' using errcode = '23514'; end if;
  select * into a from sigap_akun where id = p_ke and aktif;
  if not found then raise exception 'Penampung % tidak ditemukan atau tidak aktif', p_ke using errcode = '23514'; end if;
  if a.jenis = 'mitra' and d.peran_penerima not in ('pml','ppl') then raise exception 'Mitra hanya dapat berperan PML atau PPL (%)', a.nama using errcode = '23514'; end if;
  if d.tenggat < v_hari then raise exception 'Masa delegasi sudah lewat' using errcode = '23514'; end if;
  if exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id and l.tanggal >= v_hari) then
    raise exception 'Penerima lama sudah melapor untuk hari ini. Pindahkan besok, atau ubah delegasinya lewat menu Ubah.' using errcode = '23514';
  end if;
  select coalesce(sum(l.poin), 0) into v_poin from keu_dlg_laporan l where l.delegasi_id = d.id;
  if d.target_total is not null and d.target_total > 0 then
    v_sisa := d.target_total - v_poin;
    if v_sisa <= 0 then raise exception 'Target total delegasi sudah tercapai. Tandai selesai saja, tidak perlu dipindahkan.' using errcode = '23514'; end if;
  else
    v_sisa := null;
  end if;

  v_mulai := greatest(v_hari, d.mulai);
  v_th := keu_dlg_target_pada(d.id, v_mulai);
  select nama into v_dari from sigap_akun where id = d.penerima_akun;
  v_ke := a.nama;
  select nama into v_pemberi from sigap_akun where id = p_akun;
  v_alasan := 'Dipindahkan ke ' || left(coalesce(v_ke, '-'), 80) || ' (pemerataan beban kerja)';

  perform set_config('keu.via_fungsi', '1', true);
  if d.mulai >= v_hari then
    v_status_lama := 'batal';
    update keu_dlg_delegasi set status = 'batal', alasan = v_alasan, ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  else
    v_status_lama := 'selesai';
    update keu_dlg_delegasi set status = 'selesai', tenggat = v_hari - 1, alasan = v_alasan, ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  end if;

  insert into keu_dlg_delegasi(tahun, ident_id, ident_ver, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot,
                               hari_kerja, mulai, tenggat, status, dibuat_oleh, diubah_oleh)
  values (extract(year from v_mulai)::smallint, d.ident_id, d.ident_ver, d.ro_kode, d.judul, d.uraian, p_ke, d.peran_penerima, d.pj_bidang, d.satuan, v_sisa, v_th, d.bobot,
          d.hari_kerja, v_mulai, d.tenggat, 'baru', p_akun, p_akun)
  returning id into v_baru;

  perform keu_dlg_notif(p_ke, 'delegasi_baru', d.ident_id, 'Delegasi baru: ' || d.judul,
    'Dari ' || coalesce(v_pemberi, 'pemberi delegasi') || ' (pemerataan beban dari ' || coalesce(v_dari, 'rekan') || '), tenggat ' || to_char(d.tenggat, 'DD-MM-YYYY') || '. Buka Delego untuk menerima.', p_akun);
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_ubah', d.ident_id, 'Delegasi dipindahkan: ' || d.judul,
    'Pekerjaan ini dipindahkan ke ' || coalesce(v_ke, 'rekan') || ' mulai hari ini untuk pemerataan beban. Laporan yang sudah Anda kirim tetap tercatat.', p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('lama', d.id, 'baru', v_baru, 'status_lama', v_status_lama, 'mulai_baru', v_mulai, 'target_total_baru', v_sisa);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- isi ident_ver untuk delegasi yang sudah ada (anggap sudah selaras dengan identifikasi saat ini)
do $$
begin
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_delegasi d set ident_ver = (select i.ver from keu_ident i where i.id = d.ident_id) where d.ident_id is not null and d.ident_ver is null;
  perform set_config('keu.via_fungsi', '', true);
end $$;

-- ---------------------------------------------------------------------
-- Hak eksekusi dan izin gerbang
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('keu_dlg_libur_atur','keu_dlg_bobot_atur','keu_dlg_target_atur','keu_dlg_tinjau_ident','keu_dlg_target_pada','keu_dlg_hak','keu_dlg_saya','keu_dlg_bahan','keu_dlg_buat','keu_dlg_ubah','keu_dlg_pindah')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_dlg_target_atur''' in d) = 0 then
    d := replace(d, '''keu_dlg_pindah'',', '''keu_dlg_pindah'',''keu_dlg_libur_atur'',''keu_dlg_bobot_atur'',''keu_dlg_target_atur'',''keu_dlg_tinjau_ident'',');
    if position('''keu_dlg_target_atur''' in d) = 0 then raise exception 'Penambahan izin gagal: jalankan 20261026f dulu'; end if;
    execute d;
  end if;
end $$;
