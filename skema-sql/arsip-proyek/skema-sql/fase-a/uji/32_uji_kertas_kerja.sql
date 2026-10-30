\set ON_ERROR_STOP on
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
create or replace function pg_temp.jd() returns bigint language sql as $$ select id from keu_revisi_jadwal where tahun = 2026 and buka = '2026-12-10' $$;
create or replace function pg_temp.kb(p text) returns bigint language sql as $$
  select id from keu_kk_baris where jadwal_id = pg_temp.jd() and pok_kunci like '%' || p $$;
create or replace function pg_temp.pem(p_id bigint) returns text language sql as $$ select pemicu from keu_v_kk_baris where id = p_id $$;
create or replace function pg_temp.rs(p_kode text, p_objek text default null) returns text language sql as $$
  select tingkat from keu_v_kk_periksa where jadwal_id = pg_temp.jd() and kode = p_kode and (p_objek is null or objek = p_objek) limit 1 $$;

-- Akun: 1 ADMIN, 3 PPK (ketua 2896.BMA.004), 4 ketua 2906.BMA.005/.006, 6 admin RO 2906.BMA.005, 7 BEND

-- A. Buka jadwal Desember, muat baris POK RO 2906.BMA.005
do $$
declare j bigint := pg_temp.jd(); n int;
begin
  perform pg_temp.ok(j is not null, 'jadwal Desember ada');
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_kk_muat_ro(%s,'2906.BMA.005')$q$, j), '23514');      -- jadwal belum dibuka
  perform pg_temp.sesi(3);
  perform keu_jadwal_aksi(j, 'buka');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi) values (%s,'2906.BMA.005','055','522151','Honor x',1,'PAKET',1000)$q$, j), '42501');
  perform pg_temp.sesi(6);
  n := keu_kk_muat_ro(j, '2906.BMA.005');
  perform pg_temp.ok(n = 3, 'tiga baris POK dimuat, dapat ' || n);
  perform pg_temp.ok(keu_kk_muat_ro(j, '2906.BMA.005') = 0, 'muat ulang idempoten');
  perform pg_temp.ok(keu_kk_muat_ro(j, '2896.BMA.004') = 0, 'RO tanpa baris POK = 0');
  perform pg_temp.ok((select count(*) = 3 and bool_and(jumlah_menjadi = jumlah_semula) and bool_and(pemicu is null) and bool_and(not baru)
                      from keu_v_kk_baris where jadwal_id = j), 'awal: Menjadi = Semula, tanpa pemicu');
  perform pg_temp.ok((select ro_kode = '2906.BMA.005' and komponen_kode = '055' and akun_semula = '521211' and kro = '2906.BMA' and vol_semula = 10 and jumlah_semula = 1000000
                      from keu_v_kk_baris where id = pg_temp.kb('atk#1')), 'kolom semula ATK');
  perform pg_temp.ok((select rab_item_id is not null from keu_kk_baris where id = pg_temp.kb('atk#1')), 'ATK terhubung ke item RAB');
  perform pg_temp.ok((select rab_item_id is not null from keu_kk_baris where id = pg_temp.kb('/transport#1')), 'Transport lokal terhubung ke item RAB');
  perform pg_temp.ok((select rab_item_id is null from keu_kk_baris where id = pg_temp.kb('transport pml#1')), 'PML belum ada di RAB');
  perform pg_temp.ok((select total_semula = 4910000 and total_menjadi = 4910000 and n_berubah = 0 from keu_v_kk_ringkas where jadwal_id = j and ro_kode = '2906.BMA.005'), 'ringkasan awal');
  perform pg_temp.sesi(null);
end $$;

