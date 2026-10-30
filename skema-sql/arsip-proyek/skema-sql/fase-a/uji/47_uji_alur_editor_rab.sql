\set ON_ERROR_STOP on
-- Uji editor RAB di halaman RO: mengirim PERSIS muatan yang dibangun aplikasi (lib/keu/rab.ts) lewat gerbang keu_tulis dan keu_jalankan.
-- Dijalankan sesudah 46. Seluruhnya dibatalkan (rollback) di akhir. Akun: 3 PPK, 4 ketua 2906.BMA.005, 12 pegawai biasa.
begin;
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
declare rab bigint; a record; b record; i1 bigint; i2 bigint; br1 bigint; br2 bigint; br3 bigint; h jsonb; v record; n int;
begin
  perform set_config('app.akun_id', '', true);
  -- hak menyusun: pegawai biasa ditolak, ketua boleh (RAB sah nomor 2 sudah ada, tidak ada yang aktif)
  perform pg_temp.gagal($q$select keu_jalankan(12, 'keu_rab_baru', '{"p_ro":"2906.BMA.005","p_dari":null}')$q$, '42501');
  rab := (keu_jalankan(4, 'keu_rab_baru', '{"p_ro":"2906.BMA.005","p_dari":null}'))::text::bigint;
  perform pg_temp.ok((select status = 'draf' from keu_rab where id = rab), 'RAB baru berstatus draf');
  perform pg_temp.gagal($q$select keu_jalankan(4, 'keu_rab_baru', '{"p_ro":"2906.BMA.005","p_dari":null}')$q$, '23505');   -- satu RAB aktif per RO

  -- dua item POK pertama dari lembar
  select * into a from keu_v_adm_lembar where ro_kode = '2906.BMA.005' order by detail_id limit 1;
  select * into b from keu_v_adm_lembar where ro_kode = '2906.BMA.005' and detail_id <> a.detail_id order by detail_id limit 1;

  -- pegawai biasa tidak boleh menulis item/rincian
  perform pg_temp.gagal(format($q$select keu_tulis(12, 'keu_rab_item', 'insert', jsonb_build_object('rab_id', %s, 'pok_kunci', %L, 'komponen_kode', %L, 'akun_kode', %L, 'uraian', %L, 'satuan', 'PAKET'))$q$,
                               rab, a.kunci_stabil, a.komponen_kode, a.akun_kode, a.uraian), '42501');

  -- RAB = item (dataItemRab + dataSamaDenganItem)
  h := keu_tulis(4, 'keu_rab_item', 'insert', jsonb_build_object('rab_id', rab, 'pok_kunci', a.kunci_stabil, 'komponen_kode', a.komponen_kode,
         'akun_kode', a.akun_kode, 'uraian', a.uraian, 'satuan', left(coalesce(nullif(a.satuan, ''), 'PAKET'), 20), 'prioritas_kode', 'inti'));
  i1 := (h ->> 'id')::bigint;
  h := keu_tulis(4, 'keu_rab_baris', 'insert', jsonb_build_object('item_id', i1, 'urut', 1, 'ket', 'RAB = item', 'volume', greatest(a.volume, 1),
         'satuan', left(coalesce(nullif(a.satuan, ''), 'PAKET'), 20), 'harga_satuan', round(a.jumlah / greatest(a.volume, 1), 2), 'jumlah_tetap', a.jumlah,
         'sama_dengan_item', true, 'periode', 'sekali', 'bulan_mulai', 11, 'bulan_sampai', 11, 'minggu', 2));
  perform pg_temp.ok((h ->> 'jumlah')::numeric = a.jumlah, 'jumlah RAB = pagu POK (dikunci)');
  select * into v from keu_v_rab_item where item_id = i1;
  perform pg_temp.ok(v.status = 'sama' and v.jumlah_rab = a.jumlah and v.pok_kunci = a.kunci_stabil, 'status item sama');
  perform pg_temp.ok((select sum(nilai) = a.jumlah from keu_rab_jadwal where baris_id = (h ->> 'id')::bigint), 'jadwal diratakan ke bulan cair');
  perform pg_temp.ok((select nilai = a.jumlah from keu_rab_jadwal where baris_id = (h ->> 'id')::bigint and bulan = 11), 'seluruh nilai pada bulan 11');

  -- rinci: dua rincian (dataBaris), ubah satu (update seperti aplikasi: sama_dengan_item false, jumlah_tetap null), hapus satu
  h := keu_tulis(4, 'keu_rab_item', 'insert', jsonb_build_object('rab_id', rab, 'pok_kunci', b.kunci_stabil, 'komponen_kode', b.komponen_kode,
         'akun_kode', b.akun_kode, 'uraian', b.uraian, 'satuan', 'PAKET', 'prioritas_kode', null));
  i2 := (h ->> 'id')::bigint;
  h := keu_tulis(4, 'keu_rab_baris', 'insert', jsonb_build_object('item_id', i2, 'urut', 1, 'ket', 'PML', 'volume', 2.5, 'satuan', 'OK', 'harga_satuan', 170000,
         'periode', 'bulanan', 'bulan_mulai', 3, 'bulan_sampai', 5, 'minggu', 2));
  br2 := (h ->> 'id')::bigint;
  perform pg_temp.ok((h ->> 'jumlah')::numeric = 425000, 'jumlah rincian = volume x harga');
  perform pg_temp.ok((select count(*) = 3 and sum(nilai) = 425000 from keu_rab_jadwal where baris_id = br2 and nilai > 0), 'jadwal tiap bulan 3-5');
  h := keu_tulis(4, 'keu_rab_baris', 'insert', jsonb_build_object('item_id', i2, 'urut', 2, 'ket', 'PPL', 'volume', 10, 'satuan', 'OK', 'harga_satuan', 100000,
         'periode', 'sekali', 'bulan_mulai', 6, 'bulan_sampai', 6, 'minggu', 1));
  br3 := (h ->> 'id')::bigint;
  h := keu_tulis(4, 'keu_rab_baris', 'update', jsonb_build_object('ket', 'PML kabupaten', 'volume', 3, 'satuan', 'OK', 'harga_satuan', 170000, 'periode', 'sekali',
         'bulan_mulai', 4, 'bulan_sampai', 4, 'minggu', 3, 'sama_dengan_item', false, 'jumlah_tetap', null), jsonb_build_object('id', br2));
  perform pg_temp.ok((h ->> 'jumlah')::numeric = 510000 and (select sum(nilai) = 510000 and count(*) filter (where nilai > 0) = 1 from keu_rab_jadwal where baris_id = br2), 'ubah rincian meratakan ulang jadwal');
  select * into v from keu_v_rab_item where item_id = i2;
  perform pg_temp.ok(v.status = 'rinci' and v.jumlah_rab = 1510000 and v.jumlah_rincian = 2, 'item rinci dengan dua rincian');
  perform pg_temp.ok((select count(*) = 2 from keu_v_rab_baris where rab_id = rab and pok_kunci = b.kunci_stabil), 'keu_v_rab_baris memuat rincian per RAB');
  perform keu_jalankan(4, 'keu_rab_hapus_baris', jsonb_build_object('p_baris', br3));
  perform pg_temp.ok((select count(*) = 1 from keu_rab_baris where item_id = i2), 'rincian terhapus');
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_rab_hapus_baris', '{"p_baris": %s}')$q$, br2), '42501');

  -- tandai selesai lalu batalkan selesai
  h := keu_tulis(4, 'keu_rab_item', 'update', '{"selesai": true}', jsonb_build_object('id', i2));
  perform pg_temp.ok((select status = 'selesai' from keu_v_rab_item where item_id = i2), 'item selesai');
  h := keu_tulis(4, 'keu_rab_item', 'update', '{"selesai": false}', jsonb_build_object('id', i2));
  perform pg_temp.ok((select status = 'rinci' from keu_v_rab_item where item_id = i2), 'selesai dibatalkan');

  -- alur persetujuan
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_rab_aksi', '{"p_rab": %s, "p_aksi": "ajukan", "p_catatan": ""}')$q$, rab), '42501');
  h := keu_jalankan(4, 'keu_rab_aksi', jsonb_build_object('p_rab', rab, 'p_aksi', 'ajukan', 'p_catatan', ''));
  perform pg_temp.ok(h #>> '{}' = 'menunggu_ppk', 'ketua mengajukan -> menunggu PPK');
  perform pg_temp.gagal(format($q$select keu_tulis(4, 'keu_rab_item', 'update', '{"selesai": true}', '{"id": %s}')$q$, i2), '23514');   -- terkunci
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_rab_aksi', '{"p_rab": %s, "p_aksi": "sahkan", "p_catatan": ""}')$q$, rab), '42501');   -- ketua bukan PPK
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_rab_aksi', '{"p_rab": %s, "p_aksi": "kembalikan", "p_catatan": "ya"}')$q$, rab), '23514');
  h := keu_jalankan(3, 'keu_rab_aksi', jsonb_build_object('p_rab', rab, 'p_aksi', 'kembalikan', 'p_catatan', 'Volume PML perlu dicek'));
  perform pg_temp.ok(h #>> '{}' = 'dikembalikan' and (select catatan = 'Volume PML perlu dicek' from keu_rab where id = rab), 'PPK mengembalikan dengan alasan');
  perform keu_tulis(4, 'keu_rab_item', 'update', '{"selesai": true}', jsonb_build_object('id', i2));   -- dapat diubah lagi
  perform keu_tulis(4, 'keu_rab_item', 'update', '{"selesai": false}', jsonb_build_object('id', i2));
  perform keu_jalankan(4, 'keu_rab_aksi', jsonb_build_object('p_rab', rab, 'p_aksi', 'ajukan', 'p_catatan', ''));
  h := keu_jalankan(3, 'keu_rab_aksi', jsonb_build_object('p_rab', rab, 'p_aksi', 'sahkan', 'p_catatan', ''));
  perform pg_temp.ok(h #>> '{}' = 'disetujui', 'PPK mengesahkan');
  perform pg_temp.ok((select status = 'digantikan' from keu_rab where ro_kode = '2906.BMA.005' and nomor = 2), 'RAB sah lama digantikan');
  select count(*) into n from keu_v_rab_jejak where rab_id = rab and oleh_nama is not null;
  perform pg_temp.ok(n = 5, 'jejak aksi tercatat dengan nama pelaku (' || n || ')');

  -- revisi: salinan dari RAB sah, lalu batalkan
  rab := (keu_jalankan(4, 'keu_rab_baru', jsonb_build_object('p_ro', '2906.BMA.005', 'p_dari', rab)))::text::bigint;
  perform pg_temp.ok((select count(*) = 2 from keu_rab_item where rab_id = rab), 'salinan membawa dua item');
  perform pg_temp.ok((select count(*) = 2 from keu_rab_baris rb join keu_rab_item ri on ri.id = rb.item_id where ri.rab_id = rab), 'salinan membawa rincian');
  h := keu_jalankan(4, 'keu_rab_aksi', jsonb_build_object('p_rab', rab, 'p_aksi', 'batalkan', 'p_catatan', ''));
  perform pg_temp.ok(h #>> '{}' = 'dibatalkan', 'batalkan draf');
end $$;
rollback;
select 'LULUS 47_uji_alur_editor_rab' as hasil;
