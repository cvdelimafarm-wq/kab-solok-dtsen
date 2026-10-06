-- (7 Okt 2026) SIGAP PEDIA -- permintaan user: ensiklopedia konsultasi resmi (HAI-DJPb, KPPN, Biro Keuangan,
-- dll) + arsip bukti (eml/html/pdf) ber-SHA-256 & timestamp RFC 3161 utk pemeriksaan Inspektorat.
-- Prefix tabel: pedia_. Idempoten (boleh dijalankan ulang). Rollback: 20261007a_sigap_pedia_rollback.sql
--
-- Imutabilitas (paling penting):
--   * pedia_entri  : nomor registrasi tidak bisa diubah; entri final/dibatalkan tidak bisa diubah kecuali
--                    penanda perlu_ditinjau (+ pembatalan entri final); tidak ada DELETE sama sekali.
--   * pedia_file   : hanya INSERT; UPDATE hanya utk melengkapi timestamp yg tertunda; tidak ada DELETE.
--   * pedia_audit  : hanya INSERT lewat RPC pedia_audit_tambah(), dgn rantai hash
--                    (hash = sha256(hash_sebelumnya || isi baris)); cek: select * from pedia_audit_cek_rantai().
--
-- TRIGGER ada di file terpisah 20261007b_sigap_pedia_trigger.sql (sudah diterapkan 7 Okt 2026).
--   * storage: server tidak pernah memanggil remove/upsert utk bucket sigap-pedia; penggantian file
--     terdeteksi lewat SHA-256 + token TSA (Verifikasi Ulang). Trigger storage: 20261007b.
set statement_timeout = '120s';
-- (sudah diterapkan 7 Okt 2026 lewat MCP)
set lock_timeout = '10s';

-- ============================================================ kategori
create table if not exists pedia_kategori (
  id bigserial primary key,
  kode text not null unique,
  induk_id bigint references pedia_kategori(id),
  nama text not null,
  deskripsi text,
  urutan integer not null default 0,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now()
);

-- ============================================================ nomor urut per tahun (atomik)
create table if not exists pedia_nomor (
  tahun integer primary key,
  terakhir integer not null default 0
);

create or replace function pedia_nomor_baru(p_tahun integer) returns integer
language sql as $$
  insert into pedia_nomor (tahun, terakhir) values (p_tahun, 1)
  on conflict (tahun) do update set terakhir = pedia_nomor.terakhir + 1
  returning terakhir;
$$;

-- ============================================================ entri
create table if not exists pedia_entri (
  id bigserial primary key,
  nomor_registrasi text not null unique,
  tahun integer not null,
  nomor_urut integer not null,
  kategori_id bigint not null references pedia_kategori(id),
  kanal text not null default 'hai_djpb' check (kanal in ('hai_djpb','kppn','kanwil_djpb','biro_keuangan_bps','inspektorat_bps','lainnya')),
  kanal_lain text,
  nomor_tiket text,
  tgl_diajukan date,
  tgl_dijawab date,
  sifat text not null default 'referensi' check (sifat in ('referensi','mengikat')),
  judul text not null,
  pertanyaan text,
  jawaban text,
  kesimpulan text,
  url_tiket text,
  nota_dinas_srikandi text,
  keputusan_ppk text,
  penanya_akun_id bigint references sigap_akun(id),
  penanya_nama text,
  tim text,
  status text not null default 'diajukan' check (status in ('diajukan','dijawab','ditindaklanjuti','final','dibatalkan')),
  perlu_ditinjau boolean not null default false,
  alasan_tinjau text,
  menggantikan_id bigint references pedia_entri(id),
  difinalkan_at timestamptz,
  difinalkan_oleh text,
  dibatalkan_alasan text,
  dibatalkan_oleh text,
  dibatalkan_at timestamptz,
  status_sebelum_batal text,
  dibuat_oleh text,
  dibuat_oleh_id bigint,
  dibuat_at timestamptz not null default now(),
  diubah_oleh text,
  diubah_at timestamptz not null default now()
);
create index if not exists pedia_entri_kat_idx on pedia_entri (kategori_id);
create index if not exists pedia_entri_status_idx on pedia_entri (status);