-- B. Kecukupan KRO terhadap RAB dan parameter Master (D-28)
do $$
declare j bigint := pg_temp.jd();
begin
  perform pg_temp.ok((select status = 'Tipis' from keu_v_kk_kecukupan where jadwal_id = j and kro = '2906.BMA' and kelompok = '52L'), 'ATK: POK 1.000.000 = RAB, di bawah K = Tipis');
  perform pg_temp.ok((select status = 'Kurang' and kurang = 510000 from keu_v_kk_kecukupan where jadwal_id = j and kro = '2906.BMA' and kelompok = '524'), 'Transport: POK 3.400.000 < RAB 3.910.000 = Kurang 510.000');
  perform pg_temp.ok((select k = 1111111 from keu_v_kk_kecukupan where jadwal_id = j and kelompok = '52L'), 'K = 1.000.000 / 0,9');
  perform pg_temp.sesi(4);
  perform pg_temp.gagal($q$update keu_master_param set nilai = 1.0 where kode = 'faktor_kebutuhan'$q$, '42501');   -- ketua bukan pemegang master
  perform pg_temp.sesi(3);
  perform pg_temp.gagal($q$update keu_master_param set nilai = 2.0 where kode = 'faktor_kebutuhan'$q$, '23514');
  perform pg_temp.gagal($q$update keu_master_param set nilai = 0.9 where kode = 'toleransi_cukup'$q$, '23514');
  perform pg_temp.gagal($q$delete from keu_master_param where kode = 'faktor_kebutuhan'$q$, '42501');
  update keu_master_param set nilai = 1.0 where kode = 'faktor_kebutuhan';
  perform pg_temp.ok((select status = 'Cukup' from keu_v_kk_kecukupan where jadwal_id = j and kelompok = '52L'), 'faktor 1,0: POK = K = Cukup');
  update keu_master_param set nilai = 1.5 where kode = 'faktor_kebutuhan';
  perform pg_temp.ok((select status = 'Lebih' from keu_v_kk_kecukupan where jadwal_id = j and kelompok = '52L'), 'faktor 1,5: K kecil, POK jauh di atas = Lebih');
  update keu_master_param set nilai = 0.9 where kode = 'faktor_kebutuhan';
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_master_param.update') >= 3, 'jejak perubahan parameter');
  perform pg_temp.sesi(null);
end $$;

-- C. Ubah angka (P-01), kolom Semula terkunci, redaksi/akun tidak diedit langsung
do $$
declare atk bigint := pg_temp.kb('atk#1'); pml bigint := pg_temp.kb('transport pml#1'); lok bigint := pg_temp.kb('/transport#1');
begin
  perform pg_temp.sesi(6);
  update keu_kk_baris set vol_menjadi = 8 where id = atk;
  perform pg_temp.ok((select jumlah_menjadi = 800000 and selisih = -200000 from keu_kk_baris where id = atk), 'ATK 8 x 100.000');
  perform pg_temp.ok(pg_temp.pem(atk) = 'P-01', 'P-01 angka berubah');
  update keu_kk_baris set vol_menjadi = 10 where id = atk;
  perform pg_temp.ok((select jumlah_menjadi = jumlah_semula from keu_kk_baris where id = atk) and pg_temp.pem(atk) is null, 'kembali ke semula, pemicu hilang');
  update keu_kk_baris set harga_menjadi = 110000 where id = atk;
  perform pg_temp.ok((select jumlah_menjadi = 1100000 from keu_kk_baris where id = atk) and pg_temp.pem(atk) = 'P-01', 'harga berubah');
  update keu_kk_baris set harga_menjadi = harga_semula where id = atk;

  perform pg_temp.gagal(format($q$update keu_kk_baris set uraian_menjadi = 'Redaksi lain' where id = %s$q$, atk), '23514');
  perform pg_temp.gagal(format($q$update keu_kk_baris set akun_menjadi = '521811' where id = %s$q$, atk), '23514');
  perform pg_temp.gagal(format($q$update keu_kk_baris set sat_menjadi = 'OK' where id = %s$q$, atk), '23514');
  perform pg_temp.gagal(format($q$update keu_kk_baris set vol_semula = 99 where id = %s$q$, atk), '23514');
  perform pg_temp.gagal(format($q$update keu_kk_baris set jumlah_semula = 1 where id = %s$q$, atk), '23514');
  perform pg_temp.gagal(format($q$update keu_kk_baris set ro_kode = '2906.BMA.006' where id = %s$q$, atk), '23514');
  perform pg_temp.gagal(format($q$update keu_kk_baris set vol_menjadi = -1 where id = %s$q$, atk), '23514');
  perform pg_temp.gagal(format($q$delete from keu_kk_baris where id = %s$q$, atk), '42501');
  perform pg_temp.gagal(format($q$select keu_kk_hapus_baris(%s)$q$, atk), '23514');            -- baris POK tidak dapat dihapus

  -- P-07 lalu P-05
  update keu_kk_baris set vol_menjadi = 0 where id = pml;
  perform pg_temp.ok(pg_temp.pem(pml) = 'P-07', 'item nol, akun masih punya item lain = P-07');
  update keu_kk_baris set vol_menjadi = 0 where id = lok;
  perform pg_temp.ok(pg_temp.pem(pml) = 'P-05' and pg_temp.pem(lok) = 'P-05', 'seluruh akun nol = P-05');
  update keu_kk_baris set vol_menjadi = 3 where id = pml;
  update keu_kk_baris set vol_menjadi = 20 where id = lok;
  perform pg_temp.ok(pg_temp.pem(pml) is null and pg_temp.pem(lok) is null, 'dipulihkan');

  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$update keu_kk_baris set vol_menjadi = 9 where id = %s$q$, atk), '42501');   -- bendahara tidak berwenang
  perform pg_temp.sesi(null);
