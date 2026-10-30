\set ON_ERROR_STOP on
-- Uji Fase E (i): Administrasi per item POK - lembar dokumen, unggah, verifikasi, kembalikan, hak akses.
-- Dijalankan sesudah 40 pada basis data yang sama (POK berlaku nomor revisi 11: item 16 ATK, 17 transport,
-- 18 transport PML kabupaten, 19 snack rapat, 20 materai; semua RO 2906.BMA.005 komponen 055).
-- Akun: 3 PPK, 4 ketua 005/006, 5 mantan ketua 006 (berakhir 1 Juli), 6 admin RO 005, 7 bendahara, 8 TU (verifikasi global), 9 mitra (admin RO + PBJ 005, verifikasi 005).
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
-- id dokumen master menurut sumber, kode, seksi, nomor
create or replace function pg_temp.d(p_sumber text, p_kode text, p_huruf text, p_no int) returns bigint language sql as $$
  select id from keu_master_dok where sumber = p_sumber and kode = p_kode and seksi_huruf = p_huruf and no = p_no $$;
create or replace function pg_temp.berkas(p_nama text, p_h text default 'a') returns jsonb language sql as $$
  select jsonb_build_object('nama', p_nama, 'hash', repeat(p_h, 64), 'ukuran', 2048, 'path', 'adm/' || p_nama) $$;
-- id detail menurut uraian pada POK berlaku
create or replace function pg_temp.it(p_ura text) returns bigint language sql as $$
  select dt.id from keu_pok_detail dt join keu_pok_versi v on v.id = dt.versi_id and v.status = 'berlaku' where dt.uraian = p_ura $$;

-- ================= A. Persiapan akun tambahan dan akses (mode editor, tanpa akun sesi) =================
do $$
begin
  perform pg_temp.sesi(null);
  insert into sigap_akun(nama, jenis) values ('Perencana','organik'), ('Anggota','organik'), ('Pegawai biasa','organik');
  insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai)
    select a.id, 'RENC', null, current_date - 5 from sigap_akun a where a.nama = 'Perencana';
  insert into keu_akses_adm(akun_id, ro_kode, berlaku_mulai)
    select a.id, null, current_date - 5 from sigap_akun a where a.nama in ('Perencana')
    union all select id, null, current_date - 5 from sigap_akun where nama = 'TU';
  insert into keu_akses_adm(akun_id, ro_kode, berlaku_mulai)
    select a.id, '2906.BMA.005', current_date - 5 from sigap_akun a where a.nama = 'Anggota';
end $$;

-- ================= B. Hak membuka tab Administrasi =================
do $$
declare n_renc bigint := (select id from sigap_akun where nama = 'Perencana');
        n_ang bigint := (select id from sigap_akun where nama = 'Anggota');
        n_biasa bigint := (select id from sigap_akun where nama = 'Pegawai biasa');
begin
  perform pg_temp.ok(keu_adm_buka(3, '2906.BMA.005'), 'PPK membuka');
  perform pg_temp.ok(keu_adm_buka(4, '2906.BMA.005'), 'ketua A membuka 005');
  perform pg_temp.ok(not keu_adm_buka(5, '2906.BMA.005'), 'ketua B bukan ketua 005');
  perform pg_temp.ok(not keu_adm_buka(5, '2906.BMA.006'), 'penugasan ketua B di 006 sudah berakhir (1 Juli)');
  perform pg_temp.ok(keu_adm_buka(4, '2906.BMA.006'), 'ketua A membuka 006');
  perform pg_temp.ok(keu_adm_buka(6, '2906.BMA.005'), 'admin RO membuka 005');
  perform pg_temp.ok(not keu_adm_buka(6, '2906.BMA.006'), 'admin RO tidak membuka 006');
  perform pg_temp.ok(keu_adm_buka(7, '2906.BMA.005'), 'bendahara membuka semua RO');
  perform pg_temp.ok(keu_adm_buka(8, '2906.BMA.005'), 'TU membuka lewat akses Administrasi global');
  perform pg_temp.ok(keu_adm_buka(n_renc, '2906.BMA.006'), 'perencana membuka lewat akses global');
  perform pg_temp.ok(keu_adm_buka(n_ang, '2906.BMA.005'), 'anggota membuka RO yang diberi akses');
  perform pg_temp.ok(not keu_adm_buka(n_ang, '2906.BMA.006'), 'anggota tidak membuka RO lain');
  perform pg_temp.ok(not keu_adm_buka(n_biasa, '2906.BMA.005'), 'pegawai biasa tidak membuka');
  perform pg_temp.ok(not keu_adm_buka(1, '2906.BMA.005'), 'admin aplikasi tidak otomatis membuka');
  perform pg_temp.ok(not keu_adm_buka(null, '2906.BMA.005'), 'akun kosong tidak membuka');
  perform pg_temp.ok((select count(*) = 1 and min(ro_kode) = '2906.BMA.005' from keu_adm_ro_terbuka(n_ang)), 'daftar RO anggota');
  perform pg_temp.ok((select count(*) = (select count(*) from keu_ro where aktif) from keu_adm_ro_terbuka(3)), 'daftar RO PPK = semua RO aktif');
