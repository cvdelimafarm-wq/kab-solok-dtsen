\set ON_ERROR_STOP on
-- Uji Fase D (h): unggahan POK resmi + pembanding, realisasi GLP039, peringatan SPAN, R-06, skor.
-- Dijalankan sesudah rangkaian a-f (berlaku: versi nomor revisi 9; RAB sah 2906.BMA.005; jadwal 3 diterapkan).
-- Akun: 3 PPK, 4 ketua 2906.BMA.005/.006, 6 admin RO, 7 bendahara.
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
-- satu baris unggahan POK untuk RO 2906.BMA.005 komponen 055 tanpa subkomponen
create or replace function pg_temp.b(p_akun text, p_ura text, p_vol numeric, p_sat text, p_harga numeric, p_jml numeric,
                                     p_ro text default '005', p_keg text default '2906') returns jsonb language sql as $$
  select jsonb_build_object('prog_kode','GG','prog_nama','Dukungan','keg_kode',p_keg,'keg_nama','K'||p_keg,'kro_kode','BMA','kro_nama','BMA',
    'ro_sub',p_ro,'ro_nama','RO '||p_ro,'ro_volume',12,'ro_satuan','Dokumen','komp_kode','055','komp_nama','Kom',
    'akun_kode',p_akun,'akun_nama','Akun '||p_akun,'uraian',p_ura,'volume',p_vol,'satuan',p_sat,'harga_satuan',p_harga,'jumlah',p_jml) $$;
create or replace function pg_temp.r(p_no text, p_ura text, p_akun text, p_pagu numeric, p_lalu numeric, p_ini numeric,
                                     p_ro text default '2906.BMA.005') returns jsonb language sql as $$
  select jsonb_build_object('nomor_item',p_no,'ro_kode',p_ro,'komponen_kode','055','akun_kode',p_akun,'uraian',p_ura,
    'pagu',p_pagu,'lock_pagu',0,'real_lalu',p_lalu,'real_ini',p_ini,'real_sd',p_lalu+p_ini,'sisa',p_pagu-p_lalu-p_ini) $$;
create or replace function pg_temp.h(p text) returns text language sql as $$ select repeat(p, 64) $$;


