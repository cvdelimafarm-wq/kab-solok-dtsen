-- =====================================================================
-- 20261029c_qc_per_kegiatan.sql
-- SIGAP - QC Pemahaman Petugas PER KEGIATAN (29 Okt 2026)
--
-- Permintaan user: QC Pemahaman tidak lagi khusus Pendataan Pascabencana; tiap survei punya jadwal, peserta, dan bank soal sendiri dengan pilihan
-- yang bisa berbeda (jam/hari rilis, wajib nilai lulus atau tidak, jumlah soal, soal diundi acak atau berurutan, dst).
--
-- Yang berubah:
--  1. sigap_qc_soal + kegiatan_id (soal lama -> Pendataan Pascabencana). Kode soal tetap unik di seluruh basis data.
--  2. sigap_qc_pengaturan + wajib_ulang, nilai_lulus, undi_acak, acak_tampil, hari_rilis, peran_peserta, rekap_pml. Bawaan = perilaku lama
--     (wajib ulang sampai 100, undian acak, tampilan diacak, rilis tiap hari, peserta PML+PPL, rekap PML menyala), jadi Pascabencana tidak berubah.
--  3. Fungsi sigap_qc_* dibuat sadar kegiatan. Petugas yang menjadi peserta di dua kegiatan dilayani satu per satu: kegiatan yang MASIH
--     wajib diisi didahulukan (sigap_qc_status). Tidak ada data dihapus; tidak ada perubahan pada hasil yang sudah tersimpan.
--  4. "Lulus" kini = benar x 100 >= nilai_lulus x jumlah (bawaan nilai_lulus 100 = semua benar, sama dengan aturan lama).
--
-- Aman diulang (add column if not exists / create or replace / drop function if exists). Jalankan oleh user (DDL produksi); lalu 62_uji_qc_kegiatan.sql.
-- Tanda tangan yang berubah: sigap_qc_tinjau (+ p_kegiatan) dan sigap_qc_rekap_baca_tandai (+ p_kegiatan); kode aplikasi baru memakai keduanya,
-- kode lama tetap berjalan karena parameter baru opsional.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom
-- ---------------------------------------------------------------------
alter table public.sigap_qc_soal add column if not exists kegiatan_id bigint references public.sigap_kegiatan(id);
update public.sigap_qc_soal set kegiatan_id = (select id from public.sigap_kegiatan where kode = 'pascabencana_2026') where kegiatan_id is null;
do $$ begin
  if exists (select 1 from public.sigap_qc_soal where kegiatan_id is null) then
    raise exception 'Ada soal QC tanpa kegiatan dan kegiatan pascabencana_2026 tidak ditemukan. Dibatalkan.';
  end if;
end $$;
alter table public.sigap_qc_soal alter column kegiatan_id set not null;
create index if not exists sigap_qc_soal_kegiatan_idx on public.sigap_qc_soal (kegiatan_id, paket, nomor);