end $$;

-- ================= C. Aturan penentuan lembar (fungsi murni) =================
do $$
declare r record; n int := 0;
begin
  for r in select * from (values
    ('521211','Konsumsi rapat','skema','521211','A'), ('521211','Cetak spanduk kegiatan','skema','521211','C'),
    ('521211','Pulsa petugas','skema','521211','D'), ('521211','Fotokopi kuesioner','skema','521211','B'),
    ('521211','Materai','skema','521211','A'), ('521211','Uang lembur petugas','skema','Lembur',''),
    ('521213','Honor camat','skema','521213','B'), ('521213','Honor instruktur','skema','521213','C'),
    ('521213','Honor pns bps','skema','521213','E'), ('521213','Honor tim pelaksana','skema','521213','A'),
    ('521213','Honor petugas lapangan','skema','521213','D'),
    ('524113','Transport lokal','skema','524113','A'), ('524113','Transport lebih dari 8 jam','skema','524113','B'),
    ('524114','Paket meeting fullboard','skema','524114','B'), ('524114','Rapat koordinasi','skema','524114','A'),
    ('524119','Hotel luar kota','skema','524119','B'), ('524111','Perjalanan dinas biasa','skema','524111','A'),
    ('521811','Barang persediaan','skema','521811',''), ('522151','Jasa profesi','skema','522151',''),
    ('511111','Gaji pokok','pola','PEG',''), ('532111','Laptop','pola','MDL',''), ('523121','Servis AC','pola','MLH','')
  ) as t(akun, ura, e_sumber, e_kode, e_huruf)
  loop
    n := n + 1;
    perform pg_temp.ok((select count(*) = 1 and bool_and(t.sumber = r.e_sumber and t.kode = r.e_kode and t.seksi_huruf = r.e_huruf)
                        from keu_adm_tentukan(r.akun, r.ura) t),
                       format('aturan lembar %s "%s" -> %s/%s/%s', r.akun, r.ura, r.e_sumber, r.e_kode, r.e_huruf));
  end loop;
  perform pg_temp.ok(not exists (select 1 from keu_adm_tentukan('999999', 'Akun tak dikenal')), 'akun tak dikenal tanpa lembar');
  perform pg_temp.ok(not exists (select 1 from keu_adm_tentukan(null, null)), 'akun kosong tanpa lembar');
  raise notice 'aturan lembar diperiksa: % kasus', n;
end $$;

-- ================= D. Alur dokumen item ATK (item 16, skema 521211-B) =================
do $$
declare i bigint := pg_temp.it('ATK');
        kak bigint := pg_temp.d('skema','521211','B',1);       -- Tim Kerja, dapat dibuat SIGAP
        daftar bigint := pg_temp.d('skema','521211','B',3);    -- Tim Kerja, bukan SIGAP
        bast bigint := pg_temp.d('skema','521211','B',4);      -- PBJ
        invoice bigint := pg_temp.d('skema','521211','B',6);   -- PBJ
        ssp bigint := pg_temp.d('skema','521211','B',8);       -- Bendahara
        transfer bigint := pg_temp.d('skema','521211','B',9);  -- Bendahara
        n_biasa bigint := (select id from sigap_akun where nama = 'Pegawai biasa');
        n_ang bigint := (select id from sigap_akun where nama = 'Anggota');
        n_renc bigint := (select id from sigap_akun where nama = 'Perencana');
        a bigint;
