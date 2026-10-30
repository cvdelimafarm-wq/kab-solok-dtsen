-- =====================================================================
-- 20261025zd_keu_kebijakan_tim.sql
-- SIGAP - Lembar kebijakan manajemen tim (tahap 28). Templat susunan tim (strata S1-S9, minimal per jabatan, rangkap, kompetensi) dan
-- kebijakan anggaran (21 parameter) disimpan sebagai DATA, bukan ditanam di kode. Rancangan: Skema Lengkap V1 bagian 5-7.
-- Bergantung pada 20261024a-n dan 20261025za/zc (memakai keu_ident_punya, keu_kek_tahun). Aman diulang. Tanpa DELETE/DROP.
--
-- Isi:
--  1. Kewenangan baru: kebijakan_susun (PPK, Perencanaan, Admin) dan kebijakan_setuju (ketua tim, PPK, KPA; hanya keterangan peran).
--  2. Tabel keu_kebijakan_lembar (satu baris = satu versi tahunan; isi = jsonb utuh dan terkunci), keu_kebijakan_pengesah (daftar pengesah
--     yang dibekukan saat diajukan), keu_kebijakan_riwayat (jejak).
--  3. Alur status: draf -> menunggu -> berlaku (terkunci) -> arsip. Revisi = versi baru dari lembar berlaku. Satu lembar berlaku per tahun.
--     Pengesahan PARALEL: SEMUA akun ketua tim aktif, SATU akun PPK, SATU akun KPA. Satu akun yang memegang beberapa peran cukup menyetujui sekali.
--  4. keu_kebijakan_periksa: pemeriksa isi (kembaran lib/keu/kebijakan.ts periksaIsi; pesan sama persis; diuji sama persis).
--  5. Tampilan keu_v_kebijakan_berlaku = satu-satunya pintu modul hilir (hanya lembar berlaku).
--  6. Fungsi didaftarkan ke gerbang keu_jalankan; tabel dan tampilan hanya dibaca server (service_role).
-- Tidak termasuk (tahap berikutnya): izin pengecualian, notifikasi, temuan Gap, tabel rujukan SBM/transport (menunggu berkas).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kewenangan
-- ---------------------------------------------------------------------
insert into keu_master_kewenangan(kode, nama, ket, urut) values
  ('kebijakan_susun', 'Menyusun lembar kebijakan manajemen tim', 'PPK, Perencanaan, dan Admin Aplikasi: membuat draf, mengisi hasil rapat, mengajukan, dan membuka revisi.', 92),
  ('kebijakan_setuju', 'Mengesahkan lembar kebijakan manajemen tim', 'Paralel: semua ketua tim aktif, PPK, dan KPA. Berlaku setelah semuanya menyetujui.', 93)
on conflict (kode) do nothing;

insert into keu_master_kewenangan_peran(kewenangan_kode, peran_kode, perlu_pemberian, ket) values
  ('kebijakan_susun', 'PPK', false, ''), ('kebijakan_susun', 'RENC', false, ''), ('kebijakan_susun', 'ADMIN', false, ''),
  ('kebijakan_setuju', 'KETUA', false, 'semua ketua tim aktif'), ('kebijakan_setuju', 'PPK', false, ''), ('kebijakan_setuju', 'KPA', false, '')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_kebijakan_lembar (
  id               bigint generated always as identity primary key,
  tahun            smallint not null references keu_tahun_anggaran(tahun),
  ver              int not null check (ver >= 1),
  status           text not null default 'draf' check (status in ('draf','menunggu','berlaku','arsip','dibatalkan')),
  isi              jsonb not null check (jsonb_typeof(isi) = 'object' and octet_length(isi::text) <= 200000),
  predefined       boolean not null default false,          -- angka awal dari Excel, belum diubah rapat
  tanggal_rapat    date,
  nomor_notulen    text not null default '',
  tujuan           text not null default '',
  alasan_revisi    text not null default '',
  catatan_kembali  text not null default '',
  kembali_oleh     text,
  kembali_at       timestamptz,
  dibuat_oleh      bigint references sigap_akun(id),
  diajukan_oleh    bigint references sigap_akun(id),
  diajukan_at      timestamptz,
  berlaku_at       timestamptz,
  arsip_at         timestamptz,
  dibuat_at        timestamptz not null default now(),
  diubah_at        timestamptz not null default now(),
  unique (tahun, ver),
  constraint kebijakan_berlaku_at check (status <> 'berlaku' or berlaku_at is not null)
);
create unique index if not exists keu_kebijakan_berlaku_uq on keu_kebijakan_lembar(tahun) where status = 'berlaku';
create unique index if not exists keu_kebijakan_terbuka_uq on keu_kebijakan_lembar(tahun) where status in ('draf','menunggu');