alter table public.sigap_qc_pengaturan add column if not exists wajib_ulang  boolean  not null default true;
alter table public.sigap_qc_pengaturan add column if not exists nilai_lulus  smallint not null default 100;
alter table public.sigap_qc_pengaturan add column if not exists undi_acak    boolean  not null default true;
alter table public.sigap_qc_pengaturan add column if not exists acak_tampil  boolean  not null default true;
alter table public.sigap_qc_pengaturan add column if not exists hari_rilis   smallint[] not null default '{1,2,3,4,5,6,7}';
alter table public.sigap_qc_pengaturan add column if not exists peran_peserta text[]  not null default '{pml,ppl}';
alter table public.sigap_qc_pengaturan add column if not exists rekap_pml     boolean  not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sigap_qc_pengaturan'::regclass and conname = 'sigap_qc_pengaturan_nilai_lulus_cek') then
    alter table public.sigap_qc_pengaturan add constraint sigap_qc_pengaturan_nilai_lulus_cek check (nilai_lulus between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.sigap_qc_pengaturan'::regclass and conname = 'sigap_qc_pengaturan_hari_rilis_cek') then
    alter table public.sigap_qc_pengaturan add constraint sigap_qc_pengaturan_hari_rilis_cek
      check (cardinality(hari_rilis) between 1 and 7 and hari_rilis <@ array[1,2,3,4,5,6,7]::smallint[]);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.sigap_qc_pengaturan'::regclass and conname = 'sigap_qc_pengaturan_peran_cek') then
    alter table public.sigap_qc_pengaturan add constraint sigap_qc_pengaturan_peran_cek
      check (cardinality(peran_peserta) between 1 and 2 and peran_peserta <@ array['pml','ppl']::text[]);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Pembantu: hari QC yang berlaku, aturan lulus
-- ---------------------------------------------------------------------
-- Hari QC yang berlaku = hari rilis terakhir yang sudah lewat jam rilis (sebelum jam rilis = kemarin); mundur sampai hari yang termasuk hari_rilis.
create or replace function public.sigap_qc_hari_berlaku(p_now timestamp, p_rilis time, p_hari smallint[])
returns date language plpgsql immutable as $$
declare d date; i integer;
begin
  d := case when p_now::time >= p_rilis then p_now::date else p_now::date - 1 end;
  for i in 0..6 loop
    if extract(isodow from d)::smallint = any (p_hari) then return d; end if;
    d := d - 1;
  end loop;
  return null;
end $$;

create or replace function public.sigap_qc_lulus(p_kegiatan bigint, p_benar integer, p_jumlah integer)
returns boolean language sql stable as $$
  select coalesce(p_jumlah, 0) > 0
     and p_benar * 100 >= coalesce((select nilai_lulus from public.sigap_qc_pengaturan where kegiatan_id = p_kegiatan), 100) * p_jumlah
$$;

-- ---------------------------------------------------------------------
-- 3. Peserta menurut peran_peserta
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_peserta(p_kegiatan bigint)
returns table (akun_id bigint, nama text, peran text, pml_akun_id bigint, pml_nama text)
language sql stable security definer set search_path = public as $$
  select p.akun_id, a.nama, p.peran, pp.akun_id, pa.nama
  from sigap_penugasan p
  join sigap_akun a on a.id = p.akun_id and a.aktif
  left join bencana_petugas bp on bp.id = a.petugas_bencana_id
  left join sigap_akun pa on p.peran = 'ppl' and pa.petugas_bencana_id = bp.atasan_id and pa.aktif
  left join sigap_penugasan pp on pp.akun_id = pa.id and pp.kegiatan_id = p_kegiatan and pp.peran = 'pml' and pp.aktif
  where p.kegiatan_id = p_kegiatan and p.aktif and p.peran in ('pml', 'ppl')
    and p.peran = any (coalesce((select g.peran_peserta from sigap_qc_pengaturan g where g.kegiatan_id = p_kegiatan), array['pml','ppl']::text[]))
$$;

-- ---------------------------------------------------------------------
-- 4. Undian soal: hanya soal kegiatan itu; acak atau berurutan (paket, nomor)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_undi(p_kegiatan bigint, p_jumlah integer)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v_hasil text[]; v_acak boolean;
begin
  select coalesce(g.undi_acak, true) into v_acak from sigap_qc_pengaturan g where g.kegiatan_id = p_kegiatan;
  v_acak := coalesce(v_acak, true);
  select coalesce(array_agg(id), '{}') into v_hasil from (
    select x.id from (
      select s.id, s.paket, s.nomor,
             coalesce((select max(h.tanggal) from sigap_qc_hari h where h.kegiatan_id = p_kegiatan and s.id = any (h.soal_ids)), date '1900-01-01') as terakhir,
             row_number() over (partition by s.paket order by
               coalesce((select max(h.tanggal) from sigap_qc_hari h where h.kegiatan_id = p_kegiatan and s.id = any (h.soal_ids)), date '1900-01-01'),
               (case when v_acak then random() else 0 end), s.nomor, s.id) as rn
      from sigap_qc_soal s where s.aktif and s.kegiatan_id = p_kegiatan
    ) x
    order by (case when x.rn = 1 then 0 else 1 end), x.terakhir, (case when v_acak then random() else 0 end), x.paket, x.nomor, x.id
    limit greatest(p_jumlah, 0)
  ) y;
  return v_hasil;
end $$;

-- ---------------------------------------------------------------------
-- 5. Status petugas: per kegiatan (sigap_qc_status_k), lalu pemilih kegiatan (sigap_qc_status)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_status_k(p_akun bigint, p_kegiatan bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s record; v_peran text; v_now timestamp; v_tgl date; v_rilis timestamptz; v_batas timestamptz; v_nama text;
  v_n integer; v_best integer; v_lulus boolean; v_maks integer; v_perlu boolean; v_belum jsonb := '[]'::jsonb; v_susulan timestamptz;
begin
  select pg.* into s from sigap_qc_pengaturan pg where pg.kegiatan_id = p_kegiatan and pg.aktif;
  if not found then return jsonb_build_object('aktif', false); end if;
  select q.peran into v_peran from sigap_qc_peserta(p_kegiatan) q where q.akun_id = p_akun limit 1;
  if v_peran is null then return jsonb_build_object('aktif', false); end if;

  v_now := now() at time zone 'Asia/Jakarta';
  v_tgl := sigap_qc_hari_berlaku(v_now, s.rilis_jam, s.hari_rilis);
  if v_tgl is null or (s.mulai is not null and v_tgl < s.mulai) or (s.akhir is not null and v_tgl > s.akhir) then
    return jsonb_build_object('aktif', false, 'alasan', 'di luar periode');
  end if;
  v_rilis := (v_tgl + s.rilis_jam) at time zone 'Asia/Jakarta';
  v_batas := (v_tgl + s.batas_jam) at time zone 'Asia/Jakarta';
  select h.susulan_at into v_susulan from sigap_qc_hari h where h.kegiatan_id = s.kegiatan_id and h.tanggal = v_tgl;
  select k.nama into v_nama from sigap_kegiatan k where k.id = s.kegiatan_id;

  select count(*), coalesce(max(skor), 0), coalesce(bool_or(sigap_qc_lulus(s.kegiatan_id, benar, jumlah)), false)
    into v_n, v_best, v_lulus
    from sigap_qc_percobaan where kegiatan_id = s.kegiatan_id and tanggal = v_tgl and akun_id = p_akun;
  -- tanpa wajib_ulang: satu percobaan saja
  v_maks := case when s.wajib_ulang then 1 + s.maks_ulang else 1 end;
  v_perlu := (v_n = 0) or (s.wajib_ulang and not v_lulus and v_n < v_maks);

  if v_peran = 'pml' then
    select coalesce(jsonb_agg(q.nama order by q.nama), '[]'::jsonb) into v_belum
      from sigap_qc_peserta(s.kegiatan_id) q
     where q.peran = 'ppl' and q.pml_akun_id = p_akun
       and not exists (select 1 from sigap_qc_percobaan c where c.kegiatan_id = s.kegiatan_id and c.tanggal = v_tgl and c.akun_id = q.akun_id);
  end if;

  return jsonb_build_object(
    'aktif', true, 'kegiatan_id', s.kegiatan_id, 'kegiatan_nama', v_nama, 'peran', v_peran, 'tanggal', v_tgl,
    'rilis_at', v_rilis, 'batas_at', v_batas, 'lewat_batas', (now() > v_batas and v_susulan is null), 'susulan', v_susulan is not null, 'susulan_at', v_susulan,
    'perlu', v_perlu, 'percobaan', v_n, 'maks_percobaan', v_maks, 'sisa_ulang', greatest(v_maks - v_n, 0),
    'skor_terbaik', v_best, 'lulus', v_lulus, 'ppl_belum', v_belum,
    'nilai_lulus', s.nilai_lulus, 'wajib_ulang', s.wajib_ulang, 'acak_tampil', s.acak_tampil, 'rekap_pml', s.rekap_pml, 'soal_per_hari', s.soal_per_hari);
end $$;

-- Pemilih: kegiatan aktif yang petugas ikuti. Yang MASIH wajib diisi didahulukan; bila tidak ada, kegiatan aktif pertama (menurut id).
create or replace function public.sigap_qc_status(p_akun bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; pertama jsonb; k bigint;
begin
  for k in
    select pg.kegiatan_id from sigap_qc_pengaturan pg
     where pg.aktif and exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun)
     order by pg.kegiatan_id
  loop
    r := sigap_qc_status_k(p_akun, k);
    if coalesce((r ->> 'aktif')::boolean, false) then
      if pertama is null then pertama := r; end if;
      if coalesce((r ->> 'perlu')::boolean, false) then return r; end if;
    end if;
  end loop;
  return coalesce(pertama, jsonb_build_object('aktif', false));
end $$;

-- ---------------------------------------------------------------------
-- 6. Soal untuk dikerjakan: urutan diacak per petugas atau tetap (paket, nomor)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_soal_untuk(p_akun bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb; v_ids text[]; v_tgl date; v_ke integer; v_acak boolean;
begin
  st := sigap_qc_status(p_akun);
  if not coalesce((st ->> 'aktif')::boolean, false) or not coalesce((st ->> 'perlu')::boolean, false) then
    raise exception 'Tidak ada soal QC yang perlu dikerjakan' using errcode = 'P0001';
  end if;
  v_tgl := (st ->> 'tanggal')::date;
  v_acak := coalesce((st ->> 'acak_tampil')::boolean, true);
  v_ids := sigap_qc_hari_pastikan((st ->> 'kegiatan_id')::bigint, v_tgl);
  v_ke := (st ->> 'percobaan')::integer + 1;
  return jsonb_build_object(
    'tanggal', v_tgl, 'ke', v_ke, 'kegiatan_id', st -> 'kegiatan_id', 'kegiatan_nama', st -> 'kegiatan_nama', 'maks_percobaan', st -> 'maks_percobaan',
    'nilai_lulus', st -> 'nilai_lulus', 'wajib_ulang', st -> 'wajib_ulang',
    'batas_at', st -> 'batas_at', 'lewat_batas', st -> 'lewat_batas', 'susulan', st -> 'susulan',
    'soal', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'paket', s.paket, 'judul_paket', s.judul_paket, 'pertanyaan', s.pertanyaan, 'kata_kunci', to_jsonb(s.kata_kunci),
               'opsi', (select jsonb_agg(jsonb_build_object('kode', o.key, 'teks', o.value #>> '{}')
                                         order by (case when v_acak then md5(p_akun || ':' || v_tgl || ':' || v_ke || ':' || s.id || ':' || o.key) else o.key end))
                          from jsonb_each(s.opsi) o))
             order by (case when v_acak then md5(p_akun || ':' || v_tgl || ':' || v_ke || ':' || s.id) else lpad(s.paket::text, 3, '0') || lpad(s.nomor::text, 5, '0') || s.id end)), '[]'::jsonb)
        from sigap_qc_soal s where s.id = any (v_ids)));