-- ================= A. Realisasi unggahan 1 (POK berlaku masih nomor revisi 9) =================
do $$
declare u1 bigint; i3 bigint;
begin
  perform pg_temp.sesi(3);
  perform pg_temp.gagal($q$select keu_realisasi_masuk(2026,'2026-07-26','glp039-jul.xlsx',repeat('1',64),'[]'::jsonb)$q$, '42501');   -- PPK bukan bendahara
  perform pg_temp.sesi(7);
  perform pg_temp.gagal($q$select keu_realisasi_masuk(2026,'2026-07-26','glp039-jul.xlsx',repeat('1',64),'[]'::jsonb)$q$, '22023');   -- kosong
  perform pg_temp.gagal($q$select keu_realisasi_masuk(2025,'2026-07-26','x.xlsx',repeat('1',64),'[{}]'::jsonb)$q$, '23514');         -- tahun tak cocok tanggal
  perform pg_temp.gagal($q$select keu_realisasi_masuk(2026,'2026-07-26','glp039-jul.xlsx',repeat('1',64),
        jsonb_build_array(jsonb_set(pg_temp.r('000252','ATK','521211',1000000,0,900000),'{sisa}','5')))$q$, '23514');               -- sisa salah
  u1 := keu_realisasi_masuk(2026, '2026-07-26', 'glp039-jul.xlsx', pg_temp.h('1'), jsonb_build_array(
          pg_temp.r('000252','ATK','521211',1000000,0,900000),
          pg_temp.r('000253','Transport lokal','524113',3400000,0,200000),
          pg_temp.r('000254','Transport PML','524113',510000,0,0),
          pg_temp.r('000255','Barang tak dikenal','521211',50000,0,0)));
  perform pg_temp.ok((select n_item = 4 and total_pagu = 4960000 and total_sd = 1100000 and status = 'diterima' and bulan = 7
                      from keu_realisasi_unggah where id = u1), 'header unggahan 1');
  perform pg_temp.ok((select count(*) = 1 from keu_laporan_kpa where jenis = 'realisasi' and rujukan_id = u1), 'antrean laporan KPA');
  perform pg_temp.ok((select cocok = 'teks' from keu_realisasi_item where unggah_id = u1 and nomor_item = '000252'), 'ATK cocok teks');
  perform pg_temp.ok((select cocok = 'tidak' from keu_realisasi_item where unggah_id = u1 and nomor_item = '000253'), 'transport belum cocok (kunci buatan tangan)');
  perform pg_temp.ok((select cocok = 'teks' from keu_realisasi_item where unggah_id = u1 and nomor_item = '000254'), 'PML cocok teks');
  perform pg_temp.ok((select cocok = 'tidak' from keu_realisasi_item where unggah_id = u1 and nomor_item = '000255'), 'tak dikenal');
  perform pg_temp.gagal($q$select keu_realisasi_masuk(2026,'2026-07-27','b.xlsx',repeat('1',64),jsonb_build_array(pg_temp.r('000252','ATK','521211',1000000,0,0)))$q$, '23505');  -- hash kembar
  perform pg_temp.gagal($q$select keu_realisasi_masuk(2026,'2026-07-26','b.xlsx',repeat('2',64),jsonb_build_array(pg_temp.r('000252','ATK','521211',1000000,0,0)))$q$, '23505');  -- tanggal kembar
  -- pemadanan manual item yang belum cocok
  i3 := (select id from keu_realisasi_item where unggah_id = u1 and nomor_item = '000253');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_realisasi_padankan(%s,'2906.BMA.005/055/524113/transport#1')$q$, i3), '42501');   -- PPK bukan bendahara
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_realisasi_padankan(%s,'tidak-ada')$q$, i3), '23514');
  perform keu_realisasi_padankan(i3, '2906.BMA.005/055/524113/transport#1');
  perform pg_temp.gagal(format($q$select keu_realisasi_padankan(%s,'2906.BMA.005/055/521211/atk#1')$q$, i3), '23505');         -- kunci sudah milik nomor lain
  perform pg_temp.ok((select cocok = 'manual' from keu_realisasi_item where id = i3), 'transport dipadankan manual');
  -- tidak dapat diubah / dihapus langsung dari aplikasi
  perform pg_temp.gagal(format($q$update keu_realisasi_item set real_ini = 1 where unggah_id = %s$q$, u1), '42501');
  perform pg_temp.gagal(format($q$update keu_realisasi_unggah set status = 'dibatalkan', alasan_batal = 'sembarang saja' where id = %s$q$, u1), '42501');
  perform pg_temp.gagal(format($q$delete from keu_realisasi_item where unggah_id = %s$q$, u1), '42501');
  perform pg_temp.sesi(null);
  perform pg_temp.ok((select count(*) = 3 and bool_and(detail_id is not null) from keu_v_realisasi_terbaru where nomor_item in ('000252','000253','000254')), 'tiga item terhubung ke POK');
  perform pg_temp.ok((select persen is not null and n_item = 4 and real_sd = 1100000 from keu_v_realisasi_ro where ro_kode = '2906.BMA.005'), 'realisasi per RO');
  -- R-06: kertas kerja Desember menurunkan ATK ke 800.000, realisasi sudah 900.000
  perform pg_temp.ok((select kekurangan = 100000 and batas = 900000 from keu_v_kk_r06 where jadwal_id = 3 and detail_id = 9), 'R-06 ATK kurang 100.000');
  perform pg_temp.ok((select count(*) = 1 from keu_v_kk_r06 where jadwal_id = 3), 'R-06 hanya satu baris pada jadwal 3');
  perform pg_temp.ok((select count(*) = 0 from keu_v_kk_r06 where jadwal_id = 13), 'R-06 jadwal 13 aman (ATK 1.000.000)');
