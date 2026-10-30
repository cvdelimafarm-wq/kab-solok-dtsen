\set ON_ERROR_STOP on
-- Uji Fase F (j): catatan kekurangan RAB dan tambahan pagu.
-- Dijalankan sesudah 41. Akun: 3 PPK, 4 ketua 005/006, 5 mantan ketua, 6 admin RO 005, 7 bendahara, 'Anggota' (akses Administrasi 005 saja).
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
create or replace function pg_temp.sesi(p bigint) returns void language sql as $$ select set_config('app.akun_id', coalesce(p::text,''), true) $$;
create temp table t42(k text primary key, v bigint);
create or replace function pg_temp.id(p text) returns bigint language sql as $$ select v from t42 where k = p $$;
create or replace function pg_temp.simpan(p text, p_v bigint) returns void language sql as $$ insert into t42 values (p, p_v) on conflict (k) do update set v = excluded.v $$;
create or replace function pg_temp.kep(p jsonb) returns jsonb language sql as $$ select p $$;

-- ================= A. Mencatat, mengubah, menarik =================
do $$
declare n_ang bigint := (select id from sigap_akun where nama = 'Anggota'); id1 bigint;
begin
  perform pg_temp.sesi(6);   -- admin RO 005
  perform pg_temp.simpan('k1', keu_kekurangan_catat('2906.BMA.005','524113','Transport lokal 12 petugas tambahan SPDT NTP', 2040000, 'penting', 'Jumlah petugas bertambah; sisa pagu akun 524 habis'));
  perform pg_temp.simpan('k2', keu_kekurangan_catat('2906.BMA.005','521211','Konsumsi rapat evaluasi tambahan', 1150000, 'tunda', 'Rapat evaluasi diusulkan; tidak ada pagu konsumsi'));
  perform pg_temp.sesi(4);   -- ketua
  perform pg_temp.simpan('k3', keu_kekurangan_catat('2906.BMA.005','521213','Honor pemeriksa lapangan tambahan 2 OK', 3600000, 'inti', 'Beban pemeriksaan melebihi rencana', '055'));
  perform pg_temp.ok((select status = 'tercatat' and tahun = 2026 and dicatat_oleh = 4 and komponen_kode = '055' from keu_kekurangan where id = pg_temp.id('k3')), 'k3 tercatat');
  perform pg_temp.ok((select kro_kode = '2906.BMA' and kelompok_kode is not null and prioritas_nama = 'Inti' from keu_v_kekurangan where id = pg_temp.id('k3')), 'view memuat KRO, kelompok, prioritas');

  -- hak: hanya ketua dan admin RO untuk RO sendiri (D-07)
  perform pg_temp.sesi(7);
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '42501');
  perform pg_temp.sesi(5);
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '42501');
  perform pg_temp.sesi(n_ang);   -- anggota tim tidak mencatat
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '42501');
  perform pg_temp.sesi(6);       -- admin RO 005 tidak pada RO 006
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.006','521211','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '42501');
  perform pg_temp.sesi(null);
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '42501');

  -- validasi
  perform pg_temp.sesi(4);
  perform pg_temp.gagal($q$select keu_kekurangan_catat('9999.XXX.999','521211','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','999999','Pembelian materai tambahan',100000,'penting','Materai kurang')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',0,'penting','Materai kurang')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',-5,'penting','Materai kurang')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',1000.5,'penting','Materai kurang')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'tebak','Materai kurang')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','ab',100000,'penting','Materai kurang')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'penting','x')$q$, '23514');
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','521211','Pembelian materai tambahan',100000,'penting','Materai kurang','55')$q$, '23514');   -- komponen bukan 3 angka
  perform pg_temp.gagal($q$select keu_kekurangan_catat('2906.BMA.005','524113','TRANSPORT LOKAL 12 petugas tambahan SPDT NTP',999,'penting','catatan serupa')$q$, '23505');   -- kembar (terbuka)

  -- ubah
  perform pg_temp.sesi(6);
  perform keu_kekurangan_ubah(pg_temp.id('k2'), 'Konsumsi rapat evaluasi tambahan (revisi)', null, 'penting', 'Rapat evaluasi diusulkan ketua tim');
  perform pg_temp.ok((select uraian like '%(revisi)' and prioritas_kode = 'penting' and jumlah = 1150000 from keu_kekurangan where id = pg_temp.id('k2')), 'ubah sebagian isian');
  perform keu_kekurangan_ubah(pg_temp.id('k2'), null, null, 'tunda', null);
  perform pg_temp.gagal(format($q$select keu_kekurangan_ubah(%s, null, 0)$q$, pg_temp.id('k2')), '23514');
  perform pg_temp.gagal(format($q$select keu_kekurangan_ubah(%s, null, null, 'tebak')$q$, pg_temp.id('k2')), '23514');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_kekurangan_ubah(%s, 'Ubah oleh bendahara')$q$, pg_temp.id('k2')), '42501');

  -- tarik, lalu catat ulang dengan uraian yang sama (hanya catatan terbuka yang unik)
  perform pg_temp.sesi(4);
  id1 := keu_kekurangan_catat('2906.BMA.006','521211','Biaya cadangan percobaan', 250000, 'tunda', 'Percobaan menarik catatan');
  perform pg_temp.gagal(format($q$select keu_kekurangan_tarik(%s, 'btl')$q$, id1), '23514');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_kekurangan_tarik(%s, 'tidak jadi diajukan')$q$, id1), '42501');
  perform pg_temp.sesi(4);
  perform keu_kekurangan_tarik(id1, 'tidak jadi diajukan');
  perform pg_temp.ok((select status = 'ditarik' and diputus_oleh = 4 and alasan_putus = 'tidak jadi diajukan' from keu_kekurangan where id = id1), 'ditarik');
  perform pg_temp.gagal(format($q$select keu_kekurangan_tarik(%s, 'tidak jadi diajukan')$q$, id1), '23514');
  perform pg_temp.gagal(format($q$select keu_kekurangan_ubah(%s, 'Ubah setelah ditarik')$q$, id1), '23514');
  id1 := keu_kekurangan_catat('2906.BMA.006','521211','Biaya cadangan percobaan', 250000, 'tunda', 'Diajukan kembali dengan alasan baru');
  perform keu_kekurangan_tarik(id1, 'ternyata tidak perlu');
