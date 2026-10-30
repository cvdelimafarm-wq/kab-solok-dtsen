-- =====================================================================
-- 20261025zf_keu_identifikasi_lanjutan.sql
-- SIGAP - Identifikasi lanjutan (tahap 29): mengubah perkiraan identifikasi awal menjadi data Fix (kelas pelatihan, jumlah dan nama petugas,
-- jabatan, sumber mitra, translok dan penginapan), serta pencatatan dokumen turunan (undangan, surat pengantar nagari, surat tugas atau SPK).
-- Bergantung pada 20261025za, zc (identifikasi) dan zd (lembar kebijakan). Aman diulang. Tanpa DELETE/DROP.
--
-- Isi:
--  1. keu_ident_lanjutan (satu baris per identifikasi, isi jsonb utuh), keu_ident_lanjutan_versi (salinan tiap versi, tidak berubah),
--     keu_ident_dokumen (nomor, tanggal, penandatangan, status konsep atau terbit).
--  2. keu_lanjutan_periksa(isi) -> text[] dan keu_lanjutan_status(isi) -> 'draf' | 'final': kembaran lib/keu/lanjutan.ts (pesan SAMA PERSIS;
--     paritas dijaga lanjutan.vektor.json dan 51_uji_lanjutan.sql).
--  3. keu_lanjutan_simpan: menyimpan isi (versi baru bila berubah), mencatat lembar kebijakan yang berlaku dan penanda sesudah H-15.
--  4. keu_ident_dokumen_simpan: simpan | terbit | cabut. Terbit hanya bila lanjutan berstatus Final.
--  5. Tampilan keu_v_ident_lanjutan, keu_v_ident_lanjutan_versi, keu_v_ident_petugas, keu_v_ident_dokumen, keu_v_ident_ttd; RLS; izin gerbang.
--
-- Keputusan (25 Okt 2026): nama petugas "menyusul" cukup dicatat (tanpa persetujuan penuh); penandatangan dipilih per dokumen dan nomor diisi manual;
-- perubahan sesudah H-15 pada lanjutan Final wajib beralasan dan ditandai (persetujuan KPA atas perubahan itu menyusul pada tahap 30).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table if not exists keu_ident_lanjutan (
  id          bigint generated always as identity primary key,
  ident_id    bigint not null unique references keu_ident(id),
  tahun       smallint not null references keu_tahun_anggaran(tahun),
  ro_kode     text not null references keu_ro(kode),
  ver         int not null default 1 check (ver >= 1),
  ident_ver   int not null check (ident_ver >= 1),               -- versi identifikasi sah yang menjadi dasar pada penyimpanan terakhir
  kebijakan_id bigint references keu_kebijakan_lembar(id),       -- lembar kebijakan yang berlaku saat penyimpanan terakhir (null = belum ada)
  isi         jsonb not null check (jsonb_typeof(isi) = 'object' and octet_length(isi::text) <= 400000),
  status      text not null check (status in ('draf','final')),
  pasca_h15   boolean not null default false,
  dibuat_oleh bigint references sigap_akun(id),
  diubah_oleh bigint references sigap_akun(id),
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now()
);

create table if not exists keu_ident_lanjutan_versi (
  id           bigint generated always as identity primary key,
  ident_id     bigint not null references keu_ident(id),
  ver          int not null check (ver >= 1),
  isi          jsonb not null,
  status       text not null check (status in ('draf','final')),
  ident_ver    int not null,
  kebijakan_id bigint references keu_kebijakan_lembar(id),
  pasca_h15    boolean not null default false,
  alasan       text not null default '',
  oleh         bigint references sigap_akun(id),
  at           timestamptz not null default now(),
  unique (ident_id, ver)
);

create table if not exists keu_ident_dokumen (
  id            bigint generated always as identity primary key,
  ident_id      bigint not null references keu_ident(id),
  jenis         text not null check (jenis in ('undangan','pengantar','tugas')),
  kunci         text not null check (char_length(kunci) between 1 and 40),   -- undangan: kode kelas; pengantar: 'semua'; tugas: kode petugas
  nomor         text not null default '' check (char_length(nomor) <= 80),
  tanggal       date,
  ttd_akun      bigint references sigap_akun(id),
  ttd_nama      text not null default '',
  ttd_jabatan   text not null default '' check (char_length(ttd_jabatan) <= 120),
  status        text not null default 'konsep' check (status in ('konsep','terbit')),
  lanjutan_ver  int,                                              -- versi lanjutan saat diterbitkan
  catatan       text not null default '',
  dibuat_oleh   bigint references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now(),
  terbit_at     timestamptz,
  unique (ident_id, jenis, kunci)
);
create index if not exists keu_ident_dokumen_idx on keu_ident_dokumen(ident_id, jenis);

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_lanjutan'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_lanjutan for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_ident_lanjutan for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_lanjutan_versi'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_lanjutan_versi for each row execute function keu_ident_jaga();
    create trigger keu_t2_catat before update or delete on keu_ident_lanjutan_versi for each row execute function keu_catat_saja();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_ident_dokumen'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_ident_dokumen for each row execute function keu_ident_jaga();
    create trigger keu_t9_jejak after insert or update on keu_ident_dokumen for each row execute function keu_jejak();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Pemeriksa isi (murni) dan penentu status