create table if not exists keu_kebijakan_pengesah (
  id         bigint generated always as identity primary key,
  lembar_id  bigint not null references keu_kebijakan_lembar(id),
  peran_kode text not null check (peran_kode in ('KETUA','PPK','KPA')),
  akun_id    bigint not null references sigap_akun(id),
  aktif      boolean not null default true,                  -- masih termasuk daftar pengesah pada pengajuan terakhir
  setuju_at  timestamptz,
  catatan    text not null default '',
  unique (lembar_id, peran_kode, akun_id)
);
create index if not exists keu_kebijakan_pengesah_idx on keu_kebijakan_pengesah(lembar_id);

create table if not exists keu_kebijakan_riwayat (
  id        bigint generated always as identity primary key,
  lembar_id bigint not null references keu_kebijakan_lembar(id),
  aksi      text not null,
  dari      text,
  ke        text not null,
  ver       int not null default 0,
  oleh      bigint references sigap_akun(id),
  catatan   text not null default '',
  at        timestamptz not null default now()
);
create index if not exists keu_kebijakan_riwayat_idx on keu_kebijakan_riwayat(lembar_id, at);

-- ---------------------------------------------------------------------
-- 3. Pemeriksa isi (kembaran lib/keu/kebijakan.ts periksaIsi; pesan sama persis)
-- ---------------------------------------------------------------------
create or replace function keu_kebijakan_angka(j jsonb)
returns numeric language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric end
$$;

create or replace function keu_kebijakan_bulat(j jsonb, p_min numeric, p_maks numeric)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(keu_kebijakan_angka(j) is not null and keu_kebijakan_angka(j) = trunc(keu_kebijakan_angka(j))
                  and keu_kebijakan_angka(j) >= p_min and keu_kebijakan_angka(j) <= p_maks, false)
$$;

create or replace function keu_kebijakan_periksa(p_isi jsonb)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  g text[] := array[]::text[];
  kst text[] := array['S1','S2','S3','S4','S5','S6','S7','S8','S9'];
  kjab text[] := array['ketua','wakil','pj_pengolahan','pj_kualitas','pj_lapangan','pj_admin','pj_logistik','pj_sdm','inda','innas'];
  njab text[] := array['Ketua','Wakil','PJ pengolahan','PJ kualitas data','PJ manajemen lapangan (kortim wilayah)','PJ administrasi','PJ logistik','PJ rekrutmen/SDM mitra','Inda (instruktur daerah)','Innas (instruktur nasional)'];
  kpar text[] := array['hari_konsultasi','peserta_konsultasi','penginapan','maks_malam','uang_harian','transport','translok_kurang_8','translok_lebih_8','maks_hari_translok','jarak_translok','paket_fullday','maks_oh','hotel_luar_kota','maks_peserta_kelas','tarif_honor_mitra','batas_honor_mitra','batas_honor_organik','pulsa_peserta','pulsa_fasih','konsumsi_rapat','batas_spj'];
  s jsonb; e jsonb; prev jsonb; sama boolean; i int; k text; m jsonb; r jsonb; x jsonb; kp jsonb; j int; v text;
  peta jsonb := '{}'::jsonb; lihat text[] := array[]::text[]; jenis text; n jsonb; b jsonb; an numeric; bn numeric; ac jsonb;