-- Nomor registrasi SP/{KODE_SUB}/{0001}/{TAHUN} (tahun = tahun WIB saat disimpan), dibuat DB:
--   * API memakai RPC pedia_entri_baru() (atomik: pedia_nomor_baru + insert dalam satu transaksi)
--   * trigger pedia_entri_bi (file 20261007b) membuat nomor utk INSERT langsung lain
create or replace function pedia_entri_sebelum_insert() returns trigger
language plpgsql as $$
declare v_kode text; v_induk bigint;
begin
  if new.status in ('final','dibatalkan') then raise exception 'Entri baru tidak boleh langsung final/dibatalkan'; end if;
  if coalesce(current_setting('pedia.nomor_rpc', true), '') = '1' and new.nomor_registrasi is not null then
    perform set_config('pedia.nomor_rpc', '', true);
    return new;
  end if;
  select kode, induk_id into v_kode, v_induk from pedia_kategori where id = new.kategori_id;
  if v_kode is null then raise exception 'Kategori tidak ditemukan'; end if;
  if v_induk is null then raise exception 'Pilih sub-kategori (bukan kategori induk)'; end if;
  new.tahun := extract(year from (now() at time zone 'Asia/Jakarta'))::int;
  new.nomor_urut := pedia_nomor_baru(new.tahun);
  new.nomor_registrasi := format('SP/%s/%s/%s', v_kode, lpad(new.nomor_urut::text, 4, '0'), new.tahun);
  return new;
end $$;

-- Imutabilitas entri
create or replace function pedia_entri_jaga() returns trigger
language plpgsql as $$
declare
  boleh_final text[] := array['perlu_ditinjau','alasan_tinjau','status','dibatalkan_alasan','dibatalkan_oleh','dibatalkan_at','status_sebelum_batal','diubah_at','diubah_oleh'];
  boleh_batal text[] := array['perlu_ditinjau','alasan_tinjau','diubah_at','diubah_oleh'];
  k text; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'SIGAP PEDIA: entri tidak boleh dihapus (nomor %). Gunakan pembatalan.', old.nomor_registrasi;
  end if;
  if new.nomor_registrasi is distinct from old.nomor_registrasi or new.nomor_urut is distinct from old.nomor_urut or new.tahun is distinct from old.tahun then
    raise exception 'SIGAP PEDIA: nomor registrasi tidak boleh diubah';
  end if;
  if old.status in ('final','dibatalkan') then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if (n -> k) is distinct from (o -> k) and not (k = any(case when old.status = 'final' then boleh_final else boleh_batal end)) then
        raise exception 'SIGAP PEDIA: entri % berstatus % tidak boleh diubah (kolom %)', old.nomor_registrasi, old.status, k;
      end if;
    end loop;
    if old.status = 'final' and new.status not in ('final','dibatalkan') then
      raise exception 'SIGAP PEDIA: entri final hanya bisa dibatalkan';
    end if;
    if old.status = 'dibatalkan' and new.status <> 'dibatalkan' then
      raise exception 'SIGAP PEDIA: entri dibatalkan tidak bisa dipulihkan';
    end if;
    if new.status = 'dibatalkan' and old.status <> 'dibatalkan' and coalesce(trim(new.dibatalkan_alasan), '') = '' then
      raise exception 'SIGAP PEDIA: alasan pembatalan wajib diisi';
    end if;
  end if;
  return new;
end $$;

-- Kategori: tidak boleh dihapus bila sudah dipakai (entri atau sub-kategori)
create or replace function pedia_kategori_jaga() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from pedia_entri where kategori_id = old.id) or exists (select 1 from pedia_kategori where induk_id = old.id) then
    raise exception 'SIGAP PEDIA: kategori % sudah dipakai, nonaktifkan saja', old.kode;
  end if;
  return old;
end $$;

-- ============================================================ tag, regulasi, tautan
create table if not exists pedia_tag (
  id bigserial primary key,
  nama text not null unique check (nama = lower(trim(nama)) and nama <> '')
);
create table if not exists pedia_entri_tag (
  entri_id bigint not null references pedia_entri(id),
  tag_id bigint not null references pedia_tag(id),
  primary key (entri_id, tag_id)
);

