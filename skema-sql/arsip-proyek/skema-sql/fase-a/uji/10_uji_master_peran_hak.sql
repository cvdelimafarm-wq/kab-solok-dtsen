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

do $$
declare n bigint;
begin
  -- 1. jumlah data awal
  perform pg_temp.ok((select count(*) from keu_master_peran)=9, 'peran 9');
  perform pg_temp.ok((select count(*) from keu_master_kewenangan)=17, 'kewenangan 17');
  perform pg_temp.ok((select count(*) from keu_master_kewenangan_peran)=31, 'matriks 31');
  perform pg_temp.ok((select count(*) from keu_master_akun)=43, 'akun 43');
  perform pg_temp.ok((select count(*) from keu_master_satuan)=20, 'satuan 20');
  perform pg_temp.ok((select count(*) from keu_master_satuan where not pasti)=0, 'satuan semua pasti');
  perform pg_temp.ok((select count(*) from keu_struktur_level)=8, 'level 8');
  perform pg_temp.ok((select tampil from keu_struktur_level where kode='subkomp')=false, 'subkomp tersembunyi');
  perform pg_temp.ok((select count(*) from keu_struktur_level where tampil)=7, '7 level tampil');
  perform pg_temp.ok((select count(*) from keu_master_jalur)=26, 'jalur 26');
  perform pg_temp.ok((select count(*) from keu_ro)=35, 'ro 35');
  perform pg_temp.ok((select count(*) from keu_master_dok)=297, 'dok 297');
  perform pg_temp.ok((select count(*) from keu_master_dok where sumber='pola')=32, 'pola 32');
  perform pg_temp.ok((select count(*) from keu_master_waktu)=8, 'waktu 8');
  perform pg_temp.ok((select sum(persen) from keu_master_profil_penarikan)=100, 'profil 100');
  perform pg_temp.ok((select bobot_penarikan+bobot_volume+bobot_cakupan+bobot_disiplin from keu_master_skor)=100, 'bobot 100');
  perform pg_temp.ok((select count(*) from keu_master_akun a where a.kelompok_kode is null)=0, 'semua akun punya kelompok');
  perform pg_temp.ok((select kelompok_kode from keu_master_akun where kode='521211')='52L', '521211 = 52L');
  perform pg_temp.ok((select kelompok_kode from keu_master_akun where kode='524113')='524', '524113 = 524');
  perform pg_temp.ok((select kelompok_kode from keu_master_akun where kode='511111')='51', '511111 = 51');
  perform pg_temp.ok(keu_kelompok_akun('999999') is null, 'kelompok tak dikenal null');
  perform pg_temp.ok(keu_satuan_baku(' o-k ')='OK', 'alias O-K');
  perform pg_temp.ok(keu_satuan_baku('lbr')='LMBR', 'alias LBR');
  perform pg_temp.ok(keu_satuan_baku('xyz') is null, 'alias tak dikenal');
  perform pg_temp.ok((keu_jalur('item','lintas',false)).jalur_kode='djpb', 'item lintas = djpb');
  perform pg_temp.ok((keu_jalur('item','dalam',false)).jalur_kode='pok', 'item dalam = pok');
  perform pg_temp.ok((keu_jalur('ro','dalam',false)).kepastian='dugaan', 'ro dugaan');
  perform pg_temp.ok((keu_jalur('komponen','dalam',true)).jalur_kode='dja', 'komponen khusus = dja');
  perform pg_temp.ok((keu_jalur('akun','tambahan',false)).jalur_kode='dja', 'tambahan = dja');
  perform pg_temp.ok((select nilai_tanggal from keu_master_waktu where kode='tenggat_dipa_dja')='2026-10-30', 'tenggat DJA');
  -- RO format
  perform pg_temp.gagal($q$insert into keu_ro(kode,nama) values ('abc','x')$q$, '23514');
  insert into keu_ro(kode,nama) values ('T-001','RO usulan uji');
  perform pg_temp.ok((select sementara from keu_ro where kode='T-001'), 'T-001 sementara');
  perform pg_temp.gagal($q$insert into keu_master_akun(kode,nama,pola_kode) values ('12345','x','BRG')$q$);
  perform pg_temp.gagal($q$insert into keu_master_akun(kode,nama,pola_kode) values ('999999','x','BRG')$q$);
  perform pg_temp.gagal($q$insert into keu_master_satuan_alias(alias,satuan_kode) values ('abc','OK')$q$, '23514');
  perform pg_temp.gagal($q$update keu_master_skor set bobot_penarikan=40$q$, '23514');
  perform pg_temp.gagal($q$update keu_master_skor set ambang_baik=60$q$, '23514');
end $$;

-- 2. penugasan
insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values
 (1,'ADMIN',null,'2026-01-01'),(2,'KPA',null,'2026-01-01'),(3,'PPK',null,'2026-01-01'),
 (4,'KETUA','2906.BMA.005','2026-01-01'),(5,'KETUA','2906.BMA.006','2026-01-01'),
 (6,'ADMINRO','2906.BMA.005','2026-01-01'),(7,'BEND',null,'2026-01-01'),(8,'TU',null,'2026-01-01');
