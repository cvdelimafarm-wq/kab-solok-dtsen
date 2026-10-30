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

-- data uji: versi 0 (dipa awal), pohon lengkap
insert into keu_pok_versi(tahun,nomor_revisi,jenis) values (2026,0,'dipa_awal'),(2026,1,'revisi');
create temp table id(k text primary key, v bigint);
do $$
declare v0 bigint; n bigint;
begin
  select id into v0 from keu_pok_versi where nomor_revisi=0;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v0,null,'program','GG','Dukungan Manajemen',1000000) returning id into n; insert into id values ('gg',n);
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v0,n,'kegiatan','2906','Kegiatan 2906',1000000) returning id into n; insert into id values ('keg',n);
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v0,n,'kro','BMA','KRO BMA',1000000) returning id into n; insert into id values ('kro',n);
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu,ro_kode,volume,satuan) values (v0,n,'ro','005','RO 005',1000000,'2906.BMA.005',12,'Dokumen') returning id into n; insert into id values ('ro',n);
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v0,n,'komponen','055','Komponen 055',1000000) returning id into n; insert into id values ('kom',n);
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v0,n,'subkomp','A','Subkomponen A',700000) returning id into n; insert into id values ('sub',n);
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v0,n,'akun','521211','Belanja Barang',700000) returning id into n; insert into id values ('akun1',n);
  -- akun langsung di bawah komponen
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values (v0,(select v from id where k='kom'),'akun','524113','Transport lokal',300000) returning id into n; insert into id values ('akun2',n);
  -- dua baris kembar (uraian sama) pada akun1: jumlah dibulatkan (33.333,33 x 21 = 699.999,93 -> 700000 hampir)
  insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,kemunculan,uraian,volume,satuan,harga_satuan,jumlah)
   values (v0,(select v from id where k='akun1'),keu_kunci_detail('2906.BMA.005','055','521211','ATK  Kegiatan',1),1,'ATK Kegiatan',10,'OK',20000,200000),
          (v0,(select v from id where k='akun1'),keu_kunci_detail('2906.BMA.005','055','521211','atk kegiatan',2),2,'ATK Kegiatan',25,'OK',20000,500000);
  insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,uraian,volume,satuan,harga_satuan,jumlah,nomor_item)
   values (v0,(select v from id where k='akun2'),keu_kunci_detail('2906.BMA.005','055','524113','transport',1),'transport',3,'OK',100000,300000,'000252');
end $$;

do $$
begin
  perform pg_temp.ok(keu_kunci_detail('2906.BMA.005','055','521211','ATK  Kegiatan',1) = '2906.BMA.005/055/521211/atk kegiatan#1', 'kunci ternormalisasi');
  perform pg_temp.ok((select count(*) from keu_v_pok_selisih where selisih<>0)=0, 'pohon konsisten');
  -- hirarki
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama) values (%s,%s,'ro','006','x')$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='keg')), '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama) values (%s,%s,'kegiatan','ABC','x')$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='gg')), '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,ro_kode) values (%s,%s,'ro','007','x','2906.BMA.099')$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='kro')), '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama) values (%s,%s,'akun','521213','x')$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='ro')), '23514');
  -- induk beda versi
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama) values (%s,%s,'kegiatan','2907','x')$q$,(select id from keu_pok_versi where nomor_revisi=1),(select v from id where k='gg')), '23514');
  -- ro tanpa ro_kode / non-ro dengan volume
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama) values (%s,%s,'ro','008','x')$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='kro')), '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,volume) values (%s,%s,'kro','CCC','x',3)$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='keg')), '23514');
  -- KRO kembar: tanpa kemunculan ditolak (23505), dengan kemunculan=2 diterima
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama) values (%s,%s,'kro','BMA','KRO BMA lagi')$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='keg')), '23505');
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,kemunculan,nama) values ((select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='keg'),'kro','BMA',2,'KRO BMA kemunculan 2');
  -- detail
  perform pg_temp.gagal(format($q$insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,uraian,volume,satuan,harga_satuan,jumlah) values (%s,%s,'k1','x',1,'OK',1,1)$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='kom')), '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,uraian,volume,satuan,harga_satuan,jumlah) values (%s,%s,'k1','x',1,'OK',1,1)$q$,(select id from keu_pok_versi where nomor_revisi=1),(select v from id where k='akun1')), '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,uraian,volume,satuan,harga_satuan,jumlah,nomor_item) values (%s,%s,'k2','x',1,'OK',1,1,'ab')$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='akun1')), '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,uraian,volume,satuan,harga_satuan,jumlah) values (%s,%s,%L,'ATK',1,'OK',1,1)$q$,(select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='akun1'),keu_kunci_detail('2906.BMA.005','055','521211','atk kegiatan',1)), '23505');
  -- jumlah tersimpan menyimpang dari volume x harga diterima, selisih tercatat
  update keu_pok_detail set jumlah = jumlah where false;
  insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama,pagu) values ((select id from keu_pok_versi where nomor_revisi=0),(select v from id where k='kom'),'akun','521811','Akun uji pembulatan',66667);
  insert into keu_pok_detail(versi_id,akun_node_id,kunci_stabil,uraian,volume,satuan,harga_satuan,jumlah)
   values ((select id from keu_pok_versi where nomor_revisi=0),(select id from keu_pok_node where kode='521811'),'k-bulat','uji bulat',3,'OK',22222,66667);
  perform pg_temp.ok((select selisih_pembulatan from keu_pok_detail where kunci_stabil='k-bulat')=1, 'selisih pembulatan = 1');
end $$;