create table if not exists pedia_regulasi (
  id bigserial primary key,
  jenis text not null check (jenis in ('UU','PP','Perpres','PMK','PER','Perka BPS','SE','KMK','Lainnya')),
  nomor text not null,
  tahun integer not null,
  judul text,
  status text not null default 'berlaku' check (status in ('berlaku','diubah','dicabut')),
  diubah_oleh_id bigint references pedia_regulasi(id),
  diubah_oleh_teks text,
  catatan text,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now(),
  unique (jenis, nomor, tahun)
);
create table if not exists pedia_entri_regulasi (
  entri_id bigint not null references pedia_entri(id),
  regulasi_id bigint not null references pedia_regulasi(id),
  pasal text,
  primary key (entri_id, regulasi_id)
);

create table if not exists pedia_tautan (
  id bigserial primary key,
  entri_id bigint not null references pedia_entri(id),
  jenis text not null check (jenis in ('kegiatan','penugasan','kontrak_paket','perjadin','akun_anggaran','lainnya')),
  ref_id bigint,
  ref_teks text,
  dibuat_oleh text,
  dibuat_at timestamptz not null default now()
);
create unique index if not exists pedia_tautan_uq on pedia_tautan (entri_id, jenis, coalesce(ref_id, 0), coalesce(ref_teks, ''));
create index if not exists pedia_tautan_ref_idx on pedia_tautan (jenis, ref_id);

-- Relasi entri final/dibatalkan: tag & tautan hanya boleh ditambah; regulasi dikunci.
create or replace function pedia_relasi_jaga() returns trigger
language plpgsql as $$
declare v_status text; v_entri bigint;
begin
  v_entri := case when tg_op = 'DELETE' then old.entri_id else new.entri_id end;
  select status into v_status from pedia_entri where id = v_entri;
  if v_status in ('final','dibatalkan') then
    if tg_op = 'INSERT' and tg_table_name in ('pedia_entri_tag','pedia_tautan') and v_status = 'final' then
      return new;
    end if;
    raise exception 'SIGAP PEDIA: entri sudah % — % pada % ditolak', v_status, tg_op, tg_table_name;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Regulasi diubah/dicabut -> semua entri yg merujuknya ditandai perlu_ditinjau
create or replace function pedia_regulasi_status() returns trigger
language plpgsql as $$
begin
  if new.status in ('diubah','dicabut') and new.status is distinct from old.status then
    update pedia_entri e
       set perlu_ditinjau = true,
           alasan_tinjau = format('%s %s (%s) berstatus %s', new.jenis, new.nomor, new.tahun, new.status)
               || coalesce(' oleh ' || new.diubah_oleh_teks, ''),
           diubah_at = now()
     where e.id in (select entri_id from pedia_entri_regulasi where regulasi_id = new.id)
       and e.status <> 'dibatalkan';
  end if;
  new.diubah_at := now();
  return new;
end $$;

-- ============================================================ file bukti
create table if not exists pedia_file (
  id bigserial primary key,
  entri_id bigint not null references pedia_entri(id),
  induk_file_id bigint references pedia_file(id),
  jenis text not null check (jenis in ('eml','html','pdf','dkim_screenshot','lampiran')),
  nama_asli text not null,
  mime text,
  ukuran bigint not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  path text not null unique,
  tsa_status text not null default 'pending' check (tsa_status in ('ok','pending')),
  tsa_nama text,
  tsa_url text,
  tsa_gen_time timestamptz,
  tsa_serial text,
  tsa_path text,
  tsa_percobaan integer not null default 0,
  tsa_galat text,
  email jsonb,
  dkim jsonb,
  diunggah_oleh text,
  diunggah_oleh_id bigint,
  dibuat_at timestamptz not null default now()
);
create index if not exists pedia_file_entri_idx on pedia_file (entri_id);
create index if not exists pedia_file_sha_idx on pedia_file (sha256);

create or replace function pedia_file_jaga() returns trigger
language plpgsql as $$
declare
  v_status text; k text; o jsonb; n jsonb;
  boleh text[] := array['tsa_status','tsa_nama','tsa_url','tsa_gen_time','tsa_serial','tsa_path','tsa_percobaan','tsa_galat'];