end $$;

-- D. Pasangan: ganti akun (P-03), ganti redaksi (P-02), gabungan (P-08), sebagian, batal
do $$
declare atk bigint := pg_temp.kb('atk#1'); pml bigint := pg_temp.kb('transport pml#1'); lok bigint := pg_temp.kb('/transport#1'); pb bigint; pb2 bigint; pb3 bigint;
begin
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_kk_pasangkan(%s,'999999')$q$, pml), '23514');             -- akun tidak ada di Master
  perform pg_temp.gagal(format($q$select keu_kk_pasangkan(%s)$q$, pml), '23514');                       -- tidak ada yang berbeda
  perform pg_temp.gagal(format($q$select keu_kk_pasangkan(%s,'521811',null,11)$q$, atk), '23514');     -- volume melebihi
  perform pg_temp.gagal(format($q$select keu_kk_pasangkan(%s,'521811',null,0)$q$, atk), '23514');

  pb := keu_kk_pasangkan(atk, '521811');
  perform pg_temp.ok((select akun_menjadi = '521811' and vol_menjadi = 10 and jumlah_menjadi = 1000000 and baru and pindah_dari = atk and rab_item_id is not null
                      from keu_v_kk_baris where id = pb), 'baris pasangan baru berisi salinan');
  perform pg_temp.ok((select vol_menjadi = 0 and jumlah_menjadi = 0 and pindah_ke = pb from keu_v_kk_baris where id = atk), 'baris lama dikosongkan dan menunjuk pasangannya');
  perform pg_temp.ok(pg_temp.pem(atk) = 'P-03' and pg_temp.pem(pb) = 'P-03', 'ganti akun = P-03 di kedua sisi');
  perform pg_temp.gagal(format($q$select keu_kk_pasangkan(%s,'522151')$q$, atk), '23514');             -- sudah berpasangan
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi,pindah_dari)
                                  select jadwal_id,ro_kode,komponen_kode,'522151','salinan kedua',1,'PAKET',1,%s from keu_kk_baris where id = %s$q$, atk, atk), '23505');

  pb2 := keu_kk_pasangkan(pml, null, 'Transport petugas pemutakhiran lapangan');
  perform pg_temp.ok(pg_temp.pem(pml) = 'P-02' and pg_temp.pem(pb2) = 'P-02', 'ganti redaksi = P-02');
  perform pg_temp.ok((select akun_menjadi = '524113' and uraian_menjadi = 'Transport petugas pemutakhiran lapangan' from keu_kk_baris where id = pb2), 'redaksi baru, akun sama');

  pb3 := keu_kk_pasangkan(lok, '524119', 'Transport lokal lain', 5);                                    -- sebagian, akun dan redaksi berubah
  perform pg_temp.ok((select vol_menjadi = 15 and jumlah_menjadi = 2550000 from keu_kk_baris where id = lok) and (select vol_menjadi = 5 and jumlah_menjadi = 850000 from keu_kk_baris where id = pb3), 'pemindahan sebagian');
  perform pg_temp.ok(pg_temp.pem(lok) = 'P-08' and pg_temp.pem(pb3) = 'P-08', 'akun dan redaksi berubah = P-08');
  perform pg_temp.ok((select total_semula = total_menjadi from keu_v_kk_ringkas where ro_kode = '2906.BMA.005' and jadwal_id = pg_temp.jd()), 'pasangan tidak mengubah total RO');

  -- batalkan semua pasangan: volume kembali ke baris lama
  perform keu_kk_hapus_baris(pb3); perform keu_kk_hapus_baris(pb2); perform keu_kk_hapus_baris(pb);
  perform pg_temp.ok((select count(*) = 3 and bool_and(jumlah_menjadi = jumlah_semula) and bool_and(pemicu is null) from keu_v_kk_baris where jadwal_id = pg_temp.jd()), 'semua kembali ke semula');
  perform pg_temp.sesi(null);