end $$;

-- ================= B. Tambahan pagu (PPK) =================
do $$
declare j_pok bigint := (select id from keu_revisi_jadwal where jenis = 'pok' order by id limit 1); t1 bigint;
begin
  perform pg_temp.sesi(4);   -- ketua bukan PPK
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', current_date)$q$, '42501');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', current_date)$q$, '42501');
  perform pg_temp.sesi(null);
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', current_date)$q$, '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 0, 'dja', 'S-123/DJA/2026', current_date)$q$, '23514');
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 1.5, 'dja', 'S-123/DJA/2026', current_date)$q$, '23514');
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'pusat', 'S-123/DJA/2026', current_date)$q$, '23514');
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'ab', current_date)$q$, '23514');
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', null)$q$, '23514');
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('9999.XXX.999', 6000000, 'dja', 'S-123/DJA/2026', current_date)$q$, '23514');
  perform pg_temp.gagal(format($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', current_date, %s)$q$, j_pok), '23514');   -- jadwal bukan DIPA DJA
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', current_date, 999999)$q$, '23514');
  t1 := keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', current_date, null, 'Tambahan pagu RO 005');
  perform pg_temp.simpan('tp1', t1);
  perform pg_temp.gagal($q$select keu_tambahan_pagu_catat('2906.BMA.005', 1000000, 'djpb', 'S-124/DJPb/2026', current_date)$q$, '23505');   -- satu terbuka per RO
  -- batal
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_tambahan_pagu_batal(%s, 'salah catat tanggal')$q$, t1), '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_tambahan_pagu_batal(%s, 'btl')$q$, t1), '23514');
  perform keu_tambahan_pagu_batal(t1, 'salah catat nomor dokumen');
  perform pg_temp.ok((select status = 'dibatalkan' from keu_tambahan_pagu where id = t1), 'tambahan dibatalkan');
  perform pg_temp.gagal(format($q$select keu_tambahan_pagu_batal(%s, 'sudah dibatalkan')$q$, t1), '23514');
  -- catat ulang dengan nomor yang sama diperbolehkan setelah batal
  t1 := keu_tambahan_pagu_catat('2906.BMA.005', 6000000, 'dja', 'S-123/DJA/2026', current_date, null, 'Tambahan pagu RO 005 (benar)');
  perform pg_temp.simpan('tp1', t1);
  perform pg_temp.ok((select status = 'terbuka' and tahun = 2026 and dicatat_oleh = 3 from keu_tambahan_pagu where id = t1), 'tambahan terbuka');
  perform pg_temp.ok((select tambahan_terbuka_jumlah = 6000000 and n_terbuka = 3 and jumlah_terbuka = 6790000 and jumlah_inti = 3600000 and jumlah_penting = 2040000 and jumlah_tunda = 1150000
                      from keu_v_kekurangan_ro where ro_kode = '2906.BMA.005'), 'ringkasan RO sebelum keputusan');
end $$;

-- ================= C. Saran urutan =================
do $$
begin
  perform pg_temp.ok((select string_agg(kekurangan_id || ':' || saran || ':' || sisa_setelah, ' ' order by ordinality)
                      from keu_kekurangan_saran(pg_temp.id('tp1')) with ordinality)
                     = pg_temp.id('k3') || ':penuhi:2400000 ' || pg_temp.id('k1') || ':penuhi:360000 ' || pg_temp.id('k2') || ':tunda:360000',
                     'saran: inti, penting, tunda');
  perform pg_temp.ok((select count(*) = 0 from keu_kekurangan_saran(999999)), 'saran untuk tambahan tak ada kosong');
end $$;

-- ================= D. Keputusan ketua tim =================
do $$
declare t1 bigint := pg_temp.id('tp1'); k1 bigint := pg_temp.id('k1'); k2 bigint := pg_temp.id('k2'); k3 bigint := pg_temp.id('k3');
        k_lain bigint; sisa numeric;
begin
  perform pg_temp.sesi(4);
  k_lain := keu_kekurangan_catat('2906.BMA.006','524113','Transport supervisi RO lain', 700000, 'penting', 'Dipakai menguji id dari RO lain');
  -- hak
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '[]'::jsonb)$q$, t1), '42501');   -- admin RO tidak memutuskan
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '[]'::jsonb)$q$, t1), '42501');   -- PPK bukan ketua RO ini
  perform pg_temp.sesi(5);
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '[]'::jsonb)$q$, t1), '42501');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '[]'::jsonb)$q$, t1), '42501');
  perform pg_temp.sesi(null);
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '[]'::jsonb)$q$, t1), '42501');
  -- validasi
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '{"id":1}'::jsonb)$q$, t1), '23514');   -- bukan daftar
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '[]'::jsonb)$q$, t1), '23514');          -- semua belum diputuskan
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, jsonb_build_array(
        jsonb_build_object('id',%s,'keputusan','penuhi'), jsonb_build_object('id',%s,'keputusan','penuhi')))$q$, t1, k3, k1), '23514');   -- k2 belum
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, jsonb_build_array(
        jsonb_build_object('id',%s,'keputusan','penuhi'), jsonb_build_object('id',%s,'keputusan','penuhi'),
        jsonb_build_object('id',%s,'keputusan','tunda'), jsonb_build_object('id',%s,'keputusan','tunda')))$q$, t1, k3, k1, k2, k_lain), '23514');   -- id RO lain
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, jsonb_build_array(
        jsonb_build_object('id',%s,'keputusan','penuhi'), jsonb_build_object('id',%s,'keputusan','penuhi'),
        jsonb_build_object('id',%s,'keputusan','tunda'), jsonb_build_object('id',%s,'keputusan','tunda')))$q$, t1, k3, k1, k2, k2), '23514');   -- id ganda
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, jsonb_build_array(
        jsonb_build_object('id',%s,'keputusan','penuhi'), jsonb_build_object('id',%s,'keputusan','penuhi'),
        jsonb_build_object('id',%s,'keputusan','setuju')))$q$, t1, k3, k1, k2), '22023');                                                  -- keputusan tak dikenal
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, jsonb_build_array(
        jsonb_build_object('id',%s,'keputusan','penuhi'), jsonb_build_object('id',%s,'keputusan','penuhi'),
        jsonb_build_object('id',%s,'keputusan','tolak')))$q$, t1, k3, k1, k2), '23514');                                                   -- tolak tanpa alasan
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, jsonb_build_array(
        jsonb_build_object('id',%s,'keputusan','penuhi'), jsonb_build_object('id',%s,'keputusan','penuhi'),
        jsonb_build_object('id',%s,'keputusan','penuhi')))$q$, t1, k3, k1, k2), '23514');                                                  -- 6.790.000 > 6.000.000
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, jsonb_build_array(
        jsonb_build_object('keputusan','penuhi')))$q$, t1), '23514');                                                                       -- tanpa id
  -- semua kegagalan tidak mengubah apa pun
  perform pg_temp.ok((select count(*) = 0 from keu_kekurangan_putus where tambahan_id = t1), 'tidak ada keputusan tersimpan');
  perform pg_temp.ok((select count(*) = 3 and bool_and(status in ('tercatat','ditunda')) from keu_kekurangan where ro_kode = '2906.BMA.005' and status <> 'ditarik'), 'catatan RO 005 tetap terbuka');
  perform pg_temp.ok((select status = 'terbuka' from keu_tambahan_pagu where id = t1), 'tambahan tetap terbuka');
  -- berhasil: penuhi k3 dan k1, tolak k2
  sisa := keu_kekurangan_putuskan(t1, jsonb_build_array(
            jsonb_build_object('id',k3,'keputusan','penuhi'), jsonb_build_object('id',k1,'keputusan','PENUHI'),
            jsonb_build_object('id',k2,'keputusan','tolak','alasan','tidak mendesak, rapat dapat daring')));
  perform pg_temp.ok(sisa = 360000, 'sisa menjadi dana penggenap Rp 360.000');
  perform pg_temp.ok((select status = 'diputus' and dipenuhi_total = 5640000 and sisa_penggenap = 360000 and diputus_oleh = 4 from keu_tambahan_pagu where id = t1), 'tambahan diputus');
  perform pg_temp.ok((select status = 'dipenuhi' and tambahan_id = t1 and diputus_oleh = 4 from keu_kekurangan where id = k3), 'k3 dipenuhi');
  perform pg_temp.ok((select status = 'dipenuhi' from keu_kekurangan where id = k1), 'k1 dipenuhi');
  perform pg_temp.ok((select status = 'ditolak' and alasan_putus like 'tidak mendesak%' from keu_kekurangan where id = k2), 'k2 ditolak dengan alasan');
  perform pg_temp.ok((select count(*) = 3 from keu_kekurangan_putus where tambahan_id = t1), 'tiga baris keputusan');
  -- beku
  perform pg_temp.gagal(format($q$select keu_kekurangan_tarik(%s, 'sudah dipenuhi, tarik')$q$, k3), '23514');
  perform pg_temp.gagal(format($q$select keu_kekurangan_ubah(%s, 'Ubah setelah dipenuhi')$q$, k3), '23514');
  perform pg_temp.gagal(format($q$select keu_kekurangan_putuskan(%s, '[]'::jsonb)$q$, t1), '23514');   -- tambahan sudah diputus
  perform pg_temp.gagal(format($q$select keu_tambahan_pagu_batal(%s, 'sudah diputus')$q$, t1), '42501');   -- ketua bukan PPK
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_tambahan_pagu_batal(%s, 'sudah diputus')$q$, t1), '23514');
  perform pg_temp.ok((select n_terbuka = 0 and n_dipenuhi = 2 and jumlah_dipenuhi = 5640000 and n_ditolak = 1 and tambahan_terbuka_id is null
                      from keu_v_kekurangan_ro where ro_kode = '2906.BMA.005'), 'ringkasan RO 005 sesudah keputusan');