end $$;

-- ================= B. Unggahan POK resmi nomor revisi 10 (pagu tetap, jadwal 3) =================
do $$
declare u bigint; v bigint; r_ record;
begin
  perform pg_temp.sesi(7);
  perform pg_temp.gagal($q$select keu_pok_unggah_baru(2026,10,'rkks-okt.pdf',repeat('a',64),'POK Okt','2026-11-01',3)$q$, '42501');       -- bendahara bukan PPK
  perform pg_temp.sesi(4);
  perform pg_temp.gagal($q$insert into keu_pok_unggah(tahun,nomor_revisi,nama_berkas,hash_berkas,tanggal_efektif) values (2026,10,'x.pdf',repeat('a',64),'2026-11-01')$q$, '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.gagal($q$select keu_pok_unggah_baru(2026,9,'rkks-okt.pdf',repeat('a',64),'POK Okt','2026-11-01',3)$q$, '23514');       -- nomor tidak lebih besar
  perform pg_temp.gagal($q$select keu_pok_unggah_baru(2026,10,'rkks-okt.pdf',repeat('a',64),'POK Okt','2026-11-01',10)$q$, '23514');      -- jadwal 10 belum diterapkan
  perform pg_temp.gagal($q$select keu_pok_unggah_baru(2026,10,'rkks-okt.pdf','bukan-hash','POK Okt','2026-11-01',3)$q$, '23514');
  u := keu_pok_unggah_baru(2026, 10, 'rkks-okt.pdf', pg_temp.h('a'), 'POK Okt 2026', date '2026-11-01', 3);
  perform pg_temp.ok((select status = 'diunggah' from keu_pok_unggah where id = u), 'unggahan baru berstatus diunggah');
  perform pg_temp.gagal(format($q$select keu_pok_unggah_terima(%s)$q$, u), '23514');                                                    -- belum berisi baris
  perform pg_temp.gagal(format($q$select keu_pok_unggah_isi(%s,'[]'::jsonb)$q$, u), '22023');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_pok_unggah_isi(%s,jsonb_build_array(pg_temp.b('521211','ATK',8,'PAKET',100000,800000)))$q$, u), '42501');
  perform pg_temp.sesi(3);
  perform pg_temp.ok(keu_pok_unggah_isi(u, jsonb_build_array(
          pg_temp.b('521211','ATK',8,'PAKET',100000,800000),
          pg_temp.b('524113','transport',20,'OK',170000,3400000),
          pg_temp.b('524113','Transport PML kabupaten',4,'OK',152500,610000),
          pg_temp.b('521211','Snack rapat',1,'PAKET',100000,100000))) = 4, 'empat baris dimuat');
  perform pg_temp.gagal(format($q$select keu_pok_unggah_isi(%s,jsonb_build_array(pg_temp.b('521211','ATK',8,'PAKET',100000,800000)))$q$, u), '23514');   -- sekali saja
  perform pg_temp.gagal(format($q$update keu_pok_unggah_baris set jumlah = 1 where unggah_id = %s$q$, u), '42501');                       -- baris append-only
  -- pembanding
  perform pg_temp.ok((select n_baris = 4 and total_unggah = 4910000 and total_berlaku = 4910000 and n_sama = 1 and n_berubah = 1
                             and n_baru = 2 and n_hilang = 1 and n_dipadankan = 0 and n_ro_tak_terdaftar = 0
                      from keu_v_pok_unggah_ringkas where unggah_id = u), 'ringkasan banding sebelum pemadanan');
  perform pg_temp.ok((select n_di_luar_usulan = 4 from keu_v_pok_unggah_ringkas where unggah_id = u), 'semua perubahan di luar usulan (usulan RO dikembalikan)');
  perform pg_temp.ok((select selisih = -200000 from keu_v_pok_banding where unggah_id = u and status = 'berubah'), 'ATK turun 200.000');
  -- pemadanan manual: redaksi PML berubah
  declare b3 bigint := (select id from keu_pok_unggah_baris where unggah_id = u and urut = 3);
          b2 bigint := (select id from keu_pok_unggah_baris where unggah_id = u and urut = 2);
          b4 bigint := (select id from keu_pok_unggah_baris where unggah_id = u and urut = 4);
  begin
    perform pg_temp.sesi(6);
    perform pg_temp.gagal(format($q$select keu_pok_unggah_padankan(%s,'2906.BMA.005/055/524113/transport pml#1')$q$, b3), '42501');    -- admin RO tidak berwenang
    perform pg_temp.sesi(3);
    perform pg_temp.gagal(format($q$select keu_pok_unggah_padankan(%s,'2906.BMA.005/055/524113/transport#1')$q$, b2), '23514');        -- sudah cocok otomatis
    perform pg_temp.gagal(format($q$select keu_pok_unggah_padankan(%s,'tidak-ada')$q$, b3), '23514');
    perform pg_temp.gagal(format($q$select keu_pok_unggah_padankan(%s,'2906.BMA.005/055/524113/transport#1')$q$, b4), '23514');       -- kunci lama itu cocok otomatis dgn baris 2
    perform keu_pok_unggah_padankan(b3, '2906.BMA.005/055/524113/transport pml#1');
    perform pg_temp.gagal(format($q$select keu_pok_unggah_padankan(%s,'2906.BMA.005/055/524113/transport pml#1')$q$, b4), '23505');   -- sudah dipadankan ke baris lain
    perform pg_temp.ok((select n_dipadankan = 1 and n_baru = 1 and n_hilang = 0 and n_berubah = 1 and n_sama = 1
                        from keu_v_pok_unggah_ringkas where unggah_id = u), 'ringkasan setelah pemadanan');
    -- lepas lalu pasang lagi
    perform keu_pok_unggah_lepas_padan(b3);
    perform pg_temp.ok((select n_dipadankan = 0 and n_hilang = 1 from keu_v_pok_unggah_ringkas where unggah_id = u), 'padan dilepas');
    perform keu_pok_unggah_padankan(b3, '2906.BMA.005/055/524113/transport pml#1');
  end;
  -- nomor item resmi yang sudah dikenal ikut terbawa (000252, 000253 dari unggahan realisasi; 000254 lewat padan)
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_pok_unggah_terima(%s)$q$, u), '42501');
  perform pg_temp.sesi(3);
  v := keu_pok_unggah_terima(u);
  perform pg_temp.ok((select status = 'berlaku' and nomor_revisi = 10 and jenis = 'revisi' and hash_berkas = pg_temp.h('a') from keu_pok_versi where id = v), 'versi 10 berlaku');
  perform pg_temp.ok((select status = 'digantikan' from keu_pok_versi where nomor_revisi = 9 and tahun = 2026), 'versi 9 digantikan');
  perform pg_temp.ok((select count(*) = 4 from keu_pok_detail where versi_id = v), 'empat detail');
  perform pg_temp.ok((select count(*) from keu_v_pok_selisih where versi_id = v and selisih <> 0) = 0, 'tanpa selisih');
  perform pg_temp.ok((select pagu = 4910000 from keu_pok_node where versi_id = v and tingkat = 'program'), 'pagu program 4.910.000');
  perform pg_temp.ok((select ro_kode = '2906.BMA.005' and volume = 12 and satuan = 'Dokumen' from keu_pok_node where versi_id = v and tingkat = 'ro'), 'node RO membawa volume dan satuan');
  perform pg_temp.ok((select status = 'diterima' and versi_id = v from keu_pok_unggah where id = u), 'unggahan diterima');
  perform pg_temp.ok((select kunci_baru = '2906.BMA.005/055/524113/transport pml kabupaten#1' from keu_kunci_alias where kunci_lama = '2906.BMA.005/055/524113/transport pml#1'), 'alias kunci PML');
  perform pg_temp.ok((select nomor_item = '000252' from keu_pok_detail where versi_id = v and kunci_stabil like '%/atk#1'), 'nomor item ATK terbawa');
  perform pg_temp.ok((select nomor_item = '000253' from keu_pok_detail where versi_id = v and kunci_stabil like '%/transport#1'), 'nomor item transport terbawa');
  perform pg_temp.ok((select nomor_item = '000254' from keu_pok_detail where versi_id = v and kunci_stabil like '%pml kabupaten#1'), 'nomor item PML terbawa lewat padan');
  perform pg_temp.ok((select kunci_stabil = '2906.BMA.005/055/524113/transport pml kabupaten#1' from keu_item_nomor where tahun = 2026 and nomor_item = '000254'), 'pemetaan nomor item diperbarui ke kunci baru');
  -- final: tidak dapat diubah lagi
  perform pg_temp.gagal(format($q$update keu_pok_unggah set nama_berkas = 'lain.pdf' where id = %s$q$, u), '23514');
  perform pg_temp.gagal(format($q$update keu_pok_unggah set status = 'ditolak', alasan_tolak = 'sembarang saja' where id = %s$q$, u), '42501');
  perform pg_temp.gagal(format($q$select keu_pok_unggah_tolak(%s,'sudah diterima, tak bisa ditolak')$q$, u), '23514');
  perform pg_temp.gagal(format($q$select keu_pok_unggah_terima(%s)$q$, u), '23514');
  perform pg_temp.gagal(format($q$delete from keu_pok_unggah where id = %s$q$, u), '42501');
  -- tautan ke catatan sah
  perform keu_jadwal_aksi(3, 'sah', 'S-123/KPA/2026', date '2026-11-15');
  perform pg_temp.ok(keu_sah_tautkan_pok(3) = v, 'tautkan POK hasil ke catatan sah');
  perform pg_temp.ok((select pok_versi_hasil_id = v from keu_revisi_sah where jadwal_id = 3), 'sah menunjuk versi hasil');
  perform pg_temp.sesi(null);
  -- nomor item tetap terhubung di tampilan realisasi (sekarang menunjuk versi 10)
  perform pg_temp.ok((select count(*) = 3 and bool_and(detail_id is not null) from keu_v_realisasi_terbaru where nomor_item in ('000252','000253','000254')), 'item realisasi mengikuti versi baru');