begin
  if tg_op = 'DELETE' then raise exception 'SIGAP PEDIA: file bukti tidak boleh dihapus'; end if;
  if tg_op = 'INSERT' then
    select status into v_status from pedia_entri where id = new.entri_id;
    if v_status in ('final','dibatalkan') then raise exception 'SIGAP PEDIA: entri sudah %, file tidak bisa ditambah', v_status; end if;
    return new;
  end if;
  -- UPDATE: hanya melengkapi timestamp yg masih pending
  if old.tsa_status = 'ok' then raise exception 'SIGAP PEDIA: file bukti tidak boleh diubah'; end if;
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if (n -> k) is distinct from (o -> k) and not (k = any(boleh)) then
      raise exception 'SIGAP PEDIA: kolom % pada file bukti tidak boleh diubah', k;
    end if;
  end loop;
  return new;
end $$;

-- Riwayat verifikasi ulang (append-only)
create table if not exists pedia_verifikasi (
  id bigserial primary key,
  entri_id bigint not null references pedia_entri(id),
  oleh text,
  at timestamptz not null default now(),
  semua_cocok boolean not null,
  hasil jsonb not null
);

-- Statistik dibuka (dipisah supaya entri final tetap tidak berubah)
create table if not exists pedia_statistik (
  entri_id bigint primary key references pedia_entri(id),
  dibuka integer not null default 0,
  terakhir_dibuka timestamptz
);

-- ============================================================ audit log berantai hash
create table if not exists pedia_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  akun_id bigint,
  nama text,
  ip text,
  aksi text not null,
  entri_id bigint,
  file_id bigint,
  detail jsonb,
  hash_sebelum text,
  hash text
);
create index if not exists pedia_audit_entri_idx on pedia_audit (entri_id);

create or replace function pedia_audit_hash(p_prev text, p_id bigint, p_at timestamptz, p_akun bigint, p_nama text, p_ip text, p_aksi text, p_entri bigint, p_file bigint, p_detail jsonb)
returns text language sql immutable as $$
  select encode(extensions.digest(
    p_prev || '|' || p_id || '|' || to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
    coalesce(p_akun::text, '') || '|' || coalesce(p_nama, '') || '|' || coalesce(p_ip, '') || '|' || p_aksi || '|' ||
    coalesce(p_entri::text, '') || '|' || coalesce(p_file::text, '') || '|' || coalesce(p_detail::text, ''), 'sha256'), 'hex');
$$;
-- Tambah baris audit berantai (dipanggil API lewat RPC). Kunci advisory menjamin urutan rantai.
create or replace function pedia_audit_tambah(p_akun bigint, p_nama text, p_ip text, p_aksi text, p_entri bigint, p_file bigint, p_detail jsonb)
returns bigint language plpgsql as $$
declare v_prev text; v_id bigint; v_at timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtext('pedia_audit_rantai'));
  select hash into v_prev from pedia_audit order by id desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_id := nextval(pg_get_serial_sequence('pedia_audit', 'id'));
  insert into pedia_audit (id, at, akun_id, nama, ip, aksi, entri_id, file_id, detail, hash_sebelum, hash)
  values (v_id, v_at, p_akun, p_nama, p_ip, p_aksi, p_entri, p_file, p_detail, v_prev,
          pedia_audit_hash(v_prev, v_id, v_at, p_akun, p_nama, p_ip, p_aksi, p_entri, p_file, p_detail));
  return v_id;
end $$;
create or replace function pedia_audit_jaga() returns trigger
language plpgsql as $$
begin
  raise exception 'SIGAP PEDIA: audit log hanya bisa ditambah';
end $$;
-- Penjaga INSERT langsung (dipasang sbg trigger di 20261007b)
create or replace function pedia_audit_cek_insert() returns trigger
language plpgsql as $$
declare v_prev text;
begin
  perform pg_advisory_xact_lock(hashtext('pedia_audit_rantai'));
  select hash into v_prev from pedia_audit order by id desc limit 1;
  if new.hash_sebelum is distinct from coalesce(v_prev, repeat('0', 64))
     or new.hash is distinct from pedia_audit_hash(new.hash_sebelum, new.id, new.at, new.akun_id, new.nama, new.ip, new.aksi, new.entri_id, new.file_id, new.detail) then
    raise exception 'SIGAP PEDIA: baris audit harus ditambah lewat pedia_audit_tambah()';
  end if;
  return new;