end $$;

-- ================= E. Ditunda muncul lagi pada tambahan berikutnya (RO 006) =================
do $$
declare ka bigint; kb bigint; kc bigint; t2 bigint; t3 bigint; j_dja bigint; sisa numeric;
begin
  perform pg_temp.sesi(4);
  -- catatan percobaan dari bagian D (k_lain) masih terbuka di RO 006: tarik agar bagian ini bersih
  perform keu_kekurangan_tarik((select id from keu_kekurangan where uraian = 'Transport supervisi RO lain'), 'hanya untuk uji id RO lain');
  ka := keu_kekurangan_catat('2906.BMA.006','521213','Honor petugas pendataan susulan', 6200000, 'inti', 'Cakupan SLS susulan');
  kb := keu_kekurangan_catat('2906.BMA.006','524113','Transport lokal supervisi susulan', 1700000, 'penting', 'Supervisi wilayah baru');
  perform pg_temp.simpan('ka', ka); perform pg_temp.simpan('kb', kb);
  perform pg_temp.sesi(3);
  t2 := keu_tambahan_pagu_catat('2906.BMA.006', 1700000, 'djpb', 'S-77/DJPb/2026', current_date);
  perform pg_temp.ok((select string_agg(kekurangan_id || ':' || saran, ' ' order by ordinality) = ka || ':tunda ' || kb || ':penuhi'
                      from keu_kekurangan_saran(t2) with ordinality), 'saran: yang besar ditunda, yang muat dipenuhi');
  perform pg_temp.sesi(4);
  sisa := keu_kekurangan_putuskan(t2, jsonb_build_array(jsonb_build_object('id',ka,'keputusan','tunda'), jsonb_build_object('id',kb,'keputusan','penuhi')));
  perform pg_temp.ok(sisa = 0, 'tidak ada sisa penggenap');
  perform pg_temp.ok((select status = 'ditunda' and tambahan_id is null and diputus_at is null from keu_kekurangan where id = ka), 'ka ditunda, masih terbuka');
  perform pg_temp.ok((select kali_ditunda = 1 and terbuka from keu_v_kekurangan where id = ka), 'ka tercatat ditunda satu kali');
  perform pg_temp.ok((select n_ditunda = 1 and n_terbuka = 1 and jumlah_terbuka = 6200000 from keu_v_kekurangan_ro where ro_kode = '2906.BMA.006'), 'ringkasan RO 006');
  -- ka dapat diubah selagi ditunda
  perform keu_kekurangan_ubah(ka, null, null, null, 'Cakupan SLS susulan, sudah diverifikasi ulang');
  -- tambahan berikutnya (jadwal DIPA DJA) : ka muncul lagi dan dipenuhi
  perform pg_temp.sesi(null);
  insert into keu_revisi_jadwal(tahun, jenis, judul, buka, tutup) values (2026, 'dipa_dja', 'Revisi DIPA DJA (uji kekurangan)', current_date, current_date + 7) returning id into j_dja;
  perform pg_temp.sesi(3);
  t3 := keu_tambahan_pagu_catat('2906.BMA.006', 7000000, 'dja', 'S-88/DJA/2026', current_date, j_dja, '');
  perform pg_temp.ok((select jadwal_id = j_dja and tahun = 2026 from keu_tambahan_pagu where id = t3), 'tambahan memuat jadwal DJA');
  perform pg_temp.ok((select string_agg(kekurangan_id || ':' || saran, ' ') = ka || ':penuhi' from keu_kekurangan_saran(t3)), 'ka muncul lagi pada tambahan berikutnya');
  perform pg_temp.sesi(4);
  sisa := keu_kekurangan_putuskan(t3, jsonb_build_array(jsonb_build_object('id',ka,'keputusan','penuhi')));
  perform pg_temp.ok(sisa = 800000, 'sisa Rp 800.000 menjadi dana penggenap');
  perform pg_temp.ok((select status = 'dipenuhi' and tambahan_id = t3 from keu_kekurangan where id = ka), 'ka dipenuhi pada tambahan kedua');
  perform pg_temp.ok((select string_agg(keputusan, ',' order by id) = 'tunda,penuhi' from keu_kekurangan_putus where kekurangan_id = ka), 'riwayat keputusan ka: tunda lalu penuhi');
  -- tambahan tanpa catatan terbuka: seluruhnya menjadi penggenap
  perform pg_temp.sesi(3);
  t3 := keu_tambahan_pagu_catat('2906.BMA.006', 500000, 'djpb', 'S-99/DJPb/2026', current_date);
  perform pg_temp.sesi(4);
  sisa := keu_kekurangan_putuskan(t3, '[]'::jsonb);
  perform pg_temp.ok(sisa = 500000 and (select sisa_penggenap = 500000 and dipenuhi_total = 0 from keu_tambahan_pagu where id = t3), 'tanpa catatan: seluruh tambahan menjadi penggenap');
