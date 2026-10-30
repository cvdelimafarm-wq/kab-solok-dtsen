\set ON_ERROR_STOP on
-- Uji pelaksanaan (berkas 20261025zj): tautan identifikasi <-> kegiatan, usulan penugasan (status tiap petugas, penerapan hanya baris siap, tidak mengubah yang ada),
-- bahan pelaksanaan (penugasan, hari kerja, laporan harian, presensi, rapat evaluasi, tarif, realisasi anggaran), hak akses, kunci tulis langsung.
-- Dijalankan sesudah migrasi a-n, za, zc, zd, zf, zh, zj dan stub2 (tabel pelaksanaan). Akun 354 memegang semua peran; akun lain pegawai biasa. Dibatalkan (rollback) di akhir.
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
  isi jsonb; admin bigint := 354; z bigint; ro text := '2906.BMA.001'; ro2 text := '2906.BMA.002'; ia bigint; ix bigint; ig bigint; tid bigint; r jsonb; h jsonb; n int; kk jsonb;
  a4 bigint; a5 bigint; a6 bigint; a7 bigint;
begin
  perform set_config('app.akun_id', '', true);
  select id into z from sigap_akun where aktif and id <> admin and not exists (select 1 from keu_penugasan t where t.akun_id = sigap_akun.id and t.dibatalkan_at is null) order by id limit 1;
  a4 := 4; a5 := 5; a6 := 6; a7 := 7;
  insert into sigap_akun(id, nama, aktif) values (21, 'Akun 6', true);   -- nama kembar -> status ambigu

  insert into sigap_kegiatan(id, kode, nama, kode_anggaran, tanggal_mulai, tanggal_selesai, aktif, jenis) values
    (9001, 'uji_pendataan', 'UJI Pendataan Triwulan', '054.01.GG.2906.BMA.001.052.A.524113', '2026-12-01', '2026-12-15', true, 'pendataan'),
    (9002, 'uji_lain', 'UJI Kegiatan RO Lain', '054.01.GG.2906.BMA.002.052.A.524113', '2026-12-01', '2026-12-15', true, 'pendataan'),
    (9003, 'uji_mati', 'UJI Kegiatan Nonaktif', '054.01.GG.2906.BMA.001.052.A.524114', '2026-12-01', '2026-12-15', false, 'pelatihan');
  insert into sigap_kegiatan_tarif(kegiatan_id, peran, tarif, maks_hari_default, urutan) values (9001, 'pml', 170000, 10, 1), (9001, 'korwil', 170000, 10, 2), (9003, 'pml', 170000, 1, 1);

  insert into keu_ident(tahun, ro_kode, nama, status, ver, form, dibuat_oleh) values (2026, ro, 'UJI pelaksanaan A', 'sah', 1, pg_temp.frm('UJI pelaksanaan A', 'Triwulan IV'), admin) returning id into ia;
  insert into keu_ident_versi(ident_id, ver, form) values (ia, 1, pg_temp.frm('UJI pelaksanaan A', 'Triwulan IV'));
  insert into keu_ident(tahun, ro_kode, nama, status, ver, form, dibuat_oleh) values (2026, ro, 'UJI pelaksanaan draf', 'draf', 0, pg_temp.frm('UJI pelaksanaan draf', 'Triwulan IV'), admin) returning id into ix;

  -- ===== tautan =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_tautkan', %L::jsonb)$q$, z, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001)::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_tautkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 999999)::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_tautkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', 999999, 'p_kegiatan', 9001)::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_tautkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ix, 'p_kegiatan', 9001)::text), '23514');          -- belum sah
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_tautkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_fungsi', 'aneh')::text), '22023');
  perform pg_temp.ok((select count(*) = 3 and count(*) filter (where disarankan) = 2 and count(*) filter (where tertaut) = 0 from keu_v_kegiatan_calon where ident_id = ia and kegiatan_id in (9001, 9002, 9003)), 'calon: 2 dari 3 disarankan (kode RO sama), belum ada yang tertaut');
  perform pg_temp.ok((select count(*) = 0 from keu_v_kegiatan_calon where ident_id = ix), 'identifikasi belum sah tidak punya calon');
  tid := (keu_jalankan(admin, 'keu_ident_kegiatan_tautkan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_fungsi', 'pendataan', 'p_catatan', 'Pendataan utama')) #>> '{}')::bigint;
  perform pg_temp.ok((select disarankan and fungsi = 'pendataan' and catatan = 'Pendataan utama' from keu_ident_kegiatan where id = tid), 'tautan tersimpan dan ditandai disarankan');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_tautkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001)::text), '23514');            -- ganda
  perform keu_jalankan(admin, 'keu_ident_kegiatan_tautkan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9002));
  perform pg_temp.ok((select not disarankan from keu_ident_kegiatan where ident_id = ia and kegiatan_id = 9002), 'kegiatan RO lain boleh ditautkan tetapi tidak ditandai disarankan');
  perform pg_temp.ok((select count(*) = 2 from keu_v_ident_kegiatan where ident_id = ia) and (select count(*) filter (where tertaut) = 2 from keu_v_kegiatan_calon where ident_id = ia), 'tampilan tautan dan calon');
  perform pg_temp.ok((select n_penugasan = 0 from keu_v_ident_kegiatan where ident_id = ia and kegiatan_id = 9001), 'jumlah penugasan awal 0');
  perform pg_temp.ok((select count(*) = 2 from keu_ident_riwayat where ident_id = ia and aksi = 'kegiatan'), 'tautan tercatat di riwayat');

  -- kunci tulis langsung
  perform set_config('app.akun_id', admin::text, true);
  perform pg_temp.gagal(format($q$insert into keu_ident_kegiatan(ident_id, kegiatan_id) values (%s, 9003)$q$, ia), '42501');
  perform pg_temp.gagal(format($q$update keu_ident_kegiatan set catatan = 'x' where id = %s$q$, tid), '42501');
  perform pg_temp.gagal(format($q$delete from keu_ident_kegiatan where id = %s$q$, tid), '42501');
  perform set_config('app.akun_id', '', true);

  -- ===== usulan sebelum lanjutan ada =====
  perform pg_temp.ok(keu_jalankan(admin, 'keu_usulan_penugasan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001)) = '[]'::jsonb, 'tanpa lanjutan: usulan kosong');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_usulan_penugasan', %L::jsonb)$q$, z, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001)::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_usulan_penugasan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9003)::text), '23514');       -- belum ditautkan
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_usulan_terapkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_kode', jsonb_build_array('p1'))::text), '23514'); -- lanjutan belum ada

  -- ===== lanjutan Final: status tiap petugas =====
  perform keu_jalankan(admin, 'keu_lanjutan_simpan', jsonb_build_object('p_ident', ia, 'p_isi', base));
  perform pg_temp.ok((select status = 'final' from keu_ident_lanjutan where ident_id = ia), 'lanjutan uji berstatus Final');
  r := keu_jalankan(admin, 'keu_usulan_penugasan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001));
  perform pg_temp.ok(jsonb_array_length(r) = 4, 'empat butir usulan');
  perform pg_temp.ok(pg_temp.status_dari(r, 'p1') = 'siap', 'p1: akun tunggal, peran ber-tarif -> siap');
  perform pg_temp.ok(pg_temp.status_dari(r, 'p2') = 'siap', 'p2: nama beda huruf besar dan spasi ganda tetap cocok');
  perform pg_temp.ok(pg_temp.status_dari(r, 'p3') = 'tarif_belum', 'p3: peran ppl belum bertarif di kegiatan');
  perform pg_temp.ok(pg_temp.status_dari(r, 'p4') = 'ambigu', 'p4: dua akun bernama sama -> ambigu, tidak dipilihkan');
  perform pg_temp.ok((select (e ->> 'akun_id')::bigint = a4 and e ->> 'peran_sigap' = 'pml' from jsonb_array_elements(r) e where e ->> 'kode' = 'p1'), 'p1: akun 4, peran pml');
  perform pg_temp.ok((select e -> 'akun_id' = 'null'::jsonb and (e ->> 'calon')::int = 2 from jsonb_array_elements(r) e where e ->> 'kode' = 'p4'), 'p4: akun tidak diisi, calon 2');

  -- ===== penerapan =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_usulan_terapkan', %L::jsonb)$q$, z, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_kode', jsonb_build_array('p1'))::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_usulan_terapkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_kode', jsonb_build_array())::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_usulan_terapkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9003, 'p_kode', jsonb_build_array('p1'))::text), '23514'); -- kegiatan nonaktif (dan belum tertaut)
  -- penugasan yang sudah ada tidak boleh berubah
  insert into sigap_penugasan(kegiatan_id, akun_id, peran, maks_hari, sumber) values (9001, a5, 'ppl', 3, 'manual');
  r := keu_jalankan(admin, 'keu_usulan_penugasan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001));
  perform pg_temp.ok(pg_temp.status_dari(r, 'p2') = 'sudah_ada', 'p2: sudah punya penugasan -> sudah_ada');
  h := keu_jalankan(admin, 'keu_usulan_terapkan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_kode', jsonb_build_array('p1', 'p2', 'p3', 'p4', 'zzz')));
  perform pg_temp.ok((h ->> 'ditambah')::int = 1 and (h ->> 'lanjutan_ver')::int = 1, 'hanya p1 yang ditambahkan');
  perform pg_temp.ok((select count(*) = 1 from jsonb_array_elements(h -> 'dilewati') e where e ->> 'kode' = 'p2' and e ->> 'status' = 'sudah_ada'), 'p2 dilewati sebagai sudah_ada');
  perform pg_temp.ok((select count(*) = 1 from jsonb_array_elements(h -> 'dilewati') e where e ->> 'kode' = 'p3' and e ->> 'status' = 'tarif_belum'), 'p3 dilewati: tarif belum');
  perform pg_temp.ok((select count(*) = 1 from jsonb_array_elements(h -> 'dilewati') e where e ->> 'kode' = 'p4' and e ->> 'status' = 'ambigu'), 'p4 dilewati: ambigu');
  perform pg_temp.ok((select count(*) = 1 from jsonb_array_elements(h -> 'dilewati') e where e ->> 'kode' = '*' and e ->> 'status' = 'kode_tak_dikenal'), 'kode tak dikenal dihitung');
  perform pg_temp.ok((select peran = 'pml' and aktif and sumber = 'lanjutan:' || ia || ' v1' from sigap_penugasan where kegiatan_id = 9001 and akun_id = a4), 'penugasan baru: peran pml, aktif, sumber lanjutan');
  perform pg_temp.ok((select peran = 'ppl' and maks_hari = 3 and sumber = 'manual' from sigap_penugasan where kegiatan_id = 9001 and akun_id = a5), 'penugasan lama tidak berubah');
  perform pg_temp.ok((select count(*) = 2 from sigap_penugasan where kegiatan_id = 9001), 'total penugasan kegiatan = 2');
  perform pg_temp.ok((select count(*) = 1 from sigap_audit where aksi = 'keu.usulan_penugasan.terapkan' and (detail ->> 'ident_id')::bigint = ia), 'penerapan tercatat di audit');
  perform pg_temp.ok((select count(*) = 1 from keu_ident_riwayat where ident_id = ia and aksi = 'penugasan'), 'penerapan tercatat di riwayat identifikasi');
  perform pg_temp.ok((select count(*) = 1 from keu_notifikasi where ident_id = ia and jenis = 'penugasan_diterapkan' and akun_id = admin), 'PPK diberi tahu penugasan diterapkan');
  h := keu_jalankan(admin, 'keu_usulan_terapkan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_kode', jsonb_build_array('p1')));
  perform pg_temp.ok((h ->> 'ditambah')::int = 0, 'penerapan ulang tidak menggandakan');
  perform pg_temp.ok((select count(*) = 1 from keu_notifikasi where ident_id = ia and jenis = 'penugasan_diterapkan'), 'penerapan tanpa tambahan tidak mengirim notifikasi');
  perform pg_temp.ok((select n_penugasan = 2 from keu_v_ident_kegiatan where ident_id = ia and kegiatan_id = 9001), 'tampilan: jumlah penugasan 2');

  -- lanjutan Draf: usulan tetap terbaca, penerapan ditolak
  isi := jsonb_set(jsonb_set(base, '{petugas,3,nama}', '""'), '{petugas,3,menyusul}', 'true');
  perform keu_jalankan(admin, 'keu_lanjutan_simpan', jsonb_build_object('p_ident', ia, 'p_isi', isi));
  r := keu_jalankan(admin, 'keu_usulan_penugasan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001));
  perform pg_temp.ok(pg_temp.status_dari(r, 'p4') = 'menyusul', 'nama menyusul -> status menyusul');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_usulan_terapkan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001, 'p_kode', jsonb_build_array('p1'))::text), '23514');
  isi := jsonb_set(jsonb_set(base, '{petugas,3,nama}', '"Orang Tidak Ada"'), '{petugas,2,peran}', '""');
  perform keu_jalankan(admin, 'keu_lanjutan_simpan', jsonb_build_object('p_ident', ia, 'p_isi', isi));
  r := keu_jalankan(admin, 'keu_usulan_penugasan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9001));
  perform pg_temp.ok(pg_temp.status_dari(r, 'p4') = 'tidak_ada', 'nama tak ada di master -> tidak_ada');
  perform pg_temp.ok(pg_temp.status_dari(r, 'p3') = 'peran_kosong', 'peran kosong -> peran_kosong');

  -- ===== bahan pelaksanaan =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pelaksanaan_bahan', %L::jsonb)$q$, z, jsonb_build_object('p_ident', ia)::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_pelaksanaan_bahan', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', 999999)::text), '23514');
  insert into sigap_hari_kerja(penugasan_id, akun_id, tanggal) select s.id, s.akun_id, d from sigap_penugasan s, unnest(array['2026-12-02','2026-12-03','2026-12-04']::date[]) d where s.kegiatan_id = 9001 and s.akun_id = a4;
  insert into sigap_realisasi(kegiatan_id, petugas_id, tanggal, jumlah_realisasi, penugasan_id)
    select 9001, s.akun_id, d, 5, s.id from sigap_penugasan s, unnest(array['2026-12-02','2026-12-03']::date[]) d where s.kegiatan_id = 9001 and s.akun_id = a4;
  insert into sigap_realisasi(kegiatan_id, petugas_id, tanggal, jumlah_realisasi, penugasan_id) values (9001, a5, '2026-12-20', 2, null);   -- tanpa penugasan_id: dicocokkan lewat akun
  insert into sigap_rapat(judul, aktif, sasaran_kegiatan_id) values ('Rapat Evaluasi Triwulan IV', true, 9001), ('Rapat persiapan', true, 9001), ('Evaluasi lain', false, 9001);
  insert into sigap_pelatihan_presensi(kegiatan_id, akun_id, diterima) values (9001, a4, true), (9001, a4, true), (9001, a5, false);
  insert into keu_v_realisasi_terbaru(tahun, sampai_tanggal, ro_kode, akun_kode, pagu, real_sd, sisa) values
    (2026, '2026-12-10', ro, '524113', 1000000, 400000, 600000), (2026, '2026-12-10', ro, '524113', 500000, 100000, 400000), (2026, '2026-12-10', ro, '521211', 200000, 0, 200000),
    (2026, '2026-12-10', ro2, '524113', 999, 999, 0);
  h := keu_jalankan(admin, 'keu_pelaksanaan_bahan', jsonb_build_object('p_ident', ia));
  perform pg_temp.ok(jsonb_array_length(h -> 'kegiatan') = 2 and (h ->> 'ro_kode') = ro and (h ->> 'tahun')::int = 2026, 'bahan: dua kegiatan tertaut, RO dan tahun benar');
  kk := (select e from jsonb_array_elements(h -> 'kegiatan') e where (e ->> 'id')::bigint = 9001);
  perform pg_temp.ok(kk ->> 'mulai' = '2026-12-01' and kk ->> 'selesai' = '2026-12-15' and kk ->> 'fungsi' = 'pendataan' and jsonb_array_length(kk -> 'tarif') = 2, 'bahan: periode kegiatan, fungsi, dan tarif');
  perform pg_temp.ok((kk ->> 'rapat_evaluasi')::int = 1, 'bahan: hanya rapat evaluasi aktif yang dihitung');
  perform pg_temp.ok((kk ->> 'presensi')::int = 1, 'bahan: presensi dihitung per akun yang diterima');
  perform pg_temp.ok((select (e ->> 'hari_kerja')::int = 3 and (e ->> 'laporan')::int = 2 and e ->> 'lapor_pertama' = '2026-12-02' and e ->> 'lapor_terakhir' = '2026-12-03' and e ->> 'peran' = 'pml'
                        from jsonb_array_elements(kk -> 'petugas') e where (e ->> 'akun_id')::bigint = a4), 'bahan: hari kerja dan laporan harian petugas akun 4');
  perform pg_temp.ok((select (e ->> 'laporan')::int = 1 and e ->> 'lapor_terakhir' = '2026-12-20' and (e ->> 'maks_hari')::int = 3
                        from jsonb_array_elements(kk -> 'petugas') e where (e ->> 'akun_id')::bigint = a5), 'bahan: laporan tanpa penugasan_id dicocokkan lewat akun; maks hari terbawa');
  perform pg_temp.ok((select (e ->> 'pagu')::numeric = 1500000 and (e ->> 'real_sd')::numeric = 500000 and (e ->> 'sisa')::numeric = 1000000 from jsonb_array_elements(h -> 'realisasi') e where e ->> 'akun' = '524113'), 'bahan: realisasi dijumlah per akun pada RO ini saja');
  perform pg_temp.ok(jsonb_array_length(h -> 'realisasi') = 2 and h ->> 'realisasi_sampai' = '2026-12-10', 'bahan: dua akun dan tanggal sampai');
  perform pg_temp.ok(jsonb_array_length((keu_jalankan(admin, 'keu_pelaksanaan_bahan', jsonb_build_object('p_ident', ix))) -> 'kegiatan') = 0, 'bahan: tanpa tautan -> daftar kegiatan kosong');

  -- ===== melepas tautan =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_lepas', %L::jsonb)$q$, z, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9002)::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_lepas', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9003)::text), '23514');
  perform pg_temp.ok((keu_jalankan(admin, 'keu_ident_kegiatan_lepas', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9002)) #>> '{}') = 'dilepas', 'tautan dilepas');
  perform pg_temp.ok((select count(*) = 1 from keu_v_ident_kegiatan where ident_id = ia) and (select count(*) = 1 from keu_ident_kegiatan where ident_id = ia and kegiatan_id = 9002 and dilepas_at is not null and dilepas_oleh = admin), 'dilepas tidak tampil tetapi jejaknya tetap ada');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_ident_kegiatan_lepas', %L::jsonb)$q$, admin, jsonb_build_object('p_ident', ia, 'p_kegiatan', 9002)::text), '23514');
  perform keu_jalankan(admin, 'keu_ident_kegiatan_tautkan', jsonb_build_object('p_ident', ia, 'p_kegiatan', 9002));
  perform pg_temp.ok((select count(*) = 2 from keu_ident_kegiatan where ident_id = ia and kegiatan_id = 9002), 'boleh ditautkan lagi sesudah dilepas (baris baru)');
  perform pg_temp.ok(jsonb_array_length((keu_jalankan(admin, 'keu_pelaksanaan_bahan', jsonb_build_object('p_ident', ia))) -> 'kegiatan') = 2, 'bahan memuat tautan aktif saja');

  -- ===== izin fungsi =====
  perform pg_temp.ok(not has_function_privilege('anon', 'keu_usulan_terapkan(bigint,bigint,text[],bigint)', 'execute') and not has_function_privilege('authenticated', 'keu_pelaksanaan_bahan(bigint,bigint)', 'execute'), 'fungsi tidak dapat dipanggil anon/authenticated');
  perform pg_temp.ok(not has_table_privilege('anon', 'keu_ident_kegiatan', 'select') and has_table_privilege('service_role', 'keu_v_kegiatan_calon', 'select'), 'hak tabel dan tampilan');
  raise notice 'LULUS 53';
end $$;
rollback;
