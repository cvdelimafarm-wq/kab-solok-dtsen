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

-- POK dasar: versi 9 berlaku dengan satu RO dan tiga baris
do $$
declare v bigint; g bigint; k bigint; kro bigint; ro bigint; kom bigint; a1 bigint; a2 bigint; ro2 bigint; kom2 bigint; a3 bigint;
begin
  insert into keu_pok_versi(tahun,nomor_revisi,jenis,tanggal_efektif,hash_berkas) values (2026,9,'revisi','2026-10-01',repeat('c',64)) returning id into v;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v,null,'program','GG','Dukungan',1) returning id into g;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v,g,'kegiatan','2906','K2906',1) returning id into k;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v,k,'kro','BMA','BMA',1) returning id into kro;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu,ro_kode,volume,satuan) values (v,kro,'ro','005','RO 005',1,'2906.BMA.005',12,'Dokumen') returning id into ro;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v,ro,'komponen','055','Kom',1) returning id into kom;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v,kom,'akun','521211','Bahan',1) returning id into a1;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v,kom,'akun','524113','Transport',1) returning id into a2;
  insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,uraian,volume,satuan,harga_satuan,jumlah) values
    (v,a1,'2906.BMA.005/055/521211/atk#1','ATK',10,'PAKET',100000,1000000),
    (v,a2,'2906.BMA.005/055/524113/transport#1','Transport lokal',20,'OK',170000,3400000),
    (v,a2,'2906.BMA.005/055/524113/transport pml#1','Transport PML',3,'OK',170000,510000);
  update keu_pok_node set pagu=1000000 where id=a1;
  update keu_pok_node set pagu=3910000 where id=a2;
  update keu_pok_node set pagu=4910000 where id in (kom,ro,kro,k,g);
  perform keu_pok_berlakukan(v);
  -- RO kedua untuk uji PPK merangkap ketua
  insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (3,'KETUA','2896.BMA.004','2026-01-01');
end $$;

