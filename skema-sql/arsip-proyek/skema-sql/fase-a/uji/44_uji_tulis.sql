\set ON_ERROR_STOP on
-- Uji berkas l: gerbang tulis keu_tulis. Dijalankan sesudah 43.
create or replace function pg_temp.gagal(p_sql text, p_state text default null) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'SEHARUSNYA GAGAL: %', p_sql;
exception when others then
  if sqlerrm like 'SEHARUSNYA GAGAL%' then raise; end if;
  if p_state is not null and sqlstate <> p_state then raise exception 'SQLSTATE % bukan % untuk: % (%)', sqlstate, p_state, p_sql, sqlerrm; end if;
end $$;
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'GAGAL: %', p_msg; end if; end $$;

do $$
declare h jsonb; v_id bigint;
begin
  -- sesi aplikasi kosong: gerbang menyetel akun sendiri
  perform set_config('app.akun_id', '', true);
  h := keu_tulis(1, 'keu_master_satuan', 'insert', '{"kode":"ZZTEST","arti":"satuan uji gerbang"}');
  perform pg_temp.ok(h ->> 'kode' = 'ZZTEST' and h ->> 'aktif' = 'true', 'insert mengembalikan baris lengkap dengan nilai bawaan');
  perform pg_temp.ok(keu_akun_sesi() = 1, 'akun pelaku disetel selama transaksi');
  -- hak: bendahara tidak boleh mengubah master
  perform pg_temp.gagal($q$select keu_tulis(7, 'keu_master_satuan', 'insert', '{"kode":"ZZTES2","arti":"oleh bendahara"}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_tulis(7, 'keu_master_satuan', 'update', '{"arti":"diubah bendahara"}', '{"kode":"ZZTEST"}')$q$, '42501');
  -- update oleh admin
  h := keu_tulis(1, 'keu_master_satuan', 'update', '{"arti":"satuan uji diubah","aktif":false}', '{"kode":"ZZTEST"}');
  perform pg_temp.ok(h ->> 'arti' = 'satuan uji diubah' and h ->> 'aktif' = 'false', 'update mengembalikan baris baru');
  perform pg_temp.ok((select arti from keu_master_satuan where kode = 'ZZTEST') = 'satuan uji diubah', 'update tersimpan');
  -- kunci
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'update', '{"arti":"x"}', '{"arti":"y"}')$q$, '23514');   -- bukan kunci utama
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'update', '{"arti":"x"}', null)$q$, '23514');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'update', '{"kode":"ZZTES9"}', '{"kode":"ZZTEST"}')$q$, '23514');   -- ubah kunci
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'update', '{"arti":"x"}', '{"kode":"TIDAKADA"}')$q$, 'P0002');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'update', '{"arti":"x"}', '{"kode":"ZZTEST","arti":"y"}')$q$, '23514');   -- kunci berlebih
  -- validasi gerbang
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'insert', '{"kode":"ZZTES3","tidak_ada":1}')$q$, '23514');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_nggak_ada', 'insert', '{"a":1}')$q$, '42P01');
  perform pg_temp.gagal($q$select keu_tulis(1, 'sigap_akun', 'update', '{"super":true}', '{"id":12}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_struktur_usulan_riwayat', 'insert', '{"aksi":"x"}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan; drop table x', 'insert', '{"a":1}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'delete', '{"kode":"ZZTEST"}', '{"kode":"ZZTEST"}')$q$, '22023');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'insert', '{}')$q$, '22023');
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'insert', '[1]')$q$, '22023');
  perform pg_temp.gagal($q$select keu_tulis(null, 'keu_master_satuan', 'insert', '{"kode":"ZZTES4","arti":"tanpa akun"}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_tulis(99999, 'keu_master_satuan', 'insert', '{"kode":"ZZTES4","arti":"akun tidak ada"}')$q$, '42501');
  -- CHECK tabel tetap berlaku
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_master_satuan', 'insert', '{"kode":"zzkecil","arti":"huruf kecil"}')$q$);
  -- kolom identitas tidak bisa diisi
  perform pg_temp.gagal($q$select keu_tulis(1, 'keu_akses_adm', 'insert', '{"id":777,"akun_id":12,"ro_kode":"2906.BMA.005","berlaku_mulai":"2026-10-01"}')$q$);
  -- penjaga status: status usulan struktur tidak bisa diubah lewat gerbang
  select id into v_id from keu_struktur_usulan where status = 'draf' order by id limit 1;
  if v_id is not null then
    perform pg_temp.gagal(format($q$select keu_tulis(3, 'keu_struktur_usulan', 'update', '{"status":"sah"}', '{"id":%s}')$q$, v_id));
  end if;
  -- hak fungsi
  perform pg_temp.ok(not has_function_privilege('anon', 'keu_tulis(bigint,text,text,jsonb,jsonb)', 'execute')
                     and not has_function_privilege('authenticated', 'keu_tulis(bigint,text,text,jsonb,jsonb)', 'execute')
                     and has_function_privilege('service_role', 'keu_tulis(bigint,text,text,jsonb,jsonb)', 'execute'), 'hak eksekusi hanya service_role');
  perform pg_temp.ok(exists (select 1 from sigap_audit where aksi = 'keu.keu_master_satuan.insert' and akun_id = 1), 'tulis lewat gerbang tercatat di audit dengan akun pelaku');
end $$;

-- ================= gerbang panggil keu_jalankan =================
do $$
declare h jsonb; v_id bigint; v_versi bigint;
begin
  perform set_config('app.akun_id', '', true);
  perform pg_temp.ok(keu_jalankan(3, 'keu_boleh', '{"p_kew":"sahkan"}') = 'true'::jsonb, 'PPK boleh sahkan');
  perform pg_temp.ok(keu_jalankan(7, 'keu_boleh', '{"p_kew":"sahkan"}') = 'false'::jsonb, 'bendahara tidak boleh sahkan');
  perform pg_temp.ok(keu_jalankan(1, 'keu_ro_kro', '{"p":"2906.BMA.005"}') = '"2906.BMA"'::jsonb, 'fungsi bantu skalar teks');
  -- daftar izin, argumen
  perform pg_temp.gagal($q$select keu_jalankan(1, 'keu_tulis', '{}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(1, 'keu_akun_sesi', '{}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(1, 'keu_struktur_kode_baru', '{}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(1, 'now', '{}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(null, 'keu_boleh', '{"p_kew":"sahkan"}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(99999, 'keu_boleh', '{"p_kew":"sahkan"}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(1, 'keu_boleh', '{"p_kew":"sahkan","p_akun":7}')$q$, '22023');   -- akun tidak dari klien
  perform pg_temp.gagal($q$select keu_jalankan(1, 'keu_boleh', '{"p_kew":"sahkan","ngawur":1}')$q$, '23514');
  perform pg_temp.gagal($q$select keu_jalankan(1, 'keu_boleh', '[1]')$q$, '22023');
  perform pg_temp.gagal($q$select keu_jalankan(1, 'keu_ro_kro', '{"p":{"a":1}}')$q$, '22023');
  -- hak ditegakkan karena akun disetel (usul struktur)
  h := keu_jalankan(6, 'keu_struktur_usul', '{"p_level":"komponen","p_induk":"2906.BMA.005","p_kode":"071","p_uraian":"Komponen lewat gerbang panggil","p_sumber":"dalam"}');
  v_id := (h #>> '{}')::bigint;
  perform pg_temp.ok((select status = 'draf' and dibuat_oleh = 6 from keu_struktur_usulan where id = v_id), 'usulan dibuat atas nama akun pelaku');
  perform pg_temp.gagal($q$select keu_jalankan(7, 'keu_struktur_usul', '{"p_level":"komponen","p_induk":"2906.BMA.005","p_kode":"072","p_uraian":"Oleh bendahara","p_sumber":"dalam"}')$q$, '42501');
  perform pg_temp.ok(keu_jalankan(6, 'keu_struktur_aksi', format('{"p_id":%s,"p_aksi":"ajukan"}', v_id)::jsonb) = '"menunggu_ketua"'::jsonb, 'fungsi teks mengembalikan status');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_struktur_aksi', '{"p_id":%s,"p_aksi":"setuju_ketua"}')$q$, v_id), '42501');   -- admin RO bukan ketua
  perform pg_temp.ok(keu_jalankan(4, 'keu_struktur_aksi', format('{"p_id":%s,"p_aksi":"setuju_ketua"}', v_id)::jsonb) = '"menunggu_ppk"'::jsonb, 'ketua setuju');
  -- fungsi tanpa p_akun (memakai sesi): hak tetap ditegakkan
  perform set_config('app.akun_id', '', true);   -- seperti SQL editor
  insert into keu_pok_versi(tahun, nomor_revisi, jenis, tanggal_efektif, hash_berkas) values (2026, 20, 'revisi', '2026-10-30', repeat('c', 64)) returning id into v_versi;
  perform pg_temp.gagal(format($q$select keu_jalankan(7, 'keu_pok_berlakukan', '{"p_versi":%s,"p_abaikan_selisih":true}')$q$, v_versi), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_pok_berlakukan', '{"p_versi":%s,"p_abaikan_selisih":true}')$q$, v_versi), '42501');
  update keu_pok_versi set status = 'dibatalkan' where id = v_versi;
  -- hasil himpunan (setof) dan jsonb argumen
  perform pg_temp.ok(jsonb_typeof(keu_jalankan(4, 'keu_kekurangan_saran', '{"p_tambahan":999999}')) = 'array', 'fungsi himpunan mengembalikan larik');
  perform pg_temp.ok(not has_function_privilege('anon', 'keu_jalankan(bigint,text,jsonb)', 'execute') and not has_function_privilege('authenticated', 'keu_jalankan(bigint,text,jsonb)', 'execute')
                     and has_function_privilege('service_role', 'keu_jalankan(bigint,text,jsonb)', 'execute'), 'hak eksekusi keu_jalankan hanya service_role');
end $$;
