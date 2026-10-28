-- Uji penanda RAB per survei (berkas 20261028f). Membaca katalog saja; tidak mengubah data. Dijalankan sesudah 20261028f.
begin;
do $$
declare k int; d text;
begin
  select count(*) into k from information_schema.columns where table_schema = 'public' and table_name = 'keu_rab_baris' and column_name in ('ident_id','ident_ver','ident_kunci','ident_vol','ident_harga');
  if k <> 5 then raise exception 'GAGAL: kolom penanda pada keu_rab_baris harus 5, ada %', k; end if;
  select count(*) into k from information_schema.columns where table_schema = 'public' and table_name = 'keu_v_rab_baris' and column_name in ('ident_id','ident_ver','ident_kunci','ident_vol','ident_harga');
  if k <> 5 then raise exception 'GAGAL: keu_v_rab_baris harus memuat 5 kolom penanda, ada %', k; end if;
  select count(*) into k from information_schema.columns where table_schema = 'public' and table_name = 'keu_v_rab_baris' and column_name in ('baris_id','item_id','rab_id','pok_kunci','urut','ket','volume','satuan','harga_satuan','jumlah','jumlah_dikunci','sama_dengan_item','catatan','tautan','periode','bulan_mulai','bulan_sampai','minggu','manual');
  if k <> 19 then raise exception 'GAGAL: kolom lama keu_v_rab_baris harus tetap 19, ada %', k; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_rab_baris'::regclass and conname = 'keu_rab_baris_ident_serasi') then raise exception 'GAGAL: pemeriksa ident_id dan ident_kunci tidak ada'; end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_rab_baru_alasan' and p.pronamespace = 'public'::regnamespace;
  if position('br.ident_kunci' in d) = 0 then raise exception 'GAGAL: keu_rab_baru_alasan belum membawa penanda'; end if;
  select count(*) into k from keu_rab_baris where ident_id is not null or ident_kunci is not null;
  raise notice 'LULUS 73 (% baris bertanda)', k;
end $$;
rollback;