end $$;

-- ================= C. Penolakan dan unggahan DIPA (pagu berubah) =================
do $$
declare ub bigint; uc bigint; ud bigint; v bigint;
begin
  perform pg_temp.sesi(3);
  -- B: pagu tetap tetapi total berbeda -> ditolak sistem
  ub := keu_pok_unggah_baru(2026, 11, 'rkks-b.pdf', pg_temp.h('b'), null, date '2026-11-20', 3);
  perform keu_pok_unggah_isi(ub, jsonb_build_array(
          pg_temp.b('521211','ATK',8,'PAKET',100000,800000),
          pg_temp.b('524113','transport',20,'OK',170000,3400000),
          pg_temp.b('524113','Transport PML kabupaten',4,'OK',152500,610000),
          pg_temp.b('521211','Snack rapat',1,'PAKET',100000,100000),
          pg_temp.b('521211','Materai',5,'PAKET',10000,50000)));
  perform pg_temp.gagal(format($q$select keu_pok_unggah_terima(%s)$q$, ub), '23514');
  perform pg_temp.gagal(format($q$select keu_pok_unggah_tolak(%s,'bah')$q$, ub), '23514');
  perform keu_pok_unggah_tolak(ub, 'Total tidak sama dengan POK berlaku');
  perform pg_temp.ok((select status = 'ditolak' from keu_pok_unggah where id = ub), 'B ditolak');
  -- C: RO belum terdaftar
  uc := keu_pok_unggah_baru(2026, 11, 'rkks-c.pdf', pg_temp.h('c'), null, date '2026-11-20');
  perform keu_pok_unggah_isi(uc, jsonb_build_array(pg_temp.b('521211','ATK',8,'PAKET',100000,800000,'005','9999')));
  perform pg_temp.gagal(format($q$select keu_pok_unggah_terima(%s)$q$, uc), '23503');
  perform pg_temp.ok((select n_ro_tak_terdaftar = 1 from keu_v_pok_unggah_ringkas where unggah_id = uc), 'ringkasan melaporkan RO tak terdaftar');
  perform keu_pok_unggah_tolak(uc, 'RO tidak terdaftar pada Master');
  -- hash dan nomor yang pernah ditolak boleh dipakai lagi
  ud := keu_pok_unggah_baru(2026, 11, 'rkks-b2.pdf', pg_temp.h('b'), 'POK DIPA', date '2026-11-25');
  perform keu_pok_unggah_isi(ud, jsonb_build_array(
          pg_temp.b('521211','ATK',12,'PAKET',100000,1200000),
          pg_temp.b('524113','transport',20,'OK',170000,3400000),
          pg_temp.b('524113','Transport PML kabupaten',4,'OK',152500,610000),
          pg_temp.b('521211','Snack rapat',1,'PAKET',100000,100000),
          pg_temp.b('521211','Materai',5,'PAKET',10000,50000)));
  perform pg_temp.gagal($q$select keu_pok_unggah_baru(2026,11,'dobel.pdf',repeat('e',64),null,'2026-11-25')$q$, '23505');       -- nomor 11 sedang aktif
  perform pg_temp.ok((select n_sama = 3 and n_berubah = 1 and n_baru = 1 and n_hilang = 0 and n_di_luar_usulan = 0
                      from keu_v_pok_unggah_ringkas where unggah_id = ud), 'banding DIPA tanpa jadwal');
  v := keu_pok_unggah_terima(ud);
  perform pg_temp.ok((select status = 'berlaku' and nomor_revisi = 11 from keu_pok_versi where id = v), 'versi 11 berlaku');
  perform pg_temp.ok((select sum(jumlah) = 5360000 from keu_pok_detail where versi_id = v), 'total 5.360.000');
  perform pg_temp.ok((select nomor_item = '000254' from keu_pok_detail where versi_id = v and kunci_stabil like '%pml kabupaten#1'), 'nomor PML tetap');
  perform pg_temp.ok((select count(*) = 1 from keu_pok_versi where status = 'berlaku' and tahun = 2026), 'satu versi berlaku');
  perform pg_temp.sesi(null);