end $$;

-- Cek rantai: kembalikan baris pertama yg rantainya putus (kosong = utuh)
create or replace function pedia_audit_cek_rantai() returns table (id bigint, masalah text)
language plpgsql stable as $$
declare r record; v_prev text := repeat('0', 64);
begin
  for r in select * from pedia_audit order by pedia_audit.id loop
    if r.hash_sebelum is distinct from v_prev then
      id := r.id; masalah := 'hash_sebelum tidak sama dgn hash baris sebelumnya (ada baris hilang/disisipkan)'; return next; return;
    end if;
    if pedia_audit_hash(r.hash_sebelum, r.id, r.at, r.akun_id, r.nama, r.ip, r.aksi, r.entri_id, r.file_id, r.detail) is distinct from r.hash then
      id := r.id; masalah := 'isi baris berubah'; return next; return;
    end if;
    v_prev := r.hash;
  end loop;
end $$;

-- ============================================================ pencarian full-text
create table if not exists pedia_cari (
  entri_id bigint primary key references pedia_entri(id),
  teks text not null default '',
  dokumen tsvector
);
create index if not exists pedia_cari_gin on pedia_cari using gin (dokumen);

create or replace function pedia_segarkan_cari(p_entri bigint) returns void
language plpgsql as $$
declare v_teks text;
begin
  select concat_ws(' ',
           e.nomor_registrasi, e.judul, e.pertanyaan, e.jawaban, e.kesimpulan, e.nomor_tiket, e.kanal_lain, e.tim,
           k.kode, k.nama, ki.kode, ki.nama,
           (select string_agg(t.nama || ' ' || replace(t.nama, '-', ' '), ' ') from pedia_entri_tag et join pedia_tag t on t.id = et.tag_id where et.entri_id = e.id),
           (select string_agg(concat_ws(' ', r.jenis, r.nomor, r.tahun, regexp_replace(r.nomor, '[^A-Za-z0-9]+', ' ', 'g'), r.judul, er.pasal), ' ')
              from pedia_entri_regulasi er join pedia_regulasi r on r.id = er.regulasi_id where er.entri_id = e.id))
    into v_teks
    from pedia_entri e
    join pedia_kategori k on k.id = e.kategori_id
    left join pedia_kategori ki on ki.id = k.induk_id
   where e.id = p_entri;
  if v_teks is null then return; end if;
  insert into pedia_cari (entri_id, teks, dokumen)
  values (p_entri, v_teks, to_tsvector('indonesian', v_teks) || to_tsvector('simple', v_teks))
  on conflict (entri_id) do update set teks = excluded.teks, dokumen = excluded.dokumen;
end $$;

create or replace function pedia_cari_picu() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'pedia_entri' then perform pedia_segarkan_cari(new.id);
  elsif tg_table_name = 'pedia_regulasi' then
    perform pedia_segarkan_cari(er.entri_id) from pedia_entri_regulasi er where er.regulasi_id = new.id;
  else perform pedia_segarkan_cari(case when tg_op = 'DELETE' then old.entri_id else new.entri_id end);
  end if;
  return null;
end $$;

-- Fungsi cari utk API (websearch syntax; gabungan kamus indonesian + simple)
create or replace function pedia_cari_entri(q text, batas integer default 50)
returns table (entri_id bigint, skor real)
language sql stable as $$
  select c.entri_id, ts_rank(c.dokumen, websearch_to_tsquery('indonesian', q) || websearch_to_tsquery('simple', q)) as skor
    from pedia_cari c
   where c.dokumen @@ (websearch_to_tsquery('indonesian', q) || websearch_to_tsquery('simple', q))
      or (length(q) >= 3 and c.teks ilike '%' || q || '%')
   order by skor desc
   limit batas;
$$;

