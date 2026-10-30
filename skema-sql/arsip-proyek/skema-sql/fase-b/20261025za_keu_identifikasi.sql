-- =====================================================================
-- 20261025za_keu_identifikasi.sql
-- SIGAP - Identifikasi survei (tahap awal Alur GSBPM), tahap 27. Menerapkan mockup "Identifikasi survei" (Version 7) ke basis data.
-- Bergantung pada 20261024a-n (master, POK, RAB, administrasi, gerbang keu_jalankan). Aman diulang. Tanpa DELETE/DROP.
--
-- Isi:
--  1. Kewenangan baru: ident_susun (ketua tim, admin RO, PPK), ident_setuju (PPK, Tata Usaha, KPA). Teks peran KPA/TU diperjelas:
--     KPA tetap tidak menyetujui revisi anggaran, tetapi menyetujui identifikasi survei.
--  2. Tabel keu_ident (satu baris = satu survei pada satu RO), keu_ident_versi (salinan tiap versi Sah, tidak berubah),
--     keu_ident_riwayat (jejak), keu_ident_paket (pemetaan baris POK ke paket belanja).
--  3. Alur status: draf -> [menunggu_ketua bila dikirim admin RO] -> menunggu_setuju (PPK, lalu Tata Usaha, lalu KPA, berurutan) -> sah.
--     Sesudah sah: ajukan_revisi -> revisi -> kirim lagi -> persetujuan ulang. Hanya versi Sah dibaca modul hilir (keu_v_ident_sah).
--  4. Pembaruan periode (H-15): sesudah sah, ketua tim/admin RO/PPK memperbarui tanggal pendataan per periode; pergeseran sampai 7 hari
--     (kedua ujung) boleh langsung, lebih dari itu lewat revisi.
--  5. keu_ident_jendela: pola jendela pendataan menjadi tanggal (kembaran lib/keu/identifikasi.ts; diuji sama persis).
--  6. Fungsi didaftarkan ke gerbang keu_jalankan; tabel dan tampilan hanya dibaca server (service_role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kewenangan dan teks peran
-- ---------------------------------------------------------------------
insert into keu_master_kewenangan(kode, nama, ket, urut) values
  ('ident_susun', 'Menyusun dan mengirim identifikasi survei', 'Ketua tim dan PPK; admin RO menyusun, dikirim atas persetujuan ketua tim. Juga mengajukan revisi dan memperbarui periode H-15.', 90),
  ('ident_setuju', 'Menyetujui identifikasi survei', 'Berurutan: PPK, Tata Usaha, lalu KPA. Sah setelah ketiganya menyetujui.', 91)
on conflict (kode) do nothing;

insert into keu_master_kewenangan_peran(kewenangan_kode, peran_kode, perlu_pemberian, ket) values
  ('ident_susun', 'KETUA', false, ''), ('ident_susun', 'ADMINRO', false, ''), ('ident_susun', 'PPK', false, ''),
  ('ident_setuju', 'PPK', false, 'langkah 1'), ('ident_setuju', 'TU', false, 'langkah 2'), ('ident_setuju', 'KPA', false, 'langkah 3')
on conflict do nothing;

update keu_master_peran set ket = 'Menerima laporan revisi, realisasi, dan skor. Tidak menyetujui revisi anggaran: sah atau tidaknya revisi cukup di PPK (ketentuan kantor, 24 Okt 2026). Menyetujui identifikasi survei sebagai langkah ketiga, sesudah PPK dan Tata Usaha.'
 where kode = 'KPA' and ket not like '%identifikasi survei%';
update keu_master_peran set ket = 'Membantu administrasi; dapat diberi kewenangan verifikasi dokumen oleh PPK. Menyetujui identifikasi survei sebagai langkah kedua, sesudah PPK.'
 where kode = 'TU' and ket not like '%identifikasi survei%';
update keu_master_peran set ket = ket || ' Menyetujui identifikasi survei sebagai langkah pertama.'
 where kode = 'PPK' and ket not like '%identifikasi survei%';

-- ---------------------------------------------------------------------
-- 2. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_ident (
  id                   bigint generated always as identity primary key,
  tahun                smallint not null references keu_tahun_anggaran(tahun),
  ro_kode              text not null references keu_ro(kode),
  nama                 text not null check (char_length(btrim(nama)) >= 3),
  status               text not null default 'draf' check (status in ('draf','menunggu_ketua','menunggu_setuju','sah','revisi','dibatalkan')),
  rev                  boolean not null default false,                  -- pengiriman yang sedang berjalan adalah revisi
  ver                  int not null default 0 check (ver >= 0),          -- versi Sah terakhir (0 = belum pernah sah)
  form                 jsonb not null check (jsonb_typeof(form) = 'object' and octet_length(form::text) <= 200000),
  langkah              smallint not null default 0 check (langkah between 0 and 3),   -- jumlah persetujuan (PPK, TU, KPA) pada pengiriman ini
  alasan_revisi        text not null default '',
  catatan_kembali      text not null default '',
  kembali_oleh         text,
  kembali_at           timestamptz,
  upd                  jsonb not null default '{}'::jsonb check (jsonb_typeof(upd) = 'object'),   -- pembaruan H-15 per periode
  dibuat_oleh          bigint references sigap_akun(id),
  diajukan_oleh        bigint references sigap_akun(id),
  diajukan_at          timestamptz,
  disetujui_ketua_oleh bigint references sigap_akun(id),
  disetujui_ketua_at   timestamptz,
  dibuat_at            timestamptz not null default now(),
  diubah_at            timestamptz not null default now(),
  constraint ident_sah_ver check (status <> 'sah' or ver >= 1),
  constraint ident_revisi_ver check (status <> 'revisi' or ver >= 1)
);
create index if not exists keu_ident_ro_idx on keu_ident(tahun, ro_kode);
create unique index if not exists keu_ident_nama_uq on keu_ident(tahun, ro_kode, lower(btrim(nama))) where status <> 'dibatalkan';

create table if not exists keu_ident_versi (
  id          bigint generated always as identity primary key,
  ident_id    bigint not null references keu_ident(id),
  ver         int not null check (ver >= 1),
  form        jsonb not null,
  alasan      text not null default '',
  rev         boolean not null default false,
  disahkan_at timestamptz not null default now(),
  unique (ident_id, ver)
);

create table if not exists keu_ident_riwayat (
  id        bigint generated always as identity primary key,
  ident_id  bigint not null references keu_ident(id),
  aksi      text not null,
  dari      text,
  ke        text not null,
  ver       int not null default 0,
  oleh      bigint references sigap_akun(id),
  catatan   text not null default '',
  at        timestamptz not null default now()
);
create index if not exists keu_ident_riwayat_idx on keu_ident_riwayat(ident_id, at);

-- pemetaan baris POK (kunci_stabil) ke paket belanja, per RO; satu baris POK dipetakan sekali untuk semua survei RO itu
create table if not exists keu_ident_paket (
  tahun        smallint not null references keu_tahun_anggaran(tahun),
  ro_kode      text not null references keu_ro(kode),
  kunci_stabil text not null,
  paket        text[] not null default '{}'::text[],
  oleh         bigint references sigap_akun(id),
  diubah_at    timestamptz not null default now(),
  primary key (tahun, ro_kode, kunci_stabil),
  constraint ident_paket_format check (array_to_string(paket, ',') ~ '^([0-9]{6}(-[A-Z])?(,[0-9]{6}(-[A-Z])?)*)?$')
);

-- ---------------------------------------------------------------------
-- 3. Fungsi bantu murni
-- ---------------------------------------------------------------------
-- jumlah hari pada bulan ke-m0 (0 = Januari tahun p_tahun; boleh lewat 11 = tahun berikutnya)
create or replace function keu_ident_hari_bulan(p_tahun int, p_m0 int)
returns int language sql immutable set search_path = public as $$
  select extract(day from (make_date(p_tahun + (p_m0 / 12), (p_m0 % 12) + 1, 1) + interval '1 month' - interval '1 day'))::int
$$;

create or replace function keu_ident_tgl(p_tahun int, p_m0 int, p_hari int)
returns date language sql immutable set search_path = public as $$
  select make_date(p_tahun + (p_m0 / 12), (p_m0 % 12) + 1, 1) + (least(greatest(p_hari, 1), keu_ident_hari_bulan(p_tahun, p_m0)) - 1)
$$;

-- jendela pendataan {mulai, selesai} satu periode dari isian formulir; null bila tidak dapat dihitung.
-- Urutan: pengecualian aktif periode itu, lalu pola jendela (jend), atau jadwal tunggal bila "Tanpa periode".
create or replace function keu_ident_jendela(p_form jsonb, p_periode text, p_tahun int)
returns date[] language plpgsql immutable set search_path = public as $$
declare
  v_per text := p_form ->> 'periode';
  v_len int := case v_per when 'Bulanan' then 1 when 'Triwulanan' then 3 when 'Kuartalan (4 bulanan)' then 4 when 'Semesteran' then 6 when 'Tahunan' then 12 when 'Ad-hoc' then 12 else 0 end;
  v_ke text[] := case v_per
    when 'Bulanan' then array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
    when 'Triwulanan' then array['Triwulan I','Triwulan II','Triwulan III','Triwulan IV']
    when 'Kuartalan (4 bulanan)' then array['Kuartal I (Jan–Apr)','Kuartal II (Mei–Agu)','Kuartal III (Sep–Des)']
    when 'Semesteran' then array['Semester I','Semester II']
    when 'Tahunan' then array['Tahun 2026']
    when 'Ad-hoc' then array['Ad-hoc']
    else array[]::text[] end;
  v_i int; v_b int; j jsonb := coalesce(p_form -> 'jend', '{}'::jsonb); e jsonb; t jsonb;
  mb int; mn int; sb int; sn int; ms date; se date; v_mj text; v_sj text;
begin
  if v_len = 0 then
    t := coalesce(p_form -> 'tunggal', '{}'::jsonb);
    if nullif(t ->> 'mulai', '') is null or nullif(t ->> 'selesai', '') is null then return null; end if;
    return array[(t ->> 'mulai')::date, (t ->> 'selesai')::date];
  end if;
  v_i := array_position(v_ke, p_periode);
  if v_i is null then return null; end if;
  e := p_form -> 'kecuali' -> p_periode;
  if e is not null and coalesce((e ->> 'on')::boolean, false) then
    if nullif(e ->> 'mulai', '') is null or nullif(e ->> 'selesai', '') is null then return null; end if;
    return array[(e ->> 'mulai')::date, (e ->> 'selesai')::date];
  end if;
  v_b := (v_i - 1) * v_len;
  mb := coalesce((j ->> 'mb')::int, 0); mn := coalesce((j ->> 'mn')::int, 1);
  sb := coalesce((j ->> 'sb')::int, 0); sn := coalesce((j ->> 'sn')::int, 1);
  v_mj := coalesce(j ->> 'mj', 'tgl'); v_sj := coalesce(j ->> 'sj', 'tgl');
  ms := keu_ident_tgl(p_tahun, v_b + mb, case when v_mj = 'akhir' then keu_ident_hari_bulan(p_tahun, v_b + mb) - mn + 1 else mn end);
  se := keu_ident_tgl(p_tahun, v_b + sb, case when v_sj = 'akhir' then keu_ident_hari_bulan(p_tahun, v_b + sb) else sn end);
  return array[ms, se];
end $$;

-- ---------------------------------------------------------------------
-- 4. Pemeriksa hak
-- ---------------------------------------------------------------------
create or replace function keu_ident_punya(p_akun bigint, p_peran text, p_ro text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from keu_penugasan t join keu_master_peran pr on pr.kode = t.peran_kode and pr.aktif
     where t.akun_id = p_akun and t.peran_kode = p_peran and t.dibatalkan_at is null and t.masa @> current_date
       and (p_ro is null or pr.lingkup = 'global' or t.ro_kode = p_ro))
$$;
revoke execute on function keu_ident_punya(bigint, text, text) from public, anon, authenticated;

-- RO tanpa ketua tim aktif: PPK menggantikan peran ketua agar usulan admin RO tidak buntu
create or replace function keu_ident_ketua_ada(p_ro text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from keu_penugasan t where t.peran_kode = 'KETUA' and t.ro_kode = p_ro and t.dibatalkan_at is null and t.masa @> current_date)
$$;
revoke execute on function keu_ident_ketua_ada(text) from public, anon, authenticated;

-- hak akun yang masuk, untuk menampilkan tombol (yang memutuskan tetap fungsi alur)
create or replace function keu_ident_hak(p_ro text default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  return jsonb_build_object(
    'susun', keu_boleh(p_akun, 'ident_susun', p_ro),
    'ketua', (p_ro is not null and keu_boleh(p_akun, 'setuju_ketua', p_ro)) or (keu_ident_punya(p_akun, 'PPK') and p_ro is not null and not keu_ident_ketua_ada(p_ro)),
    'ppk', keu_ident_punya(p_akun, 'PPK'), 'tu', keu_ident_punya(p_akun, 'TU'), 'kpa', keu_ident_punya(p_akun, 'KPA'), 'akun', p_akun);
end $$;
revoke execute on function keu_ident_hak(text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Penjaga tabel
-- ---------------------------------------------------------------------
create or replace function keu_ident_jaga()
returns trigger language plpgsql set search_path = public as $$
declare v_fungsi boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if keu_akun_sesi() is not null then
    if tg_op = 'DELETE' then raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501'; end if;
    if not v_fungsi then raise exception 'Tabel % hanya dapat diubah melalui fungsi alur identifikasi.', tg_table_name using errcode = '42501'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function keu_ident_cek()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.tahun, new.ro_kode, new.dibuat_oleh) is distinct from (old.tahun, old.ro_kode, old.dibuat_oleh) then
      raise exception 'Tahun, RO, dan pembuat identifikasi tidak dapat diubah' using errcode = '23514';
    end if;
    -- isian hanya berubah selagi draf atau revisi
    if old.status not in ('draf','revisi') and new.form is distinct from old.form
       and not (new.status = 'revisi' and old.status = 'sah') and not (new.status = 'sah' and old.status = 'revisi') then
      raise exception 'Isian identifikasi berstatus % terkunci', old.status using errcode = '23514';
    end if;
    if new.ver < old.ver then raise exception 'Nomor versi tidak boleh turun' using errcode = '23514'; end if;
  end if;
  new.diubah_at := clock_timestamp();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_ident for each row execute function keu_ident_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_ident for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_ident for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_versi'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_versi for each row execute function keu_ident_jaga();
    create trigger keu_t2_catat before update or delete on keu_ident_versi for each row execute function keu_catat_saja();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_riwayat'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_riwayat for each row execute function keu_ident_jaga();
    create trigger keu_t2_catat before update or delete on keu_ident_riwayat for each row execute function keu_catat_saja();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_paket'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_paket for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_ident_paket for each row execute function keu_jejak();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Fungsi alur
-- ---------------------------------------------------------------------
-- 6a. membuat survei (draf) pada satu RO
create or replace function keu_ident_buat(p_ro text, p_form jsonb, p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_nama text := btrim(coalesce(p_form ->> 'nama', ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not exists (select 1 from keu_ro where kode = p_ro and aktif) then raise exception 'RO % tidak dikenal atau tidak aktif', p_ro using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', p_ro) then raise exception 'Akun % tidak berwenang menyusun identifikasi RO %', p_akun, p_ro using errcode = '42501'; end if;
  if p_form is null or jsonb_typeof(p_form) <> 'object' then raise exception 'Isian harus berupa objek' using errcode = '22023'; end if;
  if char_length(v_nama) < 3 then raise exception 'Nama survei minimal 3 huruf' using errcode = '23514'; end if;
  if exists (select 1 from keu_ident x where x.tahun = keu_kek_tahun() and x.ro_kode = p_ro and lower(btrim(x.nama)) = lower(v_nama) and x.status <> 'dibatalkan') then
    raise exception 'Survei bernama "%" sudah ada pada RO %', v_nama, p_ro using errcode = '23505';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_ident(tahun, ro_kode, nama, status, form, dibuat_oleh) values (keu_kek_tahun(), p_ro, v_nama, 'draf', p_form, p_akun) returning id into v_id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, oleh, catatan) values (v_id, 'buat', null, 'draf', p_akun, 'Draf identifikasi dibuat');
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_buat(text, jsonb, bigint) from public, anon, authenticated;

-- 6b. menyimpan isian (draf atau revisi). p_diubah: waktu diubah_at yang dibaca penyunting; bila sudah berbeda, ditolak (ada penyunting lain).
create or replace function keu_ident_simpan(p_id bigint, p_form jsonb, p_alasan text default null, p_diubah timestamptz default null, p_akun bigint default keu_akun_sesi())
returns timestamptz language plpgsql security definer set search_path = public as $$
declare i keu_ident; v_nama text := btrim(coalesce(p_form ->> 'nama', '')); v_baru timestamptz;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_id for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang menyunting identifikasi RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status not in ('draf','revisi') then raise exception 'Identifikasi berstatus % terkunci; ajukan revisi bila sudah sah', i.status using errcode = '23514'; end if;
  if p_diubah is not null and p_diubah <> i.diubah_at then raise exception 'Isian sudah diubah orang lain; muat ulang halaman' using errcode = '40001'; end if;
  if p_form is null or jsonb_typeof(p_form) <> 'object' then raise exception 'Isian harus berupa objek' using errcode = '22023'; end if;
  if char_length(v_nama) < 3 then raise exception 'Nama survei minimal 3 huruf' using errcode = '23514'; end if;
  if exists (select 1 from keu_ident x where x.tahun = i.tahun and x.ro_kode = i.ro_kode and x.id <> i.id and lower(btrim(x.nama)) = lower(v_nama) and x.status <> 'dibatalkan') then
    raise exception 'Survei bernama "%" sudah ada pada RO %', v_nama, i.ro_kode using errcode = '23505';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_ident set form = p_form, nama = v_nama, alasan_revisi = coalesce(btrim(p_alasan), alasan_revisi) where id = p_id returning diubah_at into v_baru;
  perform set_config('keu.via_fungsi', '', true);
  return v_baru;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_simpan(bigint, jsonb, text, timestamptz, bigint) from public, anon, authenticated;

-- 6c. alur: kirim | setuju_ketua | setujui | kembalikan | tarik | ajukan_revisi | batal_revisi | batal
create or replace function keu_ident_aksi(p_id bigint, p_aksi text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; v jsonb; ke text; v_cat text := btrim(coalesce(p_catatan, ''));
  v_peran text[] := array['PPK','TU','KPA']; v_nama text[] := array['PPK','Tata Usaha','KPA'];
  v_susun boolean; v_ketua boolean; v_ppk boolean; v_form_sah jsonb; v_balik text; P text; v_upd jsonb := '{}'::jsonb; a date[]; b date[];
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_id for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_id using errcode = '23514'; end if;
  v_susun := keu_boleh(p_akun, 'ident_susun', i.ro_kode);
  v_ppk := keu_ident_punya(p_akun, 'PPK');
  v_ketua := keu_boleh(p_akun, 'setuju_ketua', i.ro_kode) or (v_ppk and not keu_ident_ketua_ada(i.ro_kode));
  v_balik := case when i.ver > 0 then 'revisi' else 'draf' end;
  select form into v_form_sah from keu_ident_versi where ident_id = i.id and ver = i.ver;
  perform set_config('keu.via_fungsi', '1', true);

  if p_aksi = 'kirim' then
    if i.status not in ('draf','revisi') then raise exception 'Hanya draf atau revisi yang dapat dikirim (status %)', i.status using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang mengirim identifikasi RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    if i.status = 'revisi' then
      if char_length(btrim(i.alasan_revisi)) < 10 then raise exception 'Alasan revisi wajib diisi, minimal 10 huruf' using errcode = '23514'; end if;
      if i.form is not distinct from v_form_sah then raise exception 'Belum ada perubahan dibanding versi sah' using errcode = '23514'; end if;
    end if;
    ke := case when keu_boleh(p_akun, 'setuju_ketua', i.ro_kode) or v_ppk then 'menunggu_setuju' else 'menunggu_ketua' end;
    update keu_ident set status = ke, rev = (i.ver > 0), langkah = 0, diajukan_oleh = p_akun, diajukan_at = now(),
           disetujui_ketua_oleh = case when ke = 'menunggu_setuju' then p_akun end, disetujui_ketua_at = case when ke = 'menunggu_setuju' then now() end,
           catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'kirim', i.status, ke, i.ver + 1, p_akun,
      case when i.ver > 0 then 'Revisi. Alasan: ' || btrim(i.alasan_revisi) else '' end);

  elsif p_aksi = 'setuju_ketua' then
    if i.status <> 'menunggu_ketua' then raise exception 'Identifikasi tidak menunggu ketua tim (status %)', i.status using errcode = '23514'; end if;
    if not v_ketua then raise exception 'Akun % bukan ketua tim RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    if p_akun = i.diajukan_oleh then raise exception 'Pengirim tidak menyetujui kirimannya sendiri sebagai ketua' using errcode = '42501'; end if;
    ke := 'menunggu_setuju';
    update keu_ident set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now() where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'setuju_ketua', i.status, ke, i.ver + 1, p_akun, v_cat);

  elsif p_aksi = 'setujui' then
    if i.status <> 'menunggu_setuju' then raise exception 'Identifikasi tidak menunggu persetujuan (status %)', i.status using errcode = '23514'; end if;
    if not keu_ident_punya(p_akun, v_peran[i.langkah + 1]) or not keu_boleh(p_akun, 'ident_setuju') then
      raise exception 'Giliran % (langkah %); akun % tidak berwenang', v_nama[i.langkah + 1], i.langkah + 1, p_akun using errcode = '42501';
    end if;
    if i.langkah + 1 < 3 then
      ke := 'menunggu_setuju';
      update keu_ident set langkah = i.langkah + 1 where id = i.id;
      insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'setujui', i.status, ke, i.ver + 1, p_akun, v_nama[i.langkah + 1] || ' menyetujui. ' || v_cat);
    else
      ke := 'sah';
      -- pembaruan H-15 dipertahankan hanya untuk periode yang jendelanya tidak berubah oleh versi baru
      if i.ver > 0 and v_form_sah is not null then
        for P in select k from jsonb_object_keys(i.upd) k loop
          a := keu_ident_jendela(v_form_sah, P, i.tahun); b := keu_ident_jendela(i.form, P, i.tahun);
          if a is not null and a = b then v_upd := v_upd || jsonb_build_object(P, i.upd -> P); end if;
        end loop;
      end if;
      insert into keu_ident_versi(ident_id, ver, form, alasan, rev) values (i.id, i.ver + 1, i.form, case when i.rev then i.alasan_revisi else '' end, i.rev);
      update keu_ident set status = 'sah', ver = i.ver + 1, langkah = 3, rev = false, alasan_revisi = '', catatan_kembali = '', kembali_oleh = null, kembali_at = null, upd = v_upd where id = i.id;
      insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'setujui', i.status, 'sah', i.ver + 1, p_akun, v_nama[3] || ' menyetujui; identifikasi sah v' || (i.ver + 1));
    end if;

  elsif p_aksi = 'kembalikan' then
    if char_length(v_cat) < 5 then raise exception 'Catatan pengembalian wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if i.status = 'menunggu_ketua' and v_ketua then v_nama := array['Ketua tim','Ketua tim','Ketua tim'];
    elsif i.status = 'menunggu_setuju' and keu_ident_punya(p_akun, v_peran[i.langkah + 1]) and keu_boleh(p_akun, 'ident_setuju') then null;
    else raise exception 'Akun % tidak dapat mengembalikan identifikasi berstatus % pada giliran ini', p_akun, i.status using errcode = '42501'; end if;
    ke := v_balik;
    update keu_ident set status = ke, langkah = 0, catatan_kembali = v_cat,
           kembali_oleh = case when i.status = 'menunggu_ketua' then 'Ketua tim' else v_nama[i.langkah + 1] end, kembali_at = now() where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'kembalikan', i.status, ke, i.ver + 1, p_akun, v_cat);

  elsif p_aksi = 'tarik' then
    if i.status not in ('menunggu_ketua','menunggu_setuju') or i.langkah > 0 then
      raise exception 'Hanya kiriman yang belum disetujui siapa pun yang dapat ditarik kembali' using errcode = '23514';
    end if;
    if not (p_akun = i.diajukan_oleh or v_ppk or keu_boleh(p_akun, 'setuju_ketua', i.ro_kode)) then
      raise exception 'Hanya pengirim, ketua tim, atau PPK yang dapat menarik kiriman' using errcode = '42501';
    end if;
    ke := v_balik;
    update keu_ident set status = ke, langkah = 0 where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'tarik', i.status, ke, i.ver + 1, p_akun, v_cat);

  elsif p_aksi = 'ajukan_revisi' then
    if i.status <> 'sah' then raise exception 'Revisi hanya dapat diajukan dari identifikasi yang sah (status %)', i.status using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang mengajukan revisi RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    ke := 'revisi';
    update keu_ident set status = ke, form = v_form_sah, alasan_revisi = '', langkah = 0, catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'ajukan_revisi', i.status, ke, i.ver + 1, p_akun, 'Revisi dibuka dari sah v' || i.ver);

  elsif p_aksi = 'batal_revisi' then
    if i.status <> 'revisi' then raise exception 'Tidak ada revisi yang sedang disunting (status %)', i.status using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang membatalkan revisi RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    ke := 'sah';
    update keu_ident set status = ke, form = v_form_sah, nama = coalesce(nullif(btrim(v_form_sah ->> 'nama'), ''), nama), alasan_revisi = '', langkah = 3, catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'batal_revisi', i.status, ke, i.ver, p_akun, 'Revisi dibatalkan; kembali ke sah v' || i.ver);

  elsif p_aksi = 'batal' then
    if i.ver > 0 or i.status <> 'draf' then raise exception 'Hanya draf yang belum pernah sah yang dapat dibatalkan' using errcode = '23514'; end if;
    if char_length(v_cat) < 5 then raise exception 'Alasan pembatalan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if not (v_susun or p_akun = i.dibuat_oleh) then raise exception 'Akun % tidak berwenang membatalkan identifikasi ini', p_akun using errcode = '42501'; end if;
    ke := 'dibatalkan';
    update keu_ident set status = ke where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'batal', i.status, ke, 0, p_akun, v_cat);
  else
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_aksi(bigint, text, text, bigint) from public, anon, authenticated;

