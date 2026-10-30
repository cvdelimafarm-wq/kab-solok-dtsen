-- =====================================================================
-- 20261024l_keu_tulis.sql  (Fase H / berkas l: gerbang tulis untuk aplikasi)
-- Aplikasi memakai supabase-js (PostgREST): tiap panggilan = satu transaksi, tidak bisa menjalankan
-- "set_config('app.akun_id', ...)" lebih dulu. Fungsi ini menyetel akun pelaku DI DALAM transaksi yang sama,
-- lalu menulis (insert atau update) ke satu tabel keu_. Semua penjaga tabel (trigger kewenangan, pembekuan,
-- status hanya lewat fungsi, audit) tetap berlaku karena akun pelaku terisi. Tidak ada hapus.
-- Aman diulang. Hanya service_role (aplikasi sisi server) yang boleh memanggil.
-- =====================================================================

create or replace function keu_tulis(p_akun bigint, p_tabel text, p_op text, p_data jsonb, p_kunci jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rel regclass; v_cols text; v_set text; v_where text; v_hasil jsonb; v_pk text[]; v_kunci_kol text[]; v_salah text;
begin
  if p_akun is null or not exists (select 1 from sigap_akun where id = p_akun and aktif) then
    raise exception 'Akun pelaku tidak dikenal atau tidak aktif' using errcode = '42501';
  end if;
  if p_op not in ('insert','update') then
    raise exception 'Operasi % tidak dikenal (hanya insert atau update; hapus permanen tidak tersedia)', p_op using errcode = '22023';
  end if;
  if p_tabel is null or p_tabel !~ '^keu_[a-z0-9_]+$' or p_tabel like '%\_riwayat' then
    raise exception 'Tabel % tidak dapat ditulis lewat gerbang ini', p_tabel using errcode = '42501';
  end if;
  v_rel := to_regclass('public.' || quote_ident(p_tabel));
  if v_rel is null or (select c.relkind from pg_class c where c.oid = v_rel) <> 'r' then
    raise exception 'Tabel % tidak ada', p_tabel using errcode = '42P01';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data = '{}'::jsonb then
    raise exception 'Data harus berupa objek JSON yang tidak kosong' using errcode = '22023';
  end if;
  -- kolom yang dikirim harus ada pada tabel
  select string_agg(k, ', ') into v_salah from jsonb_object_keys(p_data) k
   where not exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attname = k and a.attnum > 0 and not a.attisdropped);
  if v_salah is not null then
    raise exception 'Kolom tidak ada pada %: %', p_tabel, v_salah using errcode = '23514';
  end if;
  select array_agg(k order by k) into v_kunci_kol from jsonb_object_keys(p_data) k;
  perform set_config('app.akun_id', p_akun::text, true);

  if p_op = 'insert' then
    select string_agg(quote_ident(k), ', ') into v_cols from unnest(v_kunci_kol) k;
    execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1) returning to_jsonb(%s.*)',
                   v_rel, v_cols, v_cols, v_rel, p_tabel) into v_hasil using p_data;
  else
    -- update: p_kunci harus memuat tepat kolom kunci utama tabel
    select array_agg(a.attname::text order by a.attname) into v_pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
     where i.indrelid = v_rel and i.indisprimary;
    if v_pk is null then raise exception 'Tabel % tidak punya kunci utama; tidak dapat diubah lewat gerbang', p_tabel using errcode = '42501'; end if;
    if p_kunci is null or jsonb_typeof(p_kunci) <> 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_kunci) k) is distinct from v_pk then
      raise exception 'Kunci harus tepat kolom kunci utama %: %', p_tabel, array_to_string(v_pk, ', ') using errcode = '23514';
    end if;
    if exists (select 1 from unnest(v_kunci_kol) k where k = any (v_pk)) then
      raise exception 'Kolom kunci utama tidak boleh diubah' using errcode = '23514';
    end if;
    select string_agg(format('%I = r.%I', k, k), ', ') into v_set from unnest(v_kunci_kol) k;
    select string_agg(format('t.%I = kk.%I', k, k), ' and ') into v_where from unnest(v_pk) k;
    execute format('update %s t set %s from jsonb_populate_record(null::%s, $1) r, jsonb_populate_record(null::%s, $2) kk where %s returning to_jsonb(t.*)',
                   v_rel, v_set, v_rel, v_rel, v_where) into v_hasil using p_data, p_kunci;
    if v_hasil is null then raise exception 'Baris % tidak ditemukan', p_kunci using errcode = 'P0002'; end if;
  end if;
  return v_hasil;
end $$;