-- ---------------------------------------------------------------------
-- tanggal "YYYY-MM-DD" yang benar-benar ada; null bila tidak sah
create or replace function keu_lanjutan_tgl(p text)
returns date language plpgsql immutable set search_path = public as $$
begin
  if p is null or p !~ '^\d{4}-\d\d-\d\d$' or p < '0001-01-01' then return null; end if;
  return p::date;
exception when others then return null;
end $$;

-- teks bila jsonb berupa string, selain itu null
create or replace function keu_lanjutan_teks(j jsonb)
returns text language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'string' then j #>> '{}' end
$$;

create or replace function keu_lanjutan_periksa(p_isi jsonb)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  g text[] := array[]::text[];
  kperan text[] := array['supervisor','kortim','pml','ppl','entri'];
  kjab text[] := array['ketua','wakil','pj_pengolahan','pj_kualitas','pj_lapangan','pj_admin','pj_logistik','pj_sdm','inda','innas'];
  kelas jsonb; pr jsonb; pt jsonb; e jsonb; n int; k text; x jsonb; v text; t1 date; t2 date; u jsonb; j jsonb;
  lihat text[] := array[]::text[]; nama_lihat text[] := array[]::text[]; nm text; lw text;
begin
  if p_isi is null or coalesce(jsonb_typeof(p_isi), '') <> 'object' then return array['Isi lanjutan harus berupa objek']; end if;

  -- wilayah tugas
  if p_isi ? 'wilayah' and (coalesce(jsonb_typeof(p_isi -> 'wilayah'), '') <> 'string' or char_length(p_isi ->> 'wilayah') > 2000) then
    g := g || 'Wilayah tugas harus berupa teks maksimal 2000 huruf'::text;
  end if;

  -- kelas
  kelas := coalesce(p_isi -> 'kelas', '[]'::jsonb);
  if coalesce(jsonb_typeof(kelas), '') <> 'array' or jsonb_array_length(kelas) > 60 then
    g := g || 'Daftar kelas harus berupa daftar maksimal 60 kelas'::text;
  else
    for n in 1..jsonb_array_length(kelas) loop
      e := kelas -> (n - 1);
      if coalesce(jsonb_typeof(e), '') <> 'object' then g := g || format('Kelas %s tidak valid', n); continue; end if;
      v := keu_lanjutan_teks(e -> 'id');
      if v is null or char_length(btrim(v)) not between 1 and 20 then g := g || format('Kelas %s: kode wajib (1 sampai 20 huruf)', n);
      elsif v = any (lihat) then g := g || format('Kelas %s: kode dobel', n);
      else lihat := lihat || v; end if;
      if coalesce(keu_lanjutan_teks(e -> 'sesi'), '') not in ('briefing','pelatihan') then g := g || format('Kelas %s: jenis sesi harus briefing atau pelatihan', n); end if;
      if (e ? 'nama') and coalesce(jsonb_typeof(e -> 'nama'), '') <> 'string' then g := g || format('Kelas %s: nama harus berupa teks', n);
      elsif char_length(coalesce(keu_lanjutan_teks(e -> 'nama'), '')) > 120 then g := g || format('Kelas %s: nama maksimal 120 huruf', n); end if;
      if (e ? 'periode') and coalesce(jsonb_typeof(e -> 'periode'), '') <> 'string' then g := g || format('Kelas %s: periode harus berupa teks', n);
      elsif char_length(coalesce(keu_lanjutan_teks(e -> 'periode'), '')) > 60 then g := g || format('Kelas %s: periode maksimal 60 huruf', n); end if;
      if (e ? 'lokasi') and coalesce(jsonb_typeof(e -> 'lokasi'), '') <> 'string' then g := g || format('Kelas %s: lokasi harus berupa teks', n);
      elsif char_length(coalesce(keu_lanjutan_teks(e -> 'lokasi'), '')) > 200 then g := g || format('Kelas %s: lokasi maksimal 200 huruf', n); end if;
      if keu_lanjutan_teks(e -> 'metode') is null or keu_lanjutan_teks(e -> 'metode') not in ('','Daring','Luring','Hybrid') then g := g || format('Kelas %s: metode tidak dikenal', n); end if;
      if keu_lanjutan_teks(e -> 'tempat') is null or keu_lanjutan_teks(e -> 'tempat') not in ('','Kantor','Hotel dalam kota','Hotel luar kota','Lokasi lain') then g := g || format('Kelas %s: tempat tidak dikenal', n); end if;
      if keu_lanjutan_teks(e -> 'paket') is null or keu_lanjutan_teks(e -> 'paket') not in ('','fullday','fullboard') then g := g || format('Kelas %s: paket tidak dikenal', n); end if;
      if not keu_kebijakan_bulat(e -> 'oh', 0, 60) then g := g || format('Kelas %s: jumlah OH harus bilangan bulat 0 sampai 60', n); end if;
      v := keu_lanjutan_teks(e -> 'mulai'); t1 := null;
      if v is null or (v <> '' and keu_lanjutan_tgl(v) is null) then g := g || format('Kelas %s: tanggal mulai tidak valid', n); elsif v <> '' then t1 := keu_lanjutan_tgl(v); end if;
      v := keu_lanjutan_teks(e -> 'selesai'); t2 := null;
      if v is null or (v <> '' and keu_lanjutan_tgl(v) is null) then g := g || format('Kelas %s: tanggal selesai tidak valid', n); elsif v <> '' then t2 := keu_lanjutan_tgl(v); end if;
      if t1 is not null and t2 is not null and t2 < t1 then g := g || format('Kelas %s: tanggal selesai sebelum tanggal mulai', n); end if;
      u := e -> 'untuk';
      if coalesce(jsonb_typeof(u), '') <> 'array' then g := g || format('Kelas %s: peserta (untuk) harus berupa daftar peran yang dikenal', n);
      else
        for j in select * from jsonb_array_elements(u) loop
          if keu_lanjutan_teks(j) is null or not (keu_lanjutan_teks(j) = any (kperan)) then g := g || format('Kelas %s: peserta (untuk) harus berupa daftar peran yang dikenal', n); exit; end if;
        end loop;
      end if;
      if coalesce(jsonb_typeof(e -> 'fix'), '') <> 'boolean' then g := g || format('Kelas %s: penanda Fix harus ya atau tidak', n);
      elsif (e -> 'fix') = 'true'::jsonb then
        if coalesce(keu_lanjutan_teks(e -> 'metode'), '') = '' then g := g || format('Kelas %s: ditandai Fix tetapi metode belum dipilih', n); end if;
        if not keu_kebijakan_bulat(e -> 'oh', 1, 60) then g := g || format('Kelas %s: ditandai Fix tetapi jumlah OH belum diisi', n); end if;
        if coalesce(keu_lanjutan_teks(e -> 'mulai'), '') = '' or coalesce(keu_lanjutan_teks(e -> 'selesai'), '') = '' then g := g || format('Kelas %s: ditandai Fix tetapi tanggal belum lengkap', n); end if;
        if coalesce(keu_lanjutan_teks(e -> 'metode'), '') in ('Luring','Hybrid') and coalesce(keu_lanjutan_teks(e -> 'tempat'), '') = '' then g := g || format('Kelas %s: ditandai Fix tetapi tempat belum dipilih', n); end if;
        if coalesce(keu_lanjutan_teks(e -> 'tempat'), '') in ('Hotel dalam kota','Hotel luar kota') and coalesce(keu_lanjutan_teks(e -> 'paket'), '') = '' then g := g || format('Kelas %s: ditandai Fix tetapi paket belum dipilih', n); end if;
        if jsonb_typeof(u) = 'array' and jsonb_array_length(u) = 0 then g := g || format('Kelas %s: ditandai Fix tetapi peserta belum dipilih', n); end if;
      end if;
    end loop;
  end if;

  -- peran
  pr := p_isi -> 'peran';
  if coalesce(jsonb_typeof(pr), '') <> 'object' then g := g || 'Isian peran harus berupa objek'::text;
  else
    foreach k in array kperan loop
      x := pr -> k;
      if coalesce(jsonb_typeof(x), '') <> 'object' then g := g || format('Peran %s tidak ada', k); continue; end if;
      if coalesce(jsonb_typeof(x -> 'on'), '') <> 'boolean' then g := g || format('Peran %s: penanda pakai harus ya atau tidak', k); end if;
      if not keu_kebijakan_bulat(x -> 'nOrg', 0, 10000) then g := g || format('Peran %s: jumlah organik harus bilangan bulat 0 sampai 10000', k); end if;
      if not keu_kebijakan_bulat(x -> 'nMit', 0, 10000) then g := g || format('Peran %s: jumlah mitra harus bilangan bulat 0 sampai 10000', k); end if;
      if coalesce(jsonb_typeof(x -> 'translok'), '') <> 'boolean' then g := g || format('Peran %s: translok harus ya atau tidak', k); end if;
      if coalesce(jsonb_typeof(x -> 'penginapan'), '') <> 'boolean' then g := g || format('Peran %s: penginapan harus ya atau tidak', k); end if;
      if coalesce(jsonb_typeof(x -> 'fix'), '') <> 'boolean' then g := g || format('Peran %s: penanda Fix harus ya atau tidak', k);
      elsif (x -> 'fix') = 'true'::jsonb and (x -> 'on') = 'true'::jsonb and keu_kebijakan_bulat(x -> 'nOrg', 0, 10000) and keu_kebijakan_bulat(x -> 'nMit', 0, 10000)
            and keu_kebijakan_angka(x -> 'nOrg') + keu_kebijakan_angka(x -> 'nMit') < 1 then
        g := g || format('Peran %s: ditandai Fix tetapi jumlah petugas 0', k);
      end if;
    end loop;
  end if;

  -- petugas
  pt := coalesce(p_isi -> 'petugas', '[]'::jsonb);
  lihat := array[]::text[];
  if coalesce(jsonb_typeof(pt), '') <> 'array' or jsonb_array_length(pt) > 3000 then
    g := g || 'Daftar petugas harus berupa daftar maksimal 3000 petugas'::text;
  else
    for n in 1..jsonb_array_length(pt) loop
      e := pt -> (n - 1);
      if coalesce(jsonb_typeof(e), '') <> 'object' then g := g || format('Petugas %s tidak valid', n); continue; end if;
      v := keu_lanjutan_teks(e -> 'id');
      if v is null or char_length(btrim(v)) not between 1 and 20 then g := g || format('Petugas %s: kode wajib (1 sampai 20 huruf)', n);
      elsif v = any (lihat) then g := g || format('Petugas %s: kode dobel', n);
      else lihat := lihat || v; end if;
      nm := keu_lanjutan_teks(e -> 'nama');
      if nm is null or char_length(nm) > 120 then g := g || format('Petugas %s: nama harus berupa teks maksimal 120 huruf', n); nm := ''; end if;
      if coalesce(jsonb_typeof(e -> 'menyusul'), '') <> 'boolean' then g := g || format('Petugas %s: penanda menyusul harus ya atau tidak', n);
      elsif (e -> 'menyusul') = 'true'::jsonb then
        if btrim(nm) <> '' then g := g || format('Petugas %s: tandai menyusul hanya bila nama kosong', n); end if;
      elsif btrim(nm) = '' then g := g || format('Petugas %s: nama wajib diisi atau tandai menyusul', n);
      end if;
      if coalesce(jsonb_typeof(e -> 'baru'), '') <> 'boolean' then g := g || format('Petugas %s: penanda baru harus ya atau tidak', n); end if;
      v := keu_lanjutan_teks(e -> 'peran');
      if v is null or (v <> '' and not (v = any (kperan))) then g := g || format('Petugas %s: peran tidak dikenal', n); end if;
      v := keu_lanjutan_teks(e -> 'status');
      if v is null or v not in ('Organik','Mitra') then g := g || format('Petugas %s: status harus Organik atau Mitra', n);
      else
        lw := keu_lanjutan_teks(e -> 'sumber');
        if lw is null or lw not in ('','kepka','seleksi') then g := g || format('Petugas %s: sumber mitra tidak dikenal', n);
        elsif v = 'Mitra' and lw = '' then g := g || format('Petugas %s: sumber mitra wajib dipilih (kepka atau seleksi)', n);
        elsif v = 'Organik' and lw <> '' then g := g || format('Petugas %s: sumber mitra hanya untuk mitra', n); end if;
      end if;
      u := e -> 'jabatan';
      if coalesce(jsonb_typeof(u), '') <> 'array' then g := g || format('Petugas %s: jabatan tidak dikenal', n);
      else
        lw := '';
        for j in select * from jsonb_array_elements(u) loop
          if keu_lanjutan_teks(j) is null or not (keu_lanjutan_teks(j) = any (kjab)) or position('|' || keu_lanjutan_teks(j) || '|' in lw) > 0 then
            g := g || format('Petugas %s: jabatan tidak dikenal', n); exit;
          end if;
          lw := lw || '|' || keu_lanjutan_teks(j) || '|';
        end loop;
      end if;
      -- nama kembar (tanpa membedakan huruf besar kecil)
      if btrim(nm) <> '' then
        if lower(btrim(nm)) = any (nama_lihat) then g := g || format('Nama petugas dobel: %s', btrim(nm));
        else nama_lihat := nama_lihat || lower(btrim(nm)); end if;
      end if;
    end loop;
  end if;
  return g;