begin
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' then return array['Isi lembar harus berupa objek']; end if;

  -- strata
  s := case when jsonb_typeof(p_isi -> 'strata') = 'array' then p_isi -> 'strata' else '[]'::jsonb end;
  sama := jsonb_array_length(s) = 9;
  if sama then
    for i in 0..8 loop
      if jsonb_typeof(s -> i) <> 'object' or (s -> i) ->> 'k' is distinct from kst[i + 1] then sama := false; end if;
    end loop;
  end if;
  if not sama then
    g := g || 'Strata harus tepat S1 sampai S9 berurutan'::text;
  else
    for i in 0..8 loop
      e := s -> i; k := e ->> 'k'; prev := case when i > 0 then s -> (i - 1) end;
      if i = 0 then
        if keu_kebijakan_angka(e -> 'dari') is distinct from 1 then g := g || 'Rentang S1 harus mulai dari 1'::text; end if;
      elsif keu_kebijakan_angka(e -> 'dari') is null or keu_kebijakan_angka(prev -> 'sampai') is null
            or keu_kebijakan_angka(e -> 'dari') <> keu_kebijakan_angka(prev -> 'sampai') + 1 then
        g := g || format('Rentang %s tidak menyambung dengan strata sebelumnya', k);
      end if;
      if i = 8 then
        if (e -> 'sampai') is distinct from 'null'::jsonb then g := g || format('Rentang %s harus terbuka (tanpa batas atas)', k); end if;
      elsif keu_kebijakan_angka(e -> 'sampai') is null or keu_kebijakan_angka(e -> 'dari') is null
            or keu_kebijakan_angka(e -> 'sampai') < keu_kebijakan_angka(e -> 'dari') then
        g := g || format('Rentang %s tidak valid', k);
      end if;
      if not keu_kebijakan_bulat(e -> 'maks_jabatan', 1, 10) then g := g || format('Maksimal jabatan per orang %s harus bilangan bulat 1 sampai 10', k); end if;
      if (e -> 'persen_baru') is distinct from 'null'::jsonb
         and not coalesce(keu_kebijakan_angka(e -> 'persen_baru') between 0 and 100, false) then
        g := g || format('Persen petugas baru %s harus 0 sampai 100', k);
      end if;
    end loop;
  end if;

  -- minimal dan rangkap
  foreach k in array kst loop
    m := case when jsonb_typeof(p_isi -> 'minimal' -> k) = 'object' then p_isi -> 'minimal' -> k else '{}'::jsonb end;
    for j in 1..10 loop
      if not keu_kebijakan_bulat(m -> kjab[j], 0, 1000) then g := g || format('Minimal %s pada %s harus bilangan bulat 0 atau lebih', njab[j], k); end if;
    end loop;
    if keu_kebijakan_bulat(m -> 'ketua', 0, 1000) and keu_kebijakan_angka(m -> 'ketua') < 1 then g := g || format('Ketua pada %s minimal 1', k); end if;
    r := p_isi -> 'rangkap' -> k;
    if jsonb_typeof(r) is distinct from 'array' then
      g := g || format('Rangkap %s harus berupa daftar jabatan', k);
    else
      for x in select value from jsonb_array_elements(r) loop
        v := case when jsonb_typeof(x) = 'string' then x #>> '{}' else x::text end;
        if jsonb_typeof(x) <> 'string' or not (v = any(kjab)) then g := g || format('Rangkap %s: jabatan %s tidak dikenal', k, v); end if;
      end loop;
    end if;
  end loop;

  -- kompetensi
  kp := case when jsonb_typeof(p_isi -> 'kompetensi') = 'object' then p_isi -> 'kompetensi' else '{}'::jsonb end;
  if not coalesce(keu_kebijakan_angka(kp -> 'nilai_pelatihan_min') between 0 and 100, false) then g := g || 'Kompetensi: nilai pelatihan minimal harus 0 sampai 100'::text; end if;
  if not coalesce(keu_kebijakan_angka(kp -> 'nilai_seleksi_min') between 0 and 100, false) then g := g || 'Kompetensi: nilai seleksi minimal harus 0 sampai 100'::text; end if;
  if not keu_kebijakan_bulat(kp -> 'ambang_ketat', 1, 100000) then g := g || 'Kompetensi: ambang ketat harus bilangan bulat 1 atau lebih'::text; end if;

  -- parameter anggaran
  if jsonb_typeof(p_isi -> 'param') = 'array' then
    for x in select value from jsonb_array_elements(p_isi -> 'param') loop
      if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'k') <> 'string' then g := g || 'Parameter tanpa kode'::text; continue; end if;
      k := x ->> 'k';
      if k = any(lihat) then g := g || format('Parameter %s dobel', k);
      else lihat := lihat || k; peta := peta || jsonb_build_object(k, x); end if;
    end loop;
  end if;
  foreach k in array kpar loop
    if not (k = any(lihat)) then g := g || format('Parameter %s belum ada', k); end if;
  end loop;
  foreach k in array kpar loop
    if not (k = any(lihat)) then continue; end if;
    x := peta -> k; jenis := x ->> 'jenis';
    if jenis in ('angka','persen') then
      n := x -> 'aturan'; b := x -> 'kebijakan'; an := keu_kebijakan_angka(n); bn := keu_kebijakan_angka(b);
      if (n is distinct from 'null'::jsonb and an is null) or (b is distinct from 'null'::jsonb and bn is null) then
        g := g || format('Parameter %s: nilai harus angka', k); continue;
      end if;
      if jenis = 'persen' then
        if (an is not null and (an < 0 or an > 100)) or (bn is not null and (bn < 0 or bn > 100)) then g := g || format('Parameter %s: persen harus 0 sampai 100', k); end if;
        ac := case when jsonb_typeof(x -> 'acuan') = 'string' then peta -> (x ->> 'acuan') end;
        if ac is null or ac ->> 'jenis' is distinct from 'angka' then g := g || format('Parameter %s: acuan harus parameter angka', k); end if;
      end if;
      if an is not null and bn is null then g := g || format('Parameter %s: nilai kebijakan wajib diisi', k);
      elsif an is not null and bn is not null then
        if coalesce(x ->> 'arah', 'maks') = 'min' then
          if bn < an then g := g || format('Parameter %s: nilai kebijakan lebih longgar dari aturan', k); end if;
        elsif bn > an then g := g || format('Parameter %s: nilai kebijakan lebih longgar dari aturan', k); end if;
      end if;
    elsif jenis = 'yatidak' then
      if jsonb_typeof(x -> 'aturan') <> 'boolean' or jsonb_typeof(x -> 'kebijakan') <> 'boolean' then g := g || format('Parameter %s: nilai harus ya atau tidak', k);
      elsif (x -> 'aturan') = 'false'::jsonb and (x -> 'kebijakan') = 'true'::jsonb then g := g || format('Parameter %s: nilai kebijakan lebih longgar dari aturan', k); end if;
    elsif jenis in ('rujukan','dokumen') then
      null;
    else
      g := g || format('Parameter %s: jenis tidak dikenal', k);
    end if;
  end loop;
  return g;