end $$;

-- ---------------------------------------------------------------------
-- 7. Tinjauan jawaban (kegiatan boleh disebut; bila tidak, ditebak dari percobaan petugas pada tanggal itu)
-- ---------------------------------------------------------------------
drop function if exists public.sigap_qc_tinjau(bigint, date, integer);
create or replace function public.sigap_qc_tinjau(p_akun bigint, p_tanggal date, p_ke integer default null, p_kegiatan bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; st jsonb; v_keg bigint := p_kegiatan; v_lulus boolean;
begin
  if v_keg is null then
    select pc.kegiatan_id into v_keg from sigap_qc_percobaan pc
     where pc.akun_id = p_akun and pc.tanggal = p_tanggal and (p_ke is null or pc.ke = p_ke)
     order by pc.selesai_at desc limit 1;
  end if;
  if v_keg is null then
    select pg.kegiatan_id into v_keg from sigap_qc_pengaturan pg
     where exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun) order by pg.aktif desc, pg.kegiatan_id limit 1;
  end if;
  if v_keg is null then raise exception 'Bukan peserta QC' using errcode = 'P0001'; end if;
  select * into c from sigap_qc_percobaan
   where kegiatan_id = v_keg and tanggal = p_tanggal and akun_id = p_akun and (p_ke is null or ke = p_ke)
   order by ke desc limit 1;
  if not found then raise exception 'Percobaan tidak ditemukan' using errcode = 'P0001'; end if;
  st := sigap_qc_status_k(p_akun, v_keg);
  v_lulus := sigap_qc_lulus(v_keg, c.benar, c.jumlah);
  return jsonb_build_object(
    'tanggal', c.tanggal, 'ke', c.ke, 'kegiatan_id', v_keg, 'skor', c.skor, 'benar', c.benar, 'jumlah', c.jumlah, 'lulus', v_lulus, 'terlambat', c.terlambat,
    'nilai_lulus', coalesce(st -> 'nilai_lulus', to_jsonb((select nilai_lulus from sigap_qc_pengaturan where kegiatan_id = v_keg))),
    'sisa_ulang', case when (st ->> 'tanggal')::date = c.tanggal and c.ke = (st ->> 'percobaan')::integer then (st -> 'sisa_ulang') else '0'::jsonb end,
    'perlu_ulang', (st ->> 'tanggal')::date = c.tanggal and coalesce((st ->> 'perlu')::boolean, false) and c.ke = (st ->> 'percobaan')::integer,
    'tinjau', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'paket', s.paket, 'judul_paket', s.judul_paket, 'pertanyaan', s.pertanyaan, 'kata_kunci', to_jsonb(s.kata_kunci),
               'opsi', (select jsonb_agg(jsonb_build_object('kode', o.key, 'teks', o.value #>> '{}') order by o.key) from jsonb_each(s.opsi) o),
               'kunci', s.kunci, 'jawaban', c.jawaban ->> s.id, 'benar', (c.jawaban ->> s.id) = s.kunci, 'penjelasan', s.penjelasan)
             order by s.paket, s.nomor, s.id), '[]'::jsonb)
        from sigap_qc_soal s where s.id = any (select jsonb_object_keys(c.jawaban))));