begin
  perform pg_temp.ok((select n_dok = 9 and status_item = 'belum' and asal = 'aturan' from keu_v_adm_item where detail_id = i), 'ATK: 9 dokumen, belum');

  -- tanpa akses atau bukan pihak
  perform pg_temp.sesi(n_biasa);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('kak.pdf'))$q$, i, kak), '42501');
  perform pg_temp.sesi(7);   -- bendahara bukan pihak Tim Kerja
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('kak.pdf'))$q$, i, kak), '42501');
  perform pg_temp.sesi(n_renc);   -- perencana membuka tab tetapi bukan pihak dokumen ini
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('kak.pdf'))$q$, i, kak), '42501');
  perform pg_temp.sesi(null);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('kak.pdf'))$q$, i, kak), '42501');   -- akun wajib

  -- draf SIGAP
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'draf')$q$, i, daftar), '23514');   -- tidak dapat dibuat SIGAP
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'tebak')$q$, i, kak), '22023');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('kak.pdf'))$q$, 999999, kak), '23514');   -- item tak ada
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('kak.pdf'))$q$, i, pg_temp.d('skema','524113','A',1)), '23514');   -- dokumen lembar lain
  a := keu_adm_aksi(i, kak, 'draf', null, 'templat awal');
  perform pg_temp.ok((select status = 'draf' and catatan = 'templat awal' from keu_adm_dok where id = a), 'status draf');

  -- berkas tidak sah
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah')$q$, i, kak), '23514');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah','{"nama":"kak.pdf"}'::jsonb)$q$, i, kak), '23514');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',jsonb_set(pg_temp.berkas('kak.pdf'),'{hash}','"xyz"'))$q$, i, kak), '23514');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',jsonb_set(pg_temp.berkas('kak.pdf'),'{ukuran}','0'))$q$, i, kak), '23514');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',jsonb_set(pg_temp.berkas('kak.pdf'),'{path}','""'))$q$, i, kak), '23514');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',jsonb_set(pg_temp.berkas('kak.pdf'),'{ukuran}','"abc"'))$q$, i, kak), '23514');

  -- unggah oleh ketua; draf tidak dapat dibuat lagi
  perform keu_adm_aksi(i, kak, 'unggah', pg_temp.berkas('kak.pdf'), 'KAK ditandatangani');
  perform pg_temp.ok((select status = 'terunggah' and diunggah_oleh = 4 and berkas_nama = 'kak.pdf' from keu_adm_dok where id = a), 'terunggah');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'draf')$q$, i, kak), '23514');
  -- ganti berkas selagi terunggah
  perform keu_adm_aksi(i, kak, 'unggah', pg_temp.berkas('kak-v2.pdf', 'b'));
  perform pg_temp.ok((select berkas_nama = 'kak-v2.pdf' and berkas_hash = repeat('b',64) from keu_adm_dok where id = a), 'berkas diganti');

  -- verifikasi: ketua dan admin RO tidak berwenang; pengunggah tidak memverifikasi sendiri
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, kak), '42501');
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, kak), '42501');
  perform pg_temp.sesi(7);   -- bendahara hanya dokumen yang melibatkan Bendahara
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, kak), '42501');
  perform pg_temp.sesi(8);   -- TU diberi kewenangan verifikasi oleh PPK
  perform keu_adm_aksi(i, kak, 'verifikasi', null, 'sesuai');
  perform pg_temp.ok((select status = 'terverifikasi' and diverifikasi_oleh = 8 from keu_adm_dok where id = a), 'terverifikasi oleh TU');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, kak), '23514');   -- sudah terverifikasi
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('baru.pdf'))$q$, i, kak), '23514');   -- harus dikembalikan dulu

  -- dokumen bendahara: bendahara mengunggah, tidak boleh memverifikasi sendiri; PPK dan TU boleh
  perform pg_temp.sesi(7);
  a := keu_adm_aksi(i, ssp, 'unggah', pg_temp.berkas('ssp.pdf', 'c'));
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, ssp), '42501');   -- sendiri
  perform pg_temp.sesi(3);
  perform keu_adm_aksi(i, ssp, 'verifikasi');
  perform pg_temp.ok((select status = 'terverifikasi' and diverifikasi_oleh = 3 from keu_adm_dok where id = a), 'SSP diverifikasi PPK');
  -- bendahara memverifikasi dokumen bendahara yang diunggah orang lain
  perform pg_temp.sesi(3);
  a := keu_adm_aksi(i, transfer, 'unggah', pg_temp.berkas('tf.pdf', 'd'));    -- PPK boleh semua dokumen
  perform pg_temp.sesi(7);
  perform keu_adm_aksi(i, transfer, 'verifikasi');
  perform pg_temp.ok((select status = 'terverifikasi' and diverifikasi_oleh = 7 from keu_adm_dok where id = a), 'bendahara memverifikasi dokumen bendahara');

  -- PPK mengunggah dan memverifikasi sendiri (pengecualian)
  perform pg_temp.sesi(3);
  a := keu_adm_aksi(i, invoice, 'unggah', pg_temp.berkas('inv.pdf', 'e'));
  perform keu_adm_aksi(i, invoice, 'verifikasi');
  perform pg_temp.ok((select status = 'terverifikasi' and diunggah_oleh = 3 and diverifikasi_oleh = 3 from keu_adm_dok where id = a), 'PPK memverifikasi sendiri');

  -- mitra: admin RO + PBJ pada 005
  perform pg_temp.sesi(9);
  a := keu_adm_aksi(i, bast, 'unggah', pg_temp.berkas('bast.pdf', 'f'));       -- sebagai PBJ
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, bast), '42501');   -- pengunggah, pemegang verifikasi RO 005
  perform keu_adm_aksi(i, daftar, 'unggah', pg_temp.berkas('alokasi.pdf', '1'));  -- sebagai admin RO (Tim Kerja)
  perform pg_temp.sesi(n_ang);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'unggah',pg_temp.berkas('x.pdf'))$q$, i, bast), '42501');   -- anggota hanya pihak Tim Kerja
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, daftar), '42501');

  -- mengembalikan
  perform pg_temp.sesi(8);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'kembalikan')$q$, i, daftar), '23514');         -- alasan wajib
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'kembalikan',null,'baik')$q$, i, daftar), '23514');   -- kurang dari 5 huruf
  perform keu_adm_aksi(i, daftar, 'kembalikan', null, 'tanda terima belum lengkap');
  perform pg_temp.ok((select status = 'belum' and berkas_hash is null and diunggah_oleh is null and catatan = 'tanda terima belum lengkap'
                      from keu_adm_dok where kunci_stabil = (select kunci_stabil from keu_pok_detail where id = i) and dok_id = daftar), 'dikembalikan: berkas dibersihkan, alasan tersimpan');
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'kembalikan',null,'alasan cukup panjang')$q$, i, daftar), '23514');   -- sudah belum
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'verifikasi')$q$, i, daftar), '23514');                                -- belum diunggah
  -- dokumen terverifikasi hanya dikembalikan PPK
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'kembalikan',null,'salah tanggal')$q$, i, kak), '42501');   -- TU bukan PPK
  perform pg_temp.sesi(3);
  perform keu_adm_aksi(i, kak, 'kembalikan', null, 'tanggal KAK salah');
  perform pg_temp.ok((select status = 'belum' from keu_adm_dok where dok_id = kak and kunci_stabil = (select kunci_stabil from keu_pok_detail where id = i)), 'PPK mengembalikan dokumen terverifikasi');
  -- riwayat: lengkap dan urut
  perform pg_temp.ok((select string_agg(aksi, ',' order by r.id) = 'draf,unggah,unggah,verifikasi,kembalikan'
                      from keu_adm_riwayat r where r.dok_id = kak and r.kunci_stabil = (select kunci_stabil from keu_pok_detail where id = i)), 'riwayat dokumen KAK');
  perform pg_temp.ok((select ke_status = 'terunggah' and berkas_nama = 'kak-v2.pdf' and oleh = 4 from keu_adm_riwayat r
                      where r.dok_id = kak and aksi = 'unggah' order by r.id desc limit 1), 'riwayat menyimpan berkas terakhir');