end $$;

-- E. Baris baru, Dana penggenap, satuan baku
do $$
declare j bigint := pg_temp.jd(); n1 bigint; n2 bigint; pg bigint;
begin
  perform pg_temp.sesi(6);
  insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi)
    values (j,'2906.BMA.005','055','522151','Honor narasumber (baru)',1,'PAKET',900000) returning id into n1;
  perform pg_temp.ok(pg_temp.pem(n1) = 'P-04' and (select jumlah_menjadi = 900000 and baru and akun_semula is null and jumlah_semula = 0 from keu_v_kk_baris where id = n1), 'akun belum ada di komponen = P-04');
  insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi)
    values (j,'2906.BMA.005','055','524113','Transport tambahan',2,'O-K',170000) returning id into n2;
  perform pg_temp.ok(pg_temp.pem(n2) = 'P-06' and (select sat_menjadi = 'OK' from keu_kk_baris where id = n2), 'akun sudah ada = P-06; satuan O-K dibakukan jadi OK');

  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi) values (%s,'2906.BMA.005','055','522151','Honor y',1,'XYZ',1000)$q$, j), '23514');
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi) values (%s,'2906.BMA.005','055','999999','Honor y',1,'PAKET',1000)$q$, j), '23514');
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi) values (%s,'2906.BMA.005','999','522151','Honor y',1,'PAKET',1000)$q$, j), '23514');
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,vol_menjadi,sat_menjadi,harga_menjadi) values (%s,'2906.BMA.005','055','522151',1,'PAKET',1000)$q$, j), '23514');

  -- Dana penggenap (D-09)
  insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi,penggenap)
    values (j,'2906.BMA.005','055','524113','Perjalanan dinas Kabupaten',1,'PAKET',100000,true) returning id into pg;
  perform pg_temp.ok(pg_temp.pem(pg) is null and (select penggenap and baru from keu_v_kk_baris where id = pg), 'penggenap tanpa pemicu');
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi,penggenap) values (%s,'2906.BMA.005','055','524113','Kedua',1,'PAKET',1,true)$q$, j), '23505');
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi,penggenap) values (%s,'2906.BMA.005','055','511111','Gaji kabupaten',1,'PAKET',1,true)$q$, j), '23514');
  perform pg_temp.ok((select n_penggenap = 1 and total_penggenap = 100000 from keu_v_kk_ringkas where jadwal_id = j and ro_kode = '2906.BMA.005'), 'ringkasan penggenap');
  perform pg_temp.ok(pg_temp.rs('R-09') = 'kuning', 'R-09 menyala kuning');
  perform pg_temp.gagal(format($q$update keu_kk_baris set penggenap = false where id = %s$q$, pg), '23514');

  -- bersihkan
  perform keu_kk_hapus_baris(pg); perform keu_kk_hapus_baris(n2); perform keu_kk_hapus_baris(n1);
  perform pg_temp.ok((select count(*) = 3 from keu_kk_baris where jadwal_id = j), 'kembali tiga baris');
  perform pg_temp.sesi(null);