-- Buat entri + nomor registrasi atomik (dipanggil API lewat RPC)
create or replace function pedia_entri_baru(p jsonb) returns table (id bigint, nomor_registrasi text)
language plpgsql as $$
declare r pedia_entri; v_kode text; v_induk bigint;
begin
  r := jsonb_populate_record(null::pedia_entri, p);
  select k.kode, k.induk_id into v_kode, v_induk from pedia_kategori k where k.id = r.kategori_id and k.aktif;
  if v_kode is null then raise exception 'Kategori tidak ditemukan / nonaktif'; end if;
  if v_induk is null then raise exception 'Pilih sub-kategori (bukan kategori induk)'; end if;
  if coalesce(r.status, 'diajukan') not in ('diajukan','dijawab','ditindaklanjuti') then raise exception 'Status awal tidak valid'; end if;
  r.tahun := extract(year from (now() at time zone 'Asia/Jakarta'))::int;
  r.nomor_urut := pedia_nomor_baru(r.tahun);
  r.nomor_registrasi := format('SP/%s/%s/%s', v_kode, lpad(r.nomor_urut::text, 4, '0'), r.tahun);
  perform set_config('pedia.nomor_rpc', '1', true);
  insert into pedia_entri (nomor_registrasi, tahun, nomor_urut, kategori_id, kanal, kanal_lain, nomor_tiket, tgl_diajukan, tgl_dijawab, sifat,
                           judul, pertanyaan, jawaban, kesimpulan, url_tiket, nota_dinas_srikandi, keputusan_ppk, penanya_akun_id, penanya_nama, tim,
                           status, menggantikan_id, dibuat_oleh, dibuat_oleh_id, diubah_oleh)
  values (r.nomor_registrasi, r.tahun, r.nomor_urut, r.kategori_id, coalesce(r.kanal, 'hai_djpb'), r.kanal_lain, r.nomor_tiket, r.tgl_diajukan, r.tgl_dijawab,
          coalesce(r.sifat, 'referensi'), r.judul, r.pertanyaan, r.jawaban, r.kesimpulan, r.url_tiket, r.nota_dinas_srikandi, r.keputusan_ppk,
          r.penanya_akun_id, r.penanya_nama, r.tim, coalesce(r.status, 'diajukan'), r.menggantikan_id, r.dibuat_oleh, r.dibuat_oleh_id, r.dibuat_oleh)
  returning pedia_entri.id, pedia_entri.nomor_registrasi into id, nomor_registrasi;
  perform set_config('pedia.nomor_rpc', '', true);
  perform pedia_segarkan_cari(id);
  return next;
end $$;

-- ============================================================ RLS (akses hanya lewat API server)
alter table pedia_kategori enable row level security;
alter table pedia_nomor enable row level security;
alter table pedia_entri enable row level security;
alter table pedia_tag enable row level security;
alter table pedia_entri_tag enable row level security;
alter table pedia_regulasi enable row level security;
alter table pedia_entri_regulasi enable row level security;
alter table pedia_tautan enable row level security;
alter table pedia_file enable row level security;
alter table pedia_verifikasi enable row level security;
alter table pedia_statistik enable row level security;
alter table pedia_audit enable row level security;
alter table pedia_cari enable row level security;

-- ============================================================ storage
-- Bucket privat "sigap-pedia" (batas 25 MB) dibuat otomatis oleh server SIGAP lewat Storage API saat
-- unggahan pertama (DDL pada skema storage tidak bisa dijalankan lewat koneksi migrasi ini).
-- Penjaga hapus/timpa di level storage.objects ada di 20261007b_sigap_pedia_trigger.sql.

-- ============================================================ menu & izin SIGAP
insert into sigap_menu (kode, portal, nama, keterangan, urutan) values
  ('pedia.baca',   'SIGAP PEDIA', 'Baca ensiklopedia',        'Pegawai organik otomatis boleh membaca', 300),
  ('pedia.kelola', 'SIGAP PEDIA', 'Penatausahaan & arsip bukti', 'Buat, kategorikan, finalkan entri; unduh bukti asli; master data', 310)
on conflict (kode) do nothing;
insert into sigap_peran_izin (peran_id, menu_kode, level)
select id, m.kode, 'kelola' from sigap_peran, (values ('pedia.baca'), ('pedia.kelola')) as m(kode)
where sigap_peran.kode = 'admin_anggaran'
on conflict do nothing;