end $$;

-- ================= E. Penjaga tabel dan transisi status =================
do $$
declare i bigint := pg_temp.it('ATK'); kak bigint := pg_temp.d('skema','521211','B',1); v_adm bigint;
begin
  select id into v_adm from keu_adm_dok where dok_id = kak and kunci_stabil = (select kunci_stabil from keu_pok_detail where id = i);
  -- dari aplikasi: tidak boleh DML langsung
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$update keu_adm_dok set catatan = 'ubah' where id = %s$q$, v_adm), '42501');
  perform pg_temp.gagal(format($q$delete from keu_adm_dok where id = %s$q$, v_adm), '42501');
  perform pg_temp.gagal(format($q$insert into keu_adm_dok(kunci_stabil, ro_kode, dok_id) values ('x/y/z/u#1','2906.BMA.005',%s)$q$, kak), '42501');
  perform pg_temp.gagal($q$update keu_adm_riwayat set catatan = 'ubah'$q$, '42501');
  perform pg_temp.gagal($q$delete from keu_adm_riwayat$q$, '42501');
  perform pg_temp.gagal($q$insert into keu_adm_peta(kunci_stabil, ro_kode, sumber, kode, seksi_huruf) values ('x','2906.BMA.005','skema','521211','A')$q$, '42501');
  -- mode editor: batasan tetap berlaku
  perform pg_temp.sesi(null);
  perform pg_temp.gagal(format($q$update keu_adm_dok set status = 'terverifikasi' where id = %s$q$, v_adm), '23514');     -- belum -> terverifikasi dilarang
  perform pg_temp.gagal(format($q$update keu_adm_dok set status = 'terunggah' where id = %s$q$, v_adm), '23514');         -- terunggah tanpa berkas
  perform pg_temp.gagal(format($q$update keu_adm_dok set dok_id = dok_id + 1 where id = %s$q$, v_adm), '23514');
  perform pg_temp.gagal(format($q$update keu_adm_dok set kunci_stabil = 'lain' where id = %s$q$, v_adm), '23514');          -- kunci hanya oleh fungsi
  perform pg_temp.gagal(format($q$insert into keu_adm_dok(kunci_stabil, ro_kode, dok_id, status) values ('x/y/z/u#1','2906.BMA.005',%s,'draf')$q$, kak), '23514');
  perform pg_temp.gagal(format($q$update keu_adm_dok set berkas_nama = 'a.pdf' where id = %s$q$, v_adm), '23514');          -- berkas pada status belum
  perform pg_temp.gagal($q$insert into keu_adm_peta(kunci_stabil, ro_kode, sumber, kode, seksi_huruf) values ('x','2906.BMA.005','skema','521211','Z')$q$, '23503');
  perform pg_temp.gagal($q$insert into keu_adm_peta(kunci_stabil, ro_kode, sumber, kode) values ('x','2906.BMA.005','tebak','521211')$q$, '23503');