-- 6d. pembaruan periode H-15 (sesudah sah). Pergeseran kedua ujung terhadap jendela pada versi sah paling banyak 7 hari.
create or replace function keu_ident_h15(p_id bigint, p_periode text, p_mulai date, p_selesai date, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; f jsonb; w date[]; gm int; gs int; v_ambang constant int := 7; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_id for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang memperbarui periode RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.ver < 1 then raise exception 'Pembaruan periode baru dapat dilakukan sesudah identifikasi sah' using errcode = '23514'; end if;
  select form into f from keu_ident_versi where ident_id = i.id and ver = i.ver;
  if f ->> 'instrumen' = 'Tanpa pendataan' or f ->> 'periode' = 'Tanpa periode' then
    raise exception 'Identifikasi ini tidak memiliki pendataan berperiode' using errcode = '23514';
  end if;
  if not (f -> 'keList') ? p_periode then raise exception 'Periode % tidak ada pada identifikasi sah', p_periode using errcode = '23514'; end if;
  if p_mulai is null or p_selesai is null or p_selesai < p_mulai then raise exception 'Tanggal belum lengkap atau selesai sebelum mulai' using errcode = '23514'; end if;
  w := keu_ident_jendela(f, p_periode, i.tahun);
  if w is null then raise exception 'Jendela pendataan % belum dapat dihitung' , p_periode using errcode = '23514'; end if;
  gm := p_mulai - w[1]; gs := p_selesai - w[2];
  if greatest(abs(gm), abs(gs)) > v_ambang then
    raise exception 'Pergeseran % hari (mulai) dan % hari (selesai) melebihi % hari; ajukan revisi identifikasi', gm, gs, v_ambang using errcode = '23514';
  end if;
  r := jsonb_build_object('mulai', p_mulai, 'selesai', p_selesai, 'geser_mulai', gm, 'geser_selesai', gs, 'oleh', p_akun, 'at', now());
  perform set_config('keu.via_fungsi', '1', true);
  update keu_ident set upd = upd || jsonb_build_object(p_periode, r) where id = i.id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'h15', i.status, i.status, i.ver, p_akun,
    p_periode || ': pendataan ' || to_char(p_mulai, 'DD/MM/YYYY') || ' s.d. ' || to_char(p_selesai, 'DD/MM/YYYY') || case when gm <> 0 or gs <> 0 then ' (bergeser ' || gm || '/' || gs || ' hari)' else ' (tanggal ditegaskan)' end);
  perform set_config('keu.via_fungsi', '', true);
  return r;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_h15(bigint, text, date, date, bigint) from public, anon, authenticated;