end $$;

-- F. Skenario seimbang, geseran, keputusan PPK per KRO
do $$
declare j bigint := pg_temp.jd(); atk bigint := pg_temp.kb('atk#1'); h bigint; g1 bigint; g2 bigint; lok bigint := pg_temp.kb('/transport#1');
begin
  perform pg_temp.sesi(6);
  update keu_kk_baris set vol_menjadi = 8 where id = atk;
  insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi)
    values (j,'2906.BMA.005','055','522151','Honor narasumber (baru)',1,'PAKET',200000) returning id into h;
  perform pg_temp.ok(pg_temp.rs('R-01') = 'hijau' and pg_temp.rs('R-03') = 'hijau' and pg_temp.rs('R-05') = 'hijau' and pg_temp.rs('R-16', '2906.BMA/52L') = 'hijau',
                     'skenario seimbang: R-01/R-03/R-05/R-16 hijau');
  perform pg_temp.ok((select merah = 0 from keu_v_kk_periksa_ringkas where jadwal_id = j), 'tidak ada merah');

  -- buku geseran (D-08)
  insert into keu_kk_geseran(jadwal_id, donor_id, penerima_id, jumlah, catatan) values (j, atk, h, 200000, 'ATK ke honor') returning id into g1;
  perform pg_temp.ok((select dibuat_oleh = 6 from keu_kk_geseran where id = g1), 'pencatat geseran = sesi');
  perform pg_temp.ok((select count(*) = 0 from keu_v_kk_geseran_beda where jadwal_id = j), 'geseran sesuai perubahan baris');
  perform pg_temp.gagal(format($q$insert into keu_kk_geseran(jadwal_id,donor_id,penerima_id,jumlah) values (%s,%s,%s,1000)$q$, j, atk, lok), '23514');   -- lintas kelompok 52L -> 524
  perform pg_temp.gagal(format($q$insert into keu_kk_geseran(jadwal_id,donor_id,penerima_id,jumlah) values (%s,%s,%s,0)$q$, j, atk, h), '23514');
  perform pg_temp.gagal(format($q$insert into keu_kk_geseran(jadwal_id,donor_id,penerima_id,jumlah) values (%s,%s,%s,5)$q$, j, atk, atk), '23514');
  insert into keu_kk_geseran(jadwal_id, donor_id, penerima_id, jumlah) values (j, atk, h, 500000) returning id into g2;
  perform pg_temp.ok((select count(*) = 2 from keu_v_kk_geseran_beda where jadwal_id = j), 'geseran melebihi perubahan terdeteksi (donor dan penerima)');
  update keu_kk_geseran set batal = true where id = g2;
  perform pg_temp.ok((select batal and batal_oleh = 6 and batal_at is not null from keu_kk_geseran where id = g2), 'batal tercatat');
  perform pg_temp.ok((select count(*) = 0 from keu_v_kk_geseran_beda where jadwal_id = j), 'setelah batal tidak ada selisih');
  perform pg_temp.gagal(format('update keu_kk_geseran set batal = false, batal_at = null where id = %s', g2), '23514');
  perform pg_temp.gagal(format('update keu_kk_geseran set jumlah = 1 where id = %s', g1), '23514');
  perform pg_temp.gagal(format('delete from keu_kk_geseran where id = %s', g1), '42501');
  perform pg_temp.gagal(format($q$select keu_kk_hapus_baris(%s)$q$, h), '23514');                     -- masih tercatat di buku geseran
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$insert into keu_kk_geseran(jadwal_id,donor_id,penerima_id,jumlah) values (%s,%s,%s,1000)$q$, j, atk, h), '42501');

  -- buku selisih dan keputusan PPK
  perform pg_temp.sesi(null);
  perform pg_temp.ok((select kurang_kro = 710000 and count(*) = 2 from keu_v_kk_buku_selisih where jadwal_id = j and kro = '2906.BMA' group by kurang_kro), 'buku selisih KRO 2906.BMA: 200.000 + 510.000');
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_kk_putuskan(%s,'2906.BMA','semua')$q$, j), '42501');      -- ketua bukan PPK
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_kk_putuskan(%s,'2896.BMA','semua')$q$, j), '23514');      -- tidak ada kekurangan
  perform pg_temp.gagal(format($q$select keu_kk_putuskan(%s,'2906.BMA','sebagian')$q$, j), '23514');   -- sebagian tanpa jumlah
  perform pg_temp.gagal(format($q$select keu_kk_putuskan(%s,'2906.BMA','sebagian', 800000)$q$, j), '23514');   -- melebihi kekurangan
  perform pg_temp.gagal(format($q$select keu_kk_putuskan(%s,'2906.BMA','semua', 5)$q$, j), '23514');
  perform pg_temp.gagal(format($q$select keu_kk_putuskan(%s,'bukan-kro','tunda')$q$, j), '23514');
  perform keu_kk_putuskan(j, '2906.BMA', 'sebagian', 600000, 'Terima sebagian dahulu');
  perform pg_temp.ok((select keputusan = 'sebagian' and jumlah_diterima = 600000 and catatan_ppk = 'Terima sebagian dahulu' from keu_v_kk_buku_selisih where jadwal_id = j and kelompok = '524'), 'keputusan tampil di buku selisih');
  perform keu_kk_putuskan(j, '2906.BMA', 'tunda');                                                    -- dapat diubah selama jendela terbuka
  perform pg_temp.ok((select keputusan = 'tunda' and jumlah is null from keu_kk_keputusan_kro where jadwal_id = j and kro = '2906.BMA'), 'keputusan diubah menjadi tunda');
  perform pg_temp.ok((select count(*) = 1 from keu_kk_keputusan_kro where jadwal_id = j), 'satu keputusan per KRO');
  perform pg_temp.ok((select count(*) >= 2 from sigap_audit where aksi like 'keu.keu_kk_keputusan_kro.%'), 'jejak keputusan');
  perform pg_temp.sesi(null);