end $$;

-- ================= F. Lembar khusus (peta) =================
do $$
declare snack bigint := pg_temp.it('Snack rapat'); n_biasa bigint := (select id from sigap_akun where nama = 'Pegawai biasa');
        a_lama bigint; a_baru bigint;
begin
  perform pg_temp.ok((select seksi_huruf = 'A' and asal = 'aturan' and n_dok = 12 from keu_v_adm_item where detail_id = snack), 'snack: konsumsi A, 12 dokumen');
  a_lama := pg_temp.d('skema','521211','A',1);
  perform pg_temp.sesi(n_biasa);
  perform pg_temp.gagal(format($q$select keu_adm_peta_atur(%s,'skema','521211','C')$q$, snack), '42501');
  perform pg_temp.sesi(5);   -- ketua RO lain
  perform pg_temp.gagal(format($q$select keu_adm_peta_atur(%s,'skema','521211','C')$q$, snack), '42501');
  perform pg_temp.sesi(7);   -- bendahara
  perform pg_temp.gagal(format($q$select keu_adm_peta_atur(%s,'skema','521211','C')$q$, snack), '42501');
  perform pg_temp.sesi(null);
  perform pg_temp.gagal(format($q$select keu_adm_peta_atur(%s,'skema','521211','C')$q$, snack), '42501');
  perform pg_temp.sesi(6);   -- admin RO 005
  perform pg_temp.gagal(format($q$select keu_adm_peta_atur(%s,'skema','999999','')$q$, snack), '23503');   -- lembar tak ada
  perform pg_temp.gagal(format($q$select keu_adm_peta_atur(%s,'skema','521211','C')$q$, 999999), '23514');
  perform keu_adm_peta_atur(snack, 'skema', '521211', 'C', 'ternyata cetak spanduk');
  perform pg_temp.ok((select seksi_huruf = 'C' and asal = 'peta' and n_dok = 9 from keu_v_adm_item where detail_id = snack), 'snack: lembar C lewat peta');
  perform pg_temp.ok((select count(*) = 1 from keu_adm_peta where dibatalkan_at is null), 'satu peta aktif');
  -- dokumen lembar lama tidak lagi bagian dari item
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$select keu_adm_aksi(%s,%s,'draf')$q$, snack, a_lama), '23514');
  -- ganti lagi: peta lama dibatalkan, tetap satu aktif
  perform keu_adm_peta_atur(snack, 'skema', '521211', 'D');
  perform pg_temp.ok((select count(*) = 1 and bool_and(seksi_huruf = 'D') from keu_adm_peta where dibatalkan_at is null), 'peta diganti');
  perform pg_temp.ok((select count(*) = 2 from keu_adm_peta), 'peta lama dibatalkan, bukan dihapus');
  -- setelah ada unggahan, lembar tidak boleh diganti
  a_baru := pg_temp.d('skema','521211','D',1);
  perform keu_adm_aksi(snack, a_baru, 'unggah', pg_temp.berkas('d1.pdf', '2'));
  perform pg_temp.gagal(format($q$select keu_adm_peta_atur(%s,'skema','521211','A')$q$, snack), '23514');
  perform pg_temp.gagal(format($q$select keu_adm_peta_lepas(%s)$q$, snack), '23514');
  -- dikembalikan -> boleh dilepas -> kembali ke aturan
  perform pg_temp.sesi(3);
  perform keu_adm_aksi(snack, a_baru, 'kembalikan', null, 'salah lembar, ganti');
  perform keu_adm_peta_lepas(snack);
  perform pg_temp.ok((select seksi_huruf = 'A' and asal = 'aturan' and n_dok = 12 from keu_v_adm_item where detail_id = snack), 'kembali ke aturan otomatis');
  perform keu_adm_peta_lepas(snack);   -- tanpa peta: tidak berbuat apa-apa
  -- pengaturan khusus ke pola umum
  perform keu_adm_peta_atur(pg_temp.it('Materai'), 'pola', 'BRG', '', 'memakai pola belanja barang');
  perform pg_temp.ok((select sumber = 'pola' and lembar_kode = 'BRG' and asal = 'peta' and n_dok = 6 from keu_v_adm_item where detail_id = pg_temp.it('Materai')), 'materai: pola BRG');