-- 6e. memetakan baris POK ke paket belanja (per RO)
create or replace function keu_ident_paket_atur(p_ro text, p_kunci text, p_paket text[], p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare v_tahun smallint := keu_kek_tahun(); x text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (keu_boleh(p_akun, 'rab', p_ro) or keu_boleh(p_akun, 'draf', p_ro) or keu_boleh(p_akun, 'sahkan')) then
    raise exception 'Akun % tidak berwenang memetakan baris POK RO %', p_akun, p_ro using errcode = '42501';
  end if;
  if not exists (select 1 from keu_v_adm_lembar l where l.ro_kode = p_ro and l.kunci_stabil = p_kunci) then
    raise exception 'Baris POK % tidak ada pada RO % di POK berlaku', p_kunci, p_ro using errcode = '23514';
  end if;
  p_paket := coalesce(p_paket, array[]::text[]);
  foreach x in array p_paket loop
    if x !~ '^[0-9]{6}(-[A-Z])?$' then raise exception 'Kode paket % tidak sah', x using errcode = '23514'; end if;
  end loop;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_ident_paket(tahun, ro_kode, kunci_stabil, paket, oleh) values (v_tahun, p_ro, p_kunci, p_paket, p_akun)
  on conflict (tahun, ro_kode, kunci_stabil) do update set paket = excluded.paket, oleh = excluded.oleh, diubah_at = now();
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_paket_atur(text, text, text[], bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Tampilan (dibaca server lewat service_role)
-- ---------------------------------------------------------------------
create or replace view keu_v_ident with (security_invoker = true) as
select i.id, i.tahun, i.ro_kode, i.nama, i.status, i.rev, i.ver, i.langkah, i.form,
       (select v.form from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver) as form_sah,
       (select v.disahkan_at from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver) as sah_at,
       i.alasan_revisi, i.catatan_kembali, i.kembali_oleh, i.kembali_at, i.upd,
       i.dibuat_oleh, i.diajukan_oleh, i.diajukan_at, i.disetujui_ketua_oleh, i.disetujui_ketua_at, i.dibuat_at, i.diubah_at,
       case i.status when 'draf' then 'penyusun' when 'revisi' then 'penyusun (revisi)' when 'menunggu_ketua' then 'ketua tim'
         when 'menunggu_setuju' then case i.langkah when 0 then 'PPK' when 1 then 'Tata Usaha' else 'KPA' end end as menunggu
from keu_ident i;

-- Satu-satunya pintu modul hilir (anggaran, Delego, rekrutmen, evaluasi): hanya versi Sah, bukan draf atau revisi yang sedang disunting.
create or replace view keu_v_ident_sah with (security_invoker = true) as
select i.id as ident_id, i.tahun, i.ro_kode, i.nama, i.ver, v.form, v.disahkan_at, i.upd
from keu_ident i join keu_ident_versi v on v.ident_id = i.id and v.ver = i.ver
where i.ver >= 1 and i.status <> 'dibatalkan';

create or replace view keu_v_ident_versi with (security_invoker = true) as
select v.ident_id, i.nama, v.ver, v.form, v.alasan, v.rev, v.disahkan_at
from keu_ident_versi v join keu_ident i on i.id = v.ident_id;

create or replace view keu_v_ident_riwayat with (security_invoker = true) as
select r.id, r.ident_id, i.nama, i.ro_kode, r.aksi, r.dari, r.ke, r.ver, ak.nama as oleh_nama, r.catatan, r."at" as waktu
from keu_ident_riwayat r join keu_ident i on i.id = r.ident_id left join sigap_akun ak on ak.id = r.oleh;

create or replace view keu_v_ident_paket with (security_invoker = true) as
select p.tahun, p.ro_kode, p.kunci_stabil, p.paket, ak.nama as oleh_nama, p.diubah_at
from keu_ident_paket p left join sigap_akun ak on ak.id = p.oleh;

-- ---------------------------------------------------------------------
-- 8. RLS, hak, gerbang
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_ident','keu_ident_versi','keu_ident_riwayat','keu_ident_paket')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke execute on function keu_ident_hari_bulan(int, int), keu_ident_tgl(int, int, int), keu_ident_jendela(jsonb, text, int), keu_ident_jaga(), keu_ident_cek() from public, anon, authenticated;
grant execute on function keu_ident_hari_bulan(int, int), keu_ident_tgl(int, int, int), keu_ident_jendela(jsonb, text, int) to service_role;
revoke all on keu_v_ident, keu_v_ident_sah, keu_v_ident_versi, keu_v_ident_riwayat, keu_v_ident_paket from anon, authenticated, public;
grant select on keu_v_ident, keu_v_ident_sah, keu_v_ident_versi, keu_v_ident_riwayat, keu_v_ident_paket to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama (definisi lengkap ada di berkas l dan penambahan berikutnya)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_ident_aksi''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_ident_aksi'',''keu_ident_buat'',''keu_ident_h15'',''keu_ident_hak'',''keu_ident_paket_atur'',''keu_ident_simpan'',');
    if position('''keu_ident_aksi''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
