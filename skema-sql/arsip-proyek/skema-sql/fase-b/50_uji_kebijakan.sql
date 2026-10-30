\set ON_ERROR_STOP on
-- Uji lembar kebijakan manajemen tim (berkas 20261025zd): paritas pemeriksa isi TS-SQL (27 kasus bersama lib/keu/__tests__/kebijakan.vektor.json),
-- hak, alur draf -> menunggu -> berlaku -> arsip, pengesahan paralel (semua ketua tim + PPK + KPA), revisi, pengembalian, penarikan, kunci isian, tulis langsung ditutup.
-- Dijalankan sesudah migrasi a-n, za, zc, dan zd. Akun 354 (Admin) memegang semua peran; akun lain dipakai sebagai ketua kedua dan pegawai biasa. Dibatalkan (rollback) di akhir.
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

do $$
declare
  vek jsonb := '{"base":{"strata":[{"k":"S1","dari":1,"sampai":4,"maks_jabatan":5,"persen_baru":null,"pengembangan":true},{"k":"S2","dari":5,"sampai":10,"maks_jabatan":4,"persen_baru":null,"pengembangan":true},{"k":"S3","dari":11,"sampai":19,"maks_jabatan":3,"persen_baru":null,"pengembangan":true},{"k":"S4","dari":20,"sampai":40,"maks_jabatan":3,"persen_baru":20,"pengembangan":false},{"k":"S5","dari":41,"sampai":60,"maks_jabatan":2,"persen_baru":20,"pengembangan":false},{"k":"S6","dari":61,"sampai":100,"maks_jabatan":2,"persen_baru":15,"pengembangan":false},{"k":"S7","dari":101,"sampai":200,"maks_jabatan":2,"persen_baru":10,"pengembangan":false},{"k":"S8","dari":201,"sampai":400,"maks_jabatan":1,"persen_baru":10,"pengembangan":false},{"k":"S9","dari":401,"sampai":null,"maks_jabatan":1,"persen_baru":5,"pengembangan":false}],"minimal":{"S1":{"ketua":1,"wakil":0,"pj_pengolahan":0,"pj_kualitas":0,"pj_lapangan":0,"pj_admin":0,"pj_logistik":0,"pj_sdm":0,"inda":0,"innas":0},"S2":{"ketua":1,"wakil":1,"pj_pengolahan":1,"pj_kualitas":0,"pj_lapangan":0,"pj_admin":0,"pj_logistik":0,"pj_sdm":0,"inda":0,"innas":0},"S3":{"ketua":1,"wakil":1,"pj_pengolahan":1,"pj_kualitas":1,"pj_lapangan":0,"pj_admin":1,"pj_logistik":0,"pj_sdm":0,"inda":0,"innas":0},"S4":{"ketua":1,"wakil":1,"pj_pengolahan":1,"pj_kualitas":2,"pj_lapangan":1,"pj_admin":1,"pj_logistik":0,"pj_sdm":0,"inda":0,"innas":0},"S5":{"ketua":1,"wakil":1,"pj_pengolahan":1,"pj_kualitas":2,"pj_lapangan":2,"pj_admin":2,"pj_logistik":0,"pj_sdm":0,"inda":0,"innas":0},"S6":{"ketua":1,"wakil":2,"pj_pengolahan":1,"pj_kualitas":3,"pj_lapangan":2,"pj_admin":2,"pj_logistik":1,"pj_sdm":0,"inda":0,"innas":0},"S7":{"ketua":1,"wakil":2,"pj_pengolahan":2,"pj_kualitas":3,"pj_lapangan":5,"pj_admin":3,"pj_logistik":1,"pj_sdm":1,"inda":0,"innas":0},"S8":{"ketua":1,"wakil":3,"pj_pengolahan":3,"pj_kualitas":3,"pj_lapangan":8,"pj_admin":4,"pj_logistik":2,"pj_sdm":2,"inda":0,"innas":0},"S9":{"ketua":1,"wakil":4,"pj_pengolahan":3,"pj_kualitas":4,"pj_lapangan":12,"pj_admin":6,"pj_logistik":3,"pj_sdm":3,"inda":0,"innas":0}},"rangkap":{"S1":["ketua","wakil","pj_pengolahan","pj_kualitas","pj_lapangan","pj_admin","pj_logistik","pj_sdm","inda","innas"],"S2":["ketua","pj_pengolahan","pj_kualitas","pj_lapangan","pj_admin","pj_logistik","pj_sdm","inda","innas"],"S3":["ketua","pj_kualitas","pj_lapangan","pj_admin","pj_logistik","pj_sdm","inda","innas"],"S4":["ketua","pj_kualitas","pj_lapangan","pj_logistik","pj_sdm","inda"],"S5":["ketua","pj_logistik","pj_sdm","inda"],"S6":["ketua","pj_sdm","inda"],"S7":["ketua","inda"],"S8":["ketua"],"S9":["ketua"]},"kompetensi":{"nilai_pelatihan_min":70,"nilai_seleksi_min":70,"ambang_ketat":20,"validasi_desktop":true},"param":[{"k":"hari_konsultasi","nama":"Hari tugas konsultasi","grup":"Konsultasi dan perjalanan","jenis":"angka","satuan":"hari","aturan":2,"kebijakan":2,"dasar":"","ket":""},{"k":"peserta_konsultasi","nama":"Jumlah peserta konsultasi","grup":"Konsultasi dan perjalanan","jenis":"angka","satuan":"orang","aturan":3,"kebijakan":3,"dasar":"","ket":""},{"k":"penginapan","nama":"Penginapan","grup":"Konsultasi dan perjalanan","jenis":"rujukan","rujukan":"SBM penginapan (provinsi dan golongan)","berkas":null,"dasar":"","ket":"Mengacu SBM; tabel rujukan menunggu berkas."},{"k":"maks_malam","nama":"Maksimal malam penginapan","grup":"Konsultasi dan perjalanan","jenis":"angka","satuan":"malam","aturan":1,"kebijakan":1,"dasar":"","ket":""},{"k":"uang_harian","nama":"Uang harian","grup":"Konsultasi dan perjalanan","jenis":"angka","satuan":"Rp per hari","aturan":380000,"kebijakan":380000,"dasar":"","ket":""},{"k":"transport","nama":"Transport","grup":"Konsultasi dan perjalanan","jenis":"rujukan","rujukan":"Matriks SK transport","berkas":null,"dasar":"","ket":"Mengacu matriks SK transport; tabel rujukan menunggu berkas."},{"k":"translok_kurang_8","nama":"Translok kurang dari 8 jam","grup":"Translok","jenis":"angka","satuan":"Rp","aturan":170000,"kebijakan":170000,"dasar":"","ket":""},{"k":"translok_lebih_8","nama":"Translok lebih dari 8 jam","grup":"Translok","jenis":"persen","acuan":"uang_harian","riil":true,"satuan":"% uang harian","aturan":60,"kebijakan":60,"dasar":"","ket":"Ditambah transportasi at cost (biaya riil, dibuktikan bukti pengeluaran)."},{"k":"maks_hari_translok","nama":"Maksimal hari translok","grup":"Translok","jenis":"angka","satuan":"hari","aturan":null,"kebijakan":null,"dasar":"","ket":"Tidak ada batas."},{"k":"jarak_translok","nama":"Jarak minimal translok","grup":"Translok","jenis":"angka","satuan":"km","arah":"min","aturan":5,"kebijakan":5,"dasar":"","ket":"Lebih dari 5 km."},{"k":"paket_fullday","nama":"Paket fullday dan fullboard","grup":"Pelatihan","jenis":"rujukan","rujukan":"SBM paket fullday dan fullboard","berkas":null,"dasar":"","ket":"Mengacu SBM; tabel rujukan menunggu berkas."},{"k":"maks_oh","nama":"Maksimal OH pelatihan","grup":"Pelatihan","jenis":"dokumen","teks":"Tidak diatur kabupaten; ikut surat atau juknis pusat.","dasar":"","ket":"Hanya rujukan; tidak dihitung otomatis."},{"k":"hotel_luar_kota","nama":"Hotel luar kota","grup":"Pelatihan","jenis":"yatidak","aturan":true,"kebijakan":true,"dasar":"","ket":"Bendera kebijakan: bila ya, pelatihan di hotel luar kota memakai akun 524119."},{"k":"maks_peserta_kelas","nama":"Maksimal peserta per kelas","grup":"Pelatihan","jenis":"angka","satuan":"orang","aturan":30,"kebijakan":30,"dasar":"","ket":""},{"k":"tarif_honor_mitra","nama":"Tarif honor mitra","grup":"Honor","jenis":"dokumen","teks":"Diatur di SPKL.","dasar":"","ket":"Hanya rujukan; tidak dihitung otomatis."},{"k":"batas_honor_mitra","nama":"Batas honor mitra per bulan","grup":"Honor","jenis":"angka","satuan":"Rp per bulan","aturan":4500000,"kebijakan":4500000,"dasar":"","ket":"Di luar translok."},{"k":"batas_honor_organik","nama":"Batas honor organik","grup":"Honor","jenis":"dokumen","teks":"Diatur di SPKL.","dasar":"","ket":"Hanya rujukan; tidak dihitung otomatis."},{"k":"pulsa_peserta","nama":"Pulsa peserta","grup":"Lain-lain","jenis":"angka","satuan":"Rp","aturan":100000,"kebijakan":100000,"dasar":"","ket":""},{"k":"pulsa_fasih","nama":"Pulsa FASIH","grup":"Lain-lain","jenis":"angka","satuan":"Rp per orang per bulan","aturan":100000,"kebijakan":100000,"dasar":"","ket":""},{"k":"konsumsi_rapat","nama":"Konsumsi rapat","grup":"Lain-lain","jenis":"angka","satuan":"Rp","aturan":40000,"kebijakan":40000,"dasar":"","ket":""},{"k":"batas_spj","nama":"Batas waktu SPJ","grup":"Lain-lain","jenis":"angka","satuan":"hari kerja","aturan":5,"kebijakan":5,"dasar":"","ket":""}]},"cases":[{"nama":"dasar","ops":[],"galat":[]},{"nama":"rentang S4 putus","ops":[{"op":"set","path":["strata",3,"dari"],"value":21}],"galat":["Rentang S4 tidak menyambung dengan strata sebelumnya"]},{"nama":"S9 tertutup","ops":[{"op":"set","path":["strata",8,"sampai"],"value":500}],"galat":["Rentang S9 harus terbuka (tanpa batas atas)"]},{"nama":"S1 tidak mulai 1","ops":[{"op":"set","path":["strata",0,"dari"],"value":2}],"galat":["Rentang S1 harus mulai dari 1"]},{"nama":"maks jabatan 0","ops":[{"op":"set","path":["strata",0,"maks_jabatan"],"value":0}],"galat":["Maksimal jabatan per orang S1 harus bilangan bulat 1 sampai 10"]},{"nama":"persen baru 120","ops":[{"op":"set","path":["strata",3,"persen_baru"],"value":120}],"galat":["Persen petugas baru S4 harus 0 sampai 100"]},{"nama":"ketua nol","ops":[{"op":"set","path":["minimal","S3","ketua"],"value":0}],"galat":["Ketua pada S3 minimal 1"]},{"nama":"minimal pecahan","ops":[{"op":"set","path":["minimal","S5","pj_admin"],"value":1.5}],"galat":["Minimal PJ administrasi pada S5 harus bilangan bulat 0 atau lebih"]},{"nama":"rangkap asing","ops":[{"op":"set","path":["rangkap","S2"],"value":["ketua","tukang"]}],"galat":["Rangkap S2: jabatan tukang tidak dikenal"]},{"nama":"rangkap bukan daftar","ops":[{"op":"set","path":["rangkap","S2"],"value":"ketua"}],"galat":["Rangkap S2 harus berupa daftar jabatan"]},{"nama":"nilai pelatihan 150","ops":[{"op":"set","path":["kompetensi","nilai_pelatihan_min"],"value":150}],"galat":["Kompetensi: nilai pelatihan minimal harus 0 sampai 100"]},{"nama":"ambang nol","ops":[{"op":"set","path":["kompetensi","ambang_ketat"],"value":0}],"galat":["Kompetensi: ambang ketat harus bilangan bulat 1 atau lebih"]},{"nama":"uang harian longgar","ops":[{"op":"set","path":["param",4,"kebijakan"],"value":400000}],"galat":["Parameter uang_harian: nilai kebijakan lebih longgar dari aturan"]},{"nama":"uang harian lebih ketat","ops":[{"op":"set","path":["param",4,"kebijakan"],"value":350000}],"galat":[]},{"nama":"jarak min longgar","ops":[{"op":"set","path":["param",9,"kebijakan"],"value":3}],"galat":["Parameter jarak_translok: nilai kebijakan lebih longgar dari aturan"]},{"nama":"jarak min lebih ketat","ops":[{"op":"set","path":["param",9,"kebijakan"],"value":8}],"galat":[]},{"nama":"hotel luar kota longgar","ops":[{"op":"set","path":["param",12,"aturan"],"value":false}],"galat":["Parameter hotel_luar_kota: nilai kebijakan lebih longgar dari aturan"]},{"nama":"hotel luar kota ketat","ops":[{"op":"set","path":["param",12,"kebijakan"],"value":false}],"galat":[]},{"nama":"aturan bukan angka","ops":[{"op":"set","path":["param",4,"aturan"],"value":"abc"}],"galat":["Parameter uang_harian: nilai harus angka"]},{"nama":"kebijakan kosong padahal ada aturan","ops":[{"op":"set","path":["param",8,"aturan"],"value":5}],"galat":["Parameter maks_hari_translok: nilai kebijakan wajib diisi"]},{"nama":"persen di luar rentang","ops":[{"op":"set","path":["param",7,"kebijakan"],"value":150}],"galat":["Parameter translok_lebih_8: nilai kebijakan lebih longgar dari aturan","Parameter translok_lebih_8: persen harus 0 sampai 100"]},{"nama":"acuan persen salah","ops":[{"op":"set","path":["param",7,"acuan"],"value":"tidak_ada"}],"galat":["Parameter translok_lebih_8: acuan harus parameter angka"]},{"nama":"parameter hilang","ops":[{"op":"del","path":["param",20]}],"galat":["Parameter batas_spj belum ada"]},{"nama":"parameter dobel","ops":[{"op":"tambah","path":["param"],"value":{"k":"pulsa_peserta","nama":"x","grup":"x","jenis":"angka","aturan":1,"kebijakan":1,"dasar":"","ket":""}}],"galat":["Parameter pulsa_peserta dobel"]},{"nama":"jenis asing","ops":[{"op":"set","path":["param",0,"jenis"],"value":"ajaib"}],"galat":["Parameter hari_konsultasi: jenis tidak dikenal"]},{"nama":"strata kurang","ops":[{"op":"del","path":["strata",8]}],"galat":["Strata harus tepat S1 sampai S9 berurutan"]},{"nama":"bukan objek","ops":[{"op":"ganti","value":[1,2]}],"galat":["Isi lembar harus berupa objek"]}]}'::jsonb;
  base jsonb; c jsonb; o jsonb; x jsonb; p text[]; hasil text[]; harapan text[]; n int := 0;
  admin bigint := 354; k2 bigint; z bigint; ro2 text; id1 bigint; id2 bigint; id3 bigint; h jsonb; ke text; isi2 jsonb;