-- ============================================================ seed kategori
insert into pedia_kategori (kode, nama, urutan) values
  ('PD',  'Perjalanan Dinas', 10),
  ('HN',  'Honorarium & Uang Harian', 20),
  ('PBJ', 'Pengadaan Barang/Jasa', 30),
  ('BB',  'Belanja Barang Operasional', 40),
  ('PJK', 'Perpajakan', 50),
  ('PRA', 'Perencanaan & Revisi Anggaran', 60),
  ('PLB', 'Pelaksanaan & Pembayaran', 70),
  ('SPJ', 'Pertanggungjawaban & Dokumen', 80),
  ('AKB', 'Akuntansi & BMN', 90),
  ('KEG', 'Kegiatan Statistik', 100),
  ('LN',  'Lainnya', 110)
on conflict (kode) do nothing;

insert into pedia_kategori (kode, induk_id, nama, urutan)
select s.kode, k.id, s.nama, s.urutan
from (values
  ('PD.01','PD','Transport lokal / perjalanan dalam kota',1),
  ('PD.02','PD','Perjalanan dinas luar kota',2),
  ('PD.03','PD','Paket meeting / fullboard',3),
  ('PD.04','PD','Dokumen SPD, visum & bukti pendukung',4),
  ('HN.01','HN','Honor narasumber / panitia',1),
  ('HN.02','HN','Honor mitra statistik',2),
  ('HN.03','HN','Uang lembur & uang makan',3),
  ('HN.04','HN','Uang harian & uang saku rapat',4),
  ('PBJ.01','PBJ','Pembelian langsung / kuitansi',1),
  ('PBJ.02','PBJ','Penyedia, e-katalog & toko daring',2),
  ('PBJ.03','PBJ','Swakelola',3),
  ('PBJ.04','PBJ','Kontrak, jaminan & denda',4),
  ('BB.01','BB','Konsumsi rapat',1),
  ('BB.02','BB','ATK & bahan',2),
  ('BB.03','BB','Sewa (gedung, kendaraan, peralatan)',3),
  ('BB.04','BB','Pemeliharaan',4),
  ('PJK.01','PJK','PPh 21',1),
  ('PJK.02','PJK','PPh 22/23',2),
  ('PJK.03','PJK','PPN',3),
  ('PJK.04','PJK','Bea meterai',4),
  ('PRA.01','PRA','RKA-K/L & DIPA',1),
  ('PRA.02','PRA','Revisi anggaran & POK',2),
  ('PRA.03','PRA','Blokir / automatic adjustment',3),
  ('PLB.01','PLB','UP/TUP/GUP',1),
  ('PLB.02','PLB','Pembayaran LS',2),
  ('PLB.03','PLB','SPM/SP2D',3),
  ('PLB.04','PLB','KKP & digipay',4),
  ('SPJ.01','SPJ','Kelengkapan bukti pengeluaran',1),
  ('SPJ.02','SPJ','Dokumen & tanda tangan elektronik',2),
  ('SPJ.03','SPJ','Koreksi, pengembalian & setoran',3),
  ('AKB.01','AKB','SAKTI',1),
  ('AKB.02','AKB','Persediaan',2),
  ('AKB.03','AKB','Aset tetap / BMN',3),
  ('KEG.01','KEG','Sensus & survei lapangan',1),
  ('KEG.02','KEG','Pelatihan petugas',2),
  ('KEG.03','KEG','Kerja sama / swakelola dengan pemda',3),
  ('LN.01','LN','Lain-lain',1)
) as s(kode, induk, nama, urutan)
join pedia_kategori k on k.kode = s.induk
on conflict (kode) do nothing;

-- Regulasi yg disebut di permintaan user (status awal "berlaku"; judul PER-8 dikosongkan -- mohon dilengkapi)
insert into pedia_regulasi (jenis, nomor, tahun, judul) values
  ('PMK', '113/PMK.05/2012', 2012, 'Perjalanan Dinas Dalam Negeri bagi Pejabat Negara, Pegawai Negeri, dan Pegawai Tidak Tetap'),
  ('PER', 'PER-8/PB/2020', 2020, null)
on conflict (jenis, nomor, tahun) do nothing;