-- 1. Menyusun RAB oleh admin RO (akun 6) -> jadwal otomatis
do $$
declare r bigint; i1 bigint; i2 bigint; b1 bigint; b2 bigint; b3 bigint; n int;
begin
  perform pg_temp.sesi(8);
  perform pg_temp.gagal($q$select keu_rab_baru('2906.BMA.005')$q$, '42501');       -- TU tidak berwenang
  perform pg_temp.sesi(6);
  r := keu_rab_baru('2906.BMA.005');
  perform pg_temp.gagal($q$select keu_rab_baru('2906.BMA.005')$q$, '23505');       -- sudah ada RAB aktif
  perform pg_temp.ok((select status from keu_rab where id=r)='draf', 'RAB baru berstatus draf');
  insert into keu_rab_item(rab_id,pok_kunci,komponen_kode,akun_kode,uraian,satuan,prioritas_kode) values (r,'2906.BMA.005/055/521211/atk#1','055','521211','ATK','PAKET','inti') returning id into i1;
  insert into keu_rab_item(rab_id,pok_kunci,komponen_kode,akun_kode,uraian,satuan) values (r,'2906.BMA.005/055/524113/transport#1','055','524113','Transport lokal','OK') returning id into i2;
  perform pg_temp.gagal(format($q$insert into keu_rab_item(rab_id,pok_kunci,komponen_kode,akun_kode,uraian) values (%s,'tidak-ada','055','521211','x')$q$, r), '23514');
  perform pg_temp.gagal(format($q$insert into keu_rab_item(rab_id,pok_kunci,komponen_kode,akun_kode,uraian) values (%s,'2906.BMA.005/055/521211/atk#1','055','521211','dobel')$q$, r), '23505');
  -- item baru (tanpa kunci POK)
  insert into keu_rab_item(rab_id,komponen_kode,akun_kode,uraian) values (r,'055','522151','Honor narasumber (item baru)');
  perform pg_temp.ok((select baru from keu_rab_item where uraian like 'Honor%'), 'item baru bertanda baru');
  perform pg_temp.ok((select status from keu_v_rab_item where item_id=i1)='belum', 'belum ada rincian = belum');

  -- sekali: satu bulan
  insert into keu_rab_baris(item_id,ket,volume,satuan,harga_satuan,sama_dengan_item,bulan_mulai,bulan_sampai,periode,minggu) values (i1,'RAB = item',10,'PAKET',100000,true,7,7,'sekali',2) returning id into b1;
  perform pg_temp.ok((select count(*) from keu_rab_jadwal where baris_id=b1)=12, 'jadwal 12 bulan');
  perform pg_temp.ok((select nilai from keu_rab_jadwal where baris_id=b1 and bulan=7)=1000000 and (select sum(nilai) from keu_rab_jadwal where baris_id=b1)=1000000, 'sekali: seluruhnya di Juli');
  perform pg_temp.ok((select minggu from keu_rab_jadwal where baris_id=b1 and bulan=7)=2, 'tag minggu M2');
  perform pg_temp.ok((select status from keu_v_rab_item where item_id=i1)='sama', 'satu baris RAB=item = sama');

  -- bulanan Jul..Okt: 4 bulan, sisa pembulatan ke bulan terakhir
  insert into keu_rab_baris(item_id,urut,ket,volume,satuan,harga_satuan,periode,bulan_mulai,bulan_sampai,minggu) values (i2,1,'PML',3,'OK',170000,'bulanan',7,10,4) returning id into b2;
  perform pg_temp.ok((select array_agg(nilai order by bulan) filter (where nilai>0) from keu_rab_jadwal where baris_id=b2) = array[127500,127500,127500,127500]::numeric[], 'bulanan dibagi rata 510000/4');
  -- 3.400.000 triwulan Jan..Sep => bulan 1,4,7 ; 3.400.000/3 = 1.133.333 sisa 1 ke bulan 7
  insert into keu_rab_baris(item_id,urut,ket,volume,satuan,harga_satuan,periode,bulan_mulai,bulan_sampai,minggu) values (i2,2,'PPL',20,'OK',170000,'triwulan',1,9,3) returning id into b3;
  perform pg_temp.ok((select array_agg(nilai order by bulan) filter (where nilai>0) from keu_rab_jadwal where baris_id=b3) = array[1133333,1133333,1133334]::numeric[], 'triwulan: sisa ke bulan terakhir');
  perform pg_temp.ok((select array_agg(bulan order by bulan) filter (where nilai>0) from keu_rab_jadwal where baris_id=b3) = array[1,4,7]::smallint[], 'triwulan bulan 1,4,7');
  perform pg_temp.ok((select status from keu_v_rab_item where item_id=i2)='rinci', 'dua rincian = rinci');
  perform pg_temp.ok((select jumlah_rab from keu_v_rab_item where item_id=i2)=3910000, 'jumlah item = jumlah rincian');
  perform pg_temp.ok((select count(*) from keu_v_rab_jadwal_beda)=0, 'jadwal selaras');

  -- ubah volume: jadwal ikut (otomatis)
  update keu_rab_baris set volume=4 where id=b2;
  perform pg_temp.ok((select sum(nilai) from keu_rab_jadwal where baris_id=b2)=680000, 'jadwal ikut volume');
  perform pg_temp.ok((select jumlah_tetap from keu_rab_baris where id=b2) is null, 'jumlah_tetap kosong');
  -- jumlah_tetap (POK dibulatkan) dipertahankan sampai volume/harga diubah
  update keu_rab_baris set jumlah_tetap=680001 where id=b2;
  perform pg_temp.ok((select jumlah from keu_rab_baris where id=b2)=680001 and (select sum(nilai) from keu_rab_jadwal where baris_id=b2)=680001, 'jumlah_tetap dipakai');
  update keu_rab_baris set harga_satuan=170000.00, volume=3 where id=b2;
  perform pg_temp.ok((select jumlah from keu_rab_baris where id=b2)=510000, 'jumlah_tetap hilang saat volume berubah');

  -- jadwal manual
  update keu_rab_jadwal set nilai=500000 where baris_id=b2 and bulan=7;
  perform pg_temp.ok((select manual from keu_rab_baris where id=b2), 'edit tangan = manual');
  update keu_rab_baris set volume=6 where id=b2;      -- manual: tidak diratakan
  perform pg_temp.ok((select nilai from keu_rab_jadwal where baris_id=b2 and bulan=7)=500000, 'manual tidak ditimpa');
  perform pg_temp.ok((select selisih from keu_v_rab_jadwal_beda where baris_id=b2) is not null, 'selisih jadwal terdeteksi');
  perform keu_rab_ratakan(b2);
  perform pg_temp.ok((select not manual from keu_rab_baris where id=b2) and (select count(*) from keu_v_rab_jadwal_beda)=0, 'ratakan ulang memulihkan');
  update keu_rab_baris set volume=3 where id=b2;

  -- selesai & pencairan
  insert into keu_rab_baris(item_id,ket,volume,satuan,harga_satuan,periode,bulan_mulai,bulan_sampai,minggu) values (i1,'tambahan',1,'PAKET',50000,'sekali',8,8,1);
  perform pg_temp.ok((select nilai from keu_v_rab_pencairan where rab_id=r and bulan=8 and minggu=1)=50000, 'pencairan Agu M1');
  update keu_rab_item set selesai=true where id=i1;
  perform pg_temp.ok((select count(*) from keu_v_rab_pencairan where rab_id=r and bulan=8 and minggu=1)=0, 'item selesai tidak ikut pencairan');
  perform pg_temp.ok((select status from keu_v_rab_item where item_id=i1)='selesai', 'status selesai');
  update keu_rab_item set selesai=false where id=i1;

  -- penjaga akun: PBJ (9) pada RO ini hanya admin RO -> boleh; TU tidak
  perform pg_temp.sesi(8);
  perform pg_temp.gagal(format($q$insert into keu_rab_baris(item_id,volume,satuan,harga_satuan) values (%s,1,'OK',1)$q$, i2), '42501');
  perform pg_temp.gagal(format($q$update keu_rab_item set catatan='x' where id=%s$q$, i1), '42501');
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$delete from keu_rab_item where id=%s$q$, i1), '42501');
  -- hapus rincian lewat fungsi
  perform keu_rab_hapus_baris((select id from keu_rab_baris where ket='tambahan'));
  perform pg_temp.ok((select count(*) from keu_rab_baris where ket='tambahan')=0, 'rincian dihapus');
  perform pg_temp.sesi(null);
  create temp table if not exists ctx(k text primary key, v bigint);
  insert into ctx values ('rab1', r) on conflict (k) do update set v=excluded.v;