do $$
begin
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,berlaku_mulai) values (9,'PPK','2026-06-01')$q$, '23P01');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,berlaku_mulai) values (9,'KPA','2026-06-01')$q$, '23P01');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (9,'KETUA','2906.BMA.005','2026-06-01')$q$, '23P01');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,berlaku_mulai) values (9,'KETUA','2026-06-01')$q$, '23514');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (9,'PPK','2906.BMA.005','2027-06-01')$q$, '23514');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (6,'ADMINRO','2906.BMA.005','2026-03-01')$q$, '23P01');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai,berlaku_sampai) values (9,'ADMINRO','2906.BMA.005','2026-05-01','2026-04-01')$q$, '22000');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (999,'ADMINRO','2906.BMA.005','2026-05-01')$q$);
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (4,'ADMINRO','2999.ZZZ.999','2026-05-01')$q$, '23503');
  -- admin RO kedua untuk RO yang sama boleh
  insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (9,'ADMINRO','2906.BMA.005','2026-05-01');
  -- pergantian ketua: lama berakhir lalu baru mulai sesudahnya
  update keu_penugasan set berlaku_sampai='2026-06-30' where akun_id=5 and peran_kode='KETUA';
  insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (4,'KETUA','2906.BMA.006','2026-07-01');
  -- akun tidak aktif
  update sigap_akun set aktif=false where id=9;
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (9,'ADMINRO','2906.BMA.006','2026-05-01')$q$, '23514');
  update sigap_akun set aktif=true where id=9;
end $$;

-- 3. keu_boleh
do $$
declare ro1 text := '2906.BMA.005'; ro2 text := '2906.BMA.006'; t date := '2026-10-24';
begin
  perform pg_temp.ok(keu_boleh(4,'rab',ro1,t), 'ketua A rab di RO sendiri');
  perform pg_temp.ok(keu_boleh(4,'rab',ro2,t), 'ketua A jadi ketua RO2 mulai Jul');
  perform pg_temp.ok(not keu_boleh(5,'rab',ro2,t), 'ketua B sudah berakhir 30 Jun');
  perform pg_temp.ok(keu_boleh(5,'rab',ro2,'2026-06-15'), 'ketua B masih ketua 15 Jun');
  perform pg_temp.ok(not keu_boleh(4,'rab',null,t), 'RO null tidak cukup untuk peran ro');
  perform pg_temp.ok(not keu_boleh(4,'rab','2896.BMA.004',t), 'RO lain');
  perform pg_temp.ok(keu_boleh(6,'draf',ro1,t) and not keu_boleh(6,'rab',ro1,t), 'admin RO: draf ya, rab tidak');
  perform pg_temp.ok(not keu_boleh(6,'draf',ro2,t), 'admin RO bukan RO lain');
  perform pg_temp.ok(keu_boleh(3,'sahkan',null,t) and keu_boleh(3,'jadwal') and keu_boleh(3,'pok_pdf') and not keu_boleh(3,'rab',ro1,t), 'PPK');
  perform pg_temp.ok(keu_boleh(3,'bobot') and keu_boleh(3,'str_ppk') and keu_boleh(3,'master'), 'PPK bobot/str_ppk/master');
  perform pg_temp.ok(keu_boleh(2,'laporan') and not keu_boleh(2,'sahkan') and not keu_boleh(2,'bobot'), 'KPA hanya laporan');
  perform pg_temp.ok(keu_boleh(7,'realisasi') and keu_boleh(7,'verifikasi') and not keu_boleh(7,'rab',ro1,t), 'bendahara');
  perform pg_temp.ok(keu_boleh(1,'akses') and keu_boleh(1,'master') and not keu_boleh(1,'sahkan'), 'admin');
  perform pg_temp.ok(not keu_boleh(4,'master') and not keu_boleh(4,'akses'), 'ketua bukan master');
  perform pg_temp.ok(keu_boleh(4,'kek_putus',ro1,t) and not keu_boleh(6,'kek_putus',ro1,t), 'kek_putus hanya ketua');
  perform pg_temp.ok(keu_boleh(6,'kek_catat',ro1,t) and keu_boleh(4,'kek_catat',ro1,t) and not keu_boleh(3,'kek_catat',ro1,t), 'kek_catat ketua+adminro');
  perform pg_temp.ok(keu_boleh(8,'skor'), 'TU boleh lihat skor');
  -- TU perlu pemberian
  perform pg_temp.ok(not keu_boleh(8,'verifikasi'), 'TU belum boleh verifikasi');
  insert into keu_pemberian(akun_id,kewenangan_kode,berlaku_mulai,diberi_oleh) values (8,'verifikasi','2026-10-01',3);
  perform pg_temp.ok(keu_boleh(8,'verifikasi'), 'TU boleh setelah diberi');
  perform pg_temp.ok(keu_boleh(8,'verifikasi',ro1,t), 'TU diberi semua RO');
  perform pg_temp.gagal($q$insert into keu_pemberian(akun_id,kewenangan_kode,berlaku_mulai) values (8,'verifikasi','2026-10-15')$q$, '23P01');
  update keu_pemberian set dibatalkan_at=now() where akun_id=8;
  perform pg_temp.ok(not keu_boleh(8,'verifikasi'), 'TU dicabut');
  -- pemberian ke akun lain tanpa peran
  insert into keu_pemberian(akun_id,kewenangan_kode,ro_kode,berlaku_mulai,berlaku_sampai) values (9,'verifikasi',ro1,'2026-10-01','2026-12-31');
  perform pg_temp.ok(keu_boleh(9,'verifikasi',ro1,t) and not keu_boleh(9,'verifikasi',ro2,t), 'pemberian per RO');
  perform pg_temp.ok(not keu_boleh(9,'verifikasi',ro1,'2027-01-02'), 'pemberian berakhir');
  -- akun nonaktif
  update sigap_akun set aktif=false where id=3;
  perform pg_temp.ok(not keu_boleh(3,'sahkan'), 'akun nonaktif tidak berwenang');
  update sigap_akun set aktif=true where id=3;
  perform pg_temp.ok(not keu_boleh(3,'tidak_ada'), 'kewenangan tak dikenal');
end $$;