end $$;

-- ---------------------------------------------------------------------
-- 8. Kirim jawaban: sama seperti sebelumnya, tinjauan memakai kegiatan yang sedang dikerjakan
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_jawab(p_akun bigint, p_jawaban jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st jsonb; v_keg bigint; v_tgl date; v_ids text[]; v_ke integer; v_jml integer; v_benar integer; v_salah text[]; v_simpan jsonb; v_late boolean;
begin
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then raise exception 'Jawaban tidak valid' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('sigap_qc_jawab:' || p_akun));
  st := sigap_qc_status(p_akun);
  if not coalesce((st ->> 'aktif')::boolean, false) or not coalesce((st ->> 'perlu')::boolean, false) then
    raise exception 'Tidak ada soal QC yang perlu dikerjakan' using errcode = 'P0001';
  end if;
  v_keg := (st ->> 'kegiatan_id')::bigint; v_tgl := (st ->> 'tanggal')::date;
  v_ids := sigap_qc_hari_pastikan(v_keg, v_tgl);
  v_ke := (st ->> 'percobaan')::integer + 1;
  v_late := coalesce((st ->> 'lewat_batas')::boolean, false);  -- hari susulan: tidak pernah terlambat

  select count(*),
         count(*) filter (where (p_jawaban ->> s.id) = s.kunci),
         coalesce(array_agg(s.id order by s.id) filter (where (p_jawaban ->> s.id) is distinct from s.kunci), '{}'),
         jsonb_object_agg(s.id, p_jawaban ->> s.id)
    into v_jml, v_benar, v_salah, v_simpan
    from sigap_qc_soal s where s.id = any (v_ids);
  if v_jml = 0 then raise exception 'Soal hari ini tidak ditemukan' using errcode = 'P0001'; end if;
  if exists (select 1 from sigap_qc_soal s where s.id = any (v_ids) and coalesce(p_jawaban ->> s.id, '') not in ('A', 'B', 'C', 'D')) then
    raise exception 'Semua soal wajib dijawab' using errcode = 'P0001';
  end if;

  insert into sigap_qc_percobaan (kegiatan_id, tanggal, akun_id, ke, jawaban, salah, benar, jumlah, skor, terlambat)
  values (v_keg, v_tgl, p_akun, v_ke, v_simpan, v_salah, v_benar, v_jml, round(100.0 * v_benar / v_jml), v_late);
  return sigap_qc_tinjau(p_akun, v_tgl, v_ke, v_keg);