end $$;

-- ================= D. Realisasi unggahan 2 terhadap versi 11 + peringatan SPAN =================
do $$
declare u2 bigint; n_merah int;
begin
  perform pg_temp.sesi(7);
  u2 := keu_realisasi_masuk(2026, '2026-08-30', 'glp039-agu.xlsx', pg_temp.h('3'), jsonb_build_array(
          pg_temp.r('000252','ATK','521211',1200000,900000,200000),
          pg_temp.r('000253','Transport lokal','524113',3300000,200000,100000),
          pg_temp.r('000254','Transport PML kabupaten','524113',610000,0,100000),
          pg_temp.r('000255','Barang tak dikenal','521211',50000,0,0),
          pg_temp.r('000256','Snack rapat','521211',100000,0,0),
          pg_temp.r('000257','Materai','521211',50000,0,0)));
  perform pg_temp.ok((select count(*) filter (where cocok = 'nomor') = 3 and count(*) filter (where cocok = 'teks') = 2
                             and count(*) filter (where cocok = 'tidak') = 1 from keu_realisasi_item where unggah_id = u2), 'pencocokan unggahan 2');
  perform pg_temp.sesi(null);
  -- hanya unggahan terbaru yang dipakai untuk posisi sekarang
  perform pg_temp.ok((select count(*) = 6 from keu_v_realisasi_terbaru), 'terbaru = unggahan 2');
  perform pg_temp.ok((select real_sd = 1500000 and pagu = 5310000 and n_item = 6 from keu_v_realisasi_ro where ro_kode = '2906.BMA.005'), 'realisasi RO terbaru');
  perform pg_temp.ok((select realisasi_bulan = 200000 from keu_v_realisasi_bulan where bulan = 8 and nomor_item = '000252'), 'realisasi Agustus ATK = bulan ini');
  perform pg_temp.ok((select realisasi_bulan = 900000 from keu_v_realisasi_bulan where bulan = 7 and nomor_item = '000252'), 'realisasi Juli ATK');
  -- peringatan SPAN
  perform pg_temp.ok((select count(*) = 1 and min(nomor_item) = '000254' from keu_v_span_peringatan where jenis = 'tanpa_rab'), 'tanpa RAB: PML kabupaten');
  perform pg_temp.ok((select count(*) = 1 and min(nomor_item) = '000252' from keu_v_span_peringatan where jenis = 'melebihi_rab'), 'melebihi RAB: ATK 1.100.000 > 1.000.000');
  perform pg_temp.ok((select count(*) = 1 and min(nomor_item) = '000252' and min(bulan) = 8 from keu_v_span_peringatan where jenis = 'bulan_tak_terjadwal'), 'bulan tak terjadwal: ATK Agustus');
  perform pg_temp.ok((select count(*) = 1 and min(nomor_item) = '000255' from keu_v_span_peringatan where jenis = 'tidak_cocok_pok'), 'tidak cocok POK');
  perform pg_temp.ok((select count(*) = 1 and min(nomor_item) = '000253' from keu_v_span_peringatan where jenis = 'pagu_beda_pok'), 'pagu beda: transport');
  perform pg_temp.ok((select count(*) = 0 from keu_v_span_peringatan where jenis = 'ro_tanpa_rab_sah'), 'RO punya RAB sah');
  select count(*) into n_merah from keu_v_span_peringatan where tingkat = 'merah';
  perform pg_temp.ok(n_merah = 3, 'tiga peringatan merah, dapat ' || n_merah);
  -- pembatalan unggahan: kembali ke unggahan 1
  perform pg_temp.sesi(3);
  perform pg_temp.gagal(format($q$select keu_realisasi_batalkan(%s,'salah unggah berkas')$q$, u2), '42501');
  perform pg_temp.sesi(7);
  perform pg_temp.gagal(format($q$select keu_realisasi_batalkan(%s,'x')$q$, u2), '23514');
  perform keu_realisasi_batalkan(u2, 'salah unggah berkas bulan');
  perform pg_temp.gagal(format($q$select keu_realisasi_batalkan(%s,'sekali lagi saja')$q$, u2), '23514');
  perform pg_temp.sesi(null);
  perform pg_temp.ok((select count(*) = 4 from keu_v_realisasi_terbaru), 'setelah pembatalan, terbaru = unggahan 1');
  -- unggah ulang (tanggal dan hash yang sama sekarang boleh)
  perform pg_temp.sesi(7);
  u2 := keu_realisasi_masuk(2026, '2026-08-30', 'glp039-agu-benar.xlsx', pg_temp.h('3'), jsonb_build_array(
          pg_temp.r('000252','ATK','521211',1200000,900000,200000),
          pg_temp.r('000253','Transport lokal','524113',3300000,200000,100000),
          pg_temp.r('000254','Transport PML kabupaten','524113',610000,0,100000),
          pg_temp.r('000255','Barang tak dikenal','521211',50000,0,0),
          pg_temp.r('000256','Snack rapat','521211',100000,0,0),
          pg_temp.r('000257','Materai','521211',50000,0,0)));
  perform pg_temp.sesi(null);
  perform pg_temp.ok((select count(*) = 6 from keu_v_realisasi_terbaru), 'unggah ulang berhasil');
