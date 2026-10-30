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

-- 4. penjaga hak (app.akun_id terisi)
do $$
declare a0 bigint; a1 bigint;
begin
  select count(*) into a0 from sigap_audit;
  -- ketua (4) tidak boleh mengubah master akun
  perform set_config('app.akun_id','4',true);
  perform pg_temp.gagal($q$update keu_master_akun set nama='Coba' where kode='521211'$q$, '42501');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,berlaku_mulai) values (9,'TU','2027-01-01')$q$, '42501');
  perform pg_temp.gagal($q$update keu_master_skor set bobot_penarikan=30, bobot_volume=30$q$, '42501');
  -- PPK (3) boleh master, bobot; tidak boleh akses (penugasan)
  perform set_config('app.akun_id','3',true);
  update keu_master_akun set nama='Belanja Barang Operasional (uji)' where kode='521211';
  update keu_master_skor set bobot_penarikan=30, bobot_volume=30;
  perform pg_temp.ok((select count(*) from keu_master_skor_riwayat)=1, 'riwayat skor 1');
  perform pg_temp.ok((select bobot_penarikan from keu_master_skor_riwayat)=35, 'riwayat berisi nilai lama 35');
  perform pg_temp.ok((select diubah_oleh from keu_master_skor)=3, 'diubah_oleh = PPK');
  update keu_master_skor set bobot_penarikan=35, bobot_volume=25;
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,berlaku_mulai) values (9,'TU','2027-01-01')$q$, '42501');
  -- PPK memberi hak verifikasi (pemberi_kode = sahkan) boleh; memberi 'master' tidak
  insert into keu_pemberian(akun_id,kewenangan_kode,berlaku_mulai,diberi_oleh) values (8,'verifikasi','2026-10-24',3);
  perform pg_temp.gagal($q$insert into keu_pemberian(akun_id,kewenangan_kode,berlaku_mulai) values (9,'master','2026-10-24')$q$, '42501');
  -- tidak ada hapus dari aplikasi
  perform pg_temp.gagal($q$delete from keu_master_akun where kode='521211'$q$, '42501');
  -- admin (1) boleh penugasan
  perform set_config('app.akun_id','1',true);
  insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (9,'PBJ','2906.BMA.005','2026-01-01');
  perform pg_temp.gagal($q$insert into keu_penugasan(akun_id,peran_kode,berlaku_mulai) values (9,'PBJ','2026-01-01')$q$, '23514');
  perform set_config('app.akun_id','',true);
  -- audit: jejak tercatat dengan akun pelaku
  perform pg_temp.ok((select count(*) from sigap_audit where aksi='keu.keu_master_akun.update' and akun_id=3)=1, 'audit update akun oleh PPK');
  perform pg_temp.ok((select detail->'lama'->>'nama' from sigap_audit where aksi='keu.keu_master_akun.update' and akun_id=3) is not null, 'audit memuat nilai lama');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi='keu.keu_penugasan.insert' and akun_id=1)=1, 'audit penugasan oleh admin');
  perform pg_temp.ok((select count(*) from sigap_audit where aksi like 'keu.keu_master_skor.%')=2, 'audit skor 2 kali; yang gagal tidak tercatat');
end $$;
select set_config('app.akun_id','',false);

-- update tanpa perubahan nilai tidak mencatat jejak
do $$
declare a0 bigint; a1 bigint;
begin
  select count(*) into a0 from sigap_audit;
  update keu_master_akun set nama=nama where kode='511111';
  select count(*) into a1 from sigap_audit;
  perform pg_temp.ok(a0=a1, 'update tanpa perubahan tidak dijejak');
  update keu_master_akun set nama=nama||' ' where kode='511111';
  select count(*) into a1 from sigap_audit;
  perform pg_temp.ok(a1=a0+1, 'update berubah dijejak');
  update keu_master_akun set nama=rtrim(nama) where kode='511111';
end $$;

-- 5. RLS dan hak anon / authenticated
do $$
declare r record; n int;
begin
  for r in select relname, relrowsecurity from pg_class c join pg_namespace s on s.oid=c.relnamespace
           where s.nspname='public' and c.relkind='r' and c.relname like 'keu\_%' loop
    perform pg_temp.ok(r.relrowsecurity, 'RLS aktif: '||r.relname);
  end loop;
  select count(*) into n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relname like 'keu\_%';
  perform pg_temp.ok(n=20, 'jumlah tabel keu_ = 20, ada '||n);
  perform pg_temp.ok(not has_table_privilege('anon','keu_master_akun','select'), 'anon tanpa select');
  perform pg_temp.ok(not has_table_privilege('authenticated','keu_penugasan','select'), 'authenticated tanpa select');
  perform pg_temp.ok(has_table_privilege('service_role','keu_penugasan','insert'), 'service_role boleh');
  perform pg_temp.ok(not has_function_privilege('anon','keu_boleh(bigint,text,text,date)','execute'), 'anon tanpa keu_boleh');
  perform pg_temp.ok(not has_function_privilege('authenticated','keu_peran_akun(bigint,date)','execute'), 'authenticated tanpa keu_peran_akun');
end $$;
set role anon;
select pg_temp.gagal('select * from keu_master_akun', '42501');
reset role;

-- 6. cek kesehatan acuan bagian 6 (khusus tabel keu_): tidak boleh ada baris P0
with t as (
  select c.oid, c.relname nama, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname like 'keu\_%'
)
select pg_temp.ok((select count(*) from t where not rls)=0, 'P0 RLS mati: 0');
select pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and p.proname like 'keu\_%' and has_function_privilege('anon',p.oid,'EXECUTE'))=0, 'P0 definer terbuka: 0');
select pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and p.proname like 'keu\_%' and has_function_privilege('authenticated',p.oid,'EXECUTE'))=0, 'P0 definer terbuka utk authenticated: 0');
