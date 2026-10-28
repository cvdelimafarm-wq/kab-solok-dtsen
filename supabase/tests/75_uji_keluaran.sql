-- Uji keluaran RAB per survei (berkas 20261028h). Dijalankan sesudah 20261028g dan 20261028h. Seluruhnya di dalam transaksi yang dibatalkan: tidak ada data yang tersisa.
begin;
do $$
declare
  k int; d text; v_rab bigint; v_ro text; v_ident bigint; v_item bigint; v_akun text; v_admin bigint; v_asing bigint; v_isi jsonb; v_r jsonb; v_t text; v_id1 bigint; v_id2 bigint;
begin
  -- ---- katalog
  select count(*) into k from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('keu_keluaran','keu_keluaran_tanda','keu_keluaran_spek') and c.relrowsecurity;
  if k <> 3 then raise exception 'GAGAL: tiga tabel keluaran harus berRLS, ada %', k; end if;
  if has_table_privilege('anon', 'public.keu_keluaran', 'select') or has_table_privilege('authenticated', 'public.keu_keluaran_tanda', 'select') or has_table_privilege('authenticated', 'public.keu_keluaran_spek', 'select') then
    raise exception 'GAGAL: anon atau authenticated masih boleh membaca tabel keluaran';
  end if;
  if not (has_table_privilege('service_role', 'public.keu_keluaran', 'insert') and has_table_privilege('service_role', 'public.keu_v_keluaran', 'select')
          and has_table_privilege('service_role', 'public.keu_v_keluaran_tanda', 'select') and has_table_privilege('service_role', 'public.keu_v_keluaran_spek', 'select')) then
    raise exception 'GAGAL: service_role harus boleh menulis tabel dan membaca tampilan keluaran';
  end if;
  select count(*) into k from pg_trigger where tgrelid = 'public.keu_keluaran'::regclass and not tgisinternal and tgname in ('keu_t1_jaga','keu_t2_catat');
  if k <> 2 then raise exception 'GAGAL: keu_keluaran harus punya penjaga dan pencatat-saja, ada %', k; end if;
  select count(*) into k from pg_trigger where tgrelid in ('public.keu_keluaran_tanda'::regclass, 'public.keu_keluaran_spek'::regclass) and not tgisinternal and tgname = 'keu_t1_jaga';
  if k <> 2 then raise exception 'GAGAL: penjaga tabel tanda dan spek harus 2, ada %', k; end if;
  select count(*) into k from pg_proc where pronamespace = 'public'::regnamespace and proname in ('keu_keluaran_ajukan','keu_keluaran_tandai','keu_keluaran_spek_simpan') and not has_function_privilege('anon', oid, 'execute') and not has_function_privilege('authenticated', oid, 'execute');
  if k <> 3 then raise exception 'GAGAL: tiga fungsi keluaran harus tertutup bagi anon dan authenticated, ada %', k; end if;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'keu_jalankan' and pronamespace = 'public'::regnamespace;
  if position('''keu_keluaran_ajukan''' in d) = 0 or position('''keu_keluaran_tandai''' in d) = 0 or position('''keu_keluaran_spek_simpan''' in d) = 0 then raise exception 'GAGAL: izin gerbang keu_jalankan belum memuat fungsi keluaran'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keu_notifikasi'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%keluaran_diajukan%' and pg_get_constraintdef(oid) like '%keluaran_ditanya%' and pg_get_constraintdef(oid) like '%ident_fix%') then
    raise exception 'GAGAL: jenis notifikasi keluaran belum ada (atau jenis lama hilang)';
  end if;

  -- ---- perilaku (memakai data yang ada; dilewati bila tidak ada RAB draf dengan identifikasi sah atau tidak ada akun Admin)
  select r.id, r.ro_kode into v_rab, v_ro from keu_rab r
   where r.status in ('draf','dikembalikan') and exists (select 1 from keu_ident i where i.ro_kode = r.ro_kode and i.ver >= 1 and i.status <> 'dibatalkan') order by r.id limit 1;
  select a.id into v_admin from sigap_akun a where a.aktif and keu_ident_punya(a.id, 'ADMIN') order by a.id limit 1;
  if v_rab is null or v_admin is null then raise notice 'LULUS 75 (katalog saja; tidak ada RAB draf dengan identifikasi sah atau tidak ada akun Admin untuk uji perilaku)'; return; end if;
  select i.id into v_ident from keu_ident i where i.ro_kode = v_ro and i.ver >= 1 and i.status <> 'dibatalkan' order by i.id limit 1;
  select kode into v_akun from keu_master_akun order by kode limit 1;
  perform set_config('app.akun_id', '', true);

  -- bahan: satu item baru dengan dua rincian bertanda, status survei Siap
  insert into keu_rab_item(rab_id, pok_kunci, komponen_kode, akun_kode, uraian, satuan) values (v_rab, null, '051', v_akun, 'UJI keluaran', 'PAKET') returning id into v_item;
  insert into keu_rab_baris(item_id, urut, ket, volume, satuan, harga_satuan, ident_id, ident_ver, ident_kunci, ident_vol, ident_harga) values (v_item, 1, 'UJI 1', 2, 'orang-hari', 1000, v_ident, 1, 'uji|k1', 2, 1000);
  insert into keu_rab_baris(item_id, urut, ket, volume, satuan, harga_satuan, ident_id, ident_ver, ident_kunci, ident_vol, ident_harga) values (v_item, 2, 'UJI 2', 3, 'orang-hari', 500, v_ident, 1, 'uji|k2', 3, 500);
  insert into keu_rab_survei(rab_id, ident_id, status) values (v_rab, v_ident, 'siap')
    on conflict (rab_id, ident_id) do update set status = 'siap';
  v_isi := jsonb_build_object('v', 1, 'n', 2, 'total', 3500, 'survei', jsonb_build_object('identNama', 'Uji'), 'dana', jsonb_build_object('total', 3500), 'bayar', jsonb_build_object('rincian', '[]'::jsonb), 'pengadaan', '[]'::jsonb);

  -- 1. pengajuan oleh Admin
  perform set_config('app.akun_id', v_admin::text, true);
  v_r := keu_keluaran_ajukan(v_ident, v_rab, v_isi, 'uji');
  if (v_r ->> 'ver')::int <> 1 or (v_r ->> 'tanpa_perubahan')::boolean then raise exception 'GAGAL: pengajuan pertama harus versi 1, dapat %', v_r; end if;
  v_id1 := (v_r ->> 'id')::bigint;
  if not exists (select 1 from keu_keluaran where id = v_id1 and total = 3500 and n_rincian = 2 and dibuat_oleh = v_admin) then raise exception 'GAGAL: paket versi 1 tidak tersimpan lengkap'; end if;
  -- 2. isi sama persis = tanpa perubahan
  v_r := keu_keluaran_ajukan(v_ident, v_rab, v_isi);
  if not (v_r ->> 'tanpa_perubahan')::boolean or (v_r ->> 'ver')::int <> 1 then raise exception 'GAGAL: isi sama harus tanpa perubahan, dapat %', v_r; end if;
  -- 3. jumlah tidak sama dengan RAB ditolak; cacah tidak sama ditolak
  begin perform keu_keluaran_ajukan(v_ident, v_rab, v_isi || jsonb_build_object('total', 9999)); raise exception 'GAGAL: total salah seharusnya ditolak';
  exception when sqlstate '23514' then null; end;
  begin perform keu_keluaran_ajukan(v_ident, v_rab, v_isi || jsonb_build_object('n', 5)); raise exception 'GAGAL: cacah salah seharusnya ditolak';
  exception when sqlstate '23514' then null; end;
  -- 4. bentuk isi tidak sah ditolak
  begin perform keu_keluaran_ajukan(v_ident, v_rab, '{"v":1}'::jsonb); raise exception 'GAGAL: isi tidak lengkap seharusnya ditolak';
  exception when sqlstate '22023' then null; end;
  -- 5. isi berbeda = versi 2
  v_r := keu_keluaran_ajukan(v_ident, v_rab, v_isi || jsonb_build_object('survei', jsonb_build_object('identNama', 'Uji 2')));
  if (v_r ->> 'ver')::int <> 2 then raise exception 'GAGAL: isi berbeda harus versi 2, dapat %', v_r; end if;
  v_id2 := (v_r ->> 'id')::bigint;
  -- 6. paket beku: tidak bisa diubah langsung, dengan atau tanpa akun sesi
  begin update keu_keluaran set total = 1 where id = v_id1; raise exception 'GAGAL: pembaruan langsung seharusnya ditolak';
  exception when sqlstate '42501' then null; end;
  perform set_config('app.akun_id', '', true);
  begin update keu_keluaran set total = 1 where id = v_id1; raise exception 'GAGAL: paket seharusnya hanya-tambah';
  exception when others then if sqlerrm like 'GAGAL%' then raise; end if; end;
  begin delete from keu_keluaran where id = v_id1; raise exception 'GAGAL: paket seharusnya tidak dapat dihapus';
  exception when others then if sqlerrm like 'GAGAL%' then raise; end if; end;
  perform set_config('app.akun_id', v_admin::text, true);
  -- 7. status survei harus Siap
  perform set_config('app.akun_id', '', true);
  update keu_rab_survei set status = 'draf' where rab_id = v_rab and ident_id = v_ident;
  perform set_config('app.akun_id', v_admin::text, true);
  begin perform keu_keluaran_ajukan(v_ident, v_rab, v_isi || jsonb_build_object('survei', jsonb_build_object('identNama', 'Uji 3'))); raise exception 'GAGAL: survei Draf seharusnya ditolak';
  exception when sqlstate '23514' then null; end;
  -- 8. tanda terima
  v_t := keu_keluaran_tandai(v_id2, 'dana', 'diterima');
  if v_t <> 'diterima' then raise exception 'GAGAL: tanda dana harus diterima, dapat %', v_t; end if;
  if keu_keluaran_tandai(v_id2, 'dana', 'diterima') <> 'tetap' then raise exception 'GAGAL: tanda sama harus tetap'; end if;
  begin perform keu_keluaran_tandai(v_id2, 'bayar', 'ditanyakan'); raise exception 'GAGAL: pertanyaan tanpa catatan seharusnya ditolak';
  exception when sqlstate '23514' then null; end;
  if keu_keluaran_tandai(v_id2, 'bayar', 'ditanyakan', 'Tenggat SPJ kurang jelas') <> 'ditanyakan' then raise exception 'GAGAL: pertanyaan harus tersimpan'; end if;
  begin perform keu_keluaran_tandai(v_id1, 'dana', 'diterima'); raise exception 'GAGAL: menandai versi lama seharusnya ditolak';
  exception when sqlstate '23514' then null; end;
  begin perform keu_keluaran_tandai(v_id2, 'lain', 'diterima'); raise exception 'GAGAL: bagian tidak sah seharusnya ditolak';
  exception when sqlstate '22023' then null; end;
  if (select count(*) from keu_keluaran_tanda where keluaran_id = v_id2) <> 2 then raise exception 'GAGAL: tanda per bagian harus 2'; end if;
  -- 9. spesifikasi
  if keu_keluaran_spek_simpan(v_ident, 'k1:konsumsi', 'Konsumsi', '{"isi":{"jenis":"Snack"},"barang":[],"catatan":""}'::jsonb) <> 'tersimpan' then raise exception 'GAGAL: spesifikasi baru harus tersimpan'; end if;
  if keu_keluaran_spek_simpan(v_ident, 'k1:konsumsi', 'Konsumsi', '{"isi":{"jenis":"Snack"},"barang":[],"catatan":""}'::jsonb) <> 'tetap' then raise exception 'GAGAL: spesifikasi sama harus tetap'; end if;
  if keu_keluaran_spek_simpan(v_ident, 'k1:konsumsi', 'Konsumsi', '{"isi":{"jenis":"Prasmanan"},"barang":[],"catatan":""}'::jsonb) <> 'tersimpan' then raise exception 'GAGAL: spesifikasi berubah harus tersimpan'; end if;
  begin perform keu_keluaran_spek_simpan(v_ident, 'Salah Kode!', 'Konsumsi', '{}'::jsonb); raise exception 'GAGAL: kode butir tidak sah seharusnya ditolak';
  exception when sqlstate '22023' then null; end;
  begin perform keu_keluaran_spek_simpan(v_ident, 'k1:konsumsi', 'Ngawur', '{}'::jsonb); raise exception 'GAGAL: jenis tidak sah seharusnya ditolak';
  exception when sqlstate '22023' then null; end;
  begin perform keu_keluaran_spek_simpan(v_ident, 'k1:konsumsi', 'Konsumsi', '[]'::jsonb); raise exception 'GAGAL: spesifikasi bukan objek seharusnya ditolak';
  exception when sqlstate '22023' then null; end;
  -- 10. akun tanpa hak ditolak (dilewati bila semua akun aktif punya hak)
  select a.id into v_asing from sigap_akun a
   where a.aktif and not keu_ident_punya(a.id, 'ADMIN') and not keu_ident_punya(a.id, 'PPK') and not keu_ident_punya(a.id, 'BEND') and not keu_ident_punya(a.id, 'TU')
     and not keu_ident_punya(a.id, 'PBJ') and not keu_keluaran_boleh_susun(a.id, v_ro) order by a.id limit 1;
  if v_asing is not null then
    perform set_config('app.akun_id', v_asing::text, true);
    begin perform keu_keluaran_ajukan(v_ident, v_rab, v_isi); raise exception 'GAGAL: akun tanpa hak seharusnya ditolak mengajukan';
    exception when sqlstate '42501' then null; end;
    begin perform keu_keluaran_tandai(v_id2, 'dana', 'diterima', 'x'); raise exception 'GAGAL: akun tanpa hak seharusnya ditolak menandai';
    exception when sqlstate '42501' then null; end;
    begin perform keu_keluaran_spek_simpan(v_ident, 'k1:konsumsi', 'Konsumsi', '{}'::jsonb); raise exception 'GAGAL: akun tanpa hak seharusnya ditolak mengisi spesifikasi';
    exception when sqlstate '42501' then null; end;
  end if;
  raise notice 'LULUS 75 (katalog dan perilaku)';
end $$;
rollback;