end $$;

-- ================= E. Skor RAB =================
do $$
declare s record; hitung numeric;
begin
  select * into s from keu_v_skor_ro where ro_kode = '2906.BMA.005';
  perform pg_temp.ok(s.ada_rab_sah and s.sampai_bulan = 8, 'RO punya RAB sah, data sampai Agustus');
  perform pg_temp.ok(s.n_penarikan between 24.8 and 25.0, 'penarikan ~24,9 dapat ' || s.n_penarikan);
  perform pg_temp.ok(s.n_volume between 86.0 and 86.2, 'volume ~86,1 dapat ' || s.n_volume);
  perform pg_temp.ok(s.n_cakupan between 85.7 and 85.9, 'cakupan ~85,8 dapat ' || s.n_cakupan);
  perform pg_temp.ok(s.n_disiplin = 50.0, 'disiplin 50 (satu dari dua usulan tidak disetujui) dapat ' || s.n_disiplin);
  hitung := round((s.n_penarikan * 35 + s.n_volume * 25 + s.n_cakupan * 20 + s.n_disiplin * 20) / 100, 1);
  perform pg_temp.ok(s.total = hitung, 'total berbobot ' || s.total || ' vs ' || hitung);
  perform pg_temp.ok(s.kategori = 'Perlu pembinaan', 'kategori ' || s.kategori);
  select * into s from keu_v_skor_ro where ro_kode = '2906.BMA.006';
  perform pg_temp.ok(not s.ada_rab_sah and s.n_penarikan = 0 and s.n_volume = 0 and s.n_cakupan = 0 and s.n_disiplin = 100, 'RO tanpa RAB sah');
  perform pg_temp.ok(s.total = 20.0, 'total RO tanpa RAB = 20, dapat ' || s.total);
  perform pg_temp.ok((select count(*) = (select count(*) from keu_ro where aktif) from keu_v_skor_ro), 'satu baris skor per RO aktif');
  -- bobot diubah -> skor mengikuti
  perform pg_temp.sesi(3);
  update keu_master_skor set bobot_penarikan = 10, bobot_volume = 30, bobot_cakupan = 30, bobot_disiplin = 30 where id = 1;
  perform pg_temp.sesi(null);
  select * into s from keu_v_skor_ro where ro_kode = '2906.BMA.005';
  hitung := round((s.n_penarikan * 10 + s.n_volume * 30 + s.n_cakupan * 30 + s.n_disiplin * 30) / 100, 1);
  perform pg_temp.ok(s.total = hitung, 'total mengikuti bobot baru');