end $$;

-- ---------------------------------------------------------------------
-- 4. Penjaga tabel
-- ---------------------------------------------------------------------
create or replace function keu_kebijakan_jaga()
returns trigger language plpgsql set search_path = public as $$
declare v_fungsi boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if keu_akun_sesi() is not null then
    if tg_op = 'DELETE' then raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501'; end if;
    if not v_fungsi then raise exception 'Tabel % hanya dapat diubah melalui fungsi alur lembar kebijakan.', tg_table_name using errcode = '42501'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function keu_kebijakan_cek()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.tahun, new.ver, new.dibuat_oleh) is distinct from (old.tahun, old.ver, old.dibuat_oleh) then
      raise exception 'Tahun, versi, dan pembuat lembar kebijakan tidak dapat diubah' using errcode = '23514';
    end if;
    if old.status <> 'draf' and (new.isi is distinct from old.isi or new.tanggal_rapat is distinct from old.tanggal_rapat
         or new.nomor_notulen is distinct from old.nomor_notulen or new.tujuan is distinct from old.tujuan) then
      raise exception 'Lembar kebijakan berstatus % terkunci', old.status using errcode = '23514';
    end if;
  end if;
  new.diubah_at := clock_timestamp();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kebijakan_lembar'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_kebijakan_lembar for each row execute function keu_kebijakan_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_kebijakan_lembar for each row execute function keu_kebijakan_jaga();
    create trigger keu_t9_jejak after insert or update on keu_kebijakan_lembar for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kebijakan_pengesah'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_kebijakan_pengesah for each row execute function keu_kebijakan_jaga();
    create trigger keu_t9_jejak after insert or update on keu_kebijakan_pengesah for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kebijakan_riwayat'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_kebijakan_riwayat for each row execute function keu_kebijakan_jaga();
    create trigger keu_t2_catat before update or delete on keu_kebijakan_riwayat for each row execute function keu_catat_saja();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Fungsi alur