end $$;

-- ================= F. Menautkan ke item RAB =================
do $$
declare k1 bigint := pg_temp.id('k1'); k2 bigint := pg_temp.id('k2'); i_ok bigint; i_akun_lain bigint; i_ro_lain bigint;
begin
  select i.id into i_ok from keu_rab_item i join keu_rab r on r.id = i.rab_id where r.ro_kode = '2906.BMA.005' and r.status = 'disetujui' and i.akun_kode = '524113';
  select i.id into i_akun_lain from keu_rab_item i join keu_rab r on r.id = i.rab_id where r.ro_kode = '2906.BMA.005' and r.status = 'disetujui' and i.akun_kode = '521211';
  select i.id into i_ro_lain from keu_rab_item i join keu_rab r on r.id = i.rab_id where r.ro_kode = '2896.BMA.004' limit 1;
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_kekurangan_tautkan_rab(%s, %s)$q$, k1, i_ok), '42501');
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_kekurangan_tautkan_rab(%s, %s)$q$, k1, i_ro_lain), '23514');       -- RO lain
  perform pg_temp.gagal(format($q$select keu_kekurangan_tautkan_rab(%s, %s)$q$, k1, i_akun_lain), '23514');     -- akun beda
  perform pg_temp.gagal(format($q$select keu_kekurangan_tautkan_rab(%s, %s)$q$, k2, i_akun_lain), '23514');     -- k2 ditolak
  perform pg_temp.gagal(format($q$select keu_kekurangan_tautkan_rab(%s, 999999)$q$, k1), '23514');
  perform keu_kekurangan_tautkan_rab(k1, i_ok);
  perform pg_temp.ok((select rab_item_id = i_ok from keu_kekurangan where id = k1), 'k1 ditautkan');
  perform pg_temp.gagal(format($q$select keu_kekurangan_tautkan_rab(%s, %s)$q$, k1, i_ok), '23514');            -- sudah ditautkan
  perform pg_temp.ok((select kali_ditunda = 0 and rab_item_id = i_ok from keu_v_kekurangan where id = k1), 'view memuat tautan');
