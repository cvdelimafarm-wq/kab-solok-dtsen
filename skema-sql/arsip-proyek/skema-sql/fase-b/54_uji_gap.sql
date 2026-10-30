\set ON_ERROR_STOP on
-- Uji Gap (berkas 20261025zl): penyimpanan laporan Gap berversi, pemeriksaan bentuk temuan, notifikasi temuan keras baru dan laporan akhir, tanggapan, hak, kunci tulis.
-- Dijalankan sesudah migrasi a-n, za, zc, zd, zf, zh, zj, zl dan stub2 (tabel pelaksanaan). Akun 354 memegang semua peran; akun lain pegawai biasa. Dibatalkan (rollback) di akhir.
\set ON_ERROR_STOP on
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
create or replace function pg_temp.status_dari(p_hasil jsonb, p_kode text) returns text language sql as $$
  select e ->> 'status' from jsonb_array_elements(p_hasil) e where e ->> 'kode' = p_kode
$$;


do $$
declare
  base jsonb := '{"v":1,"wilayah":"Nagari Contoh A","kelas":[{"id":"k1","nama":"Pelatihan Triwulan I","sesi":"pelatihan","periode":"Triwulan I","metode":"Luring","tempat":"Hotel dalam kota","lokasi":"Hotel Contoh, Arosuka","paket":"fullday","oh":2,"mulai":"2026-03-02","selesai":"2026-03-03","untuk":["pml","ppl"],"fix":true}],"peran":{"supervisor":{"on":false,"nOrg":0,"nMit":0,"translok":false,"penginapan":false,"fix":false},"kortim":{"on":false,"nOrg":0,"nMit":0,"translok":false,"penginapan":false,"fix":false},"pml":{"on":true,"nOrg":1,"nMit":1,"translok":true,"penginapan":false,"fix":true},"ppl":{"on":true,"nOrg":0,"nMit":2,"translok":false,"penginapan":false,"fix":true},"entri":{"on":false,"nOrg":0,"nMit":0,"translok":false,"penginapan":false,"fix":false}},"petugas":[{"id":"p1","nama":"Akun 4","menyusul":false,"peran":"pml","status":"Organik","sumber":"","baru":false,"jabatan":["ketua"]},{"id":"p2","nama":"akun  5","menyusul":false,"peran":"pml","status":"Mitra","sumber":"kepka","baru":false,"jabatan":[]},{"id":"p3","nama":"Akun 7","menyusul":false,"peran":"ppl","status":"Mitra","sumber":"seleksi","baru":true,"jabatan":["pj_lapangan"]},{"id":"p4","nama":"Akun 6","menyusul":false,"peran":"ppl","status":"Mitra","sumber":"kepka","baru":false,"jabatan":[]}]}';
  admin bigint := 354; z bigint; ro text := '2906.BMA.001'; ia bigint; r jsonb; gid bigint; g1 bigint; g4 bigint;
  t1 jsonb; t2 jsonb; t3 jsonb;