end $$;

-- G. Pemeriksaan merah: kelompok melintas (R-16), antar-KRO (R-05), dan gerbang penerapan
do $$
declare j bigint := pg_temp.jd(); lok bigint := pg_temp.kb('/transport#1'); atk bigint := pg_temp.kb('atk#1'); h bigint; x bigint; y bigint; u bigint; st text;
begin
  perform pg_temp.sesi(6);
  update keu_kk_baris set vol_menjadi = 19 where id = lok;                                              -- 524: -170.000
  insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi)
    values (j,'2906.BMA.005','055','521811','Persediaan tambahan',1,'PAKET',170000) returning id into x;   -- 52L: +170.000
  perform pg_temp.ok(pg_temp.rs('R-16', '2906.BMA/524') = 'merah' and pg_temp.rs('R-16', '2906.BMA/52L') = 'merah', 'dana melintas 524 -> 52L = R-16 merah');
  perform pg_temp.ok(pg_temp.rs('R-05') = 'hijau' and pg_temp.rs('R-01') = 'hijau', 'pagu KRO dan satker tetap');
  perform keu_kk_hapus_baris(x); update keu_kk_baris set vol_menjadi = 20 where id = lok;
  perform pg_temp.ok((select merah = 0 from keu_v_kk_periksa_ringkas where jadwal_id = j), 'pulih tanpa merah');

  -- antar-KRO: ATK turun 100.000, baris baru di RO 2896.BMA.004 naik 100.000 (oleh PPK yang menjadi ketua RO itu)
  update keu_kk_baris set vol_menjadi = 7 where id = atk;
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi) values (%s,'2896.BMA.004','055','521811','Penerima antar-KRO',1,'PAKET',100000)$q$, j), '42501');
  perform pg_temp.sesi(3);
  insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi)
    values (j,'2896.BMA.004','055','521811','Penerima antar-KRO',1,'PAKET',100000) returning id into y;
  perform pg_temp.ok((select jumlah_menjadi = 100000 from keu_kk_baris where id = y), 'baris baru RO lain oleh PPK');
  perform pg_temp.ok(pg_temp.rs('R-05', '2906.BMA') = 'merah' and pg_temp.rs('R-05', '2896.BMA') = 'merah', 'pagu KRO berubah = R-05 merah');
  perform pg_temp.ok(pg_temp.rs('R-01') = 'hijau', 'total satker tetap');

  -- usulan RO mengunci kertas kerja bagi non-PPK
  perform pg_temp.sesi(6);
  insert into keu_revisi_usulan(jadwal_id, ro_kode, dibuat_oleh) values (j, '2906.BMA.005', 6) returning id into u;
  perform keu_usulan_aksi(u, 'ajukan');
  perform pg_temp.gagal(format('update keu_kk_baris set vol_menjadi = 6 where id = %s', atk), '23514');
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format('update keu_kk_baris set vol_menjadi = 6 where id = %s', atk), '23514');
  perform keu_usulan_aksi(u, 'setuju_ketua');
  perform pg_temp.sesi(3);
  update keu_kk_baris set vol_menjadi = 8 where id = atk;                                              -- PPK tetap boleh
  perform keu_usulan_aksi(u, 'kembalikan', 'Perbaiki rincian kertas kerja');
  perform pg_temp.sesi(6);
  update keu_kk_baris set vol_menjadi = 7 where id = atk;                                              -- terbuka lagi setelah dikembalikan
  perform pg_temp.sesi(3);

  -- gerbang penerapan
  st := keu_jadwal_aksi(j, 'tutup');
  perform pg_temp.ok(st = 'terkumpul', 'tutup');
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format('update keu_kk_baris set vol_menjadi = 6 where id = %s', atk), '42501');   -- jendela ditutup, hanya PPK
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_jadwal_aksi(%s,'terapkan')$q$, j), '23514');              -- masih merah (R-05)
  perform pg_temp.ok((select status from keu_revisi_jadwal where id = j) = 'terkumpul', 'status tidak berubah bila ditolak');
  update keu_kk_baris set vol_menjadi = 8 where id = atk;
  perform pg_temp.ok((select jumlah_menjadi = 800000 from keu_kk_baris where id = atk), 'PPK mengubah saat terkumpul');
  perform keu_kk_hapus_baris(y);
  -- sisakan skenario seimbang F (ATK 8 + honor 200.000)
  perform pg_temp.ok((select merah = 0 from keu_v_kk_periksa_ringkas where jadwal_id = j), 'merah hilang');
  st := keu_jadwal_aksi(j, 'terapkan');
  perform pg_temp.ok(st = 'diterapkan', 'diterapkan setelah tidak ada merah');
  perform pg_temp.gagal(format('update keu_kk_baris set vol_menjadi = 9 where id = %s', atk), '23514');   -- beku
  perform pg_temp.gagal(format($q$select keu_kk_putuskan(%s,'2906.BMA','tunda')$q$, j), '23514');
  perform pg_temp.gagal(format($q$insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi) values (%s,'2906.BMA.005','055','522151','Terlambat',1,'PAKET',1)$q$, j), '23514');
  perform pg_temp.gagal(format($q$insert into keu_kk_geseran(jadwal_id,donor_id,penerima_id,jumlah) select %s, %s, id, 1 from keu_kk_baris where uraian_menjadi like 'Honor narasumber%%' and jadwal_id = %s$q$, j, atk, j), '23514');
  perform pg_temp.sesi(null);
