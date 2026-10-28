-- Uji status RAB per survei (berkas 20261028g). Dijalankan sesudah 20261028g. Seluruhnya di dalam transaksi yang dibatalkan: tidak ada data yang tersisa.
begin;
do $$
declare k int; d text; v_rab bigint; v_ro text; v_ident bigint; v_item bigint; v_baris bigint; v_akun text; v_st text; v_lain bigint;
begin
  -- ---- katalog
  select count(*) into k from information_schema.columns where table_schema = 'public' and table_name = 'keu_rab_survei' and column_name in ('rab_id','ident_id','status','catatan','diubah_oleh','dibuat_at','diubah_at');
  if k <> 7 then raise exception 'GAGAL: kolom keu_rab_survei harus 7, ada %', k; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.keu_rab_survei'::regclass) then raise exception 'GAGAL: RLS keu_rab_survei belum aktif'; end if;
  if has_table_privilege('anon', 'public.keu_rab_survei', 'select') or has_table_privilege('authenticated', 'public.keu_rab_survei', 'select') then raise exception 'GAGAL: anon atau authenticated masih boleh membaca keu_rab_survei'; end if;
  if not has_table_privilege('service_role', 'public.keu_rab_survei', 'insert') then raise exception 'GAGAL: service_role harus boleh menulis keu_rab_survei'; end if;
  select count(*) into k from pg_trigger where tgrelid = 'public.keu_rab_survei'::regclass and not tgisinternal and tgname in ('keu_t1_jaga','keu_t9_jejak');
  if k <> 2 then raise exception 'GAGAL: trigger keu_rab_survei harus 2, ada %', k; end if;
  select count(*) into k from pg_trigger where tgrelid = 'public.keu_rab_baris'::regclass and not tgisinternal and tgname = 'keu_t6_survei_turun';
  if k <> 1 then raise exception 'GAGAL: trigger penurun status pada keu_rab_baris tidak ada'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_rab_survei'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%draf%siap%') then raise exception 'GAGAL: pemeriksa status draf/siap tidak ada'; end if;

  -- ---- perilaku (memakai data yang ada; dilewati bila tidak ada RAB draf dengan identifikasi)
  select r.id, r.ro_kode into v_rab, v_ro from keu_rab r
   where r.status in ('draf','dikembalikan') and exists (select 1 from keu_ident i where i.ro_kode = r.ro_kode) order by r.id limit 1;
  if v_rab is null then raise notice 'LULUS 74 (katalog saja; tidak ada RAB draf dengan identifikasi untuk uji perilaku)'; return; end if;
  select i.id into v_ident from keu_ident i where i.ro_kode = v_ro order by i.id limit 1;
  select kode into v_akun from keu_master_akun order by kode limit 1;
  perform set_config('app.akun_id', '', true);

  -- 1. baris awal berstatus draf
  insert into keu_rab_survei(rab_id, ident_id) values (v_rab, v_ident);
  select status into v_st from keu_rab_survei where rab_id = v_rab and ident_id = v_ident;
  if v_st <> 'draf' then raise exception 'GAGAL: status awal harus draf, ada %', v_st; end if;
  -- 2. siap tanpa rincian ditolak
  begin
    update keu_rab_survei set status = 'siap' where rab_id = v_rab and ident_id = v_ident;
    raise exception 'GAGAL: siap tanpa rincian seharusnya ditolak';
  exception when sqlstate '23514' then null; end;
  -- 3. dengan satu rincian bertanda, siap diterima
  insert into keu_rab_item(rab_id, pok_kunci, komponen_kode, akun_kode, uraian, satuan) values (v_rab, null, '051', v_akun, 'UJI item baru', 'PAKET') returning id into v_item;
  insert into keu_rab_baris(item_id, urut, ket, volume, satuan, harga_satuan, ident_id, ident_ver, ident_kunci, ident_vol, ident_harga)
    values (v_item, 1, 'UJI', 2, 'orang-hari', 1000, v_ident, 1, 'uji|kunci', 2, 1000) returning id into v_baris;
  update keu_rab_survei set status = 'siap' where rab_id = v_rab and ident_id = v_ident;
  select status into v_st from keu_rab_survei where rab_id = v_rab and ident_id = v_ident;
  if v_st <> 'siap' then raise exception 'GAGAL: status harus siap, ada %', v_st; end if;
  -- 4. mengubah baris menurunkan ke draf
  update keu_rab_baris set volume = 3 where id = v_baris;
  select status into v_st from keu_rab_survei where rab_id = v_rab and ident_id = v_ident;
  if v_st <> 'draf' then raise exception 'GAGAL: ubah baris harus menurunkan ke draf, ada %', v_st; end if;
  -- 5. menambah baris baru dan menghapus juga menurunkan
  update keu_rab_survei set status = 'siap' where rab_id = v_rab and ident_id = v_ident;
  insert into keu_rab_baris(item_id, urut, ket, volume, satuan, harga_satuan, ident_id, ident_ver, ident_kunci) values (v_item, 2, 'UJI 2', 1, 'paket', 500, v_ident, 1, 'uji|kunci2');
  select status into v_st from keu_rab_survei where rab_id = v_rab and ident_id = v_ident;
  if v_st <> 'draf' then raise exception 'GAGAL: tambah baris harus menurunkan ke draf, ada %', v_st; end if;
  update keu_rab_survei set status = 'siap' where rab_id = v_rab and ident_id = v_ident;
  -- jadwal bulanan baris (keu_rab_jadwal, FK tanpa cascade) dihapus dulu, seperti yang dilakukan aplikasi saat menghapus baris
  delete from keu_rab_jadwal where baris_id in (select id from keu_rab_baris where ident_kunci = 'uji|kunci2');
  delete from keu_rab_baris where ident_kunci = 'uji|kunci2';
  select status into v_st from keu_rab_survei where rab_id = v_rab and ident_id = v_ident;
  if v_st <> 'draf' then raise exception 'GAGAL: hapus baris harus menurunkan ke draf, ada %', v_st; end if;
  -- 6. baris tanpa penanda tidak menurunkan status
  update keu_rab_survei set status = 'siap' where rab_id = v_rab and ident_id = v_ident;
  insert into keu_rab_baris(item_id, urut, ket, volume, satuan, harga_satuan) values (v_item, 3, 'UJI biasa', 1, 'paket', 100);
  select status into v_st from keu_rab_survei where rab_id = v_rab and ident_id = v_ident;
  if v_st <> 'siap' then raise exception 'GAGAL: baris biasa tidak boleh menurunkan status, ada %', v_st; end if;
  -- 7. identifikasi milik RO lain ditolak
  select id into v_lain from keu_ident where ro_kode <> v_ro order by id limit 1;
  if v_lain is not null then
    begin
      insert into keu_rab_survei(rab_id, ident_id) values (v_rab, v_lain);
      raise exception 'GAGAL: identifikasi RO lain seharusnya ditolak';
    exception when sqlstate '23514' then null; end;
  end if;
  -- 8. rab_id dan ident_id tidak dapat diganti
  begin
    update keu_rab_survei set ident_id = coalesce(v_lain, v_ident + 1000000) where rab_id = v_rab and ident_id = v_ident;
    raise exception 'GAGAL: penggantian ident_id seharusnya ditolak';
  exception when sqlstate '23514' or sqlstate '23503' then null; end;
  raise notice 'LULUS 74 (katalog dan perilaku)';
end $$;
rollback;