end $$;

-- ================= G. Rekap per KRO untuk PPK =================
do $$
begin
  perform pg_temp.sesi(4);
  perform keu_kekurangan_catat('2906.BMA.005','521213','Honor pemeriksa susulan minggu kedua', 500000, 'inti', 'Pemeriksaan lanjutan');
  perform keu_kekurangan_catat('2906.BMA.006','521211','Cetak kuesioner tambahan', 300000, 'tunda', 'Kuesioner cadangan');
  perform pg_temp.ok((select sum(jumlah_terbuka) = 800000 and max(n_ro) = 2 and sum(jumlah_inti) = 500000 and sum(jumlah_tunda) = 300000
                      from keu_v_kekurangan_kro where kro_kode = '2906.BMA'), 'rekap KRO 2906.BMA');
end $$;

-- ================= H. Penjaga tabel =================
do $$
declare k3 bigint := pg_temp.id('k3'); t1 bigint := pg_temp.id('tp1');
begin
  perform pg_temp.sesi(4);   -- dari aplikasi: DML langsung dilarang
  perform pg_temp.gagal(format($q$update keu_kekurangan set uraian = 'Ubah langsung' where id = %s$q$, k3));   -- ditolak penjaga atau pemeriksa beku, mana yang lebih dulu
  perform pg_temp.gagal(format($q$delete from keu_kekurangan where id = %s$q$, k3), '42501');
  perform pg_temp.gagal($q$insert into keu_kekurangan(tahun,ro_kode,akun_kode,uraian,jumlah,prioritas_kode,alasan) values (2026,'2906.BMA.005','521211','Sisip langsung',1000,'inti','langsung')$q$, '42501');
  perform pg_temp.gagal(format($q$update keu_tambahan_pagu set catatan = 'ubah' where id = %s$q$, t1), '42501');
  perform pg_temp.gagal($q$update keu_kekurangan_putus set alasan = 'ubah'$q$, '42501');
  perform pg_temp.gagal($q$delete from keu_kekurangan_putus$q$, '42501');
  perform pg_temp.sesi(null);   -- editor SQL: batasan data tetap berlaku
  perform pg_temp.gagal(format($q$update keu_kekurangan set status = 'tercatat' where id = %s$q$, k3), '23514');      -- sudah dipenuhi
  perform pg_temp.gagal(format($q$update keu_kekurangan set jumlah = 1 where id = %s$q$, k3), '23514');
  perform pg_temp.gagal($q$insert into keu_kekurangan(tahun,ro_kode,akun_kode,uraian,jumlah,prioritas_kode,alasan,status) values (2026,'2906.BMA.005','521211','Sisip dipenuhi',1000,'inti','langsung','dipenuhi')$q$, '23514');
  perform pg_temp.gagal($q$update keu_kekurangan set status = 'dipenuhi' where uraian = 'Honor pemeriksa susulan minggu kedua'$q$, '42501');   -- status hanya lewat fungsi alur, juga dari editor
  perform pg_temp.gagal(format($q$update keu_tambahan_pagu set jumlah = jumlah + 1 where id = %s$q$, t1), '23514');
  perform pg_temp.gagal(format($q$update keu_tambahan_pagu set status = 'terbuka' where id = %s$q$, t1), '23514');
  perform pg_temp.gagal(format($q$update keu_tambahan_pagu set sisa_penggenap = 1 where id = %s$q$, t1), '23514');
  perform pg_temp.gagal($q$update keu_kekurangan set jumlah = 0 where uraian = 'Honor pemeriksa susulan minggu kedua'$q$, '23514');
  perform pg_temp.gagal($q$insert into keu_tambahan_pagu(tahun,ro_kode,jumlah,jalur,nomor_dokumen,tanggal_dokumen,status) values (2026,'2906.BMA.005',1,'dja','S-1/2026',current_date,'diputus')$q$, '23514');