end $$;

-- H. Mode Revisi DIPA: pagu naik tidak merah, pemeriksaan jadi info
do $$
declare j2 bigint; st text; n int;
begin
  insert into keu_revisi_jadwal(tahun, jenis, judul, buka, tutup) values (2026, 'dipa_dja', 'Revisi DIPA DJA uji', '2026-12-20', '2026-12-22') returning id into j2;
  perform pg_temp.sesi(3);
  perform keu_jadwal_aksi(j2, 'buka');
  n := keu_kk_muat_ro(j2, '2906.BMA.005');
  perform pg_temp.ok(n = 3, 'muat RO pada jadwal DJA');
  insert into keu_kk_baris(jadwal_id,ro_kode,komponen_kode,akun_menjadi,uraian_menjadi,vol_menjadi,sat_menjadi,harga_menjadi)
    values (j2,'2906.BMA.005','055','521811','Tambahan pagu DJA',1,'PAKET',100000);
  perform pg_temp.ok((select tingkat from keu_v_kk_periksa where jadwal_id = j2 and kode = 'R-01') = 'hijau', 'R-01 hijau pada jalur DJA');
  perform pg_temp.ok((select tingkat from keu_v_kk_periksa where jadwal_id = j2 and kode = 'R-05') = 'info', 'R-05 info pada Revisi DIPA');
  perform pg_temp.ok((select tingkat from keu_v_kk_periksa where jadwal_id = j2 and kode = 'R-16' and objek = '2906.BMA/52L') = 'info', 'R-16 info pada Revisi DIPA');
  perform pg_temp.ok((select merah = 0 from keu_v_kk_periksa_ringkas where jadwal_id = j2), 'tanpa merah');
  perform keu_jadwal_aksi(j2, 'tutup');
  st := keu_jadwal_aksi(j2, 'terapkan');
  perform pg_temp.ok(st = 'diterapkan', 'jalur DJA dapat diterapkan');
  -- pada jadwal POK yang sama, kenaikan pagu = R-01 merah
  perform pg_temp.sesi(null);