end $$;

-- ================= G. Catatan tetap menempel setelah kunci item berpindah (alias revisi POK) =================
do $$
declare t bigint := pg_temp.it('Transport PML kabupaten'); lama text := '2906.BMA.005/055/524113/transport pml lama#1';
        baru text; dk bigint := pg_temp.d('skema','524113','A',1); n int;
begin
  select kunci_stabil into baru from keu_pok_detail where id = t;
  perform pg_temp.sesi(null);
  -- catatan lama terikat pada kunci lama, sudah terunggah
  insert into keu_adm_dok(kunci_stabil, ro_kode, dok_id) values (lama, '2906.BMA.005', dk);
  update keu_adm_dok set status = 'terunggah', berkas_nama = 'surat-tugas.pdf', berkas_hash = repeat('9',64), berkas_ukuran = 100,
         berkas_path = 'adm/surat-tugas.pdf', diunggah_oleh = 4, diunggah_at = now() where kunci_stabil = lama and dok_id = dk;
  perform pg_temp.ok((select status = 'belum' from keu_v_adm_dokumen where detail_id = t and dok_id = dk), 'sebelum alias: belum terlihat');
  insert into keu_kunci_alias(kunci_lama, kunci_baru, alasan) values (lama, baru, 'uji alias administrasi');
  perform pg_temp.ok((select status = 'terunggah' and berkas_nama = 'surat-tugas.pdf' from keu_v_adm_dokumen where detail_id = t and dok_id = dk), 'sesudah alias: catatan terlihat');
  perform pg_temp.ok((select n_terunggah = 1 from keu_v_adm_item where detail_id = t), 'hitungan item memakai alias');
  -- aksi berikutnya mengikat ulang kunci, tanpa catatan ganda
  perform pg_temp.sesi(8);
  perform keu_adm_aksi(t, dk, 'verifikasi');
  select count(*) into n from keu_adm_dok where dok_id = dk and (kunci_stabil = lama or kunci_stabil = baru);
  perform pg_temp.ok(n = 1, 'satu catatan, bukan dua');
  perform pg_temp.ok((select kunci_stabil = baru and status = 'terverifikasi' from keu_adm_dok where dok_id = dk and ro_kode = '2906.BMA.005' and kunci_stabil in (lama, baru)), 'kunci diikat ulang');