end $$;

-- 2. Alur persetujuan
do $$
declare r bigint := (select v from ctx where k='rab1'); h text;
begin
  perform pg_temp.gagal(format($q$update keu_rab set status='disetujui' where id=%s$q$, r), '42501');        -- status tidak boleh diubah langsung
  perform pg_temp.gagal(format($q$select keu_rab_aksi(%s,'setuju_ketua','',6)$q$, r), '23514');               -- belum diajukan
  perform pg_temp.gagal(format($q$select keu_rab_aksi(%s,'ajukan','',8)$q$, r), '42501');                     -- TU
  perform pg_temp.ok(keu_rab_aksi(r,'ajukan','',6)='menunggu_ketua', 'admin RO ajukan -> menunggu ketua');
  -- tidak bisa diubah lagi
  perform pg_temp.sesi(6);
  perform pg_temp.gagal(format($q$update keu_rab_item set catatan='x' where rab_id=%s$q$, r), '23514');
  perform pg_temp.sesi(null);
  perform pg_temp.gagal(format($q$select keu_rab_aksi(%s,'setuju_ketua','',6)$q$, r), '42501');             -- admin RO bukan ketua
  perform pg_temp.gagal(format($q$select keu_rab_aksi(%s,'sahkan','',3)$q$, r), '23514');                    -- belum menunggu PPK
  perform pg_temp.gagal(format($q$select keu_rab_aksi(%s,'kembalikan','',4)$q$, r), '23514');                -- alasan wajib
  -- kembalikan oleh ketua, lalu perbaiki dan ajukan lagi
  perform pg_temp.ok(keu_rab_aksi(r,'kembalikan','Volume transport belum sesuai jadwal',4)='dikembalikan', 'ketua mengembalikan');
  perform pg_temp.sesi(6);
  update keu_rab_item set catatan='diperbaiki' where rab_id=r and akun_kode='521211';
  perform pg_temp.sesi(null);
  perform pg_temp.ok(keu_rab_aksi(r,'ajukan','',6)='menunggu_ketua', 'ajukan lagi');
  perform pg_temp.ok(keu_rab_aksi(r,'setuju_ketua','',4)='menunggu_ppk', 'ketua setuju -> menunggu PPK');
  perform pg_temp.gagal(format($q$select keu_rab_aksi(%s,'sahkan','',4)$q$, r), '42501');                    -- ketua bukan PPK
  perform pg_temp.ok(keu_rab_aksi(r,'sahkan','',3)='disetujui', 'PPK mengesahkan');
  perform pg_temp.ok((select disahkan_oleh from keu_rab where id=r)=3 and (select disetujui_ketua_oleh from keu_rab where id=r)=4, 'jejak persetujuan');
  perform pg_temp.ok((select count(*) from keu_rab_riwayat where rab_id=r)=6, 'riwayat: buat, ajukan, kembalikan, ajukan, setuju, sahkan');
  -- RAB sah tidak dapat diubah
  perform pg_temp.sesi(4);
  perform pg_temp.gagal(format($q$update keu_rab_item set catatan='y' where rab_id=%s$q$, r), '23514');
  perform pg_temp.sesi(null);
