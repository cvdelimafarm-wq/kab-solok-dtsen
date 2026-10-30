\set ON_ERROR_STOP on
-- Uji status pengadaan (berkas 20261026b): hak, bentuk masukan, pencatatan status, tanpa perubahan, jejak, riwayat, kunci tulis langsung, izin.
-- Dijalankan sesudah migrasi a-n, za, zc, zf, dan 20261026b. Akun 354 memegang semua peran; akun lain pegawai biasa. Dibatalkan (rollback) di akhir.
begin;
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
create or replace function pg_temp.frm(p_nama text, p_ke text) returns jsonb language sql as $$
  select jsonb_build_object('nama', p_nama, 'periode', 'Triwulanan', 'keList', jsonb_build_array(p_ke),
    'jend', jsonb_build_object('mb', 2, 'mj', 'tgl', 'mn', 1, 'sb', 2, 'sj', 'akhir', 'sn', 0, 'perk', false), 'kecuali', '{}'::jsonb, 'instrumen', 'FASIH')
$$;

do $$
declare
  admin bigint := 354; z bigint; ro text := '2906.BMA.001'; ia bigint; ib bigint; ic bigint; r text;
begin
  perform set_config('app.akun_id', '', true);
  select id into z from sigap_akun where aktif and id <> admin and not exists (select 1 from keu_penugasan t where t.akun_id = sigap_akun.id and t.dibatalkan_at is null) order by id limit 1;
  insert into keu_ident(tahun, ro_kode, nama, status, ver, form, dibuat_oleh) values (2026, ro, 'UJI Pengadaan A', 'sah', 1, pg_temp.frm('UJI Pengadaan A', 'Triwulan I'), admin) returning id into ia;
  insert into keu_ident_versi(ident_id, ver, form) values (ia, 1, pg_temp.frm('UJI Pengadaan A', 'Triwulan I'));
  insert into keu_ident(tahun, ro_kode, nama, status, ver, form, dibuat_oleh) values (2026, ro, 'UJI Pengadaan B (belum sah)', 'draf', 0, pg_temp.frm('UJI Pengadaan B', 'Triwulan I'), admin) returning id into ib;
  insert into keu_ident(tahun, ro_kode, nama, status, ver, form, dibuat_oleh) values (2026, ro, 'UJI Pengadaan C (batal)', 'dibatalkan', 1, pg_temp.frm('UJI Pengadaan C', 'Triwulan I'), admin) returning id into ic;

  -- ===== prasyarat dan hak =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, z, jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'diajukan')::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', 999999, 'p_item', 'k1:paket', 'p_status', 'diajukan')::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ib, 'p_item', 'k1:paket', 'p_status', 'diajukan')::text), '23514');   -- belum sah
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ic, 'p_item', 'k1:paket', 'p_status', 'diajukan')::text), '23514');   -- dibatalkan

  -- ===== bentuk masukan =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', 'K1 Paket', 'p_status', 'diajukan')::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', '', 'p_status', 'diajukan')::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', repeat('a', 81), 'p_status', 'diajukan')::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'ngawur')::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'diajukan', 'p_rujukan', repeat('r', 101))::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'diajukan', 'p_catatan', repeat('c', 301))::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'batal')::text), '23514');                 -- batal tanpa alasan
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pengadaan_catat', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'batal', 'p_catatan', 'duh')::text), '23514');
  perform pg_temp.ok((select count(*) = 0 from keu_ident_pengadaan where ident_id = ia) and (select count(*) = 0 from keu_ident_pengadaan_jejak where ident_id = ia), 'penolakan tidak meninggalkan baris');

  -- ===== pencatatan =====
  r := keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_uraian', 'Pelatihan: paket fullday', 'p_status', 'belum'));
  perform pg_temp.ok(r = '"tetap"' or r = 'tetap', '"belum" untuk butir baru tanpa isian = tanpa perubahan');
  perform pg_temp.ok((select count(*) = 0 from keu_ident_pengadaan where ident_id = ia), '"belum" tanpa isian tidak membuat baris');
  perform keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_uraian', 'Pelatihan: paket fullday', 'p_status', 'diajukan', 'p_rujukan', 'Permintaan 12/PBJ/2026'));
  perform pg_temp.ok((select status = 'diajukan' and rujukan = 'Permintaan 12/PBJ/2026' and uraian like 'Pelatihan%' and diubah_oleh = admin from keu_ident_pengadaan where ident_id = ia and item = 'k1:paket'), 'status diajukan tersimpan lengkap');
  -- sama persis: tanpa jejak baru
  perform keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'diajukan', 'p_rujukan', 'Permintaan 12/PBJ/2026'));
  perform pg_temp.ok((select count(*) = 1 from keu_ident_pengadaan_jejak where ident_id = ia), 'isian sama persis tidak menambah jejak');
  -- diproses lalu selesai; uraian lama dipertahankan bila tidak dikirim
  perform keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'diproses', 'p_rujukan', 'SPK 03/2026'));
  perform keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'selesai', 'p_rujukan', 'SPK 03/2026', 'p_catatan', 'Sudah diterima'));
  perform pg_temp.ok((select count(*) = 1 and max(status) = 'selesai' and max(uraian) like 'Pelatihan%' from keu_ident_pengadaan where ident_id = ia), 'satu baris per butir, uraian lama terjaga');
  perform pg_temp.ok((select string_agg(dari || '>' || ke, ',' order by id) = 'belum>diajukan,diajukan>diproses,diproses>selesai' from keu_ident_pengadaan_jejak where ident_id = ia and item = 'k1:paket'), 'jejak berurutan');
  -- batal dengan alasan, lalu dikembalikan ke belum (tanpa hapus)
  perform keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'batal', 'p_catatan', 'Kelas dibatalkan'));
  perform keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'k1:paket', 'p_status', 'belum'));
  perform pg_temp.ok((select status = 'belum' and rujukan = '' and catatan = '' from keu_ident_pengadaan where ident_id = ia and item = 'k1:paket') and (select count(*) = 5 from keu_ident_pengadaan_jejak where ident_id = ia), 'dikembalikan ke belum; jejak lengkap');
  -- butir kedua tidak saling mengganggu
  perform keu_jalankan(admin, 'keu_pengadaan_catat', jsonb_build_object('p_ident', ia, 'p_item', 'rapat:evaluasi', 'p_status', 'diajukan'));
  perform pg_temp.ok((select count(*) = 2 from keu_ident_pengadaan where ident_id = ia), 'dua butir, dua baris');
  perform pg_temp.ok((select count(*) = 6 from keu_ident_riwayat where ident_id = ia and aksi = 'pengadaan'), 'setiap perubahan tercatat di riwayat');

  -- ===== tampilan dan kunci tulis =====
  perform pg_temp.ok((select count(*) = 2 from keu_v_ident_pengadaan where ident_id = ia) and (select count(*) = 6 from keu_v_ident_pengadaan_jejak where ident_id = ia), 'tampilan');
  perform pg_temp.ok((select diubah_oleh_nama is not null from keu_v_ident_pengadaan where ident_id = ia limit 1), 'nama pelaku pada tampilan');
  perform set_config('app.akun_id', admin::text, true);
  perform pg_temp.gagal(format($q$insert into keu_ident_pengadaan(ident_id, item) values (%s, 'langsung')$q$, ia), '42501');
  perform pg_temp.gagal(format($q$update keu_ident_pengadaan set status = 'selesai' where ident_id = %s$q$, ia), '42501');
  perform pg_temp.gagal(format($q$delete from keu_ident_pengadaan where ident_id = %s$q$, ia), '42501');
  perform pg_temp.gagal(format($q$update keu_ident_pengadaan_jejak set ke = 'x' where ident_id = %s$q$, ia), '42501');
  perform set_config('app.akun_id', '', true);

  -- ===== izin =====
  perform pg_temp.ok(not has_function_privilege('anon', 'keu_pengadaan_catat(bigint,text,text,text,text,text,bigint)', 'execute') and not has_function_privilege('authenticated', 'keu_pengadaan_catat(bigint,text,text,text,text,text,bigint)', 'execute'), 'fungsi tidak dapat dipanggil anon dan authenticated');
  perform pg_temp.ok(not has_table_privilege('anon', 'keu_ident_pengadaan', 'select') and not has_table_privilege('authenticated', 'keu_ident_pengadaan_jejak', 'select') and has_table_privilege('service_role', 'keu_v_ident_pengadaan', 'select'), 'hak tabel dan tampilan');
  raise notice 'LULUS 56';
end $$;
rollback;