end $$;

-- ---------------------------------------------------------------------
-- 9. Yang masih wajib (untuk pengingat) -- mengikuti nilai_lulus dan wajib_ulang
-- ---------------------------------------------------------------------
drop function if exists public.sigap_qc_belum(bigint, date);
create or replace function public.sigap_qc_belum(p_kegiatan bigint, p_tanggal date)
returns table (akun_id bigint, nama text, peran text, pml_akun_id bigint, pml_nama text, percobaan integer, skor_terbaik integer)
language sql stable security definer set search_path = public as $$
  select q.akun_id, q.nama, q.peran, q.pml_akun_id, q.pml_nama,
         coalesce((select count(*)::integer from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id), 0),
         coalesce((select max(c.skor)::integer from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id), 0)
    from sigap_qc_peserta(p_kegiatan) q
   where (select count(*) from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id) = 0
      or (
        (select g.wajib_ulang from sigap_qc_pengaturan g where g.kegiatan_id = p_kegiatan)
        and not exists (select 1 from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id and sigap_qc_lulus(p_kegiatan, c.benar, c.jumlah))
        and (select count(*) from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal and c.akun_id = q.akun_id)
            < 1 + (select g.maks_ulang from sigap_qc_pengaturan g where g.kegiatan_id = p_kegiatan)
      )
$$;

