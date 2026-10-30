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
declare v0 bigint; v1 bigint; v2 bigint; h text := repeat('a',64);
begin
  select id into v0 from keu_pok_versi where nomor_revisi=0;
  select id into v1 from keu_pok_versi where nomor_revisi=1;
  -- bersihkan data uji pembulatan (SQL editor boleh menghapus draf)
  delete from keu_pok_detail where kunci_stabil='k-bulat';
  delete from keu_pok_node where kode='521811';
  perform pg_temp.ok((select count(*) from keu_v_pok_selisih where versi_id=v0 and selisih<>0)=0, 'konsisten kembali');
  -- selisih terdeteksi dan menahan pemberlakuan
  update keu_pok_node set pagu=250000 where kode='524113';
  perform pg_temp.ok((select count(*) from keu_v_pok_selisih where versi_id=v0 and selisih<>0)=2, 'dua node tak konsisten (akun dan komponen)');
  perform pg_temp.gagal(format('select keu_pok_berlakukan(%s)', v0), '23514');   -- tanpa hash/tanggal
  update keu_pok_versi set tanggal_efektif='2026-01-02', hash_berkas=h where id=v0;
  perform pg_temp.gagal(format('select keu_pok_berlakukan(%s)', v0), '23514');   -- selisih
  update keu_pok_node set pagu=300000 where kode='524113';
  perform keu_pok_berlakukan(v0);
  perform pg_temp.ok((select status from keu_pok_versi where id=v0)='berlaku', 'v0 berlaku');
  -- pembekuan isi
  perform pg_temp.gagal($q$update keu_pok_node set nama='ubah' where kode='055'$q$, '23514');
  perform pg_temp.gagal($q$delete from keu_pok_detail where nomor_item='000252'$q$, '23514');
  perform pg_temp.gagal(format($q$insert into keu_pok_node(versi_id,induk_id,tingkat,kode,nama) values (%s,null,'program','ZZ','x')$q$, v0), '23514');
  perform pg_temp.gagal(format($q$update keu_pok_versi set sumber_berkas='x' where id=%s$q$, v0), '23514');
  -- v1 menggantikan v0
  update keu_pok_versi set tanggal_efektif='2026-03-01', hash_berkas=h where id=v1;
  perform keu_pok_berlakukan(v1);
  perform pg_temp.ok((select status from keu_pok_versi where id=v0)='digantikan' and (select status from keu_pok_versi where id=v1)='berlaku', 'v0 digantikan v1 berlaku');
  perform pg_temp.gagal(format('select keu_pok_berlakukan(%s)', v0), '23514');
  perform pg_temp.gagal(format($q$update keu_pok_versi set status='draf' where id=%s$q$, v0), '23514');
  perform pg_temp.gagal(format($q$update keu_pok_versi set status='berlaku' where id=%s$q$, v0), '23514');
  -- dua berlaku sekaligus ditolak indeks unik
  insert into keu_pok_versi(tahun,nomor_revisi,jenis,tanggal_efektif,hash_berkas) values (2026,2,'revisi','2026-05-01',h) returning id into v2;
  perform pg_temp.gagal(format($q$update keu_pok_versi set status='berlaku' where id=%s$q$, v2), '23505');
  update keu_pok_versi set status='dibatalkan' where id=v2;
  -- tahun anggaran tidak dikenal
  perform pg_temp.gagal($q$insert into keu_pok_versi(tahun,nomor_revisi,jenis) values (2031,0,'dipa_awal')$q$, '23503');
  perform pg_temp.gagal($q$insert into keu_pok_versi(tahun,nomor_revisi,jenis) values (2026,5,'dipa_awal')$q$, '23514');
end $$;

-- alias kunci
insert into keu_kunci_alias(kunci_lama,kunci_baru,alasan) values ('k-a','k-b','impor penetapan'),('k-b','k-c','impor penetapan 2');
do $$
begin
  perform pg_temp.ok(keu_kunci_resolusi('k-a')='k-c', 'resolusi berantai');
  perform pg_temp.ok(keu_kunci_resolusi('k-x')='k-x', 'tanpa alias = dirinya');
  perform pg_temp.gagal($q$insert into keu_kunci_alias(kunci_lama,kunci_baru) values ('k-c','k-a')$q$, '23514');
  perform pg_temp.gagal($q$insert into keu_kunci_alias(kunci_lama,kunci_baru) values ('q','q')$q$, '23514');
end $$;

-- tampilan subkomponen
do $$
begin
  perform pg_temp.ok((select induk_tampil_id from keu_v_pok_node_tampil where kode='521211') = (select id from keu_pok_node where kode='055'), 'subkomp tersembunyi: akun naik ke komponen');
  perform pg_temp.ok((select induk_tampil_id from keu_v_pok_node_tampil where kode='524113') = (select id from keu_pok_node where kode='055'), 'akun langsung komponen tetap');
  update keu_struktur_level set tampil=true where kode='subkomp';
  perform pg_temp.ok((select induk_tampil_id from keu_v_pok_node_tampil where kode='521211') = (select id from keu_pok_node where kode='A'), 'subkomp tampil: induk subkomp');
  update keu_struktur_level set tampil=false where kode='subkomp';
end $$;

-- penjaga hak
do $$
begin
  perform set_config('app.akun_id','4',true);   -- ketua
  perform pg_temp.gagal($q$insert into keu_pok_versi(tahun,nomor_revisi,jenis) values (2026,7,'revisi')$q$, '42501');
  perform pg_temp.gagal($q$insert into keu_kunci_alias(kunci_lama,kunci_baru) values ('m','n')$q$, '42501');
  perform pg_temp.gagal($q$insert into keu_tahun_anggaran(tahun) values (2027)$q$, '42501');
  perform set_config('app.akun_id','3',true);   -- PPK
  insert into keu_pok_versi(tahun,nomor_revisi,jenis) values (2026,8,'revisi');
  update keu_pok_versi set tanggal_efektif='2026-09-01', hash_berkas=repeat('b',64) where nomor_revisi=8;
  perform set_config('app.akun_id','4',true);
  perform pg_temp.gagal(format('select keu_pok_berlakukan(%s)', (select id from keu_pok_versi where nomor_revisi=8)), '42501');
  perform set_config('app.akun_id','3',true);
  perform keu_pok_berlakukan((select id from keu_pok_versi where nomor_revisi=8), true);
  perform set_config('app.akun_id','',true);
  perform pg_temp.ok((select count(*) from sigap_audit where aksi='keu.keu_pok_versi.insert' and akun_id=3)=1, 'audit versi baru');
  perform pg_temp.ok((select status from keu_pok_versi where nomor_revisi=8)='berlaku', 'v8 berlaku via PPK');
  perform pg_temp.ok((select status from keu_pok_versi where nomor_revisi=1)='digantikan', 'v1 digantikan');
end $$;

-- RLS dan akses
do $$
declare r record;
begin
  for r in select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r' and c.relname like 'keu\_%' loop
    perform pg_temp.ok(r.relrowsecurity, 'RLS aktif: '||r.relname);
  end loop;
  perform pg_temp.ok(not has_table_privilege('anon','keu_pok_detail','select'), 'anon tanpa select detail');
  perform pg_temp.ok(not has_table_privilege('authenticated','keu_v_pok_selisih','select'), 'authenticated tanpa view');
  perform pg_temp.ok(not has_function_privilege('anon','keu_pok_berlakukan(bigint,boolean)','execute'), 'anon tanpa berlakukan');
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname like 'keu\_%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')))=0, 'tidak ada fungsi definer terbuka');
end $$;