end $$;

-- Status data: 'final' bila semua kelas Fix, semua peran yang dipakai Fix, tidak ada nama yang menyusul, dan jumlah petugas bernama
-- sama dengan jumlah Fix per peran (organik dan mitra); sekurang-kurangnya ada satu kelas atau satu peran. Selain itu 'draf'. Isi harus sudah lolos periksa.
create or replace function keu_lanjutan_status(p_isi jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare
  kperan text[] := array['supervisor','kortim','pml','ppl','entri'];
  k text; x jsonb; e jsonb; n_pakai int := 0; n_kelas int;
begin
  n_kelas := coalesce(jsonb_array_length(case when jsonb_typeof(p_isi -> 'kelas') = 'array' then p_isi -> 'kelas' end), 0);
  for e in select * from jsonb_array_elements(case when jsonb_typeof(p_isi -> 'kelas') = 'array' then p_isi -> 'kelas' else '[]'::jsonb end) loop
    if (e -> 'fix') is distinct from 'true'::jsonb then return 'draf'; end if;
  end loop;
  for e in select * from jsonb_array_elements(case when jsonb_typeof(p_isi -> 'petugas') = 'array' then p_isi -> 'petugas' else '[]'::jsonb end) loop
    if (e -> 'menyusul') = 'true'::jsonb then return 'draf'; end if;
  end loop;
  foreach k in array kperan loop
    x := p_isi -> 'peran' -> k;
    if (x -> 'on') = 'true'::jsonb then
      n_pakai := n_pakai + 1;
      if (x -> 'fix') is distinct from 'true'::jsonb then return 'draf'; end if;
      if (select count(*) from jsonb_array_elements(coalesce(p_isi -> 'petugas', '[]'::jsonb)) q where q ->> 'peran' = k and q ->> 'status' = 'Organik') <> (x ->> 'nOrg')::int then return 'draf'; end if;
      if (select count(*) from jsonb_array_elements(coalesce(p_isi -> 'petugas', '[]'::jsonb)) q where q ->> 'peran' = k and q ->> 'status' = 'Mitra') <> (x ->> 'nMit')::int then return 'draf'; end if;
    end if;
  end loop;
  if n_kelas = 0 and n_pakai = 0 then return 'draf'; end if;
  return 'final';
end $$;

-- ---------------------------------------------------------------------
-- 3. Menyimpan lanjutan
-- ---------------------------------------------------------------------
-- p_diubah: waktu diubah_at yang dibaca penyunting; bila sudah berbeda, ditolak (ada penyunting lain).
-- p_alasan: wajib (minimal 10 huruf) bila lanjutan yang sudah Final diubah sesudah H-15.
create or replace function keu_lanjutan_simpan(p_ident bigint, p_isi jsonb, p_alasan text default '', p_diubah timestamptz default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; l keu_ident_lanjutan; g text[]; v_st text; v_sah jsonb; v_pasca boolean; v_keb bigint; v_cat text := btrim(coalesce(p_alasan, ''));
  v_hari date := (now() at time zone 'Asia/Jakarta')::date; v_mulai date; v_ver int; v_at timestamptz; v_ada boolean;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang menyusun identifikasi lanjutan RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.status = 'dibatalkan' then raise exception 'Identifikasi dibatalkan; lanjutan tidak dapat diubah' using errcode = '23514'; end if;
  if i.ver < 1 then raise exception 'Identifikasi awal belum disahkan; lanjutan dapat diisi sesudah identifikasi awal disahkan' using errcode = '23514'; end if;
  g := keu_lanjutan_periksa(p_isi);
  if cardinality(g) > 0 then
    raise exception 'Isi lanjutan belum sah: %', array_to_string(g[1:5], '; ') || case when cardinality(g) > 5 then format(' (dan %s lainnya)', cardinality(g) - 5) else '' end using errcode = '23514';
  end if;
  v_st := keu_lanjutan_status(p_isi);
  select v.form into v_sah from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver;
  v_mulai := keu_ident_mulai_awal(v_sah, i.tahun::int);
  v_pasca := v_mulai is not null and v_hari >= v_mulai - 15;
  select b.lembar_id into v_keb from keu_v_kebijakan_berlaku b where b.tahun = i.tahun limit 1;
  select * into l from keu_ident_lanjutan where ident_id = i.id for update;
  v_ada := found;

  perform set_config('keu.via_fungsi', '1', true);
  if not v_ada then
    insert into keu_ident_lanjutan(ident_id, tahun, ro_kode, ver, ident_ver, kebijakan_id, isi, status, pasca_h15, dibuat_oleh, diubah_oleh)
      values (i.id, i.tahun, i.ro_kode, 1, i.ver, v_keb, p_isi, v_st, v_pasca, p_akun, p_akun) returning ver, diubah_at into v_ver, v_at;
    insert into keu_ident_lanjutan_versi(ident_id, ver, isi, status, ident_ver, kebijakan_id, pasca_h15, alasan, oleh) values (i.id, 1, p_isi, v_st, i.ver, v_keb, v_pasca, v_cat, p_akun);
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'lanjutan', null, v_st, i.ver, p_akun, 'Identifikasi lanjutan dibuat (versi 1, ' || v_st || ')');
  else
    if p_diubah is not null and p_diubah <> l.diubah_at then raise exception 'Isian sudah diubah orang lain; muat ulang halaman' using errcode = '40001'; end if;
    if l.isi = p_isi and l.ident_ver = i.ver and l.kebijakan_id is not distinct from v_keb then
      perform set_config('keu.via_fungsi', '', true);
      return jsonb_build_object('ver', l.ver, 'status', l.status, 'pasca_h15', l.pasca_h15, 'diubah_at', l.diubah_at, 'berubah', false);
    end if;
    if l.status = 'final' and v_pasca and l.isi is distinct from p_isi and char_length(v_cat) < 10 then
      raise exception 'Perubahan sesudah H-15 pada lanjutan Final wajib disertai alasan (minimal 10 huruf)' using errcode = '23514';
    end if;
    update keu_ident_lanjutan set ver = l.ver + 1, ident_ver = i.ver, kebijakan_id = v_keb, isi = p_isi, status = v_st, pasca_h15 = v_pasca, diubah_oleh = p_akun
      where id = l.id returning ver, diubah_at into v_ver, v_at;
    insert into keu_ident_lanjutan_versi(ident_id, ver, isi, status, ident_ver, kebijakan_id, pasca_h15, alasan, oleh) values (i.id, v_ver, p_isi, v_st, i.ver, v_keb, v_pasca, v_cat, p_akun);
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'lanjutan', l.status, v_st, i.ver, p_akun,
      'Identifikasi lanjutan versi ' || v_ver || ' (' || v_st || ')' || case when v_pasca then ', sesudah H-15' else '' end || case when v_cat <> '' then ': ' || v_cat else '' end);
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('ver', v_ver, 'status', v_st, 'pasca_h15', v_pasca, 'diubah_at', v_at, 'berubah', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_lanjutan_simpan(bigint, jsonb, text, timestamptz, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Dokumen turunan: simpan | terbit | cabut
-- ---------------------------------------------------------------------
create or replace function keu_ident_dokumen_simpan(p_ident bigint, p_jenis text, p_kunci text, p_aksi text, p_nomor text default '', p_tanggal date default null,
  p_ttd_akun bigint default null, p_ttd_jabatan text default '', p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; l keu_ident_lanjutan; d keu_ident_dokumen; v_nomor text := btrim(coalesce(p_nomor, '')); v_jab text := btrim(coalesce(p_ttd_jabatan, '')); v_cat text := btrim(coalesce(p_catatan, ''));
  v_nama text; v_ke text; v_ada boolean; v_kunci text := btrim(coalesce(p_kunci, ''));
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_jenis is null or p_jenis not in ('undangan','pengantar','tugas') then raise exception 'Jenis dokumen % tidak dikenal', p_jenis using errcode = '22023'; end if;
  if p_aksi is null or p_aksi not in ('simpan','terbit','cabut') then raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023'; end if;
  if char_length(v_kunci) not between 1 and 40 then raise exception 'Kunci dokumen wajib (1 sampai 40 huruf)' using errcode = '23514'; end if;
  select * into i from keu_ident where id = p_ident for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not (keu_boleh(p_akun, 'ident_susun', i.ro_kode) or keu_ident_punya(p_akun, 'TU')) then
    raise exception 'Akun % tidak berwenang mengurus dokumen identifikasi RO %', p_akun, i.ro_kode using errcode = '42501';
  end if;
  select * into l from keu_ident_lanjutan where ident_id = i.id;
  if not found then raise exception 'Identifikasi lanjutan belum ada; dokumen belum dapat dibuat' using errcode = '23514'; end if;
  if char_length(v_nomor) > 80 then raise exception 'Nomor surat maksimal 80 huruf' using errcode = '23514'; end if;
  select * into d from keu_ident_dokumen where ident_id = i.id and jenis = p_jenis and kunci = v_kunci for update;
  v_ada := found;
  if v_ada and d.status = 'terbit' and p_aksi <> 'cabut' then raise exception 'Dokumen sudah terbit; cabut dahulu bila perlu diubah' using errcode = '23514'; end if;

  perform set_config('keu.via_fungsi', '1', true);
  if p_aksi = 'cabut' then
    if not v_ada or d.status <> 'terbit' then raise exception 'Hanya dokumen yang sudah terbit yang dapat dicabut' using errcode = '23514'; end if;
    if char_length(v_cat) < 5 then raise exception 'Alasan pencabutan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    update keu_ident_dokumen set status = 'konsep', terbit_at = null, lanjutan_ver = null, catatan = v_cat where id = d.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'dokumen', 'terbit', 'konsep', i.ver, p_akun, 'Dokumen ' || p_jenis || ' ' || v_kunci || ' dicabut: ' || v_cat);
    v_ke := 'konsep';
  else
    if p_aksi = 'terbit' then
      if l.status <> 'final' then raise exception 'Dokumen hanya dapat diterbitkan bila identifikasi lanjutan berstatus Final (sekarang %)', l.status using errcode = '23514'; end if;
      if char_length(v_nomor) < 3 then raise exception 'Nomor surat wajib diisi (minimal 3 huruf) sebelum diterbitkan' using errcode = '23514'; end if;
      if p_tanggal is null then raise exception 'Tanggal surat wajib diisi sebelum diterbitkan' using errcode = '23514'; end if;
      if char_length(v_jab) < 3 then raise exception 'Jabatan penandatangan wajib diisi sebelum diterbitkan' using errcode = '23514'; end if;
      if p_ttd_akun is null then raise exception 'Penandatangan wajib dipilih sebelum diterbitkan' using errcode = '23514'; end if;
    end if;
    if p_ttd_akun is not null then
      select a.nama into v_nama from sigap_akun a where a.id = p_ttd_akun and a.aktif;
      if v_nama is null then raise exception 'Penandatangan tidak dikenal atau tidak aktif' using errcode = '23514'; end if;
      if not exists (select 1 from keu_penugasan t join keu_master_peran pr on pr.kode = t.peran_kode and pr.aktif
                      where t.akun_id = p_ttd_akun and t.dibatalkan_at is null and t.masa @> current_date and t.peran_kode in ('KETUA','PPK','KPA','TU')
                        and (pr.lingkup = 'global' or t.ro_kode = i.ro_kode)) then
        raise exception 'Penandatangan harus Kepala, PPK, Tata Usaha, atau ketua tim RO ini' using errcode = '23514';
      end if;
    end if;
    v_ke := case when p_aksi = 'terbit' then 'terbit' else 'konsep' end;
    if v_ada then
      update keu_ident_dokumen set nomor = v_nomor, tanggal = p_tanggal, ttd_akun = p_ttd_akun, ttd_nama = coalesce(v_nama, ''), ttd_jabatan = v_jab, status = v_ke,
             lanjutan_ver = case when v_ke = 'terbit' then l.ver end, terbit_at = case when v_ke = 'terbit' then now() end, catatan = ''
       where id = d.id;
    else
      insert into keu_ident_dokumen(ident_id, jenis, kunci, nomor, tanggal, ttd_akun, ttd_nama, ttd_jabatan, status, lanjutan_ver, terbit_at, dibuat_oleh)
        values (i.id, p_jenis, v_kunci, v_nomor, p_tanggal, p_ttd_akun, coalesce(v_nama, ''), v_jab, v_ke, case when v_ke = 'terbit' then l.ver end, case when v_ke = 'terbit' then now() end, p_akun);
    end if;
    if p_aksi = 'terbit' then
      insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'dokumen', 'konsep', 'terbit', i.ver, p_akun,
        'Dokumen ' || p_jenis || ' ' || v_kunci || ' diterbitkan, nomor ' || v_nomor || ' (lanjutan versi ' || l.ver || ')');
    end if;
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return v_ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_dokumen_simpan(bigint, text, text, text, text, date, bigint, text, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Tampilan, RLS, gerbang
-- ---------------------------------------------------------------------
create or replace view keu_v_ident_lanjutan with (security_invoker = true) as
select l.id, l.ident_id, l.tahun, l.ro_kode, l.ver, l.ident_ver, i.ver as ident_ver_sekarang, l.kebijakan_id, kb.ver as kebijakan_ver, l.isi, l.status, l.pasca_h15,
       l.dibuat_oleh, l.diubah_oleh, ak.nama as diubah_oleh_nama, l.dibuat_at, l.diubah_at
from keu_ident_lanjutan l
join keu_ident i on i.id = l.ident_id
left join keu_kebijakan_lembar kb on kb.id = l.kebijakan_id
left join sigap_akun ak on ak.id = l.diubah_oleh;

create or replace view keu_v_ident_lanjutan_versi with (security_invoker = true) as
select v.id, v.ident_id, v.ver, v.status, v.ident_ver, v.kebijakan_id, v.pasca_h15, v.alasan, ak.nama as oleh_nama, v.at as waktu, v.isi
from keu_ident_lanjutan_versi v left join sigap_akun ak on ak.id = v.oleh;

-- petugas hasil identifikasi lanjutan (versi terakhir): dibaca modul hilir (Delego, rekrutmen, surat tugas)
create or replace view keu_v_ident_petugas with (security_invoker = true) as
select l.ident_id, l.tahun, l.ro_kode, l.status as status_lanjutan, l.ver as lanjutan_ver, p.ord::int as urut,
       p.e ->> 'id' as kode, p.e ->> 'nama' as nama, (p.e ->> 'menyusul')::boolean as menyusul, nullif(p.e ->> 'peran', '') as peran,
       p.e ->> 'status' as status, nullif(p.e ->> 'sumber', '') as sumber, (p.e ->> 'baru')::boolean as baru, p.e -> 'jabatan' as jabatan
from keu_ident_lanjutan l
cross join lateral jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) with ordinality as p(e, ord);

create or replace view keu_v_ident_dokumen with (security_invoker = true) as
select d.id, d.ident_id, d.jenis, d.kunci, d.nomor, d.tanggal, d.ttd_akun, d.ttd_nama, d.ttd_jabatan, d.status, d.lanjutan_ver, d.catatan, d.dibuat_at, d.diubah_at, d.terbit_at
from keu_ident_dokumen d;

-- calon penandatangan: Kepala, PPK, Tata Usaha, dan ketua tim (per RO)
create or replace view keu_v_ident_ttd with (security_invoker = true) as
select t.akun_id, a.nama as akun_nama, t.peran_kode, t.ro_kode
from keu_penugasan t join sigap_akun a on a.id = t.akun_id and a.aktif
where t.dibatalkan_at is null and t.masa @> current_date and t.peran_kode in ('KETUA','PPK','KPA','TU');

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_ident_lanjutan','keu_ident_lanjutan_versi','keu_ident_dokumen')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke execute on function keu_lanjutan_tgl(text), keu_lanjutan_teks(jsonb) from public, anon, authenticated;
grant execute on function keu_lanjutan_tgl(text), keu_lanjutan_teks(jsonb) to service_role;
revoke execute on function keu_lanjutan_periksa(jsonb), keu_lanjutan_status(jsonb) from public, anon, authenticated;
grant execute on function keu_lanjutan_periksa(jsonb), keu_lanjutan_status(jsonb) to service_role;
revoke all on keu_v_ident_lanjutan, keu_v_ident_lanjutan_versi, keu_v_ident_petugas, keu_v_ident_dokumen, keu_v_ident_ttd from anon, authenticated, public;
grant select on keu_v_ident_lanjutan, keu_v_ident_lanjutan_versi, keu_v_ident_petugas, keu_v_ident_dokumen, keu_v_ident_ttd to service_role;

-- daftar izin gerbang keu_jalankan: hanya menambah nama
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_lanjutan_simpan''' in d) = 0 then
    d := replace(d, '''keu_adm_aksi'',', '''keu_adm_aksi'',''keu_lanjutan_simpan'',''keu_ident_dokumen_simpan'',');
    if position('''keu_lanjutan_simpan''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