end $$;

-- 3. Versi berikutnya: salin dari RAB sah, jadwal manual ikut, RAB lama digantikan saat versi baru sah
do $$
declare r1 bigint := (select v from ctx where k='rab1'); r2 bigint; i int; b bigint; bm bigint;
begin
  perform pg_temp.sesi(4);
  r2 := keu_rab_baru('2906.BMA.005', r1);
  perform pg_temp.ok((select nomor from keu_rab where id=r2)=2, 'nomor 2');
  perform pg_temp.ok((select count(*) from keu_rab_item where rab_id=r2)=(select count(*) from keu_rab_item where rab_id=r1), 'item tersalin');
  perform pg_temp.ok((select sum(jumlah) from keu_rab_baris where item_id in (select id from keu_rab_item where rab_id=r2))=(select sum(jumlah) from keu_rab_baris where item_id in (select id from keu_rab_item where rab_id=r1)), 'rincian tersalin');
  perform pg_temp.ok((select count(*) from keu_rab_jadwal j join keu_rab_baris b on b.id=j.baris_id join keu_rab_item it on it.id=b.item_id where it.rab_id=r2)=12*(select count(*) from keu_rab_baris b join keu_rab_item it on it.id=b.item_id where it.rab_id=r2), 'jadwal 12 per rincian');
  perform pg_temp.ok((select status from keu_rab where id=r1)='disetujui', 'RAB lama masih sah selama versi baru draf');
  -- ketua mengajukan sendiri -> menunggu PPK (ketua bukan PPK)
  perform pg_temp.sesi(null);
  perform pg_temp.ok(keu_rab_aksi(r2,'ajukan','',4)='menunggu_ppk', 'ketua ajukan -> menunggu PPK');
  perform pg_temp.ok(keu_rab_aksi(r2,'sahkan','',3)='disetujui', 'PPK sahkan versi 2');
  perform pg_temp.ok((select status from keu_rab where id=r1)='digantikan', 'versi 1 digantikan');
  perform pg_temp.ok((select count(*) from keu_rab where ro_kode='2906.BMA.005' and status='disetujui')=1, 'satu sah');
  insert into ctx values ('rab2', r2) on conflict (k) do update set v=excluded.v;
end $$;

-- 4. PPK merangkap ketua tim (D-03): langsung sah
do $$
declare r bigint; i bigint;
begin
  perform pg_temp.sesi(3);
  r := keu_rab_baru('2896.BMA.004');
  -- RO ini tidak ada pada POK dasar, jadi hanya item baru
  insert into keu_rab_item(rab_id,komponen_kode,akun_kode,uraian) values (r,'052','524113','Transport lokal (item baru)') returning id into i;
  insert into keu_rab_baris(item_id,volume,satuan,harga_satuan,periode,bulan_mulai,bulan_sampai) values (i,3,'OK',170000,'sekali',9,9);
  perform pg_temp.sesi(null);
  perform pg_temp.ok(keu_rab_aksi(r,'ajukan','',3)='disetujui', 'PPK merangkap ketua: langsung sah');
  perform pg_temp.ok((select disahkan_oleh from keu_rab where id=r)=3, 'disahkan oleh PPK');
  -- RAB kosong tidak boleh diajukan
  perform pg_temp.sesi(3);
  perform pg_temp.gagal($q$select keu_rab_baru('2906.BMA.006')$q$, '42501');   -- RO lain: PPK bukan ketua/admin RO di sana
  perform pg_temp.sesi(null);
end $$;

-- 5. RLS, hak, kesehatan
do $$
begin
  perform pg_temp.ok(not has_function_privilege('anon','keu_rab_aksi(bigint,text,text,bigint)','execute'), 'anon tanpa keu_rab_aksi');
  perform pg_temp.ok(not has_function_privilege('authenticated','keu_rab_baru(text,bigint,bigint)','execute'), 'authenticated tanpa keu_rab_baru');
  perform pg_temp.ok((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'keu\_%' and not c.relrowsecurity)=0, 'semua tabel keu_ RLS aktif');
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname like 'keu\_%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')))=0, 'tidak ada definer terbuka');
  perform pg_temp.ok(not has_table_privilege('anon','keu_rab','select') and not has_table_privilege('authenticated','keu_rab_baris','select'), 'tabel RAB tertutup');
end $$;