revoke execute on function keu_tulis(bigint, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function keu_tulis(bigint, text, text, jsonb, jsonb) to service_role;
comment on function keu_tulis(bigint, text, text, jsonb, jsonb) is 'Gerbang tulis aplikasi: menyetel akun pelaku lalu insert atau update satu baris keu_ (penjaga tabel tetap berlaku). Tanpa hapus.';

-- ---------------------------------------------------------------------
-- Gerbang panggil: menjalankan fungsi keu_ yang diizinkan dengan akun pelaku disetel di transaksi yang sama.
-- Banyak fungsi alur membaca akun dari sesi (keu_akun_sesi()) bila p_akun tidak diberikan; lewat PostgREST sesi itu kosong
-- dan pemeriksaan hak dilewati. Gerbang ini menutupnya: akun selalu disetel, dan p_akun (bila ada) selalu diisi akun itu.
-- Daftar fungsi yang boleh dipanggil ada di sini (satu-satunya sumber); fungsi bantu dan pemicu tidak termasuk.
-- ---------------------------------------------------------------------
create or replace function keu_jalankan(p_akun bigint, p_fungsi text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_izin text[] := array[
    'keu_adm_aksi','keu_adm_peta_atur','keu_adm_peta_lepas','keu_adm_buka','keu_adm_ro_terbuka','keu_adm_lembar',
    'keu_boleh','keu_peran_akun','keu_jadwal_aksi','keu_jadwal_bulanan',
    'keu_kekurangan_catat','keu_kekurangan_putuskan','keu_kekurangan_saran','keu_kekurangan_tarik','keu_kekurangan_tautkan_rab','keu_kekurangan_ubah',
    'keu_kelompok_akun','keu_ro_kro','keu_rab_bulan_cair',
    'keu_kk_izin','keu_kk_muat_ro','keu_kk_hapus_baris','keu_kk_pasangkan','keu_kk_putuskan','keu_kk_tolak',
    'keu_pok_berlakukan','keu_pok_unggah_baru','keu_pok_unggah_isi','keu_pok_unggah_lepas_padan','keu_pok_unggah_padankan','keu_pok_unggah_terima','keu_pok_unggah_tolak',
    'keu_rab_aksi','keu_rab_baru','keu_rab_hapus_baris','keu_rab_ratakan',
    'keu_realisasi_batalkan','keu_realisasi_masuk','keu_realisasi_padankan','keu_sah_tautkan_pok',
    'keu_struktur_aksi','keu_struktur_cocokkan','keu_struktur_padankan','keu_struktur_tolak_pusat','keu_struktur_ubah','keu_struktur_usul','keu_struktur_usulkan',
    'keu_tambahan_pagu_batal','keu_tambahan_pagu_catat','keu_usulan_aksi'];
  p record; v_n int; v_args text := ''; v_nama text; v_tipe text; v_val text; v_lit text; v_sql text; v_hasil jsonb; k text;
begin
  if p_akun is null or not exists (select 1 from sigap_akun where id = p_akun and aktif) then
    raise exception 'Akun pelaku tidak dikenal atau tidak aktif' using errcode = '42501';
  end if;
  if p_fungsi is null or not (p_fungsi = any (v_izin)) then
    raise exception 'Fungsi % tidak dapat dipanggil lewat gerbang ini', p_fungsi using errcode = '42501';
  end if;
  if p_args is null or jsonb_typeof(p_args) <> 'object' then
    raise exception 'Argumen harus berupa objek JSON' using errcode = '22023';
  end if;
  if p_args ? 'p_akun' then
    raise exception 'p_akun diisi oleh server, jangan dikirim' using errcode = '22023';
  end if;
  select count(*) into v_n from pg_proc where pronamespace = 'public'::regnamespace and proname = p_fungsi;
  if v_n <> 1 then raise exception 'Fungsi % tidak ada atau kelebihan beban (%)', p_fungsi, v_n using errcode = '42883'; end if;
  select oid, proargnames, proargtypes, proretset, prorettype, pronargs, pronargdefaults into p from pg_proc where pronamespace = 'public'::regnamespace and proname = p_fungsi;
  -- argumen yang dikirim harus dikenal
  select string_agg(a, ', ') into v_nama from jsonb_object_keys(p_args) a where not (a = any (coalesce(p.proargnames, array[]::text[])));
  if v_nama is not null then raise exception 'Argumen tidak dikenal untuk %: %', p_fungsi, v_nama using errcode = '23514'; end if;

  perform set_config('app.akun_id', p_akun::text, true);
  for i in 1 .. p.pronargs loop
    v_nama := p.proargnames[i];
    v_tipe := format_type(p.proargtypes[i - 1], null);
    if v_nama = 'p_akun' then
      v_lit := quote_literal(p_akun::text) || '::bigint';
    elsif p_args ? v_nama then
      if jsonb_typeof(p_args -> v_nama) = 'null' then
        v_lit := 'null::' || v_tipe;
      elsif v_tipe = 'jsonb' then
        v_lit := quote_literal((p_args -> v_nama)::text) || '::jsonb';
      elsif v_tipe = 'text[]' then
        v_lit := 'array(select jsonb_array_elements_text(' || quote_literal((p_args -> v_nama)::text) || '::jsonb))::text[]';
      elsif jsonb_typeof(p_args -> v_nama) in ('object','array') then
        raise exception 'Argumen % bertipe % tidak boleh berupa objek atau larik', v_nama, v_tipe using errcode = '22023';
      else
        v_lit := quote_literal(p_args ->> v_nama) || '::' || v_tipe;
      end if;
    elsif i <= p.pronargs - p.pronargdefaults then
      v_lit := 'null::' || v_tipe;   -- tanpa nilai bawaan dan tidak dikirim: null (fungsi sendiri yang menolak bila wajib)
    else
      continue;   -- punya nilai bawaan dan tidak dikirim: pakai nilai bawaan (notasi bernama)
    end if;
    v_args := v_args || case when v_args = '' then '' else ', ' end || quote_ident(v_nama) || ' => ' || v_lit;
  end loop;

  if p.prorettype = 'void'::regtype then
    execute format('select %I(%s)', p_fungsi, v_args);
    return null;
  elsif p.proretset then
    v_sql := format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I(%s) x', p_fungsi, v_args);
  else
    v_sql := format('select to_jsonb(%I(%s))', p_fungsi, v_args);
  end if;
  execute v_sql into v_hasil;
  return v_hasil;
end $$;

revoke execute on function keu_jalankan(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function keu_jalankan(bigint, text, jsonb) to service_role;
comment on function keu_jalankan(bigint, text, jsonb) is 'Gerbang panggil aplikasi: menyetel akun pelaku lalu memanggil fungsi keu_ dari daftar izin dengan argumen bernama (JSON). p_akun selalu diisi server.';