end $$;

-- ================= F. Hak dan keamanan tabel/view =================
do $$
begin
  perform pg_temp.ok(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('keu_pok_unggah','keu_pok_unggah_baris','keu_pok_unggah_padan','keu_item_nomor','keu_realisasi_unggah','keu_realisasi_item')
      and (not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))),
    'tabel baru: RLS aktif dan tertutup bagi anon/authenticated');
  perform pg_temp.ok(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' and c.relname in ('keu_v_pok_unggah_kunci','keu_v_pok_banding','keu_v_pok_unggah_ringkas',
      'keu_v_realisasi_item_sekarang','keu_v_realisasi_terbaru','keu_v_realisasi_ro','keu_v_realisasi_bulan','keu_v_span_peringatan','keu_v_kk_r06','keu_v_skor_ro')
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
           or coalesce(c.reloptions::text, '') not like '%security_invoker=true%')),
    'view baru: security_invoker dan tertutup');
  perform pg_temp.ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('keu_pok_unggah_baru','keu_pok_unggah_isi','keu_pok_unggah_padankan','keu_pok_unggah_lepas_padan',
      'keu_pok_unggah_tolak','keu_pok_unggah_terima','keu_sah_tautkan_pok','keu_realisasi_masuk','keu_realisasi_padankan','keu_realisasi_batalkan',
      'keu_pok_unggah_cek','keu_pok_unggah_baris_cek','keu_realisasi_cek','keu_item_nomor_jaga')
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
    'fungsi baru tertutup bagi anon/authenticated');
end $$;
