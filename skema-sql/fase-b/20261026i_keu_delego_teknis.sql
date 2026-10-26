-- =====================================================================
-- 20261026i_keu_delego_teknis.sql
-- SIGAP - Delego untuk PEKERJAAN TEKNIS KANTOR (memeriksa dokumen/peta, evaluasi, briefing, menyusun KAK, merevisi anggaran, dan sejenisnya).
-- Bergantung pada 20261026c, e, f, g, h. Aman diulang. Tanpa DELETE/DROP TABLE (katalog, kelompok, langkah, rutin dinonaktifkan, bukan dihapus).
--
-- Keputusan pengguna (26 Okt 2026): ukuran beban tetap POIN (katalog jenis pekerjaan berisi satuan + poin per satuan); asal pekerjaan boleh
-- "Pekerjaan tim" (kelompok non-RO); tahap pertama memuat hasil kerja + tinjau ulang, templat berulang, daftar langkah, dan pekerjaan insidental bertenggat jam.
--
--  1. keu_dlg_jenis     : katalog jenis pekerjaan (nama, satuan, poin per satuan, perlu hasil, perlu tinjau, langkah bawaan). Nilai poin awal hanyalah USULAN
--                         (kapasitas 70 poin = 7,5 jam = 450 menit => sekitar 9,3 poin per jam); Ketua Tim menyesuaikan sendiri (cek aturan beban kerja).
--  2. keu_dlg_kelompok  : "Pekerjaan tim" non-RO. Kode berawalan TIM- dan dipakai sebagai ro_kode delegasi (hak pemberi = tingkat tim, lewat keu_boleh).
--  3. keu_dlg_delegasi  : kolom jenis_id, poin_per_satuan (salinan saat dibuat), perlu_hasil, perlu_tinjau, insidental, tenggat_waktu (jam), rutin_id, rutin_periode,
--                         pengingat_tenggat_at, telat_diberi_at. keu_dlg_laporan.jumlah (jumlah satuan yang dikerjakan; poin = jumlah x poin_per_satuan).
--  4. keu_dlg_hasil     : hasil kerja yang diserahkan penerima (butir seperti bukti: tautan/teks atau foto) + putusan tinjau pemberi (diterima atau revisi).
--  5. keu_dlg_langkah   : daftar langkah per delegasi (dicentang penerima; langkah yang dilepas dinonaktifkan, tidak dihapus).
--  6. keu_dlg_rutin     : templat pekerjaan berulang (mingguan atau bulanan); keu_dlg_rutin_jalan membuat delegasi pada hari jatuh tempo (idempoten).
--  7. fungsi tulis baru : keu_dlg_jenis_simpan, keu_dlg_kelompok_simpan, keu_dlg_lapor_jumlah, keu_dlg_hasil_serah, keu_dlg_hasil_tinjau, keu_dlg_langkah_atur,
--                         keu_dlg_langkah_centang, keu_dlg_rutin_simpan. Penjadwal: keu_dlg_rutin_jalan, keu_dlg_pengingat_tenggat (jadwalnya di berkas 20261026j).
--  8. fungsi diganti    : keu_dlg_hak, keu_dlg_saya, keu_dlg_bahan, keu_dlg_buat, keu_dlg_ubah, keu_dlg_pindah, keu_dlg_pengingat.
--  9. jenis notifikasi baru: delegasi_hasil, delegasi_tinjau, delegasi_tenggat (ditambahkan ke daftar yang ADA saat ini, bukan menimpa).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-2. Tabel katalog dan kelompok
-- ---------------------------------------------------------------------
create table if not exists keu_dlg_jenis (
  id              bigint generated always as identity primary key,
  kode            text not null unique check (kode ~ '^[a-z0-9_]{3,30}$'),
  nama            text not null check (char_length(nama) between 3 and 80),
  satuan          text not null check (char_length(satuan) between 1 and 30),
  poin_per_satuan numeric(8,2) not null check (poin_per_satuan > 0 and poin_per_satuan <= 1000),
  uraian          text not null default '' check (char_length(uraian) <= 300),
  perlu_hasil     boolean not null default true,
  perlu_tinjau    boolean not null default false,
  langkah_bawaan  jsonb not null default '[]'::jsonb check (jsonb_typeof(langkah_bawaan) = 'array' and jsonb_array_length(langkah_bawaan) <= 12),
  urut            smallint not null default 50,
  aktif           boolean not null default true,
  dicatat_oleh    bigint references sigap_akun(id),
  dibuat_at       timestamptz not null default now(),
  diubah_at       timestamptz not null default now()
);