end $$;

-- ================= I. Keamanan =================
do $$
declare t text;
begin
  perform pg_temp.sesi(null);
  foreach t in array array['keu_tambahan_pagu','keu_kekurangan','keu_kekurangan_putus'] loop
    perform pg_temp.ok((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), 'RLS aktif ' || t);
    perform pg_temp.ok(not has_table_privilege('anon', 'public.' || t, 'select') and not has_table_privilege('authenticated', 'public.' || t, 'select'), 'tanpa hak anon/authenticated ' || t);
    perform pg_temp.ok(has_table_privilege('service_role', 'public.' || t, 'select'), 'service_role ' || t);
  end loop;
  foreach t in array array['keu_v_kekurangan','keu_v_kekurangan_ro','keu_v_kekurangan_kro','keu_v_tambahan_pagu'] loop
    perform pg_temp.ok(not has_table_privilege('anon', 'public.' || t, 'select') and not has_table_privilege('authenticated', 'public.' || t, 'select'), 'view tertutup ' || t);
    perform pg_temp.ok((select coalesce(reloptions::text, '') like '%security_invoker=true%' from pg_class where oid = ('public.' || t)::regclass), 'security_invoker ' || t);
  end loop;
  foreach t in array array['keu_kekurangan_catat(text,text,text,numeric,text,text,text,bigint)','keu_kekurangan_ubah(bigint,text,numeric,text,text,bigint)',
                           'keu_kekurangan_tarik(bigint,text,bigint)','keu_tambahan_pagu_catat(text,numeric,text,text,date,bigint,text,bigint)',
                           'keu_tambahan_pagu_batal(bigint,text,bigint)','keu_kekurangan_putuskan(bigint,jsonb,bigint)','keu_kekurangan_tautkan_rab(bigint,bigint,bigint)',
                           'keu_kekurangan_saran(bigint)','keu_kek_tahun()'] loop
    perform pg_temp.ok(not has_function_privilege('anon', 'public.' || t, 'execute') and not has_function_privilege('authenticated', 'public.' || t, 'execute'), 'fungsi tertutup ' || t);
  end loop;
  perform pg_temp.ok((select count(*) > 0 from sigap_audit where aksi = 'keu.keu_kekurangan.update'), 'audit perubahan kekurangan');
  perform pg_temp.ok((select count(*) > 0 from sigap_audit where aksi = 'keu.keu_tambahan_pagu.insert'), 'audit tambahan pagu');
end $$;