end $$;

-- ================= H. Kelengkapan dan ringkasan =================
do $$
declare i bigint := pg_temp.it('ATK'); r record;
begin
  perform pg_temp.sesi(3);   -- PPK melengkapi semua dokumen ATK
  for r in select dok_id from keu_v_adm_dokumen where detail_id = i and status <> 'terverifikasi' order by dok_id loop
    perform keu_adm_aksi(i, r.dok_id, 'unggah', pg_temp.berkas('lengkap-' || r.dok_id || '.pdf', '7'));
  end loop;
  perform pg_temp.ok((select status_item = 'diperiksa' from keu_v_adm_item where detail_id = i), 'semua terunggah, sebagian belum diverifikasi: diperiksa');
  for r in select dok_id from keu_v_adm_dokumen where detail_id = i and status = 'terunggah' order by dok_id loop
    perform keu_adm_aksi(i, r.dok_id, 'verifikasi');
  end loop;
  perform pg_temp.ok((select status_item = 'lengkap' and n_terverifikasi = 9 and n_belum = 0 from keu_v_adm_item where detail_id = i), 'ATK lengkap');
  perform pg_temp.ok((select n_item_lengkap = 1 and n_item = 5 and jumlah_lengkap = 1200000 and jumlah_item = 5360000 and n_item_tanpa_dokumen = 0
                      from keu_v_adm_ringkas where ro_kode = '2906.BMA.005'), 'ringkasan RO: 1 dari 5 item lengkap');
  perform pg_temp.ok((select persen_terverifikasi > 0 and persen_terverifikasi < 100 and n_dok = n_belum + n_draf + n_terunggah + n_terverifikasi
                      from keu_v_adm_ringkas where ro_kode = '2906.BMA.005'), 'persen dan jumlah konsisten');
  perform pg_temp.ok((select status_item = 'belum' from keu_v_adm_item where detail_id = pg_temp.it('transport')), 'transport belum dimulai');
  perform pg_temp.ok((select status_item = 'berjalan' from keu_v_adm_item where detail_id = pg_temp.it('Transport PML kabupaten')), 'PML berjalan');
end $$;

-- ================= I. Keamanan =================
do $$
declare t text;
begin
  perform pg_temp.sesi(null);
  foreach t in array array['keu_adm_peta','keu_adm_dok','keu_adm_riwayat'] loop
    perform pg_temp.ok((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), 'RLS aktif ' || t);
    perform pg_temp.ok(not has_table_privilege('anon', 'public.' || t, 'select') and not has_table_privilege('authenticated', 'public.' || t, 'select'), 'tanpa hak anon/authenticated ' || t);
    perform pg_temp.ok(has_table_privilege('service_role', 'public.' || t, 'select'), 'service_role ' || t);
  end loop;
  foreach t in array array['keu_v_adm_lembar','keu_v_adm_dokumen','keu_v_adm_item','keu_v_adm_ringkas'] loop
    perform pg_temp.ok(not has_table_privilege('anon', 'public.' || t, 'select') and not has_table_privilege('authenticated', 'public.' || t, 'select'), 'view tertutup ' || t);
    perform pg_temp.ok((select coalesce(reloptions::text, '') like '%security_invoker=true%' from pg_class where oid = ('public.' || t)::regclass), 'security_invoker ' || t);
  end loop;
  foreach t in array array['keu_adm_aksi(bigint,bigint,text,jsonb,text,bigint)','keu_adm_peta_atur(bigint,text,text,text,text,bigint)',
                           'keu_adm_peta_lepas(bigint,bigint)','keu_adm_buka(bigint,text,date)','keu_adm_boleh_unggah(bigint,text,text[],date)',
                           'keu_adm_boleh_verif(bigint,text,text[],date)','keu_adm_ro_terbuka(bigint,date)'] loop
    perform pg_temp.ok(not has_function_privilege('anon', 'public.' || t, 'execute') and not has_function_privilege('authenticated', 'public.' || t, 'execute'), 'fungsi tertutup ' || t);
  end loop;
  perform pg_temp.ok((select count(*) > 0 from sigap_audit where aksi = 'keu.keu_adm_dok.update'), 'audit perubahan dokumen');
  perform pg_temp.ok((select count(*) > 0 from sigap_audit where aksi = 'keu.keu_adm_peta.insert'), 'audit peta');
end $$;