-- ---------------------------------------------------------------------
-- hak akun yang masuk, untuk menampilkan tombol (yang memutuskan tetap fungsi alur)
create or replace function keu_kebijakan_hak(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  return jsonb_build_object('susun', keu_boleh(p_akun, 'kebijakan_susun'), 'ketua', keu_ident_punya(p_akun, 'KETUA'),
    'ppk', keu_ident_punya(p_akun, 'PPK'), 'kpa', keu_ident_punya(p_akun, 'KPA'), 'akun', p_akun);
end $$;
revoke execute on function keu_kebijakan_hak(bigint) from public, anon, authenticated;

-- syarat berlaku: semua pengesah KETUA aktif sudah setuju (dan ada), minimal satu PPK dan satu KPA aktif sudah setuju
create or replace function keu_kebijakan_lengkap(p_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from keu_kebijakan_pengesah where lembar_id = p_id and aktif and peran_kode = 'KETUA')
     and not exists (select 1 from keu_kebijakan_pengesah where lembar_id = p_id and aktif and peran_kode = 'KETUA' and setuju_at is null)
     and exists (select 1 from keu_kebijakan_pengesah where lembar_id = p_id and aktif and peran_kode = 'PPK' and setuju_at is not null)
     and exists (select 1 from keu_kebijakan_pengesah where lembar_id = p_id and aktif and peran_kode = 'KPA' and setuju_at is not null)
$$;
revoke execute on function keu_kebijakan_lengkap(bigint) from public, anon, authenticated;

-- membuat lembar: pertama kali dari isi predefined (p_isi), atau revisi dari lembar berlaku (p_dari, alasan wajib)
create or replace function keu_kebijakan_buat(p_dari bigint default null, p_isi jsonb default null, p_alasan text default '', p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_tahun smallint := keu_kek_tahun(); v_ver int; v_isi jsonb; v_g text[]; l keu_kebijakan_lembar; v_alasan text := btrim(coalesce(p_alasan, '')); v_dari_ver int;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'kebijakan_susun') then raise exception 'Akun % tidak berwenang menyusun lembar kebijakan', p_akun using errcode = '42501'; end if;
  if exists (select 1 from keu_kebijakan_lembar where tahun = v_tahun and status in ('draf','menunggu')) then
    raise exception 'Masih ada lembar kebijakan % yang belum selesai (draf atau menunggu pengesahan)', v_tahun using errcode = '23505';
  end if;
  select coalesce(max(ver), 0) + 1 into v_ver from keu_kebijakan_lembar where tahun = v_tahun;
  if p_dari is null then
    if exists (select 1 from keu_kebijakan_lembar where tahun = v_tahun and status = 'berlaku') then
      raise exception 'Sudah ada lembar kebijakan % yang berlaku; ubah lewat revisi', v_tahun using errcode = '23505';
    end if;
    if p_isi is null then raise exception 'Isi lembar wajib diisi' using errcode = '22023'; end if;
    v_isi := p_isi;
  else
    select * into l from keu_kebijakan_lembar where id = p_dari;
    if not found or l.tahun <> v_tahun or l.status <> 'berlaku' then raise exception 'Revisi hanya dapat dibuka dari lembar kebijakan % yang berlaku', v_tahun using errcode = '23514'; end if;
    if char_length(v_alasan) < 10 then raise exception 'Alasan revisi wajib diisi, minimal 10 huruf' using errcode = '23514'; end if;
    v_isi := l.isi; v_dari_ver := l.ver;
  end if;
  v_g := keu_kebijakan_periksa(v_isi);
  if cardinality(v_g) > 0 then raise exception 'Isi lembar belum sah: %', v_g[1] using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_kebijakan_lembar(tahun, ver, status, isi, predefined, alasan_revisi, dibuat_oleh)
    values (v_tahun, v_ver, 'draf', v_isi, (p_dari is null), v_alasan, p_akun) returning id into v_id;
  insert into keu_kebijakan_riwayat(lembar_id, aksi, dari, ke, ver, oleh, catatan)
    values (v_id, 'buat', null, 'draf', v_ver, p_akun, case when p_dari is null then 'Draf dari angka predefined (belum sah)' else 'Revisi dari versi ' || coalesce(v_dari_ver, 0) || '. Alasan: ' || v_alasan end);
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kebijakan_buat(bigint, jsonb, text, bigint) from public, anon, authenticated;

-- menyimpan isi dan hasil rapat selama draf
create or replace function keu_kebijakan_simpan(p_id bigint, p_isi jsonb, p_rapat date default null, p_nomor text default '', p_tujuan text default '', p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare l keu_kebijakan_lembar; v_g text[];
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into l from keu_kebijakan_lembar where id = p_id for update;
  if not found then raise exception 'Lembar kebijakan % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'kebijakan_susun') then raise exception 'Akun % tidak berwenang menyusun lembar kebijakan', p_akun using errcode = '42501'; end if;
  if l.status <> 'draf' then raise exception 'Hanya draf yang dapat disimpan (status %)', l.status using errcode = '23514'; end if;
  v_g := keu_kebijakan_periksa(p_isi);
  if cardinality(v_g) > 0 then raise exception 'Isi lembar belum sah: %', v_g[1] using errcode = '23514'; end if;
  if p_rapat is not null and p_rapat > current_date then raise exception 'Tanggal rapat tidak boleh di masa depan' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_kebijakan_lembar set isi = p_isi, predefined = (predefined and p_isi = isi), tanggal_rapat = p_rapat,
         nomor_notulen = btrim(coalesce(p_nomor, '')), tujuan = btrim(coalesce(p_tujuan, '')) where id = p_id;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kebijakan_simpan(bigint, jsonb, date, text, text, bigint) from public, anon, authenticated;

-- alur: ajukan | setuju | kembalikan | tarik | batal
create or replace function keu_kebijakan_aksi(p_id bigint, p_aksi text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  l keu_kebijakan_lembar; ke text; v_cat text := btrim(coalesce(p_catatan, '')); v_susun boolean; v_g text[]; v_n int; v_peran text; v_ket text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into l from keu_kebijakan_lembar where id = p_id for update;
  if not found then raise exception 'Lembar kebijakan % tidak ada', p_id using errcode = '23514'; end if;
  v_susun := keu_boleh(p_akun, 'kebijakan_susun');
  perform set_config('keu.via_fungsi', '1', true);

  if p_aksi = 'ajukan' then
    if l.status <> 'draf' then raise exception 'Hanya draf yang dapat diajukan (status %)', l.status using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang mengajukan lembar kebijakan', p_akun using errcode = '42501'; end if;
    v_g := keu_kebijakan_periksa(l.isi);
    if cardinality(v_g) > 0 then raise exception 'Isi lembar belum sah: %', v_g[1] using errcode = '23514'; end if;
    if l.tanggal_rapat is null then raise exception 'Tanggal rapat wajib diisi sebelum diajukan' using errcode = '23514'; end if;
    if char_length(l.nomor_notulen) < 3 then raise exception 'Nomor notulen atau SK wajib diisi sebelum diajukan' using errcode = '23514'; end if;
    if char_length(l.tujuan) < 10 then raise exception 'Tujuan mutu wajib diisi sebelum diajukan (minimal 10 huruf)' using errcode = '23514'; end if;
    -- daftar pengesah dibekukan sekarang: semua akun ketua tim aktif, semua pemegang PPK, semua pemegang KPA
    update keu_kebijakan_pengesah set aktif = false, setuju_at = null, catatan = '' where lembar_id = l.id;
    insert into keu_kebijakan_pengesah(lembar_id, peran_kode, akun_id)
      select distinct l.id, t.peran_kode, t.akun_id
        from keu_penugasan t join sigap_akun a on a.id = t.akun_id and a.aktif
       where t.peran_kode in ('KETUA','PPK','KPA') and t.dibatalkan_at is null and t.masa @> current_date
    on conflict (lembar_id, peran_kode, akun_id) do update set aktif = true, setuju_at = null, catatan = '';
    foreach v_peran in array array['KETUA','PPK','KPA'] loop
      select count(*) into v_n from keu_kebijakan_pengesah where lembar_id = l.id and aktif and peran_kode = v_peran;
      if v_n = 0 then
        raise exception 'Belum ada akun % aktif; lembar tidak dapat diajukan', case v_peran when 'KETUA' then 'ketua tim' when 'KPA' then 'KPA' else 'PPK' end using errcode = '23514';
      end if;
    end loop;
    ke := 'menunggu';
    update keu_kebijakan_lembar set status = ke, diajukan_oleh = p_akun, diajukan_at = now(), catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = l.id;
    insert into keu_kebijakan_riwayat(lembar_id, aksi, dari, ke, ver, oleh, catatan) values (l.id, 'ajukan', l.status, ke, l.ver, p_akun,
      (select count(*) from keu_kebijakan_pengesah where lembar_id = l.id and aktif) || ' baris pengesah dibekukan');

  elsif p_aksi = 'setuju' then
    if l.status <> 'menunggu' then raise exception 'Lembar tidak menunggu pengesahan (status %)', l.status using errcode = '23514'; end if;
    update keu_kebijakan_pengesah set setuju_at = now(), catatan = v_cat where lembar_id = l.id and akun_id = p_akun and aktif and setuju_at is null;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'Akun % bukan pengesah lembar ini atau sudah menyetujui', p_akun using errcode = '42501'; end if;
    select string_agg(distinct case peran_kode when 'KETUA' then 'ketua tim' else peran_kode end, ', ') into v_ket
      from keu_kebijakan_pengesah where lembar_id = l.id and akun_id = p_akun and aktif;
    if keu_kebijakan_lengkap(l.id) then
      ke := 'berlaku';
      update keu_kebijakan_lembar set status = 'arsip', arsip_at = now() where tahun = l.tahun and status = 'berlaku' and id <> l.id;
      update keu_kebijakan_lembar set status = ke, berlaku_at = now(), catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = l.id;
      insert into keu_kebijakan_riwayat(lembar_id, aksi, dari, ke, ver, oleh, catatan) values (l.id, 'setuju', l.status, ke, l.ver, p_akun,
        'Pengesah terakhir menyetujui (' || v_ket || '); lembar versi ' || l.ver || ' berlaku' || case when l.ver > 1 then '; versi sebelumnya diarsipkan' else '' end);
    else
      ke := 'menunggu';
      insert into keu_kebijakan_riwayat(lembar_id, aksi, dari, ke, ver, oleh, catatan) values (l.id, 'setuju', l.status, ke, l.ver, p_akun, 'Menyetujui sebagai ' || v_ket || '. ' || v_cat);
    end if;

  elsif p_aksi = 'kembalikan' then
    if l.status <> 'menunggu' then raise exception 'Lembar tidak menunggu pengesahan (status %)', l.status using errcode = '23514'; end if;
    if char_length(v_cat) < 5 then raise exception 'Catatan pengembalian wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if not exists (select 1 from keu_kebijakan_pengesah where lembar_id = l.id and akun_id = p_akun and aktif) then
      raise exception 'Hanya pengesah lembar ini yang dapat mengembalikannya' using errcode = '42501';
    end if;
    select string_agg(distinct case peran_kode when 'KETUA' then 'Ketua tim' when 'KPA' then 'KPA' else 'PPK' end, ', ') into v_ket
      from keu_kebijakan_pengesah where lembar_id = l.id and akun_id = p_akun and aktif;
    ke := 'draf';
    update keu_kebijakan_pengesah set setuju_at = null, catatan = '' where lembar_id = l.id;
    update keu_kebijakan_lembar set status = ke, catatan_kembali = v_cat, kembali_oleh = v_ket, kembali_at = now() where id = l.id;
    insert into keu_kebijakan_riwayat(lembar_id, aksi, dari, ke, ver, oleh, catatan) values (l.id, 'kembalikan', l.status, ke, l.ver, p_akun, v_cat);

  elsif p_aksi = 'tarik' then
    if l.status <> 'menunggu' then raise exception 'Hanya lembar yang menunggu pengesahan yang dapat ditarik (status %)', l.status using errcode = '23514'; end if;
    if exists (select 1 from keu_kebijakan_pengesah where lembar_id = l.id and aktif and setuju_at is not null) then
      raise exception 'Sudah ada pengesah yang menyetujui; gunakan pengembalian oleh pengesah' using errcode = '23514';
    end if;
    if not (v_susun or p_akun = l.diajukan_oleh) then raise exception 'Hanya pengaju atau penyusun yang dapat menarik lembar' using errcode = '42501'; end if;
    ke := 'draf';
    update keu_kebijakan_lembar set status = ke where id = l.id;
    insert into keu_kebijakan_riwayat(lembar_id, aksi, dari, ke, ver, oleh, catatan) values (l.id, 'tarik', l.status, ke, l.ver, p_akun, v_cat);

  elsif p_aksi = 'batal' then
    if l.status <> 'draf' then raise exception 'Hanya draf yang dapat dibatalkan (status %)', l.status using errcode = '23514'; end if;
    if char_length(v_cat) < 5 then raise exception 'Alasan pembatalan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang membatalkan draf', p_akun using errcode = '42501'; end if;
    ke := 'dibatalkan';
    update keu_kebijakan_lembar set status = ke where id = l.id;
    insert into keu_kebijakan_riwayat(lembar_id, aksi, dari, ke, ver, oleh, catatan) values (l.id, 'batal', l.status, ke, l.ver, p_akun, v_cat);
  else
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_kebijakan_aksi(bigint, text, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Tampilan (dibaca server lewat service_role)
-- ---------------------------------------------------------------------
create or replace view keu_v_kebijakan with (security_invoker = true) as
select l.id, l.tahun, l.ver, l.status, l.isi, l.predefined, l.tanggal_rapat, l.nomor_notulen, l.tujuan, l.alasan_revisi,
       l.catatan_kembali, l.kembali_oleh, l.kembali_at, l.dibuat_oleh, l.diajukan_oleh, l.diajukan_at, l.berlaku_at, l.arsip_at, l.dibuat_at, l.diubah_at
from keu_kebijakan_lembar l;

-- Satu-satunya pintu modul hilir (identifikasi lanjutan, rencana realisasi, Bendahara, evaluasi): hanya lembar yang berlaku.
create or replace view keu_v_kebijakan_berlaku with (security_invoker = true) as
select l.id as lembar_id, l.tahun, l.ver, l.isi, l.predefined, l.tanggal_rapat, l.nomor_notulen, l.tujuan, l.berlaku_at
from keu_kebijakan_lembar l where l.status = 'berlaku';

create or replace view keu_v_kebijakan_pengesah with (security_invoker = true) as
select p.lembar_id, p.peran_kode, p.akun_id, ak.nama as akun_nama, p.aktif, p.setuju_at, p.catatan
from keu_kebijakan_pengesah p left join sigap_akun ak on ak.id = p.akun_id;

create or replace view keu_v_kebijakan_riwayat with (security_invoker = true) as
select r.id, r.lembar_id, r.aksi, r.dari, r.ke, r.ver, ak.nama as oleh_nama, r.catatan, r."at" as waktu
from keu_kebijakan_riwayat r left join sigap_akun ak on ak.id = r.oleh;

-- ---------------------------------------------------------------------
-- 7. RLS, hak, gerbang
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_kebijakan_lembar','keu_kebijakan_pengesah','keu_kebijakan_riwayat')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke execute on function keu_kebijakan_angka(jsonb), keu_kebijakan_bulat(jsonb, numeric, numeric), keu_kebijakan_jaga(), keu_kebijakan_cek() from public, anon, authenticated;
grant execute on function keu_kebijakan_angka(jsonb), keu_kebijakan_bulat(jsonb, numeric, numeric) to service_role;
revoke execute on function keu_kebijakan_periksa(jsonb) from public, anon, authenticated;
grant execute on function keu_kebijakan_periksa(jsonb) to service_role;
revoke all on keu_v_kebijakan, keu_v_kebijakan_berlaku, keu_v_kebijakan_pengesah, keu_v_kebijakan_riwayat from anon, authenticated, public;
grant select on keu_v_kebijakan, keu_v_kebijakan_berlaku, keu_v_kebijakan_pengesah, keu_v_kebijakan_riwayat to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_kebijakan_aksi''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_kebijakan_aksi'',''keu_kebijakan_buat'',''keu_kebijakan_hak'',''keu_kebijakan_simpan'',');
    if position('''keu_kebijakan_aksi''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