begin
  perform set_config('app.akun_id', '', true);
  select id into z from sigap_akun where aktif and id <> admin and not exists (select 1 from keu_penugasan t where t.akun_id = sigap_akun.id and t.dibatalkan_at is null) order by id limit 1;
  insert into sigap_kegiatan(id, kode, nama, kode_anggaran, tanggal_mulai, tanggal_selesai, aktif, jenis) values
    (9101, 'uji_gap_lalu', 'UJI Gap Pendataan Lalu', '054.01.GG.2906.BMA.001.052.A.524113', '2026-01-05', '2026-01-15', true, 'pendataan'),
    (9102, 'uji_gap_depan', 'UJI Gap Pendataan Depan', '054.01.GG.2906.BMA.001.052.A.524113', '2026-12-01', '2099-01-01', true, 'pendataan');
  insert into keu_ident(tahun, ro_kode, nama, status, ver, form, dibuat_oleh) values (2026, ro, 'UJI Gap A', 'sah', 1, pg_temp.frm('UJI Gap A', 'Triwulan I'), admin) returning id into ia;
  insert into keu_ident_versi(ident_id, ver, form) values (ia, 1, pg_temp.frm('UJI Gap A', 'Triwulan I'));

  t1 := jsonb_build_array(
    jsonb_build_object('kunci', 'laporan:1:kurang', 'kategori', 'laporan', 'tingkat', 'keras', 'pesan', 'Dua petugas kurang lapor', 'tuju', 'pl-laporan'),
    jsonb_build_object('kunci', 'jadwal:1:0', 'kategori', 'jadwal', 'tingkat', 'sedang', 'pesan', 'Kegiatan dibuka 3 hari lebih awal'));

  -- ===== prasyarat dan hak =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', t1)::text), '23514');      -- lanjutan belum ada
  perform keu_jalankan(admin, 'keu_lanjutan_simpan', jsonb_build_object('p_ident', ia, 'p_isi', base));
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, z, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', t1)::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', 999999, 'p_jenis', 'berjalan', 'p_temuan', t1)::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'aneh', 'p_temuan', t1)::text), '22023');

  -- ===== bentuk temuan =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', jsonb_build_object('x', 1))::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', t1 || t1)::text), '22023');                              -- kunci ganda
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', jsonb_build_array(jsonb_build_object('kunci', 'a', 'kategori', 'lain', 'tingkat', 'keras', 'pesan', 'p')))::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', jsonb_build_array(jsonb_build_object('kunci', 'a', 'kategori', 'biaya', 'tingkat', 'gawat', 'pesan', 'p')))::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', jsonb_build_array(jsonb_build_object('kunci', 'a', 'kategori', 'biaya', 'tingkat', 'info', 'pesan', '')))::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', jsonb_build_array(jsonb_build_object('kunci', repeat('k', 81), 'kategori', 'biaya', 'tingkat', 'info', 'pesan', 'p')))::text), '22023');
  perform pg_temp.ok((select count(*) = 0 from keu_gap where ident_id = ia), 'penyimpanan yang ditolak tidak meninggalkan baris');

  -- ===== versi 1: berjalan, satu keras =====
  r := keu_jalankan(admin, 'keu_gap_simpan', jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', t1, 'p_ringkas', jsonb_build_object('kegiatan', 1)));
  perform pg_temp.ok((r ->> 'ver')::int = 1 and (r ->> 'n_keras')::int = 1 and (r ->> 'baru_keras')::int = 1 and (r ->> 'tanpa_perubahan')::boolean is false, 'versi 1 tersimpan, 1 keras baru');
  g1 := (r ->> 'id')::bigint;
  perform pg_temp.ok((select n_keras = 1 and n_sedang = 1 and n_info = 0 and lanjutan_ver = 1 and jenis = 'berjalan' and ringkas = '{"kegiatan":1}'::jsonb from keu_gap where id = g1), 'hitungan tingkat dan ringkasan tersimpan');
  perform pg_temp.ok((select count(*) = 1 from keu_notifikasi where ident_id = ia and jenis = 'gap_keras' and akun_id = admin and tautan like '%/identifikasi/' || ia || '/gap'), 'PPK diberi tahu temuan keras');
  -- penyimpanan sama persis: tanpa versi baru dan tanpa notifikasi baru
  r := keu_jalankan(admin, 'keu_gap_simpan', jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', t1));
  perform pg_temp.ok((r ->> 'tanpa_perubahan')::boolean and (r ->> 'ver')::int = 1, 'tanpa perubahan dikenali');
  perform pg_temp.ok((select count(*) = 1 from keu_gap where ident_id = ia) and (select count(*) = 1 from keu_notifikasi where ident_id = ia and jenis = 'gap_keras'), 'tanpa versi dan notifikasi tambahan');

  -- ===== versi 2: sedang naik jadi keras + kunci keras baru =====
  t2 := jsonb_build_array(
    jsonb_build_object('kunci', 'laporan:1:kurang', 'kategori', 'laporan', 'tingkat', 'keras', 'pesan', 'Dua petugas kurang lapor'),
    jsonb_build_object('kunci', 'jadwal:1:0', 'kategori', 'jadwal', 'tingkat', 'keras', 'pesan', 'Kegiatan dibuka 3 hari lebih awal'),
    jsonb_build_object('kunci', 'biaya:521213', 'kategori', 'biaya', 'tingkat', 'keras', 'pesan', 'Kebutuhan melebihi sisa pagu'));
  r := keu_jalankan(admin, 'keu_gap_simpan', jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', t2));
  perform pg_temp.ok((r ->> 'ver')::int = 2 and (r ->> 'baru_keras')::int = 2, 'versi 2: dua keras baru (satu naik tingkat, satu kunci baru)');
  perform pg_temp.ok((select count(*) = 2 from keu_notifikasi where ident_id = ia and jenis = 'gap_keras'), 'notifikasi kedua dikirim');
  perform pg_temp.ok((select isi like '%Kegiatan dibuka%' and isi like '%Kebutuhan melebihi%' and isi not like '%Dua petugas kurang lapor%' from keu_notifikasi where ident_id = ia and jenis = 'gap_keras' order by id desc limit 1), 'isi notifikasi hanya memuat keras yang baru');
  -- versi 3: membaik, tidak ada keras baru -> tidak ada notifikasi
  t3 := jsonb_build_array(jsonb_build_object('kunci', 'evaluasi:rapat', 'kategori', 'evaluasi', 'tingkat', 'sedang', 'pesan', 'Belum ada rapat evaluasi'));
  r := keu_jalankan(admin, 'keu_gap_simpan', jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', t3));
  perform pg_temp.ok((r ->> 'ver')::int = 3 and (r ->> 'baru_keras')::int = 0 and (r ->> 'n_keras')::int = 0, 'versi 3 membaik');
  perform pg_temp.ok((select count(*) = 2 from keu_notifikasi where ident_id = ia and jenis = 'gap_keras'), 'tanpa keras baru tidak ada notifikasi');
  -- temuan kosong boleh disimpan sebagai bukti tidak ada gap
  perform keu_jalankan(admin, 'keu_gap_simpan', jsonb_build_object('p_ident', ia, 'p_jenis', 'berjalan', 'p_temuan', '[]'::jsonb));
  perform pg_temp.ok((select ver = 4 and n_keras = 0 and n_sedang = 0 and n_info = 0 from keu_gap where ident_id = ia order by ver desc limit 1), 'versi 4: temuan kosong tersimpan');

  -- ===== laporan akhir =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'akhir', 'p_temuan', t3)::text), '23514');      -- belum ada kegiatan tertaut
  perform keu_jalankan(admin, 'keu_ident_kegiatan_tautkan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9101));
  perform keu_jalankan(admin, 'keu_ident_kegiatan_tautkan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9102));
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_jenis', 'akhir', 'p_temuan', t3)::text), '23514');      -- 9102 belum berakhir
  perform keu_jalankan(admin, 'keu_ident_kegiatan_lepas', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9102));
  r := keu_jalankan(admin, 'keu_gap_simpan', jsonb_build_object('p_ident', ia, 'p_jenis', 'akhir', 'p_temuan', t3));
  g4 := (r ->> 'id')::bigint;
  perform pg_temp.ok((r ->> 'ver')::int = 5 and (select jenis = 'akhir' from keu_gap where id = g4), 'versi 5: laporan akhir (jenis beda dari sebelumnya walau isi serupa dengan versi 3)');
  perform pg_temp.ok((select count(*) = 1 from keu_notifikasi where ident_id = ia and jenis = 'gap_akhir' and akun_id = admin), 'PPK dan KPA diberi tahu laporan akhir');

  -- ===== tanggapan =====
  gid := g4;
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_tanggapi', %L::jsonb)$q$, z, jsonb_build_object('p_gap', gid, 'p_kunci', 'evaluasi:rapat', 'p_status', 'diterima')::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_tanggapi', %L::jsonb)$q$, admin, jsonb_build_object('p_gap', gid, 'p_kunci', 'tidak:ada', 'p_status', 'diterima')::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_tanggapi', %L::jsonb)$q$, admin, jsonb_build_object('p_gap', gid, 'p_kunci', 'evaluasi:rapat', 'p_status', 'ngawur')::text), '22023');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_tanggapi', %L::jsonb)$q$, admin, jsonb_build_object('p_gap', gid, 'p_kunci', 'evaluasi:rapat', 'p_status', 'dijelaskan', 'p_catatan', 'pendek')::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_gap_tanggapi', %L::jsonb)$q$, admin, jsonb_build_object('p_gap', 999999, 'p_kunci', 'evaluasi:rapat', 'p_status', 'diterima')::text), '23514');
  perform keu_jalankan(admin, 'keu_gap_tanggapi', jsonb_build_object('p_gap', gid, 'p_kunci', 'evaluasi:rapat', 'p_status', 'diterima'));
  perform keu_jalankan(admin, 'keu_gap_tanggapi', jsonb_build_object('p_gap', gid, 'p_kunci', 'evaluasi:rapat', 'p_status', 'dijelaskan', 'p_catatan', 'Rapat evaluasi dijadwalkan pekan depan'));
  perform pg_temp.ok((select count(*) = 1 and max(status) = 'dijelaskan' and max(catatan) like 'Rapat evaluasi%' from keu_v_gap_tanggapan where gap_id = gid), 'tanggapan diperbarui pada baris yang sama');

  -- ===== tampilan, riwayat, kunci tulis =====
  perform pg_temp.ok((select ver = 5 and jenis = 'akhir' from keu_v_gap_terbaru where ident_id = ia), 'tampilan terbaru: versi 5 akhir');
  perform pg_temp.ok((select count(*) = 5 from keu_v_gap where ident_id = ia and ro_kode = ro), 'lima versi pada tampilan');
  perform pg_temp.ok((select count(*) = 5 from keu_ident_riwayat where ident_id = ia and aksi = 'gap'), 'setiap penyimpanan tercatat di riwayat');
  perform pg_temp.gagal(format($q$update keu_gap set n_keras = 9 where id = %s$q$, g1), '42501');                                    -- versi tidak boleh diubah (penjaga tetap)
  perform pg_temp.gagal(format($q$delete from keu_gap where id = %s$q$, g1), '42501');
  perform set_config('app.akun_id', admin::text, true);
  perform pg_temp.gagal(format($q$insert into keu_gap(ident_id, ver, jenis) values (%s, 99, 'berjalan')$q$, ia), '42501');         -- tulis langsung ditolak
  perform pg_temp.gagal(format($q$insert into keu_gap_tanggapan(gap_id, kunci, status) values (%s, 'x', 'diterima')$q$, g1), '42501');
  perform set_config('app.akun_id', '', true);

  -- ===== izin =====
  perform pg_temp.ok(not has_function_privilege('anon', 'keu_gap_simpan(bigint,text,jsonb,jsonb,bigint)', 'execute') and not has_function_privilege('authenticated', 'keu_gap_tanggapi(bigint,text,text,text,bigint)', 'execute'), 'fungsi tidak dapat dipanggil anon dan authenticated');
  perform pg_temp.ok(not has_table_privilege('anon', 'keu_gap', 'select') and not has_table_privilege('authenticated', 'keu_gap_tanggapan', 'select') and has_table_privilege('service_role', 'keu_v_gap_terbaru', 'select'), 'hak tabel dan tampilan');
  raise notice 'LULUS 54';
end $$;
rollback;