end $$;

-- I. Hak, RLS, jejak
do $$
declare r record;
begin
  for r in select c.relname, c.relrowsecurity from pg_class c where c.relname in ('keu_master_param','keu_kk_baris','keu_kk_geseran','keu_kk_keputusan_kro') loop
    perform pg_temp.ok(r.relrowsecurity, 'RLS aktif ' || r.relname);
    perform pg_temp.ok(not has_table_privilege('authenticated', r.relname, 'select') and not has_table_privilege('anon', r.relname, 'select'), 'tanpa hak tabel ' || r.relname);
    perform pg_temp.ok(has_table_privilege('service_role', r.relname, 'select'), 'service_role ' || r.relname);
  end loop;
  perform pg_temp.ok(not has_function_privilege('authenticated', 'keu_kk_pasangkan(bigint,text,text,numeric)', 'execute')
                     and not has_function_privilege('authenticated', 'keu_kk_hapus_baris(bigint)', 'execute')
                     and not has_function_privilege('authenticated', 'keu_kk_muat_ro(bigint,text)', 'execute')
                     and not has_function_privilege('authenticated', 'keu_kk_putuskan(bigint,text,text,numeric,text)', 'execute')
                     and not has_function_privilege('anon', 'keu_kk_izin(bigint,text,bigint)', 'execute')
                     and not has_function_privilege('authenticated', 'keu_kk_sebelum()', 'execute')
                     and not has_function_privilege('authenticated', 'keu_kk_gerbang()', 'execute'), 'fungsi kertas kerja tertutup');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'keu_v_kk_baris', 'select') and not has_table_privilege('authenticated', 'keu_v_kk_periksa', 'select')
                     and not has_table_privilege('authenticated', 'keu_v_kk_kecukupan', 'select') and not has_table_privilege('authenticated', 'keu_v_kk_buku_selisih', 'select'), 'view tertutup');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_kk_baris.update') >= 5, 'jejak ubah baris');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_kk_baris.insert' and (detail->'baru'->>'detail_id') is not null) = 0, 'muat POK tidak membanjiri jejak');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_kk_baris.insert') >= 3, 'jejak baris baru');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_kk_baris.delete') >= 3, 'jejak penghapusan baris baru');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi = 'keu.keu_kk_geseran.insert') >= 2, 'jejak geseran');
end $$;