-- ---------------------------------------------------------------------
-- 10. Rekap tim (nilai lulus mengikuti pengaturan)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_rekap(p_kegiatan bigint, p_tanggal date, p_pml bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hasil jsonb;
begin
  with pes as (select * from sigap_qc_peserta(p_kegiatan)),
  pc as (
    select c.akun_id, count(*) as n, max(c.skor) as terbaik, bool_or(sigap_qc_lulus(p_kegiatan, c.benar, c.jumlah)) as lulus, bool_or(c.terlambat) as terlambat,
           max(c.skor) filter (where c.ke = 1) as awal, (select c1.salah from sigap_qc_percobaan c1
             where c1.kegiatan_id = p_kegiatan and c1.tanggal = p_tanggal and c1.akun_id = c.akun_id and c1.ke = 1) as salah_awal
      from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal group by c.akun_id),
  ppl as (
    select coalesce(q.pml_akun_id, 0) as pml, q.pml_nama, q.akun_id, q.nama, coalesce(pc.n, 0) as n, pc.terbaik, pc.awal, coalesce(pc.lulus, false) as lulus,
           coalesce(pc.terlambat, false) as terlambat, coalesce(pc.salah_awal, '{}') as salah_awal
      from pes q left join pc on pc.akun_id = q.akun_id
     where q.peran = 'ppl' and (p_pml is null or coalesce(q.pml_akun_id, 0) = p_pml)),
  grup as (
    select coalesce(p.pml, 0) as pml, max(p.pml_nama) as pml_nama from ppl p group by p.pml
    union
    select q.akun_id, q.nama from pes q where q.peran = 'pml' and (p_pml is null or q.akun_id = p_pml)),
  grup1 as (select g.pml, max(g.pml_nama) as pml_nama from grup g group by g.pml),
  salah as (
    select p.pml, s.id as soal_id, s.pertanyaan, s.penjelasan, s.opsi ->> s.kunci as kunci_teks, s.kunci, count(*) as jumlah, jsonb_agg(p.nama order by p.nama) as nama
      from ppl p cross join lateral unnest(p.salah_awal) as sid(x) join sigap_qc_soal s on s.id = sid.x
     group by p.pml, s.id, s.pertanyaan, s.penjelasan, s.opsi, s.kunci)
  select coalesce(jsonb_agg(jsonb_build_object(
           'pml_akun_id', g.pml,
           'pml_nama', coalesce(g.pml_nama, case when g.pml = 0 then 'Tanpa PML' else null end),
           'pml_sendiri', (select jsonb_build_object('percobaan', coalesce(pc.n, 0), 'skor_terbaik', pc.terbaik, 'lulus', coalesce(pc.lulus, false)) from pc where pc.akun_id = g.pml),
           'jumlah_ppl', (select count(*) from ppl p where p.pml = g.pml),
           'sudah', (select count(*) from ppl p where p.pml = g.pml and p.n > 0),
           'belum_mengisi', (select count(*) from ppl p where p.pml = g.pml and p.n = 0),
           'lulus', (select count(*) from ppl p where p.pml = g.pml and p.lulus),
           'rata_awal', (select round(avg(p.awal)) from ppl p where p.pml = g.pml and p.n > 0),
           'rata_terbaik', (select round(avg(p.terbaik)) from ppl p where p.pml = g.pml and p.n > 0),
           'ppl', (select coalesce(jsonb_agg(jsonb_build_object('akun_id', p.akun_id, 'nama', p.nama, 'percobaan', p.n, 'skor_awal', p.awal, 'skor_terbaik', p.terbaik,
                     'lulus', p.lulus, 'terlambat', p.terlambat, 'status', case when p.n = 0 then 'belum_mengisi' when p.lulus then 'lulus' else 'belum_100' end)
                     order by (p.n = 0) desc, p.terbaik nulls first, p.nama), '[]'::jsonb) from ppl p where p.pml = g.pml),
           'salah', (select coalesce(jsonb_agg(jsonb_build_object('soal_id', z.soal_id, 'pertanyaan', z.pertanyaan, 'kunci', z.kunci, 'kunci_teks', z.kunci_teks,
                     'penjelasan', z.penjelasan, 'jumlah', z.jumlah, 'nama', z.nama) order by z.jumlah desc, z.soal_id), '[]'::jsonb) from salah z where z.pml = g.pml)
         ) order by g.pml_nama nulls last), '[]'::jsonb)
    into v_hasil
    from grup1 g;
  return v_hasil;
end $$;

-- ---------------------------------------------------------------------
-- 11. Modal rekap untuk PML: kegiatan yang rekap_pml-nya menyala, hari rilis terakhir yang rekapnya sudah waktunya dan belum ditutup
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_rekap_untuk(p_akun bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; v_now timestamp; v_tgl date; v_rekap jsonb; i integer; v_ada boolean := false; v_baca jsonb := null;
begin
  v_now := now() at time zone 'Asia/Jakarta';
  for s in
    select pg.* from sigap_qc_pengaturan pg
     where pg.aktif and pg.rekap_pml and exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun and q.peran = 'pml')
     order by pg.kegiatan_id
  loop
    v_ada := true;
    -- rekap hari D tersedia mulai rekap_jam hari D+1; mundur sampai hari yang termasuk hari_rilis
    v_tgl := case when v_now::time >= s.rekap_jam then v_now::date - 1 else v_now::date - 2 end;
    for i in 0..6 loop
      exit when extract(isodow from v_tgl)::smallint = any (s.hari_rilis);
      v_tgl := v_tgl - 1;
    end loop;
    if (s.mulai is not null and v_tgl < s.mulai) or not exists (select 1 from sigap_qc_hari h where h.kegiatan_id = s.kegiatan_id and h.tanggal = v_tgl) then
      continue;
    end if;
    if exists (select 1 from sigap_qc_rekap_baca b where b.kegiatan_id = s.kegiatan_id and b.tanggal = v_tgl and b.pml_akun_id = p_akun) then
      v_baca := jsonb_build_object('ada', false, 'tanggal', v_tgl, 'dibaca', true);
      continue;
    end if;
    v_rekap := sigap_qc_rekap(s.kegiatan_id, v_tgl, p_akun);
    if jsonb_array_length(v_rekap) > 0 then
      return jsonb_build_object('ada', true, 'tanggal', v_tgl, 'kegiatan_id', s.kegiatan_id,
                                'kegiatan_nama', (select k.nama from sigap_kegiatan k where k.id = s.kegiatan_id), 'tim', v_rekap -> 0);
    end if;
  end loop;
  return coalesce(v_baca, jsonb_build_object('ada', false));
end $$;

drop function if exists public.sigap_qc_rekap_baca_tandai(bigint, date);
create or replace function public.sigap_qc_rekap_baca_tandai(p_akun bigint, p_tanggal date, p_kegiatan bigint default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_keg bigint := p_kegiatan;
begin
  if v_keg is null then
    select pg.kegiatan_id into v_keg from sigap_qc_pengaturan pg
     where exists (select 1 from sigap_qc_peserta(pg.kegiatan_id) q where q.akun_id = p_akun and q.peran = 'pml')
       and exists (select 1 from sigap_qc_hari h where h.kegiatan_id = pg.kegiatan_id and h.tanggal = p_tanggal)
     order by pg.kegiatan_id limit 1;
  elsif not exists (select 1 from sigap_qc_peserta(v_keg) q where q.akun_id = p_akun and q.peran = 'pml') then
    v_keg := null;
  end if;
  if v_keg is null then return false; end if;
  insert into sigap_qc_rekap_baca (kegiatan_id, tanggal, pml_akun_id) values (v_keg, p_tanggal, p_akun) on conflict do nothing;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 12. Pengaturan dan bank soal (menu Kelola)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_pengaturan_simpan(p_kegiatan bigint, p_data jsonb, p_oleh text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r sigap_qc_pengaturan%rowtype; v_menit integer[]; v_sel integer; v_aktif_lama boolean; v_now timestamp; v_hari smallint[]; v_peran text[];
begin
  if not exists (select 1 from sigap_kegiatan where id = p_kegiatan) then raise exception 'Kegiatan tidak ditemukan' using errcode = 'P0001'; end if;
  insert into sigap_qc_pengaturan (kegiatan_id) values (p_kegiatan) on conflict do nothing;
  select * into r from sigap_qc_pengaturan where kegiatan_id = p_kegiatan;
  v_aktif_lama := r.aktif;
  if p_data ? 'aktif'         then r.aktif := (p_data ->> 'aktif')::boolean; end if;
  if p_data ? 'rilis_jam'     then r.rilis_jam := (p_data ->> 'rilis_jam')::time; end if;
  if p_data ? 'batas_jam'     then r.batas_jam := (p_data ->> 'batas_jam')::time; end if;
  if p_data ? 'soal_per_hari' then r.soal_per_hari := (p_data ->> 'soal_per_hari')::smallint; end if;
  if p_data ? 'maks_ulang'    then r.maks_ulang := (p_data ->> 'maks_ulang')::smallint; end if;
  if p_data ? 'rekap_jam'     then r.rekap_jam := (p_data ->> 'rekap_jam')::time; end if;
  if p_data ? 'ingat_berkala_menit' then r.ingat_berkala_menit := (p_data ->> 'ingat_berkala_menit')::integer; end if;
  if p_data ? 'mulai'         then r.mulai := nullif(p_data ->> 'mulai', '')::date; end if;
  if p_data ? 'akhir'         then r.akhir := nullif(p_data ->> 'akhir', '')::date; end if;
  if p_data ? 'wajib_ulang'   then r.wajib_ulang := (p_data ->> 'wajib_ulang')::boolean; end if;
  if p_data ? 'nilai_lulus'   then r.nilai_lulus := (p_data ->> 'nilai_lulus')::smallint; end if;
  if p_data ? 'undi_acak'     then r.undi_acak := (p_data ->> 'undi_acak')::boolean; end if;
  if p_data ? 'acak_tampil'   then r.acak_tampil := (p_data ->> 'acak_tampil')::boolean; end if;
  if p_data ? 'rekap_pml'     then r.rekap_pml := (p_data ->> 'rekap_pml')::boolean; end if;
  if p_data ? 'hari_rilis'    then
    select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into v_hari from jsonb_array_elements_text(p_data -> 'hari_rilis') x;
    if cardinality(v_hari) < 1 or not (v_hari <@ array[1,2,3,4,5,6,7]::smallint[]) then raise exception 'Hari rilis harus berisi minimal satu hari (1 Senin sampai 7 Minggu)' using errcode = 'P0001'; end if;
    r.hari_rilis := v_hari;
  end if;
  if p_data ? 'peran_peserta' then
    select coalesce(array_agg(distinct x order by x), '{}') into v_peran from jsonb_array_elements_text(p_data -> 'peran_peserta') x;
    if cardinality(v_peran) < 1 or not (v_peran <@ array['pml','ppl']::text[]) then raise exception 'Peserta harus berisi PML, PPL, atau keduanya' using errcode = 'P0001'; end if;
    r.peran_peserta := v_peran;
  end if;
  if p_data ? 'ingat_menit'   then
    select coalesce(array_agg(distinct x::integer order by x::integer), '{}') into v_menit from jsonb_array_elements_text(p_data -> 'ingat_menit') x;
    r.ingat_menit := v_menit;
  end if;
  if r.rilis_jam >= r.batas_jam then raise exception 'Jam batas harus sesudah jam rilis' using errcode = 'P0001'; end if;
  if r.nilai_lulus < 1 or r.nilai_lulus > 100 then raise exception 'Nilai lulus harus 1-100' using errcode = 'P0001'; end if;
  v_sel := (extract(epoch from (r.batas_jam - r.rilis_jam)) / 60)::integer;
  if exists (select 1 from unnest(r.ingat_menit) m where m < 1 or m >= v_sel) then
    raise exception 'Menit pengingat harus di antara jam rilis dan jam batas' using errcode = 'P0001';
  end if;
  if r.ingat_berkala_menit <> 0 and r.ingat_berkala_menit not between 15 and 720 then raise exception 'Pengingat berkala harus 0 (mati) atau 15-720 menit' using errcode = 'P0001'; end if;
  if r.aktif and (select count(*) from sigap_qc_soal where aktif and kegiatan_id = p_kegiatan) < 1 then raise exception 'Bank soal kegiatan ini kosong. Tambahkan atau impor soal dulu.' using errcode = 'P0001'; end if;
  update sigap_qc_pengaturan set aktif = r.aktif, rilis_jam = r.rilis_jam, batas_jam = r.batas_jam, soal_per_hari = r.soal_per_hari, maks_ulang = r.maks_ulang,
         rekap_jam = r.rekap_jam, ingat_menit = r.ingat_menit, ingat_berkala_menit = r.ingat_berkala_menit, mulai = r.mulai, akhir = r.akhir,
         wajib_ulang = r.wajib_ulang, nilai_lulus = r.nilai_lulus, undi_acak = r.undi_acak, acak_tampil = r.acak_tampil, hari_rilis = r.hari_rilis,
         peran_peserta = r.peran_peserta, rekap_pml = r.rekap_pml, diubah_oleh = p_oleh, diubah_at = now()
   where kegiatan_id = p_kegiatan;
  -- QC baru DINYALAKAN sesudah jam batas pada hari rilis (mis. fitur baru aktif malam hari): hari itu otomatis hari SUSULAN
  if r.aktif and not coalesce(v_aktif_lama, false) then
    v_now := now() at time zone 'Asia/Jakarta';
    if v_now::time >= r.batas_jam and extract(isodow from v_now::date)::smallint = any (r.hari_rilis)
       and (r.mulai is null or v_now::date >= r.mulai) and (r.akhir is null or v_now::date <= r.akhir)
       and not exists (select 1 from sigap_qc_percobaan where kegiatan_id = p_kegiatan and tanggal = v_now::date) then
      perform sigap_qc_hari_susulan(p_kegiatan, v_now::date, true);
    end if;
  end if;
  return to_jsonb((select x from sigap_qc_pengaturan x where x.kegiatan_id = p_kegiatan));
end $$;

-- p_data wajib memuat kegiatan_id. Kode soal unik di seluruh basis data: kode milik kegiatan lain ditolak.
create or replace function public.sigap_qc_soal_simpan(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text := btrim(p_data ->> 'id'); v_opsi jsonb; v_kata text[]; v_keg bigint := nullif(p_data ->> 'kegiatan_id', '')::bigint;
begin
  if v_id is null or v_id = '' then raise exception 'Kode soal wajib diisi' using errcode = 'P0001'; end if;
  if v_keg is null or not exists (select 1 from sigap_kegiatan where id = v_keg) then raise exception 'Kegiatan soal wajib diisi' using errcode = 'P0001'; end if;
  if exists (select 1 from sigap_qc_soal where id = v_id and kegiatan_id <> v_keg) then
    raise exception 'Kode soal % sudah dipakai kegiatan lain. Pakai kode lain.', v_id using errcode = 'P0001';
  end if;
  v_opsi := p_data -> 'opsi';
  if v_opsi is null or jsonb_typeof(v_opsi) <> 'object' or not (v_opsi ?& array['A','B','C','D']) then
    raise exception 'Opsi A sampai D wajib diisi' using errcode = 'P0001';
  end if;
  if p_data ? 'kata_kunci' then
    select coalesce(array_agg(btrim(x) order by btrim(x)), '{}') into v_kata
      from (select distinct x from jsonb_array_elements_text(p_data -> 'kata_kunci') x where btrim(x) <> '') t;
  end if;
  insert into sigap_qc_soal (id, kegiatan_id, paket, judul_paket, nomor, pertanyaan, opsi, kunci, penjelasan, kata_kunci, aktif)
  values (v_id, v_keg, (p_data ->> 'paket')::smallint, coalesce(p_data ->> 'judul_paket', 'Paket ' || (p_data ->> 'paket')), coalesce((p_data ->> 'nomor')::smallint, 1),
          p_data ->> 'pertanyaan', v_opsi, upper(p_data ->> 'kunci'), coalesce(p_data ->> 'penjelasan', ''), coalesce(v_kata, '{}'), coalesce((p_data ->> 'aktif')::boolean, true))
  on conflict (id) do update set paket = excluded.paket, judul_paket = excluded.judul_paket, nomor = excluded.nomor, pertanyaan = excluded.pertanyaan,
     opsi = excluded.opsi, kunci = excluded.kunci, penjelasan = excluded.penjelasan,
     kata_kunci = case when p_data ? 'kata_kunci' then excluded.kata_kunci else sigap_qc_soal.kata_kunci end,
     aktif = case when p_data ? 'aktif' then excluded.aktif else sigap_qc_soal.aktif end, diubah_at = now();
  return jsonb_build_object('id', v_id);
end $$;

-- ---------------------------------------------------------------------
-- 13. Hak eksekusi: hanya service_role
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'sigap\_qc\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