begin
  perform set_config('app.akun_id', '', true);
  base := vek -> 'base';

  -- ===== paritas pemeriksa isi (kasus sama dengan tes TypeScript) =====
  for c in select value from jsonb_array_elements(vek -> 'cases') loop
    x := base;
    for o in select value from jsonb_array_elements(c -> 'ops') loop
      p := array(select jsonb_array_elements_text(o -> 'path'));
      if o ->> 'op' = 'set' then x := jsonb_set(x, p, o -> 'value', true);
      elsif o ->> 'op' = 'del' then x := x #- p;
      elsif o ->> 'op' = 'tambah' then x := jsonb_set(x, p, (x #> p) || jsonb_build_array(o -> 'value'));
      elsif o ->> 'op' = 'ganti' then x := o -> 'value';
      end if;
    end loop;
    hasil := array(select e from unnest(keu_kebijakan_periksa(x)) e order by e);
    harapan := array(select jsonb_array_elements_text(c -> 'galat') order by 1);
    perform pg_temp.ok(hasil is not distinct from harapan, format('kasus "%s": SQL %s, harapan %s', c ->> 'nama', hasil, harapan));
    n := n + 1;
  end loop;
  perform pg_temp.ok(n = 27, 'semua 27 kasus dijalankan');

  -- ===== kewenangan =====
  perform pg_temp.ok((select count(*) = 2 from keu_master_kewenangan where kode in ('kebijakan_susun','kebijakan_setuju')), 'dua kewenangan baru');
  perform pg_temp.ok((select count(*) = 3 from keu_master_kewenangan_peran where kewenangan_kode = 'kebijakan_susun'), 'susun: PPK, RENC, ADMIN');
  select id into z from sigap_akun where aktif and id <> admin and not exists (select 1 from keu_penugasan t where t.akun_id = sigap_akun.id and t.dibatalkan_at is null) order by id limit 1;
  select id into k2 from sigap_akun where aktif and id not in (admin, z) and not exists (select 1 from keu_penugasan t where t.akun_id = sigap_akun.id and t.dibatalkan_at is null) order by id limit 1;
  perform pg_temp.ok(z is not null and k2 is not null, 'ada dua akun tanpa penugasan untuk uji');
  perform pg_temp.ok(keu_boleh(admin, 'kebijakan_susun') and not keu_boleh(z, 'kebijakan_susun'), 'hanya PPK/Perencanaan/Admin menyusun');
  h := keu_jalankan(admin, 'keu_kebijakan_hak', '{}');
  perform pg_temp.ok((h ->> 'susun')::boolean and (h ->> 'ketua')::boolean and (h ->> 'ppk')::boolean and (h ->> 'kpa')::boolean, 'hak akun 354');
  h := keu_jalankan(z, 'keu_kebijakan_hak', '{}');
  perform pg_temp.ok(not (h ->> 'susun')::boolean and not (h ->> 'ketua')::boolean and not (h ->> 'ppk')::boolean and not (h ->> 'kpa')::boolean, 'hak pegawai biasa kosong');

  -- ===== buat =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_buat', %L::jsonb)$q$, z, jsonb_build_object('p_isi', base)::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_buat', '{}')$q$, admin), '22023'); -- tanpa isi
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_buat', %L::jsonb)$q$, admin, jsonb_build_object('p_isi', jsonb_set(base, '{param,4,kebijakan}', '400000'))::text), '23514');
  id1 := (keu_jalankan(admin, 'keu_kebijakan_buat', jsonb_build_object('p_isi', base)) #>> '{}')::bigint;
  perform pg_temp.ok((select status = 'draf' and ver = 1 and predefined and tanggal_rapat is null from keu_v_kebijakan where id = id1), 'draf versi 1 dari predefined');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_buat', %L::jsonb)$q$, admin, jsonb_build_object('p_isi', base)::text), '23505'); -- sudah ada yang terbuka

  -- ===== tulis langsung ditutup =====
  perform set_config('app.akun_id', admin::text, true);
  perform pg_temp.gagal(format('update keu_kebijakan_lembar set tujuan = %L where id = %s', 'ubah langsung', id1), '42501');
  perform pg_temp.gagal(format('delete from keu_kebijakan_lembar where id = %s', id1), '42501');
  perform set_config('app.akun_id', '', true);

  -- ===== simpan =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_simpan', %L::jsonb)$q$, z, jsonb_build_object('p_id', id1, 'p_isi', base)::text), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_id', id1, 'p_isi', base, 'p_rapat', current_date + 3)::text), '23514');
  perform keu_jalankan(admin, 'keu_kebijakan_simpan', jsonb_build_object('p_id', id1, 'p_isi', base, 'p_rapat', current_date, 'p_nomor', 'Notulen 01/2026', 'p_tujuan', 'Menjaga mutu pendataan tahun 2026'));
  perform pg_temp.ok((select predefined and nomor_notulen = 'Notulen 01/2026' from keu_v_kebijakan where id = id1), 'metadata saja: angka masih predefined');
  isi2 := jsonb_set(base, '{param,4,kebijakan}', '360000');
  perform keu_jalankan(admin, 'keu_kebijakan_simpan', jsonb_build_object('p_id', id1, 'p_isi', isi2, 'p_rapat', current_date, 'p_nomor', 'Notulen 01/2026', 'p_tujuan', 'Menjaga mutu pendataan tahun 2026'));
  perform pg_temp.ok((select not predefined and (isi #>> '{param,4,kebijakan}')::numeric = 360000 from keu_v_kebijakan where id = id1), 'isi diubah rapat: bukan predefined lagi');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_id', id1, 'p_isi', jsonb_set(base, '{param,4,kebijakan}', '999999'), 'p_rapat', current_date)::text), '23514');

  -- ===== ajukan: syarat =====
  perform keu_jalankan(admin, 'keu_kebijakan_simpan', jsonb_build_object('p_id', id1, 'p_isi', isi2, 'p_rapat', null, 'p_nomor', 'Notulen 01/2026', 'p_tujuan', 'Menjaga mutu pendataan tahun 2026'));
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"ajukan"}')$q$, admin, id1), '23514'); -- tanpa tanggal rapat
  perform keu_jalankan(admin, 'keu_kebijakan_simpan', jsonb_build_object('p_id', id1, 'p_isi', isi2, 'p_rapat', current_date, 'p_nomor', 'N', 'p_tujuan', 'Menjaga mutu pendataan tahun 2026'));
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"ajukan"}')$q$, admin, id1), '23514'); -- nomor terlalu pendek
  perform keu_jalankan(admin, 'keu_kebijakan_simpan', jsonb_build_object('p_id', id1, 'p_isi', isi2, 'p_rapat', current_date, 'p_nomor', 'Notulen 01/2026', 'p_tujuan', 'pendek'));
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"ajukan"}')$q$, admin, id1), '23514'); -- tujuan terlalu pendek
  perform keu_jalankan(admin, 'keu_kebijakan_simpan', jsonb_build_object('p_id', id1, 'p_isi', isi2, 'p_rapat', current_date, 'p_nomor', 'Notulen 01/2026', 'p_tujuan', 'Menjaga mutu pendataan tahun 2026'));
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"ajukan"}')$q$, z, id1), '42501');

  -- ketua kedua: satu RO dilepas dari akun 354 lalu diberikan kepada akun k2 (dibatalkan di akhir oleh rollback)
  perform set_config('app.akun_id', '', true);
  select ro_kode into ro2 from keu_penugasan where akun_id = admin and peran_kode = 'KETUA' and dibatalkan_at is null order by ro_kode limit 1;
  update keu_penugasan set dibatalkan_at = now() where akun_id = admin and peran_kode = 'KETUA' and ro_kode = ro2 and dibatalkan_at is null;
  insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai) values (k2, 'KETUA', ro2, current_date);

  -- ===== ajukan, tarik, ajukan lagi =====
  ke := keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id1, 'p_aksi', 'ajukan')) #>> '{}';
  perform pg_temp.ok(ke = 'menunggu', 'diajukan');
  perform pg_temp.ok((select count(*) = 4 from keu_v_kebijakan_pengesah where lembar_id = id1 and aktif), 'pengesah beku: ketua 354, ketua k2, PPK, KPA');
  perform pg_temp.ok((select count(distinct akun_id) = 2 from keu_v_kebijakan_pengesah where lembar_id = id1 and aktif and peran_kode = 'KETUA'), 'dua akun ketua');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"tarik"}')$q$, k2, id1), '42501'); -- bukan penyusun/pengaju
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"setuju"}')$q$, z, id1), '42501'); -- bukan pengesah
  ke := keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id1, 'p_aksi', 'tarik')) #>> '{}';
  perform pg_temp.ok(ke = 'draf', 'ditarik kembali ke draf');
  ke := keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id1, 'p_aksi', 'ajukan')) #>> '{}';

  -- ===== setuju paralel: 354 memegang ketua+PPK+KPA, k2 ketua kedua =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"kembalikan","p_catatan":"x"}')$q$, k2, id1), '23514'); -- catatan pendek
  ke := keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id1, 'p_aksi', 'setuju')) #>> '{}';
  perform pg_temp.ok(ke = 'menunggu', 'satu persetujuan: masih menunggu ketua kedua');
  perform pg_temp.ok((select count(*) = 3 from keu_v_kebijakan_pengesah where lembar_id = id1 and setuju_at is not null), 'akun 354 menyetujui ketiga perannya sekaligus');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"setuju"}')$q$, admin, id1), '42501'); -- sudah menyetujui
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"tarik"}')$q$, admin, id1), '23514'); -- sudah ada yang setuju
  ke := keu_jalankan(k2, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id1, 'p_aksi', 'setuju')) #>> '{}';
  perform pg_temp.ok(ke = 'berlaku', 'semua pengesah setuju: berlaku');
  perform pg_temp.ok((select status = 'berlaku' and berlaku_at is not null from keu_v_kebijakan where id = id1), 'status berlaku');
  perform pg_temp.ok((select count(*) = 1 and min(ver) = 1 from keu_v_kebijakan_berlaku), 'satu-satunya pintu hilir memuat lembar berlaku');

  -- ===== terkunci =====
  perform set_config('app.akun_id', '', true);
  begin
    update keu_kebijakan_lembar set tujuan = 'ubah' where id = id1;
    raise exception 'SEHARUSNYA GAGAL: lembar berlaku harus terkunci';
  exception when sqlstate '23514' then null;
  end;
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_simpan', %L::jsonb)$q$, admin, jsonb_build_object('p_id', id1, 'p_isi', base)::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_buat', %L::jsonb)$q$, admin, jsonb_build_object('p_isi', base)::text), '23505'); -- harus lewat revisi

  -- ===== revisi =====
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_buat', '{"p_dari":%s,"p_alasan":"pendek"}')$q$, admin, id1), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_buat', '{"p_dari":%s,"p_alasan":"Rapat revisi karena perubahan juknis"}')$q$, z, id1), '42501');
  id2 := (keu_jalankan(admin, 'keu_kebijakan_buat', jsonb_build_object('p_dari', id1, 'p_alasan', 'Rapat revisi karena perubahan juknis')) #>> '{}')::bigint;
  perform pg_temp.ok((select ver = 2 and status = 'draf' and not predefined and isi = isi2 and tanggal_rapat is null and nomor_notulen = '' from keu_v_kebijakan where id = id2), 'revisi: versi 2 salinan lembar berlaku, rapat dikosongkan');
  perform pg_temp.ok((select status = 'berlaku' from keu_v_kebijakan where id = id1), 'versi 1 tetap berlaku selama revisi disusun');
  perform keu_jalankan(admin, 'keu_kebijakan_simpan', jsonb_build_object('p_id', id2, 'p_isi', jsonb_set(isi2, '{param,4,kebijakan}', '350000'), 'p_rapat', current_date, 'p_nomor', 'Notulen 02/2026', 'p_tujuan', 'Menyesuaikan uang harian dengan juknis baru'));
  perform keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id2, 'p_aksi', 'ajukan'));
  -- pengembalian oleh pengesah
  ke := keu_jalankan(k2, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id2, 'p_aksi', 'kembalikan', 'p_catatan', 'Mohon uang harian dibahas ulang')) #>> '{}';
  perform pg_temp.ok(ke = 'draf', 'dikembalikan ke draf');
  perform pg_temp.ok((select catatan_kembali = 'Mohon uang harian dibahas ulang' and kembali_oleh = 'Ketua tim' from keu_v_kebijakan where id = id2), 'catatan dan pengembali tercatat');
  perform pg_temp.ok((select count(*) = 0 from keu_v_kebijakan_pengesah where lembar_id = id2 and setuju_at is not null), 'persetujuan direset');
  perform keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id2, 'p_aksi', 'ajukan'));
  perform keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id2, 'p_aksi', 'setuju'));
  ke := keu_jalankan(k2, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id2, 'p_aksi', 'setuju')) #>> '{}';
  perform pg_temp.ok(ke = 'berlaku', 'versi 2 berlaku');
  perform pg_temp.ok((select status = 'arsip' and arsip_at is not null from keu_v_kebijakan where id = id1), 'versi 1 diarsipkan');
  perform pg_temp.ok((select count(*) = 1 and min(ver) = 2 and (min(isi #>> '{param,4,kebijakan}'))::numeric = 350000 from keu_v_kebijakan_berlaku), 'hilir hanya melihat versi 2');

  -- ===== batal draf =====
  id3 := (keu_jalankan(admin, 'keu_kebijakan_buat', jsonb_build_object('p_dari', id2, 'p_alasan', 'Percobaan revisi yang dibatalkan')) #>> '{}')::bigint;
  perform pg_temp.ok((select ver = 3 from keu_v_kebijakan where id = id3), 'versi 3 draf');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"batal","p_catatan":"x"}')$q$, admin, id3), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"batal","p_catatan":"salah buka revisi"}')$q$, z, id3), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"batal","p_catatan":"salah buka revisi"}')$q$, admin, id2), '23514'); -- berlaku tidak dapat dibatalkan
  perform keu_jalankan(admin, 'keu_kebijakan_aksi', jsonb_build_object('p_id', id3, 'p_aksi', 'batal', 'p_catatan', 'salah buka revisi'));
  perform pg_temp.ok((select status = 'dibatalkan' from keu_v_kebijakan where id = id3), 'draf dibatalkan');
  perform pg_temp.gagal(format($q$select keu_jalankan(%s, 'keu_kebijakan_aksi', '{"p_id":%s,"p_aksi":"ngawur"}')$q$, admin, id2), '22023');

  -- ===== jejak =====
  perform pg_temp.ok((select count(*) >= 12 from keu_v_kebijakan_riwayat where lembar_id in (id1, id2, id3)), 'riwayat tercatat');
  perform pg_temp.ok((select oleh_nama is not null from keu_v_kebijakan_riwayat where lembar_id = id1 order by id limit 1), 'nama pelaku pada riwayat');
  perform pg_temp.ok(exists (select 1 from sigap_audit where aksi = 'keu.keu_kebijakan_lembar.update' and akun_id = admin), 'audit mencatat akun pelaku');
  raise notice 'LULUS 50';
end $$;
rollback;