create table if not exists keu_dlg_kelompok (
  kode         text primary key check (kode ~ '^TIM-[A-Z0-9-]{2,30}$'),
  nama         text not null check (char_length(nama) between 3 and 80),
  aktif        boolean not null default true,
  urut         smallint not null default 10,
  dicatat_oleh bigint references sigap_akun(id),
  dibuat_at    timestamptz not null default now(),
  diubah_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Kolom baru delegasi dan laporan
-- ---------------------------------------------------------------------
alter table keu_dlg_delegasi add column if not exists jenis_id bigint references keu_dlg_jenis(id);
alter table keu_dlg_delegasi add column if not exists poin_per_satuan numeric(8,2) check (poin_per_satuan is null or poin_per_satuan > 0);
alter table keu_dlg_delegasi add column if not exists perlu_hasil boolean not null default false;
alter table keu_dlg_delegasi add column if not exists perlu_tinjau boolean not null default false;
alter table keu_dlg_delegasi add column if not exists insidental boolean not null default false;
alter table keu_dlg_delegasi add column if not exists tenggat_waktu timestamptz;
alter table keu_dlg_delegasi add column if not exists rutin_id bigint;
alter table keu_dlg_delegasi add column if not exists rutin_periode date;
alter table keu_dlg_delegasi add column if not exists pengingat_tenggat_at timestamptz;
alter table keu_dlg_delegasi add column if not exists telat_diberi_at timestamptz;
create index if not exists keu_dlg_delegasi_jenis_idx on keu_dlg_delegasi(jenis_id);
create index if not exists keu_dlg_delegasi_tenggat_waktu_idx on keu_dlg_delegasi(tenggat_waktu) where tenggat_waktu is not null;

alter table keu_dlg_laporan add column if not exists jumlah numeric(10,2) check (jumlah is null or jumlah >= 0);

-- ---------------------------------------------------------------------
-- 4-6. Tabel hasil, langkah, rutin
-- ---------------------------------------------------------------------
create table if not exists keu_dlg_hasil (
  id             bigint generated always as identity primary key,
  delegasi_id    bigint not null references keu_dlg_delegasi(id),
  nomor          smallint not null check (nomor >= 1),
  catatan        text not null default '' check (char_length(catatan) <= 500),
  butir          jsonb not null check (jsonb_typeof(butir) = 'array' and jsonb_array_length(butir) between 1 and 5 and char_length(butir::text) <= 3000),
  status         text not null default 'diserahkan' check (status in ('diserahkan','diterima','revisi')),
  catatan_tinjau text not null default '' check (char_length(catatan_tinjau) <= 500),
  diserahkan_oleh bigint references sigap_akun(id),
  diserahkan_at  timestamptz not null default now(),
  ditinjau_oleh  bigint references sigap_akun(id),
  ditinjau_at    timestamptz,
  unique (delegasi_id, nomor)
);
create index if not exists keu_dlg_hasil_idx on keu_dlg_hasil(delegasi_id, status);

create table if not exists keu_dlg_langkah (
  id           bigint generated always as identity primary key,
  delegasi_id  bigint not null references keu_dlg_delegasi(id),
  urut         smallint not null default 0,
  judul        text not null check (char_length(judul) between 2 and 150),
  selesai      boolean not null default false,
  selesai_oleh bigint references sigap_akun(id),
  selesai_at   timestamptz,
  aktif        boolean not null default true,
  dibuat_oleh  bigint references sigap_akun(id),
  dibuat_at    timestamptz not null default now()
);
create index if not exists keu_dlg_langkah_idx on keu_dlg_langkah(delegasi_id, aktif, urut);

create table if not exists keu_dlg_rutin (
  id            bigint generated always as identity primary key,
  judul         text not null check (char_length(judul) between 3 and 150),
  uraian        text not null default '' check (char_length(uraian) <= 1000),
  ro_kode       text not null check (char_length(ro_kode) between 3 and 40),
  jenis_id      bigint not null references keu_dlg_jenis(id),
  jumlah        numeric(10,2) not null check (jumlah > 0 and jumlah <= 100000),
  bobot         smallint not null default 1 check (bobot between 1 and 5),
  frekuensi     text not null check (frekuensi in ('mingguan','bulanan')),
  hari          smallint not null check (hari between 1 and 28),
  durasi_hari   smallint not null default 7 check (durasi_hari between 1 and 60),
  hari_kerja    smallint[] not null default array[1,2,3,4,5]::smallint[] check (cardinality(hari_kerja) between 1 and 7),
  penerima      jsonb not null check (jsonb_typeof(penerima) = 'array' and jsonb_array_length(penerima) between 1 and 40),
  mulai_berlaku date not null,
  berakhir      date,
  aktif         boolean not null default true,
  terakhir_jalan date,
  dibuat_oleh   bigint references sigap_akun(id),
  diubah_oleh   bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  check (berakhir is null or berakhir >= mulai_berlaku),
  check (frekuensi = 'bulanan' or hari between 1 and 7)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_dlg_delegasi'::regclass and conname = 'keu_dlg_delegasi_rutin_fk') then
    alter table keu_dlg_delegasi add constraint keu_dlg_delegasi_rutin_fk foreign key (rutin_id) references keu_dlg_rutin(id);
  end if;
end $$;
create unique index if not exists keu_dlg_delegasi_rutin_uq on keu_dlg_delegasi(rutin_id, penerima_akun, rutin_periode) where rutin_id is not null;

do $$
declare t text;
begin
  foreach t in array array['keu_dlg_jenis','keu_dlg_kelompok','keu_dlg_hasil','keu_dlg_langkah','keu_dlg_rutin']
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

-- ---------------------------------------------------------------------
-- 9. Jenis notifikasi baru (menambah ke daftar yang ADA di basis data saat ini; tidak menimpa tambahan pihak lain)
-- ---------------------------------------------------------------------
do $$
declare v_def text; v_ada text[]; v_baru text[] := array['delegasi_hasil','delegasi_tinjau','delegasi_tenggat']::text[]; v_all text[];
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conrelid = 'public.keu_notifikasi'::regclass and conname = 'keu_notifikasi_jenis_check';
  if v_def is null then raise exception 'Batasan keu_notifikasi_jenis_check tidak ditemukan'; end if;
  select array_agg(t.m[1]) into v_ada from regexp_matches(v_def, '''([a-z0-9_]+)''::text', 'g') as t(m);
  if v_ada is null or not (v_baru <@ v_ada) then
    select array_agg(distinct x order by x) into v_all from unnest(coalesce(v_ada, array[]::text[]) || v_baru) x;
    alter table keu_notifikasi drop constraint keu_notifikasi_jenis_check;
    execute format('alter table keu_notifikasi add constraint keu_notifikasi_jenis_check check (jenis = any (%L::text[]))', v_all);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Isi bawaan katalog dan kelompok (USULAN awal; Ketua Tim menyesuaikan di layar Katalog pekerjaan)
-- ---------------------------------------------------------------------
insert into keu_dlg_kelompok(kode, nama, urut) values ('TIM-KESRA', 'Tim Statistik Kesejahteraan Rakyat', 10) on conflict (kode) do nothing;

insert into keu_dlg_jenis(kode, nama, satuan, poin_per_satuan, uraian, perlu_hasil, perlu_tinjau, langkah_bawaan, urut) values
 ('periksa_dokumen', 'Memeriksa dokumen', 'dokumen', 9, 'Sekitar 1 jam per dokumen (usulan awal; sesuaikan).', true, false, '[]'::jsonb, 10),
 ('periksa_peta', 'Memeriksa peta', 'peta', 14, 'Sekitar 1,5 jam per peta atau blok (usulan awal; sesuaikan).', true, false, '[]'::jsonb, 20),
 ('evaluasi_pelaksanaan', 'Evaluasi pelaksanaan', 'laporan', 28, 'Sekitar 3 jam per laporan evaluasi (usulan awal; sesuaikan).', true, true,
   '["Kumpulkan data pelaksanaan","Analisis capaian dan kendala","Susun rekomendasi","Finalisasi laporan evaluasi"]'::jsonb, 30),
 ('briefing', 'Briefing', 'sesi', 19, 'Sekitar 2 jam per sesi termasuk persiapan (usulan awal; sesuaikan).', false, false, '[]'::jsonb, 40),
 ('susun_kak', 'Menyusun KAK', 'KAK', 70, 'Sekitar 1 hari kerja per KAK (usulan awal; sesuaikan).', true, true,
   '["Kerangka dan ruang lingkup","Latar belakang dan tujuan","Metodologi dan jadwal","Rincian anggaran","Telaah internal","Finalisasi"]'::jsonb, 50),
 ('revisi_anggaran', 'Merevisi anggaran', 'revisi', 35, 'Sekitar setengah hari kerja per revisi (usulan awal; sesuaikan).', true, true,
   '["Telaah usulan revisi","Susun RAB baru","Periksa pagu dan blokir","Ajukan ke pejabat berwenang"]'::jsonb, 60),
 ('rapat_koordinasi', 'Rapat dan koordinasi', 'rapat', 14, 'Sekitar 1,5 jam per rapat (usulan awal; sesuaikan).', false, false, '[]'::jsonb, 70),
 ('teknis_lainnya', 'Pekerjaan teknis lainnya', 'tugas', 14, 'Pekerjaan teknis yang tidak termasuk jenis lain (usulan awal; sesuaikan).', true, false, '[]'::jsonb, 90)
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- Pembantu
-- ---------------------------------------------------------------------
-- jumlah hari kerja pada rentang tertutup menurut hk (1-7), tanpa tanggal libur aktif
create or replace function keu_dlg_hitung_hk(p_mulai date, p_tenggat date, p_hk smallint[]) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from generate_series(p_mulai::timestamp, least(p_tenggat, p_mulai + 800)::timestamp, interval '1 day') g(d)
   where extract(isodow from g.d)::int = any (p_hk)
     and not exists (select 1 from keu_dlg_libur l where l.tanggal = g.d::date and l.aktif)
$$;

-- butir hasil sah: larik 1-5, tiap butir teks 1-300 huruf atau objek {ket?, path?} dengan path milik delegasi itu
create or replace function keu_dlg_butir_sah(p_butir jsonb, p_delegasi bigint) returns boolean
language plpgsql immutable as $$
declare e jsonb; v_s text;
begin
  if p_butir is null or jsonb_typeof(p_butir) <> 'array' or jsonb_array_length(p_butir) not between 1 and 5 or char_length(p_butir::text) > 3000 then return false; end if;
  for e in select * from jsonb_array_elements(p_butir) loop
    if jsonb_typeof(e) = 'string' then
      v_s := btrim(e #>> '{}');
      if char_length(v_s) < 1 or char_length(v_s) > 300 then return false; end if;
    elsif jsonb_typeof(e) = 'object' then
      if e ? 'path' and (jsonb_typeof(e -> 'path') <> 'string' or (e ->> 'path') !~ ('^delego/' || p_delegasi::text || '/[0-9a-f]{16,64}\.(jpg|png|webp)$')) then return false; end if;
      if e ? 'ket' and (jsonb_typeof(e -> 'ket') <> 'string' or char_length(e ->> 'ket') > 120) then return false; end if;
      if not (e ? 'path') and coalesce(btrim(e ->> 'ket'), '') = '' then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;

-- pekerjaan sudah tuntas dari sisi penerima: hasil diserahkan/diterima bila perlu hasil, selain itu ada laporan pada atau sesudah tanggal tenggat
create or replace function keu_dlg_tuntas(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case when d.perlu_hasil
              then exists (select 1 from keu_dlg_hasil h where h.delegasi_id = d.id and h.status in ('diserahkan','diterima'))
              else exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id and l.tanggal >= d.tenggat) end
    from keu_dlg_delegasi d where d.id = p_id
$$;

-- ---------------------------------------------------------------------
-- Fungsi tulis: katalog dan kelompok (hanya pemberi tingkat tim)
-- ---------------------------------------------------------------------
-- p_data: { id? (ubah), kode (wajib saat baru), nama, satuan, poin_per_satuan, uraian?, perlu_hasil?, perlu_tinjau?, langkah_bawaan? [teks], urut?, aktif? }
-- Perubahan poin_per_satuan hanya berlaku untuk delegasi BARU (delegasi lama memegang salinannya).
create or replace function keu_dlg_jenis_simpan(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j keu_dlg_jenis; v_id bigint; v_kode text; v_nama text; v_sat text; v_pps numeric; v_ura text; v_ph boolean; v_pt boolean; v_urut int; v_aktif boolean; v_lang jsonb; e jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat mengatur katalog pekerjaan' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian harus objek JSON' using errcode = '22023'; end if;
  v_id := nullif(p_data ->> 'id', '')::bigint;
  if v_id is not null then
    select * into j from keu_dlg_jenis where id = v_id for update;
    if not found then raise exception 'Jenis pekerjaan % tidak ada', v_id using errcode = '23514'; end if;
  end if;
  v_kode := case when v_id is null then lower(btrim(coalesce(p_data ->> 'kode', ''))) else j.kode end;
  if v_kode !~ '^[a-z0-9_]{3,30}$' then raise exception 'Kode jenis 3 sampai 30 karakter: huruf kecil, angka, garis bawah' using errcode = '23514'; end if;
  v_nama := btrim(coalesce(p_data ->> 'nama', j.nama, ''));
  if char_length(v_nama) < 3 or char_length(v_nama) > 80 then raise exception 'Nama jenis 3 sampai 80 huruf' using errcode = '23514'; end if;
  v_sat := btrim(coalesce(p_data ->> 'satuan', j.satuan, ''));
  if char_length(v_sat) < 1 or char_length(v_sat) > 30 then raise exception 'Satuan 1 sampai 30 huruf' using errcode = '23514'; end if;
  v_pps := coalesce(nullif(p_data ->> 'poin_per_satuan', '')::numeric, j.poin_per_satuan);
  if v_pps is null or v_pps <= 0 or v_pps > 1000 then raise exception 'Poin per satuan harus lebih dari 0 dan paling banyak 1000' using errcode = '23514'; end if;
  v_ura := left(btrim(coalesce(p_data ->> 'uraian', j.uraian, '')), 300);
  v_ph := coalesce((p_data ->> 'perlu_hasil')::boolean, j.perlu_hasil, true);
  v_pt := coalesce((p_data ->> 'perlu_tinjau')::boolean, j.perlu_tinjau, false);
  if v_pt and not v_ph then raise exception 'Tinjau hasil hanya bermakna bila jenis ini meminta hasil kerja' using errcode = '23514'; end if;
  v_urut := coalesce(nullif(p_data ->> 'urut', '')::int, j.urut, 50);
  if v_urut not between 0 and 999 then raise exception 'Urutan 0 sampai 999' using errcode = '23514'; end if;
  v_aktif := coalesce((p_data ->> 'aktif')::boolean, j.aktif, true);
  v_lang := coalesce(p_data -> 'langkah_bawaan', j.langkah_bawaan, '[]'::jsonb);
  if jsonb_typeof(v_lang) <> 'array' or jsonb_array_length(v_lang) > 12 then raise exception 'Langkah bawaan paling banyak 12' using errcode = '23514'; end if;
  for e in select * from jsonb_array_elements(v_lang) loop
    if jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 2 and 150 then raise exception 'Tiap langkah bawaan 2 sampai 150 huruf' using errcode = '23514'; end if;
  end loop;

  perform set_config('keu.via_fungsi', '1', true);
  if v_id is null then
    insert into keu_dlg_jenis(kode, nama, satuan, poin_per_satuan, uraian, perlu_hasil, perlu_tinjau, langkah_bawaan, urut, aktif, dicatat_oleh)
    values (v_kode, v_nama, v_sat, v_pps, v_ura, v_ph, v_pt, v_lang, v_urut, v_aktif, p_akun) returning id into v_id;
  else
    update keu_dlg_jenis set nama = v_nama, satuan = v_sat, poin_per_satuan = v_pps, uraian = v_ura, perlu_hasil = v_ph, perlu_tinjau = v_pt,
           langkah_bawaan = v_lang, urut = v_urut, aktif = v_aktif, dicatat_oleh = p_akun, diubah_at = now() where id = v_id;
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', v_id, 'kode', v_kode);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- p_data: { kode (TIM-XXXX), nama, aktif?, urut? }
create or replace function keu_dlg_kelompok_simpan(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare k keu_dlg_kelompok; v_kode text; v_nama text; v_aktif boolean; v_urut int;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) then raise exception 'Hanya pemberi delegasi tingkat tim yang dapat mengatur Pekerjaan tim' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian harus objek JSON' using errcode = '22023'; end if;
  v_kode := upper(btrim(coalesce(p_data ->> 'kode', '')));
  if v_kode !~ '^TIM-[A-Z0-9-]{2,30}$' then raise exception 'Kode kelompok berawalan TIM- lalu 2 sampai 30 huruf besar, angka, atau tanda hubung' using errcode = '23514'; end if;
  select * into k from keu_dlg_kelompok where kode = v_kode for update;
  v_nama := btrim(coalesce(p_data ->> 'nama', k.nama, ''));
  if char_length(v_nama) < 3 or char_length(v_nama) > 80 then raise exception 'Nama kelompok 3 sampai 80 huruf' using errcode = '23514'; end if;
  v_aktif := coalesce((p_data ->> 'aktif')::boolean, k.aktif, true);
  v_urut := coalesce(nullif(p_data ->> 'urut', '')::int, k.urut, 10);
  if v_urut not between 0 and 999 then raise exception 'Urutan 0 sampai 999' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_kelompok(kode, nama, aktif, urut, dicatat_oleh) values (v_kode, v_nama, v_aktif, v_urut, p_akun)
  on conflict (kode) do update set nama = excluded.nama, aktif = excluded.aktif, urut = excluded.urut, dicatat_oleh = p_akun, diubah_at = now();
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('kode', v_kode, 'aktif', v_aktif);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Pembuatan delegasi (diganti): jenis katalog, Pekerjaan tim, insidental bertenggat jam, langkah, penanda rutin
-- ---------------------------------------------------------------------
-- p_data: { ident_id? | kelompok? (TIM-...) | ro_kode?, judul, uraian?, jenis_id?, jumlah? (satuan; bila jenis dipilih), satuan?, target_total?, target_harian?, bobot?, hari_kerja?[],
--           mulai?, tenggat, tenggat_jam? ("HH:MM" WIB), insidental?, perlu_hasil?, perlu_tinjau?, langkah? [teks],
--           penerima: [ { akun, peran: wakil|pegawai|pml|ppl, pj_bidang? } ... ] }
create or replace function keu_dlg_buat(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; j keu_dlg_jenis; v_ident bigint; v_ro text; v_judul text; v_ura text; v_sat text; v_th numeric; v_tt numeric; v_bobot int; v_mulai date; v_tenggat date;
  v_hk smallint[]; r jsonb; v_akun bigint; v_peran text; v_pj text; a sigap_akun; v_ids bigint[] := '{}'; v_id bigint; v_hari date := keu_dlg_hari_ini(); v_pemberi text;
  v_iv integer; v_jenis bigint; v_pps numeric; v_jumlah numeric; v_ins boolean; v_jam text; v_tw timestamptz; v_ph boolean; v_pt boolean; v_lang jsonb; e jsonb; v_n int;
  v_rutin bigint; v_rper date; v_dari_rutin boolean := coalesce(current_setting('keu.dari_rutin', true), '') = '1'; v_kel text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian delegasi harus objek JSON' using errcode = '22023'; end if;

  v_ident := nullif(p_data ->> 'ident_id', '')::bigint;
  v_kel := upper(btrim(coalesce(p_data ->> 'kelompok', '')));
  if v_ident is not null then
    select * into i from keu_ident where id = v_ident;
    if not found then raise exception 'Identifikasi % tidak ada', v_ident using errcode = '23514'; end if;
    if i.status = 'dibatalkan' or i.ver < 1 then raise exception 'Identifikasi belum disahkan atau sudah dibatalkan' using errcode = '23514'; end if;
    v_ro := i.ro_kode; v_iv := i.ver;
  elsif v_kel <> '' then
    v_ro := v_kel;
  else
    v_ro := btrim(coalesce(p_data ->> 'ro_kode', ''));
    if char_length(v_ro) < 3 then raise exception 'Pilih identifikasi, RO, atau Pekerjaan tim' using errcode = '23514'; end if;
  end if;
  if v_ro like 'TIM-%' and not exists (select 1 from keu_dlg_kelompok k where k.kode = v_ro and k.aktif) then
    raise exception 'Pekerjaan tim % tidak ada atau tidak aktif', v_ro using errcode = '23514';
  end if;
  if not keu_dlg_beri(p_akun, v_ro) then raise exception 'Akun % tidak berwenang mendelegasikan pekerjaan pada RO %', p_akun, v_ro using errcode = '42501'; end if;

  v_jenis := nullif(p_data ->> 'jenis_id', '')::bigint;
  if v_jenis is not null then
    select * into j from keu_dlg_jenis where id = v_jenis and aktif;
    if not found then raise exception 'Jenis pekerjaan % tidak ada atau tidak aktif', v_jenis using errcode = '23514'; end if;
    v_pps := j.poin_per_satuan;
  end if;
  v_ins := coalesce((p_data ->> 'insidental')::boolean, false);

  v_judul := btrim(coalesce(p_data ->> 'judul', ''));
  if char_length(v_judul) < 3 or char_length(v_judul) > 200 then raise exception 'Judul delegasi 3 sampai 200 huruf' using errcode = '23514'; end if;
  v_ura := btrim(coalesce(p_data ->> 'uraian', ''));
  if char_length(v_ura) > 1000 then raise exception 'Uraian maksimal 1000 huruf' using errcode = '23514'; end if;
  v_sat := case when v_jenis is not null then j.satuan else coalesce(nullif(btrim(p_data ->> 'satuan'), ''), 'poin') end;
  v_bobot := coalesce(nullif(p_data ->> 'bobot', '')::int, 1);
  v_mulai := coalesce(nullif(p_data ->> 'mulai', '')::date, v_hari);
  v_tenggat := nullif(p_data ->> 'tenggat', '')::date;
  if v_tenggat is null and v_ins then v_tenggat := v_mulai; end if;
  if v_tenggat is null then raise exception 'Tenggat wajib diisi' using errcode = '23514'; end if;
  if v_tenggat < v_mulai then raise exception 'Tenggat tidak boleh sebelum tanggal mulai' using errcode = '23514'; end if;
  if v_tenggat > v_mulai + 400 then raise exception 'Rentang delegasi maksimal 400 hari' using errcode = '23514'; end if;
  if v_bobot not between 1 and 5 then raise exception 'Bobot 1 sampai 5' using errcode = '23514'; end if;
  v_hk := case when p_data ? 'hari_kerja' then keu_dlg_hk(p_data -> 'hari_kerja') when v_ins then array[1,2,3,4,5,6,7]::smallint[] else keu_dlg_hk(null) end;

  v_jam := nullif(btrim(coalesce(p_data ->> 'tenggat_jam', '')), '');
  if v_jam is not null then
    if v_jam !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Jam tenggat berbentuk HH:MM (WIB)' using errcode = '23514'; end if;
    v_tw := (v_tenggat::text || ' ' || v_jam)::timestamp at time zone 'Asia/Jakarta';
    if v_tw <= now() and not v_dari_rutin then raise exception 'Jam tenggat sudah lewat' using errcode = '23514'; end if;
  end if;

  -- target: jenis katalog menghitung dari jumlah satuan; selain itu poin langsung
  v_jumlah := nullif(p_data ->> 'jumlah', '')::numeric;
  if v_jenis is not null and v_jumlah is not null then
    if v_jumlah <= 0 or v_jumlah > 100000 then raise exception 'Jumlah pekerjaan harus lebih dari 0' using errcode = '23514'; end if;
    v_tt := round(v_jumlah * v_pps, 2);
    v_th := coalesce(nullif(p_data ->> 'target_harian', '')::numeric, round(v_tt / greatest(1, keu_dlg_hitung_hk(v_mulai, v_tenggat, v_hk)), 2));
  elsif v_jenis is not null and nullif(p_data ->> 'target_harian', '') is null then
    raise exception 'Isi jumlah pekerjaan (%) untuk jenis %', j.satuan, j.nama using errcode = '23514';
  else
    v_th := coalesce(nullif(p_data ->> 'target_harian', '')::numeric, 70);
    v_tt := nullif(p_data ->> 'target_total', '')::numeric;
  end if;
  if v_th < 0 or v_th > 1000 then raise exception 'Beban harian % poin di luar batas 0 sampai 1000: perpanjang tenggat atau kurangi jumlah', v_th using errcode = '23514'; end if;

  v_ph := coalesce((p_data ->> 'perlu_hasil')::boolean, case when v_jenis is not null then j.perlu_hasil else false end);
  v_pt := coalesce((p_data ->> 'perlu_tinjau')::boolean, case when v_jenis is not null then j.perlu_tinjau else false end);
  if v_pt and not v_ph then raise exception 'Tinjau hasil hanya bermakna bila delegasi meminta hasil kerja' using errcode = '23514'; end if;

  v_lang := case when p_data ? 'langkah' then p_data -> 'langkah' when v_jenis is not null then j.langkah_bawaan else '[]'::jsonb end;
  if v_lang is null or jsonb_typeof(v_lang) <> 'array' or jsonb_array_length(v_lang) > 20 then raise exception 'Langkah harus larik paling banyak 20' using errcode = '23514'; end if;
  for e in select * from jsonb_array_elements(v_lang) loop
    if jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 2 and 150 then raise exception 'Tiap langkah 2 sampai 150 huruf' using errcode = '23514'; end if;
  end loop;

  if v_dari_rutin then
    v_rutin := nullif(p_data ->> 'rutin_id', '')::bigint;
    v_rper := nullif(p_data ->> 'rutin_periode', '')::date;
  end if;

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
                                 hari_kerja, mulai, tenggat, jenis_id, poin_per_satuan, perlu_hasil, perlu_tinjau, insidental, tenggat_waktu, rutin_id, rutin_periode,
                                 dibuat_oleh, diubah_oleh)
    values (extract(year from v_mulai)::smallint, v_ident, v_iv, v_ro, v_judul, v_ura, v_akun, v_peran, v_pj, v_sat, v_tt, v_th, v_bobot,
            v_hk, v_mulai, v_tenggat, v_jenis, v_pps, v_ph, v_pt, v_ins, v_tw, v_rutin, v_rper, p_akun, p_akun)
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_n := 0;
    for e in select * from jsonb_array_elements(v_lang) loop
      v_n := v_n + 1;
      insert into keu_dlg_langkah(delegasi_id, urut, judul, dibuat_oleh) values (v_id, v_n, btrim(e #>> '{}'), p_akun);
    end loop;
    perform keu_dlg_notif(v_akun, 'delegasi_baru', v_ident, case when v_ins then 'Pekerjaan mendadak: ' else 'Delegasi baru: ' end || v_judul,
      'Dari ' || coalesce(v_pemberi, 'Ketua Tim') || ', tenggat ' || to_char(v_tenggat, 'DD-MM-YYYY') || case when v_jam is not null then ' pukul ' || v_jam || ' WIB' else '' end
      || '. Buka Delego untuk melihat dan memulai.', p_akun);
  end loop;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('dibuat', to_jsonb(v_ids));
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Ubah (diganti): perlu_hasil, perlu_tinjau, jam tenggat; selesai menunggu hasil bila diminta
-- ---------------------------------------------------------------------
create or replace function keu_dlg_ubah(p_id bigint, p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; n keu_dlg_delegasi; a sigap_akun; v_hari date := keu_dlg_hari_ini(); v_tbaru numeric; v_tmulai date; v_ada_riwayat boolean; v_efektif numeric; v_lewat_riwayat boolean := false;
        v_jam text;
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
  if p_data ? 'perlu_hasil' then n.perlu_hasil := coalesce((p_data ->> 'perlu_hasil')::boolean, d.perlu_hasil); end if;
  if p_data ? 'perlu_tinjau' then n.perlu_tinjau := coalesce((p_data ->> 'perlu_tinjau')::boolean, d.perlu_tinjau); end if;
  -- jam tenggat: "HH:MM" mengatur, "" menghapus; bila hanya tanggal tenggat berubah, jam lama dipertahankan pada tanggal baru
  if p_data ? 'tenggat_jam' then
    v_jam := nullif(btrim(coalesce(p_data ->> 'tenggat_jam', '')), '');
    if v_jam is null then n.tenggat_waktu := null;
    else
      if v_jam !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Jam tenggat berbentuk HH:MM (WIB)' using errcode = '23514'; end if;
      n.tenggat_waktu := (n.tenggat::text || ' ' || v_jam)::timestamp at time zone 'Asia/Jakarta';
    end if;
  elsif d.tenggat_waktu is not null and n.tenggat <> d.tenggat then
    n.tenggat_waktu := (n.tenggat::text || ' ' || to_char(d.tenggat_waktu at time zone 'Asia/Jakarta', 'HH24:MI'))::timestamp at time zone 'Asia/Jakarta';
  end if;
  if n.tenggat_waktu is distinct from d.tenggat_waktu then n.pengingat_tenggat_at := null; n.telat_diberi_at := null; end if;

  if char_length(n.judul) < 3 or char_length(n.judul) > 200 then raise exception 'Judul delegasi 3 sampai 200 huruf' using errcode = '23514'; end if;
  if char_length(n.uraian) > 1000 then raise exception 'Uraian maksimal 1000 huruf' using errcode = '23514'; end if;
  if n.peran_penerima not in ('wakil','pegawai','pml','ppl') then raise exception 'Peran penerima tidak sah' using errcode = '23514'; end if;
  select * into a from sigap_akun where id = n.penerima_akun;
  if a.jenis = 'mitra' and n.peran_penerima not in ('pml','ppl') then raise exception 'Mitra hanya dapat berperan PML atau PPL' using errcode = '23514'; end if;
  if n.target_harian < 0 or n.target_harian > 1000 then raise exception 'Target harian 0 sampai 1000' using errcode = '23514'; end if;
  if n.bobot not between 1 and 5 then raise exception 'Bobot 1 sampai 5' using errcode = '23514'; end if;
  if n.tenggat < n.mulai then raise exception 'Tenggat tidak boleh sebelum tanggal mulai' using errcode = '23514'; end if;
  if n.status not in ('baru','berjalan','selesai','ditunda','batal') then raise exception 'Status tidak sah' using errcode = '23514'; end if;
  if n.perlu_tinjau and not n.perlu_hasil then raise exception 'Tinjau hasil hanya bermakna bila delegasi meminta hasil kerja' using errcode = '23514'; end if;
  if n.status in ('ditunda','batal') and n.status <> d.status and char_length(n.alasan) < 5 then
    raise exception 'Menunda atau membatalkan delegasi wajib disertai alasan (minimal 5 huruf)' using errcode = '23514';
  end if;
  if n.status = 'selesai' and d.status <> 'selesai' then
    if n.perlu_tinjau and not exists (select 1 from keu_dlg_hasil h where h.delegasi_id = d.id and h.status = 'diterima') then
      raise exception 'Hasil kerja belum diterima. Tinjau hasilnya dulu, atau matikan "perlu tinjau" bila tidak diperlukan.' using errcode = '23514';
    elsif n.perlu_hasil and not exists (select 1 from keu_dlg_hasil h where h.delegasi_id = d.id) then
      raise exception 'Hasil kerja belum diserahkan. Minta penerima menyerahkannya, atau matikan "perlu hasil" bila tidak diperlukan.' using errcode = '23514';
    end if;
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
         perlu_hasil = n.perlu_hasil, perlu_tinjau = n.perlu_tinjau, tenggat_waktu = n.tenggat_waktu,
         pengingat_tenggat_at = n.pengingat_tenggat_at, telat_diberi_at = n.telat_diberi_at,
         ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now()
   where id = d.id;
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_ubah', d.ident_id, 'Delegasi diperbarui: ' || n.judul,
    case when n.status <> d.status then 'Status sekarang: ' || n.status || '. ' else '' end
    || case when v_lewat_riwayat then 'Target harian ' || trim(to_char(v_tbaru, 'FM999990.##')) || ' mulai ' || to_char(v_tmulai, 'DD-MM-YYYY') || '. ' else '' end
    || 'Tenggat ' || to_char(n.tenggat, 'DD-MM-YYYY') || case when n.tenggat_waktu is not null then ' pukul ' || to_char(n.tenggat_waktu at time zone 'Asia/Jakarta', 'HH24:MI') || ' WIB' else '' end || '.', p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('hasil', 'diubah', 'ver', d.ver + 1);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Pindah (diganti): menyalin kolom baru dan langkah; hasil yang masih menunggu tinjau menahan pemindahan
-- ---------------------------------------------------------------------
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
  if exists (select 1 from keu_dlg_hasil h where h.delegasi_id = d.id and h.status = 'diserahkan') then
    raise exception 'Ada hasil kerja yang menunggu tinjau. Tinjau dulu sebelum memindahkan delegasi.' using errcode = '23514';
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
    update keu_dlg_delegasi set status = 'selesai', tenggat = v_hari - 1, tenggat_waktu = null, alasan = v_alasan, ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  end if;

  insert into keu_dlg_delegasi(tahun, ident_id, ident_ver, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot,
                               hari_kerja, mulai, tenggat, status, jenis_id, poin_per_satuan, perlu_hasil, perlu_tinjau, insidental, tenggat_waktu, dibuat_oleh, diubah_oleh)
  values (extract(year from v_mulai)::smallint, d.ident_id, d.ident_ver, d.ro_kode, d.judul, d.uraian, p_ke, d.peran_penerima, d.pj_bidang, d.satuan, v_sisa, v_th, d.bobot,
          d.hari_kerja, v_mulai, d.tenggat, 'baru', d.jenis_id, d.poin_per_satuan, d.perlu_hasil, d.perlu_tinjau, d.insidental, d.tenggat_waktu, p_akun, p_akun)
  returning id into v_baru;
  insert into keu_dlg_langkah(delegasi_id, urut, judul, selesai, selesai_oleh, selesai_at, dibuat_oleh)
  select v_baru, g.urut, g.judul, g.selesai, g.selesai_oleh, g.selesai_at, p_akun from keu_dlg_langkah g where g.delegasi_id = d.id and g.aktif order by g.urut, g.id;

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

-- ---------------------------------------------------------------------
-- Laporan dengan jumlah satuan: poin = jumlah x poin_per_satuan (membungkus keu_dlg_lapor agar semua pemeriksaan hak/tanggal tetap sama)
-- ---------------------------------------------------------------------
create or replace function keu_dlg_lapor_jumlah(p_delegasi bigint, p_tanggal date, p_jumlah numeric, p_uraian text default '', p_kendala text default '',
                                                 p_bukti jsonb default '[]'::jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; v_poin numeric; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_delegasi;
  if not found then raise exception 'Delegasi % tidak ada', p_delegasi using errcode = '23514'; end if;
  if d.poin_per_satuan is null then raise exception 'Delegasi ini melapor dengan poin langsung, bukan jumlah satuan' using errcode = '23514'; end if;
  if p_jumlah is null or p_jumlah < 0 or p_jumlah > 100000 then raise exception 'Jumlah % harus 0 atau lebih', d.satuan using errcode = '23514'; end if;
  v_poin := round(p_jumlah * d.poin_per_satuan, 2);
  if v_poin > 1000 then raise exception 'Jumlah terlalu besar untuk satu hari (% poin, batas 1000)', v_poin using errcode = '23514'; end if;
  r := keu_dlg_lapor(p_delegasi, p_tanggal, v_poin, p_uraian, p_kendala, p_bukti, p_akun);
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_laporan set jumlah = p_jumlah where id = (r ->> 'id')::bigint;
  perform set_config('keu.via_fungsi', '', true);
  return r || jsonb_build_object('jumlah', p_jumlah, 'poin', v_poin);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Hasil kerja dan tinjau ulang
-- ---------------------------------------------------------------------
-- Penerima menyerahkan hasil. Butir: tautan/teks atau foto (seperti bukti). Tanpa "perlu tinjau": langsung tercatat diterima.
-- Pekerjaan insidental: menyerahkan hasil = melapor selesai (laporan hari itu dibuat otomatis dengan poin target) dan, bila tanpa tinjau, delegasi selesai.
create or replace function keu_dlg_hasil_serah(p_delegasi bigint, p_butir jsonb, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d keu_dlg_delegasi; v_cat text := btrim(coalesce(p_catatan, '')); v_no int; v_id bigint; v_hari date := keu_dlg_hari_ini(); v_status text; v_nama text;
  v_tgl date; v_poin numeric; v_jml numeric; v_lap boolean := false;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_delegasi for update;
  if not found then raise exception 'Delegasi % tidak ada', p_delegasi using errcode = '23514'; end if;
  if d.penerima_akun <> p_akun then raise exception 'Hanya penerima yang dapat menyerahkan hasil kerja' using errcode = '42501'; end if;
  if d.status not in ('baru','berjalan') then raise exception 'Delegasi berstatus % tidak menerima hasil kerja', d.status using errcode = '23514'; end if;
  if not d.perlu_hasil then raise exception 'Delegasi ini tidak meminta hasil kerja' using errcode = '23514'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 huruf' using errcode = '23514'; end if;
  if not keu_dlg_butir_sah(p_butir, d.id) then raise exception 'Hasil harus berisi 1 sampai 5 butir (tautan, teks, atau foto) yang sah' using errcode = '23514'; end if;
  if exists (select 1 from keu_dlg_hasil h where h.delegasi_id = d.id and h.status = 'diserahkan') then
    raise exception 'Hasil sebelumnya masih menunggu tinjau pemberi' using errcode = '23514';
  end if;
  select coalesce(max(nomor), 0) + 1 into v_no from keu_dlg_hasil where delegasi_id = d.id;
  v_status := case when d.perlu_tinjau then 'diserahkan' else 'diterima' end;
  select nama into v_nama from sigap_akun where id = p_akun;

  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_dlg_hasil(delegasi_id, nomor, catatan, butir, status, diserahkan_oleh, ditinjau_at, catatan_tinjau)
  values (d.id, v_no, v_cat, p_butir, v_status, p_akun, case when v_status = 'diterima' then now() end, case when v_status = 'diterima' then 'Diterima otomatis (tanpa tinjau)' else '' end)
  returning id into v_id;

  if d.insidental then
    v_tgl := greatest(least(v_hari, d.tenggat), d.mulai);
    if not exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id and l.tanggal = v_tgl) then
      v_poin := least(1000, coalesce(nullif(d.target_total, 0), keu_dlg_target_pada(d.id, v_tgl)));
      v_jml := case when d.poin_per_satuan is not null and d.poin_per_satuan > 0 then round(v_poin / d.poin_per_satuan, 2) end;
      insert into keu_dlg_laporan(delegasi_id, tanggal, poin, uraian, kendala, bukti, dikirim_oleh, mewakili, terlambat, jumlah)
      values (d.id, v_tgl, v_poin, 'Hasil kerja diserahkan' || case when v_cat <> '' then ': ' || left(v_cat, 300) else '' end, '', '[]'::jsonb, p_akun, false,
              (v_hari > d.tenggat or (d.tenggat_waktu is not null and now() > d.tenggat_waktu)), v_jml);
      v_lap := true;
    end if;
  end if;

  if d.insidental and not d.perlu_tinjau then
    update keu_dlg_delegasi set status = 'selesai', ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  elsif d.status = 'baru' then
    update keu_dlg_delegasi set status = 'berjalan', ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  end if;

  if d.dibuat_oleh is not null then
    perform keu_dlg_notif(d.dibuat_oleh, 'delegasi_hasil',  d.ident_id,
      case when d.perlu_tinjau then 'Hasil kerja menunggu tinjau: ' else 'Hasil kerja diserahkan: ' end || d.judul,
      coalesce(v_nama, 'Penerima') || ' menyerahkan hasil kerja (versi ' || v_no || '). Buka Delego untuk melihat' || case when d.perlu_tinjau then ' dan meninjau.' else '.' end, p_akun);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', v_id, 'nomor', v_no, 'status', v_status, 'laporan_dibuat', v_lap);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Pemberi meninjau hasil: diterima (delegasi selesai) atau revisi (wajib catatan)
create or replace function keu_dlg_hasil_tinjau(p_hasil bigint, p_putusan text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare h keu_dlg_hasil; d keu_dlg_delegasi; v_cat text := btrim(coalesce(p_catatan, ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into h from keu_dlg_hasil where id = p_hasil for update;
  if not found then raise exception 'Hasil kerja % tidak ada', p_hasil using errcode = '23514'; end if;
  select * into d from keu_dlg_delegasi where id = h.delegasi_id for update;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berwenang meninjau hasil delegasi RO %', p_akun, d.ro_kode using errcode = '42501'; end if;
  if p_putusan not in ('diterima','revisi') then raise exception 'Putusan harus diterima atau revisi' using errcode = '23514'; end if;
  if h.status <> 'diserahkan' then raise exception 'Hasil ini sudah ditinjau (%)', h.status using errcode = '23514'; end if;
  if p_putusan = 'revisi' and char_length(v_cat) < 5 then raise exception 'Permintaan revisi wajib disertai catatan (minimal 5 huruf)' using errcode = '23514'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 huruf' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_hasil set status = p_putusan, catatan_tinjau = v_cat, ditinjau_oleh = p_akun, ditinjau_at = now() where id = h.id;
  if p_putusan = 'diterima' and d.status in ('baru','berjalan') then
    update keu_dlg_delegasi set status = 'selesai', ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  elsif p_putusan = 'revisi' and d.status = 'baru' then
    update keu_dlg_delegasi set status = 'berjalan', ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  end if;
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_tinjau', d.ident_id,
    case when p_putusan = 'diterima' then 'Hasil kerja diterima: ' else 'Hasil kerja perlu revisi: ' end || d.judul,
    case when v_cat <> '' then v_cat else 'Hasil Anda diterima.' end, p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('hasil', h.id, 'status', p_putusan, 'delegasi_selesai', (p_putusan = 'diterima' and d.status in ('baru','berjalan')));
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Daftar langkah
-- ---------------------------------------------------------------------
-- Pemberi mengatur daftar langkah. p_langkah: larik teks atau { id?, judul }. Langkah ber-id yang masih ada dipertahankan (status centang tetap);
-- tanpa id = baru; langkah aktif yang tidak disebut dinonaktifkan (tidak dihapus).
create or replace function keu_dlg_langkah_atur(p_delegasi bigint, p_langkah jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; e jsonb; v_n int := 0; v_id bigint; v_judul text; v_keep bigint[] := '{}'; v_baru int := 0;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_delegasi for update;
  if not found then raise exception 'Delegasi % tidak ada', p_delegasi using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berwenang mengatur langkah delegasi RO %', p_akun, d.ro_kode using errcode = '42501'; end if;
  if d.status not in ('baru','berjalan','ditunda') then raise exception 'Delegasi berstatus % tidak dapat diubah langkahnya', d.status using errcode = '23514'; end if;
  if p_langkah is null or jsonb_typeof(p_langkah) <> 'array' or jsonb_array_length(p_langkah) > 20 then raise exception 'Langkah harus larik paling banyak 20' using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  for e in select * from jsonb_array_elements(p_langkah) loop
    v_n := v_n + 1;
    if jsonb_typeof(e) = 'string' then v_id := null; v_judul := btrim(e #>> '{}');
    elsif jsonb_typeof(e) = 'object' then v_id := nullif(e ->> 'id', '')::bigint; v_judul := btrim(coalesce(e ->> 'judul', ''));
    else raise exception 'Tiap langkah berupa teks atau objek' using errcode = '22023';
    end if;
    if char_length(v_judul) not between 2 and 150 then raise exception 'Tiap langkah 2 sampai 150 huruf' using errcode = '23514'; end if;
    if v_id is not null and exists (select 1 from keu_dlg_langkah g where g.id = v_id and g.delegasi_id = d.id) then
      update keu_dlg_langkah set judul = v_judul, urut = v_n, aktif = true where id = v_id;
    else
      insert into keu_dlg_langkah(delegasi_id, urut, judul, dibuat_oleh) values (d.id, v_n, v_judul, p_akun) returning id into v_id;
      v_baru := v_baru + 1;
    end if;
    v_keep := v_keep || v_id;
  end loop;
  update keu_dlg_langkah set aktif = false where delegasi_id = d.id and aktif and not (id = any (v_keep));
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('delegasi', d.id, 'langkah', v_n, 'baru', v_baru);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Penerima (atau pemberi) mencentang atau melepas centang satu langkah
create or replace function keu_dlg_langkah_centang(p_langkah bigint, p_selesai boolean, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare g keu_dlg_langkah; d keu_dlg_delegasi; v_sel boolean := coalesce(p_selesai, true);
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into g from keu_dlg_langkah where id = p_langkah for update;
  if not found or not g.aktif then raise exception 'Langkah % tidak ada', p_langkah using errcode = '23514'; end if;
  select * into d from keu_dlg_delegasi where id = g.delegasi_id for update;
  if not (p_akun = d.penerima_akun or keu_dlg_beri(p_akun, d.ro_kode)) then raise exception 'Akun % tidak berhak mencentang langkah ini', p_akun using errcode = '42501'; end if;
  if d.status not in ('baru','berjalan') then raise exception 'Delegasi berstatus % tidak dapat diubah langkahnya', d.status using errcode = '23514'; end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_langkah set selesai = v_sel, selesai_oleh = case when v_sel then p_akun end, selesai_at = case when v_sel then now() end where id = g.id;
  if d.status = 'baru' and v_sel then
    update keu_dlg_delegasi set status = 'berjalan', ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('langkah', g.id, 'selesai', v_sel);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Templat pekerjaan berulang
-- ---------------------------------------------------------------------
-- p_data: { id? (ubah), judul, uraian?, kelompok? | ro_kode, jenis_id, jumlah, bobot?, frekuensi: mingguan|bulanan, hari (mingguan 1-7 Senin-Minggu; bulanan 1-28),
--           durasi_hari?, hari_kerja?[], penerima: [ { akun, peran } ], mulai_berlaku?, berakhir?, aktif? }
-- Perubahan hanya berlaku untuk delegasi yang dibuat sesudahnya; yang sudah dibuat tidak berubah.
create or replace function keu_dlg_rutin_simpan(p_data jsonb, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  x keu_dlg_rutin; v_id bigint; v_judul text; v_ura text; v_ro text; v_jenis bigint; v_jumlah numeric; v_bobot int; v_frek text; v_hari int; v_dur int; v_hk smallint[];
  v_pen jsonb; v_mulai date; v_akhir date; v_aktif boolean; e jsonb; a sigap_akun; v_akun bigint; v_peran text; v_hasil jsonb := '[]'::jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian harus objek JSON' using errcode = '22023'; end if;
  v_id := nullif(p_data ->> 'id', '')::bigint;
  if v_id is not null then
    select * into x from keu_dlg_rutin where id = v_id for update;
    if not found then raise exception 'Templat berulang % tidak ada', v_id using errcode = '23514'; end if;
    if not keu_dlg_beri(p_akun, x.ro_kode) then raise exception 'Akun % tidak berwenang mengubah templat ini', p_akun using errcode = '42501'; end if;
  end if;
  v_ro := coalesce(nullif(upper(btrim(coalesce(p_data ->> 'kelompok', ''))), ''), nullif(btrim(coalesce(p_data ->> 'ro_kode', '')), ''), x.ro_kode);
  if v_ro is null or char_length(v_ro) < 3 then raise exception 'Pilih Pekerjaan tim atau RO' using errcode = '23514'; end if;
  if v_ro like 'TIM-%' and not exists (select 1 from keu_dlg_kelompok k where k.kode = v_ro and k.aktif) then
    raise exception 'Pekerjaan tim % tidak ada atau tidak aktif', v_ro using errcode = '23514';
  end if;
  if not keu_dlg_beri(p_akun, v_ro) then raise exception 'Akun % tidak berwenang mendelegasikan pekerjaan pada RO %', p_akun, v_ro using errcode = '42501'; end if;

  v_judul := btrim(coalesce(p_data ->> 'judul', x.judul, ''));
  if char_length(v_judul) < 3 or char_length(v_judul) > 150 then raise exception 'Judul 3 sampai 150 huruf' using errcode = '23514'; end if;
  v_ura := btrim(coalesce(p_data ->> 'uraian', x.uraian, ''));
  if char_length(v_ura) > 1000 then raise exception 'Uraian maksimal 1000 huruf' using errcode = '23514'; end if;
  v_jenis := coalesce(nullif(p_data ->> 'jenis_id', '')::bigint, x.jenis_id);
  if v_jenis is null or not exists (select 1 from keu_dlg_jenis where id = v_jenis and (aktif or v_jenis = x.jenis_id)) then raise exception 'Pilih jenis pekerjaan yang aktif' using errcode = '23514'; end if;
  v_jumlah := coalesce(nullif(p_data ->> 'jumlah', '')::numeric, x.jumlah);
  if v_jumlah is null or v_jumlah <= 0 or v_jumlah > 100000 then raise exception 'Jumlah per periode harus lebih dari 0' using errcode = '23514'; end if;
  v_bobot := coalesce(nullif(p_data ->> 'bobot', '')::int, x.bobot, 1);
  if v_bobot not between 1 and 5 then raise exception 'Bobot 1 sampai 5' using errcode = '23514'; end if;
  v_frek := coalesce(p_data ->> 'frekuensi', x.frekuensi);
  if v_frek not in ('mingguan','bulanan') then raise exception 'Frekuensi harus mingguan atau bulanan' using errcode = '23514'; end if;
  v_hari := coalesce(nullif(p_data ->> 'hari', '')::int, x.hari);
  if v_hari is null or (v_frek = 'mingguan' and v_hari not between 1 and 7) or (v_frek = 'bulanan' and v_hari not between 1 and 28) then
    raise exception 'Hari tidak sah (mingguan 1 sampai 7, bulanan tanggal 1 sampai 28)' using errcode = '23514';
  end if;
  v_dur := coalesce(nullif(p_data ->> 'durasi_hari', '')::int, x.durasi_hari, 7);
  if v_dur not between 1 and 60 then raise exception 'Durasi 1 sampai 60 hari' using errcode = '23514'; end if;
  v_hk := case when p_data ? 'hari_kerja' then keu_dlg_hk(p_data -> 'hari_kerja') else coalesce(x.hari_kerja, keu_dlg_hk(null)) end;
  v_pen := coalesce(p_data -> 'penerima', x.penerima);
  if v_pen is null or jsonb_typeof(v_pen) <> 'array' or jsonb_array_length(v_pen) not between 1 and 40 then raise exception 'Pilih 1 sampai 40 penerima' using errcode = '23514'; end if;
  if (select count(distinct y ->> 'akun') from jsonb_array_elements(v_pen) y) <> jsonb_array_length(v_pen) then raise exception 'Satu penerima hanya boleh muncul sekali' using errcode = '23514'; end if;
  for e in select * from jsonb_array_elements(v_pen) loop
    v_akun := nullif(e ->> 'akun', '')::bigint; v_peran := coalesce(e ->> 'peran', '');
    select * into a from sigap_akun where id = v_akun and aktif;
    if not found then raise exception 'Penerima % tidak ditemukan atau tidak aktif', v_akun using errcode = '23514'; end if;
    if v_akun = p_akun then raise exception 'Pemberi tidak dapat mendelegasikan kepada dirinya sendiri' using errcode = '23514'; end if;
    if v_peran not in ('wakil','pegawai','pml','ppl') then raise exception 'Peran penerima harus wakil, pegawai, pml, atau ppl' using errcode = '23514'; end if;
    if a.jenis = 'mitra' and v_peran not in ('pml','ppl') then raise exception 'Mitra hanya dapat berperan PML atau PPL (%)', a.nama using errcode = '23514'; end if;
    v_hasil := v_hasil || jsonb_build_array(jsonb_build_object('akun', v_akun, 'peran', v_peran));
  end loop;
  v_mulai := coalesce(nullif(p_data ->> 'mulai_berlaku', '')::date, x.mulai_berlaku, keu_dlg_hari_ini());
  v_akhir := case when p_data ? 'berakhir' then nullif(p_data ->> 'berakhir', '')::date else x.berakhir end;
  if v_akhir is not null and v_akhir < v_mulai then raise exception 'Tanggal berakhir tidak boleh sebelum tanggal mulai berlaku' using errcode = '23514'; end if;
  v_aktif := coalesce((p_data ->> 'aktif')::boolean, x.aktif, true);

  perform set_config('keu.via_fungsi', '1', true);
  if v_id is null then
    insert into keu_dlg_rutin(judul, uraian, ro_kode, jenis_id, jumlah, bobot, frekuensi, hari, durasi_hari, hari_kerja, penerima, mulai_berlaku, berakhir, aktif, dibuat_oleh, diubah_oleh)
    values (v_judul, v_ura, v_ro, v_jenis, v_jumlah, v_bobot, v_frek, v_hari, v_dur, v_hk, v_hasil, v_mulai, v_akhir, v_aktif, p_akun, p_akun) returning id into v_id;
  else
    update keu_dlg_rutin set judul = v_judul, uraian = v_ura, ro_kode = v_ro, jenis_id = v_jenis, jumlah = v_jumlah, bobot = v_bobot, frekuensi = v_frek, hari = v_hari,
           durasi_hari = v_dur, hari_kerja = v_hk, penerima = v_hasil, mulai_berlaku = v_mulai, berakhir = v_akhir, aktif = v_aktif, diubah_oleh = p_akun, diubah_at = now()
     where id = v_id;
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', v_id, 'aktif', v_aktif);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- Dijalankan penjadwal basis data setiap pagi (bukan lewat gerbang): membuat delegasi dari templat yang jatuh tempo hari ini. Idempoten (indeks unik rutin_id+penerima+periode).
create or replace function keu_dlg_rutin_jalan(p_hari date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hari date := coalesce(p_hari, keu_dlg_hari_ini()); x keu_dlg_rutin; e jsonb; v_buat int := 0; v_ada int := 0; v_gagal int := 0; v_galat text := '';
begin
  for x in
    select * from keu_dlg_rutin r
     where r.aktif and r.mulai_berlaku <= v_hari and (r.berakhir is null or v_hari <= r.berakhir)
       and ((r.frekuensi = 'mingguan' and r.hari = extract(isodow from v_hari)::int) or (r.frekuensi = 'bulanan' and r.hari = extract(day from v_hari)::int))
     order by r.id
  loop
    for e in select * from jsonb_array_elements(x.penerima) loop
      begin
        if exists (select 1 from keu_dlg_delegasi d where d.rutin_id = x.id and d.penerima_akun = (e ->> 'akun')::bigint and d.rutin_periode = v_hari) then
          v_ada := v_ada + 1;
        else
          perform set_config('keu.dari_rutin', '1', true);
          perform keu_dlg_buat(jsonb_build_object(
            'ro_kode', x.ro_kode, 'judul', x.judul || ' (' || to_char(v_hari, 'DD-MM-YYYY') || ')', 'uraian', x.uraian, 'jenis_id', x.jenis_id, 'jumlah', x.jumlah, 'bobot', x.bobot,
            'mulai', v_hari, 'tenggat', v_hari + (x.durasi_hari - 1), 'hari_kerja', to_jsonb(x.hari_kerja),
            'penerima', jsonb_build_array(jsonb_build_object('akun', (e ->> 'akun')::bigint, 'peran', e ->> 'peran')),
            'rutin_id', x.id, 'rutin_periode', v_hari), x.dibuat_oleh);
          perform set_config('keu.dari_rutin', '', true);
          v_buat := v_buat + 1;
        end if;
      exception when others then
        perform set_config('keu.dari_rutin', '', true);
        v_gagal := v_gagal + 1;
        v_galat := left(v_galat || 'rutin ' || x.id || ': ' || sqlerrm || '; ', 500);
      end;
    end loop;
    perform set_config('keu.via_fungsi', '1', true);
    update keu_dlg_rutin set terakhir_jalan = v_hari where id = x.id;
    perform set_config('keu.via_fungsi', '', true);
  end loop;
  return jsonb_build_object('hari', v_hari, 'dibuat', v_buat, 'sudah_ada', v_ada, 'gagal', v_gagal, 'galat', v_galat);
end $$;

-- ---------------------------------------------------------------------
-- Pengingat tenggat jam (setiap 15 menit oleh penjadwal): 2 jam sebelum tenggat ke penerima; lewat tenggat ke pemberi. Masing-masing sekali per delegasi.
-- ---------------------------------------------------------------------
create or replace function keu_dlg_pengingat_tenggat(p_sekarang timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := coalesce(p_sekarang, now()); d keu_dlg_delegasi; v_a int := 0; v_b int := 0; v_jam text;
begin
  perform set_config('keu.via_fungsi', '1', true);
  for d in
    select * from keu_dlg_delegasi x
     where x.status in ('baru','berjalan') and x.tenggat_waktu is not null and x.pengingat_tenggat_at is null
       and x.tenggat_waktu > v_now and x.tenggat_waktu <= v_now + interval '2 hours' and not keu_dlg_tuntas(x.id)
  loop
    v_jam := to_char(d.tenggat_waktu at time zone 'Asia/Jakarta', 'HH24:MI');
    perform keu_dlg_notif(d.penerima_akun, 'delegasi_tenggat', d.ident_id, 'Tenggat pukul ' || v_jam || ' WIB: ' || d.judul,
      case when d.perlu_hasil then 'Hasil kerja belum diserahkan.' else 'Pekerjaan belum dilaporkan.' end || ' Buka Delego untuk menyelesaikannya.', null);
    update keu_dlg_delegasi set pengingat_tenggat_at = v_now where id = d.id;
    v_a := v_a + 1;
  end loop;
  for d in
    select * from keu_dlg_delegasi x
     where x.status in ('baru','berjalan') and x.tenggat_waktu is not null and x.telat_diberi_at is null
       and x.tenggat_waktu <= v_now and x.tenggat_waktu > v_now - interval '1 day' and not keu_dlg_tuntas(x.id)
  loop
    v_jam := to_char(d.tenggat_waktu at time zone 'Asia/Jakarta', 'HH24:MI');
    if d.dibuat_oleh is not null then
      perform keu_dlg_notif(d.dibuat_oleh, 'delegasi_tenggat', d.ident_id, 'Lewat tenggat pukul ' || v_jam || ' WIB: ' || d.judul,
        'Belum ada ' || case when d.perlu_hasil then 'hasil kerja' else 'laporan' end || ' dari penerima. Buka Delego untuk menindaklanjuti.', null);
    end if;
    update keu_dlg_delegasi set telat_diberi_at = v_now where id = d.id;
    v_b := v_b + 1;
  end loop;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('menjelang', v_a, 'lewat', v_b);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- ---------------------------------------------------------------------
-- Pengingat 18:00 (diganti): delegasi insidental yang hasilnya sudah diserahkan tidak diingatkan lagi
-- ---------------------------------------------------------------------
create or replace function keu_dlg_pengingat(p_hari date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hari date := coalesce(p_hari, keu_dlg_hari_ini()); v_dow int := extract(isodow from v_hari)::int; v_kirim int := 0; r record; v_isi text;
begin
  if exists (select 1 from keu_dlg_libur where tanggal = v_hari and aktif) then
    return jsonb_build_object('hari', v_hari, 'dikirim', 0, 'alasan', 'libur');
  end if;
  for r in
    select d.penerima_akun as akun, count(*) as n, string_agg(left(d.judul, 50), '; ' order by d.id) as daftar
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun and a.aktif
     where d.status in ('baru','berjalan') and v_hari between d.mulai and d.tenggat and v_dow = any (d.hari_kerja)
       and not exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id and l.tanggal = v_hari)
       and not (d.insidental and keu_dlg_tuntas(d.id))
       and not exists (select 1 from keu_notifikasi x where x.akun_id = d.penerima_akun and x.jenis = 'delegasi_pengingat' and (x.dibuat_at at time zone 'Asia/Jakarta')::date = v_hari)
     group by d.penerima_akun
  loop
    v_isi := 'Batas lapor hari ini pukul 23:59 WIB. Belum dilaporkan: ' || left(r.daftar, 600) || '.';
    perform keu_dlg_notif(r.akun, 'delegasi_pengingat', null,
      case when r.n = 1 then 'Laporan harian belum dikirim' else r.n || ' laporan harian belum dikirim' end, v_isi, null);
    v_kirim := v_kirim + 1;
  end loop;
  return jsonb_build_object('hari', v_hari, 'dikirim', v_kirim);
end $$;

-- ---------------------------------------------------------------------
-- Membaca (diganti): hak (+ katalog, kelompok), saya dan bahan (+ nama jenis, langkah, hasil, rutin)
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
    'bobot', (select jsonb_build_object('ketepatan', b.ketepatan, 'capaian', b.capaian, 'kualitas', b.kualitas, 'kepatuhan', b.kepatuhan) from keu_dlg_bobot b where b.id = 1),
    'jenis', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'kode', j.kode, 'nama', j.nama, 'satuan', j.satuan, 'poin_per_satuan', j.poin_per_satuan, 'uraian', j.uraian,
                'perlu_hasil', j.perlu_hasil, 'perlu_tinjau', j.perlu_tinjau, 'langkah_bawaan', j.langkah_bawaan, 'urut', j.urut, 'aktif', j.aktif) order by j.urut, j.nama), '[]'::jsonb)
                from keu_dlg_jenis j where j.aktif or v_semua),
    'kelompok', (select coalesce(jsonb_agg(jsonb_build_object('kode', k.kode, 'nama', k.nama, 'aktif', k.aktif) order by k.urut, k.nama), '[]'::jsonb)
                from keu_dlg_kelompok k where k.aktif or v_semua),
    'beri_kelompok', (case when v_semua then (select coalesce(jsonb_agg(k.kode order by k.urut, k.nama), '[]'::jsonb) from keu_dlg_kelompok k where k.aktif) else '[]'::jsonb end));
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
           (select i.ver from keu_ident i where i.id = d.ident_id) as ident_ver_kini,
           (select j.nama from keu_dlg_jenis j where j.id = d.jenis_id) as jenis_nama,
           (select k.nama from keu_dlg_kelompok k where k.kode = d.ro_kode) as kelompok_nama
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
     where d.penerima_akun = p_akun and (d.status in ('baru','berjalan','ditunda') or d.diubah_at > now() - interval '120 days')
  ), w as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari,
           keu_dlg_target_pada(d.id, v_hari) as target_kini,
           (select coalesce(jsonb_agg(jsonb_build_object('berlaku_mulai', t.berlaku_mulai, 'target_harian', t.target_harian, 'alasan', t.alasan) order by t.berlaku_mulai), '[]'::jsonb)
              from keu_dlg_target t where t.delegasi_id = d.id) as riwayat_target,
           (select i.ver from keu_ident i where i.id = d.ident_id) as ident_ver_kini,
           (select j.nama from keu_dlg_jenis j where j.id = d.jenis_id) as jenis_nama,
           (select k.nama from keu_dlg_kelompok k where k.kode = d.ro_kode) as kelompok_nama
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
    'langkah', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'delegasi_id', g.delegasi_id, 'urut', g.urut, 'judul', g.judul, 'selesai', g.selesai, 'selesai_at', g.selesai_at)
                    order by g.delegasi_id, g.urut, g.id), '[]'::jsonb)
                  from keu_dlg_langkah g where g.aktif and g.delegasi_id in (select id from s union all select id from w)),
    'hasil', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'delegasi_id', h.delegasi_id, 'nomor', h.nomor, 'catatan', h.catatan, 'butir', h.butir, 'status', h.status,
                    'catatan_tinjau', h.catatan_tinjau, 'diserahkan_at', h.diserahkan_at, 'ditinjau_at', h.ditinjau_at, 'ditinjau_nama', u.nama)
                    order by h.delegasi_id, h.nomor), '[]'::jsonb)
                  from keu_dlg_hasil h left join sigap_akun u on u.id = h.ditinjau_oleh where h.delegasi_id in (select id from s union all select id from w)),
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
           (select i.ver from keu_ident i where i.id = d.ident_id) as ident_ver_kini,
           (select j.nama from keu_dlg_jenis j where j.id = d.jenis_id) as jenis_nama,
           (select k.nama from keu_dlg_kelompok k where k.kode = d.ro_kode) as kelompok_nama
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
    'langkah', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'delegasi_id', g.delegasi_id, 'urut', g.urut, 'judul', g.judul, 'selesai', g.selesai, 'selesai_at', g.selesai_at)
                    order by g.delegasi_id, g.urut, g.id), '[]'::jsonb)
                  from keu_dlg_langkah g where g.aktif and g.delegasi_id in (select id from s where s.status in ('baru','berjalan','ditunda') or s.diubah_at > now() - interval '120 days')),
    'hasil', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'delegasi_id', h.delegasi_id, 'nomor', h.nomor, 'catatan', h.catatan, 'butir', h.butir, 'status', h.status,
                    'catatan_tinjau', h.catatan_tinjau, 'diserahkan_at', h.diserahkan_at, 'ditinjau_at', h.ditinjau_at, 'ditinjau_nama', u.nama)
                    order by h.delegasi_id, h.nomor), '[]'::jsonb)
                  from keu_dlg_hasil h left join sigap_akun u on u.id = h.ditinjau_oleh
                 where h.delegasi_id in (select id from s where s.status in ('baru','berjalan','ditunda') or s.diubah_at > now() - interval '120 days')),
    'rutin', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'judul', z.judul, 'uraian', z.uraian, 'ro_kode', z.ro_kode, 'jenis_id', z.jenis_id, 'jumlah', z.jumlah, 'bobot', z.bobot,
                    'frekuensi', z.frekuensi, 'hari', z.hari, 'durasi_hari', z.durasi_hari, 'hari_kerja', to_jsonb(z.hari_kerja), 'mulai_berlaku', z.mulai_berlaku, 'berakhir', z.berakhir,
                    'aktif', z.aktif, 'terakhir_jalan', z.terakhir_jalan,
                    'penerima', (select coalesce(jsonb_agg(jsonb_build_object('akun', (y ->> 'akun')::bigint, 'peran', y ->> 'peran', 'nama', (select u.nama from sigap_akun u where u.id = (y ->> 'akun')::bigint))), '[]'::jsonb)
                                   from jsonb_array_elements(z.penerima) y))
                    order by z.aktif desc, z.id desc), '[]'::jsonb)
                  from keu_dlg_rutin z where p_ident is null and keu_dlg_lihat(p_akun, z.ro_kode) and (p_ro is null or z.ro_kode = p_ro)),
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

-- ---------------------------------------------------------------------
-- Hak eksekusi dan izin gerbang (daftar izin dibaca dari definisi keu_jalankan YANG ADA SAAT INI, hanya menambah)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'keu\_dlg\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

do $$
declare d text; v_baru text := '''keu_dlg_jenis_simpan'',''keu_dlg_kelompok_simpan'',''keu_dlg_lapor_jumlah'',''keu_dlg_hasil_serah'',''keu_dlg_hasil_tinjau'',''keu_dlg_langkah_atur'',''keu_dlg_langkah_centang'',''keu_dlg_rutin_simpan'',';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_dlg_hasil_serah''' in d) = 0 then
    d := replace(d, '''keu_dlg_pindah'',', '''keu_dlg_pindah'',' || v_baru);
    if position('''keu_dlg_hasil_serah''' in d) = 0 then raise exception 'Penambahan izin gagal: jalankan 20261026f dulu'; end if;
    execute d;
  end if;
end $$;
