\set ON_ERROR_STOP on
-- Uji identifikasi survei (berkas 20261025za + zc): hak, persetujuan PARALEL (PPK dan TU, KPA terakhir), revisi, H-15 (sesudah H-15 hanya KPA), kunci isian, jendela pola, pemetaan paket.
-- Dijalankan sesudah migrasi a-n, za, dan zc. Bagian 'jendela depan' memakai Desember 2026 dan dilewati bila hari ini sudah >= 16 Nov 2026. Dibatalkan (rollback) di akhir.
-- Akun: 2 KPA, 3 PPK (juga ADMIN), 4 Ketua 2906.BMA.005, 6 AdminRO 2906.BMA.005, 7 Bendahara, 8 TU, 12 pegawai biasa.
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

create or replace function pg_temp.frm(p_nama text, p_tambah jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('nama', p_nama, 'periode', 'Triwulanan', 'keList', jsonb_build_array('Triwulan I', 'Triwulan II'),
    'jend', jsonb_build_object('mb', 2, 'mj', 'tgl', 'mn', 1, 'sb', 2, 'sj', 'akhir', 'sn', 0, 'perk', false),
    'kecuali', '{}'::jsonb, 'instrumen', 'FASIH') || p_tambah
$$;

do $$
declare kid bigint; id2 bigint; h jsonb; ke text; t timestamptz; t0 timestamptz; w date[]; f jsonb; n int; r jsonb; kunci text; j bigint;
begin
  perform set_config('app.akun_id', '', true);

  -- ===== kewenangan dan teks peran =====
  perform pg_temp.ok((select count(*) = 2 from keu_master_kewenangan where kode in ('ident_susun','ident_setuju')), 'dua kewenangan baru');
  perform pg_temp.ok((select count(*) = 3 from keu_master_kewenangan_peran where kewenangan_kode = 'ident_setuju'), 'setuju: PPK, TU, KPA');
  perform pg_temp.ok((select ket like '%Tidak menyetujui revisi anggaran%Menyetujui identifikasi survei%' from keu_master_peran where kode = 'KPA'), 'teks peran KPA diperjelas');
  perform pg_temp.ok(keu_boleh(2, 'ident_setuju') and keu_boleh(8, 'ident_setuju') and keu_boleh(3, 'ident_setuju'), 'KPA, TU, PPK boleh menyetujui');
  perform pg_temp.ok(not keu_boleh(2, 'sahkan'), 'KPA tetap tidak boleh mengesahkan revisi anggaran');
  perform pg_temp.ok(not keu_boleh(12, 'ident_susun', '2906.BMA.005') and not keu_boleh(7, 'ident_susun', '2906.BMA.005'), 'pegawai biasa dan bendahara tidak menyusun');
  perform pg_temp.ok(keu_boleh(6, 'ident_susun', '2906.BMA.005') and not keu_boleh(6, 'ident_susun', '2906.BMA.006'), 'admin RO hanya pada ROnya');
  h := keu_jalankan(6, 'keu_ident_hak', '{"p_ro":"2906.BMA.005"}');
  perform pg_temp.ok((h ->> 'susun')::boolean and not (h ->> 'ketua')::boolean and not (h ->> 'ppk')::boolean, 'hak admin RO');
  h := keu_jalankan(3, 'keu_ident_hak', '{"p_ro":"2906.BMA.005"}');
  perform pg_temp.ok((h ->> 'susun')::boolean and (h ->> 'ppk')::boolean and not (h ->> 'ketua')::boolean, 'PPK bukan pengganti ketua bila RO punya ketua');

  -- ===== tulis langsung ditutup, buat survei =====
  perform pg_temp.gagal($q$select keu_jalankan(12, 'keu_ident_buat', '{"p_ro":"2906.BMA.005","p_form":{"nama":"Uji tanpa hak"}}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(6, 'keu_ident_buat', '{"p_ro":"2906.BMA.006","p_form":{"nama":"RO lain"}}')$q$, '42501');
  perform pg_temp.gagal($q$select keu_jalankan(6, 'keu_ident_buat', '{"p_ro":"2906.BMA.005","p_form":{"nama":"ab"}}')$q$, '23514');
  perform pg_temp.gagal($q$select keu_jalankan(6, 'keu_ident_buat', '{"p_ro":"2906.BMA.005","p_form":[1]}')$q$, '22023');
  h := keu_jalankan(6, 'keu_ident_buat', jsonb_build_object('p_ro', '2906.BMA.005', 'p_form', pg_temp.frm('Seruti Triwulan I 2026')));
  kid := (h #>> '{}')::bigint;
  perform pg_temp.ok((select status = 'draf' and ver = 0 and langkah = 0 and nama = 'Seruti Triwulan I 2026' from keu_ident i2 where i2.id = kid), 'draf dibuat');
  perform pg_temp.gagal($q$select keu_jalankan(4, 'keu_ident_buat', '{"p_ro":"2906.BMA.005","p_form":{"nama":"seruti triwulan i 2026"}}')$q$, '23505'); -- nama kembar (huruf kecil)
  perform set_config('app.akun_id', '12', true);
  perform pg_temp.gagal(format('update keu_ident set nama = %L where id = %s', 'ubah langsung', kid), '42501');
  perform pg_temp.gagal(format('delete from keu_ident where id = %s', kid), '42501');
  perform set_config('app.akun_id', '', true);

  -- ===== simpan =====
  select diubah_at into t0 from keu_ident where keu_ident.id = kid;
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_ident_simpan', %L::jsonb)$q$, jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('x draf'))::text), '42501');
  h := keu_jalankan(6, 'keu_ident_simpan', jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026', '{"instrumen":"PAPI"}'), 'p_diubah', t0));
  t := (h #>> '{}')::timestamptz;
  perform pg_temp.ok(t > t0 and (select form ->> 'instrumen' = 'PAPI' from keu_ident where keu_ident.id = kid), 'isian tersimpan');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_simpan', %L::jsonb)$q$, jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026'), 'p_diubah', t0)::text), '40001'); -- penyunting lain
  perform keu_jalankan(6, 'keu_ident_simpan', jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026'), 'p_diubah', t));
  -- kembalikan ke FASIH untuk uji selanjutnya

  -- ===== kirim oleh admin RO -> ketua tim -> persetujuan paralel =====
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"kirim"}')$q$, kid), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '23514'); -- belum dikirim
  h := keu_jalankan(6, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kirim"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'menunggu_ketua', 'admin RO mengirim: menunggu ketua tim');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_simpan', %L::jsonb)$q$, jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026', '{"instrumen":"PAPI"}'))::text), '23514'); -- terkunci
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setuju_ketua"}')$q$, kid), '42501');  -- bukan ketua
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setuju_ketua"}')$q$, kid), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(8, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '23514'); -- belum giliran persetujuan
  h := keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setuju_ketua"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'menunggu_setuju', 'ketua menyetujui');
  perform pg_temp.ok((select menunggu = 'PPK dan Tata Usaha' and not ok_ppk and not ok_tu and not pasca_h15 from keu_v_ident where keu_v_ident.id = kid), 'menunggu PPK dan Tata Usaha (paralel)');

  perform pg_temp.gagal(format($q$select keu_jalankan(2, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '42501'); -- KPA mendahului
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '42501'); -- ketua bukan PPK
  h := keu_jalankan(8, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', kid)::jsonb);   -- TU boleh lebih dulu dari PPK
  perform pg_temp.ok((select langkah = 1 and status = 'menunggu_setuju' and menunggu = 'PPK' and ok_tu and not ok_ppk from keu_v_ident where keu_v_ident.id = kid), 'TU menyetujui, tinggal PPK');
  perform pg_temp.gagal(format($q$select keu_jalankan(8, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '42501'); -- TU tidak dua kali
  perform pg_temp.gagal(format($q$select keu_jalankan(2, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '42501'); -- KPA masih menunggu PPK
  perform pg_temp.gagal(format($q$select keu_jalankan(8, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"tarik"}')$q$, kid), '23514'); -- sudah ada yang menyetujui
  -- pengembalian oleh PPK: kembali ke draf, persetujuan TU hangus, siklus mulai lagi
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"kembalikan","p_catatan":"x"}')$q$, kid), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(2, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"kembalikan","p_catatan":"belum waktunya"}')$q$, kid), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(8, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"kembalikan","p_catatan":"sudah menyetujui"}')$q$, kid), '42501'); -- TU sudah menyetujui
  h := keu_jalankan(3, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kembalikan","p_catatan":"Lengkapi jadwal pelatihan"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'draf', 'dikembalikan ke draf (belum pernah sah)');
  perform pg_temp.ok((select langkah = 0 and not ok_tu and not ok_ppk and kembali_oleh = 'PPK' and catatan_kembali = 'Lengkapi jadwal pelatihan' from keu_ident where keu_ident.id = kid), 'catatan, pengembali tercatat; persetujuan hangus');
  -- kirim lagi oleh ketua tim: langsung ke persetujuan
  h := keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kirim"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'menunggu_setuju', 'ketua mengirim: langsung menunggu persetujuan');
  perform pg_temp.ok((select kembali_oleh is null and catatan_kembali = '' from keu_ident where keu_ident.id = kid), 'catatan pengembalian dibersihkan saat kirim');
  -- tarik kembali sebelum disetujui
  h := keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"tarik"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'draf', 'ditarik kembali');
  perform keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kirim"}', kid)::jsonb);
  perform keu_jalankan(3, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', kid)::jsonb);
  perform keu_jalankan(8, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', kid)::jsonb);
  perform pg_temp.ok((select count(*) = 0 from keu_v_ident_sah where ident_id = kid), 'belum sah: tidak tampak bagi modul hilir');
  perform pg_temp.ok((select menunggu = 'KPA' and langkah = 2 from keu_v_ident where keu_v_ident.id = kid), 'PPK dan TU selesai: menunggu KPA');
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '42501'); -- giliran KPA
  h := keu_jalankan(2, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'sah', 'KPA menyetujui: sah');
  perform pg_temp.ok((select status = 'sah' and ver = 1 and langkah = 3 and not rev and not ok_ppk and not ok_tu and not pasca_h15 from keu_ident where keu_ident.id = kid), 'status sah v1 (identifikasi awal)');
  perform pg_temp.ok((select count(*) >= 1 from keu_v_ident_riwayat where ident_id = kid and aksi = 'kirim' and catatan like '%sesudah H-15%terlambat%'), 'pengiriman awal sesudah H-15 dicatat terlambat');
  perform pg_temp.ok((select count(*) = 1 and bool_and(ver = 1 and form ->> 'nama' = 'Seruti Triwulan I 2026') from keu_v_ident_sah where ident_id = kid), 'versi sah terlihat modul hilir');
  perform pg_temp.ok((select count(*) = 1 from keu_ident_versi where ident_id = kid), 'satu salinan versi');
  perform pg_temp.gagal(format('update keu_ident_versi set form = ''{}'' where ident_id = %s', kid)); -- salinan versi tidak boleh diubah (keu_catat_saja)
end $$;

-- uji lanjutan (sesudah sah v1) pada blok berikutnya, masih dalam transaksi yang sama
do $$
declare kid bigint; w date[]; h jsonb; ke text; t0 timestamptz; r jsonb; n int; id2 bigint; kunci text; f jsonb;
begin
  perform set_config('app.akun_id', '', true);
  select i.id into kid from keu_ident i where i.nama = 'Seruti Triwulan I 2026';
  perform pg_temp.ok(kid is not null, 'survei uji ada');

  -- ===== sah tidak dapat disunting; revisi =====
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_simpan', %L::jsonb)$q$, jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026', '{"instrumen":"PAPI"}'))::text), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"ajukan_revisi"}')$q$, kid), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"batal_revisi"}')$q$, kid), '23514');
  h := keu_jalankan(6, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"ajukan_revisi"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'revisi', 'revisi dibuka');
  perform pg_temp.ok((select count(*) = 1 and bool_and(ver = 1) from keu_v_ident_sah where ident_id = kid), 'selama revisi modul hilir tetap memakai sah v1');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"kirim"}')$q$, kid), '23514'); -- alasan kosong
  h := keu_jalankan(6, 'keu_ident_simpan', jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026', '{"instrumen":"PAPI"}'), 'p_alasan', 'pendek'));
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"kirim"}')$q$, kid), '23514'); -- alasan < 10 huruf
  perform keu_jalankan(6, 'keu_ident_simpan', jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026'), 'p_alasan', 'Alasan revisi yang cukup panjang'));
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"kirim"}')$q$, kid), '23514'); -- tidak ada perubahan
  -- batalkan revisi mengembalikan isian sah
  perform keu_jalankan(6, 'keu_ident_simpan', jsonb_build_object('p_id', kid, 'p_form', pg_temp.frm('Seruti Triwulan I 2026', '{"instrumen":"PAPI"}')));
  h := keu_jalankan(6, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"batal_revisi"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'sah' and (select form ->> 'instrumen' = 'FASIH' and langkah = 3 from keu_ident where keu_ident.id = kid), 'revisi dibatalkan, isian kembali ke sah');

  -- ===== H-15 pada versi sah =====
  -- jend: bulan ke-3 periode, tgl 1 s.d. akhir bulan: Triwulan I 2026 = 1 s.d. 31 Maret 2026; Triwulan II = 1 s.d. 30 Juni 2026
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_ident_h15', '{"p_id":%s,"p_periode":"Triwulan I","p_mulai":"2026-03-02","p_selesai":"2026-03-31"}')$q$, kid), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_h15', '{"p_id":%s,"p_periode":"Triwulan III","p_mulai":"2026-09-02","p_selesai":"2026-09-30"}')$q$, kid), '23514'); -- periode tidak ada
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_h15', '{"p_id":%s,"p_periode":"Triwulan I","p_mulai":"2026-03-10","p_selesai":"2026-03-05"}')$q$, kid), '23514'); -- selesai sebelum mulai
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_h15', '{"p_id":%s,"p_periode":"Triwulan I","p_mulai":"2026-03-02","p_selesai":"2026-03-31"}')$q$, kid), '23514'); -- bergeser 1 hari: lewat revisi
  perform pg_temp.gagal(format($q$select keu_jalankan(6, 'keu_ident_h15', '{"p_id":%s,"p_periode":"Triwulan I","p_mulai":"2026-03-01","p_selesai":"2026-04-09"}')$q$, kid), '23514'); -- bergeser 9 hari: lewat revisi
  r := keu_jalankan(6, 'keu_ident_h15', format('{"p_id":%s,"p_periode":"Triwulan I","p_mulai":"2026-03-01","p_selesai":"2026-03-31"}', kid)::jsonb);
  perform pg_temp.ok((r ->> 'geser_mulai')::int = 0 and (r ->> 'geser_selesai')::int = 0, 'penegasan tanggal tanpa pergeseran lolos');
  perform pg_temp.ok((select upd -> 'Triwulan I' ->> 'mulai' = '2026-03-01' from keu_ident where keu_ident.id = kid), 'penegasan tersimpan');
  r := keu_jalankan(4, 'keu_ident_h15', format('{"p_id":%s,"p_periode":"Triwulan II","p_mulai":"2026-06-01","p_selesai":"2026-06-30"}', kid)::jsonb);
  perform pg_temp.ok((r ->> 'geser_mulai')::int = 0, 'tanggal ditegaskan tanpa pergeseran (ketua tim)');
  perform pg_temp.ok((select count(*) = 2 from keu_v_ident_riwayat where ident_id = kid and aksi = 'h15'), 'dua catatan H-15');

  -- revisi yang tidak mengubah jendela Triwulan I mempertahankan pembaruannya; Triwulan II diubah -> dibuang
  perform keu_jalankan(6, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"ajukan_revisi"}', kid)::jsonb);
  perform keu_jalankan(6, 'keu_ident_simpan', jsonb_build_object('p_id', kid, 'p_alasan', 'Pindah jadwal Triwulan II ke Kuartal',
    'p_form', pg_temp.frm('Seruti Triwulan I 2026', jsonb_build_object('kecuali', jsonb_build_object('Triwulan II', jsonb_build_object('on', true, 'mulai', '2026-07-06', 'selesai', '2026-07-20', 'alasan', 'Libur', 'perk', false))))));
  perform keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kirim"}', kid)::jsonb);
  perform pg_temp.ok((select rev and status = 'menunggu_setuju' and pasca_h15 and menunggu = 'KPA' from keu_v_ident where keu_v_ident.id = kid), 'kiriman revisi sesudah H-15: hanya KPA');
  perform pg_temp.ok((select count(*) = 1 from keu_v_ident_riwayat where ident_id = kid and aksi = 'kirim' and ver = 2 and catatan like '%hanya KPA%evaluasi%'), 'dicatat untuk evaluasi');
  perform pg_temp.ok((select count(*) = 1 and bool_and(ver = 1) from keu_v_ident_sah where ident_id = kid), 'menunggu revisi: hilir tetap v1');
  perform pg_temp.gagal(format($q$select keu_jalankan(3, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '42501'); -- PPK tidak diperlukan sesudah H-15
  perform pg_temp.gagal(format($q$select keu_jalankan(8, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, kid), '42501');
  -- KPA mengembalikan revisi: kembali ke revisi (bukan draf), versi sah tetap v1
  h := keu_jalankan(2, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kembalikan","p_catatan":"Periksa tanggal libur"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'revisi' and (select ver = 1 and kembali_oleh = 'KPA' and not pasca_h15 from keu_ident where keu_ident.id = kid), 'KPA mengembalikan revisi');
  perform keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kirim"}', kid)::jsonb);
  h := keu_jalankan(2, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', kid)::jsonb);
  perform pg_temp.ok((h #>> '{}') = 'sah' and (select ver = 2 and not rev and alasan_revisi = '' from keu_ident where keu_ident.id = kid), 'revisi sah v2');
  perform pg_temp.ok((select upd ? 'Triwulan I' and not (upd ? 'Triwulan II') from keu_ident where keu_ident.id = kid), 'H-15 Triwulan I dipertahankan, Triwulan II dibuang karena jendelanya berubah');
  perform pg_temp.ok((select count(*) = 2 and bool_and(form is not null) from keu_v_ident_versi where ident_id = kid), 'dua versi tersimpan');
  perform pg_temp.ok((select alasan = 'Pindah jadwal Triwulan II ke Kuartal' and rev from keu_v_ident_versi where ident_id = kid and ver = 2), 'alasan revisi tersimpan pada versi');
  perform pg_temp.ok((select ver = 2 from keu_v_ident_sah where ident_id = kid), 'hilir memakai v2');
  perform pg_temp.ok((select count(*) = 1 from keu_v_ident_riwayat where ident_id = kid and aksi = 'setujui' and ver = 2 and catatan like '%terupdate v2%sesudah H-15%'), 'riwayat: terupdate v2 sesudah H-15');

  -- ===== jendela depan (Desember 2026): revisi SEBELUM H-15 tetap paralel PPK dan TU, KPA terakhir =====
  if current_date < date '2026-11-16' then
    h := keu_jalankan(6, 'keu_ident_buat', jsonb_build_object('p_ro', '2906.BMA.005', 'p_form', pg_temp.frm('Survei jendela depan',
      '{"periode":"Ad-hoc","keList":["Ad-hoc"],"jend":{"mb":11,"mj":"tgl","mn":1,"sb":11,"sj":"akhir","sn":0,"perk":false}}'::jsonb)));
    id2 := (h #>> '{}')::bigint;
    perform keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kirim"}', id2)::jsonb);
    perform keu_jalankan(3, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', id2)::jsonb);
    perform keu_jalankan(8, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', id2)::jsonb);
    perform keu_jalankan(2, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', id2)::jsonb);
    perform pg_temp.ok((select status = 'sah' and ver = 1 from keu_ident where keu_ident.id = id2), 'jendela depan: identifikasi awal sah');
    perform pg_temp.ok((select count(*) = 0 from keu_v_ident_riwayat where ident_id = id2 and aksi = 'kirim' and catatan like '%sesudah H-15%'), 'jendela depan: tidak terlambat');
    perform keu_jalankan(6, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"ajukan_revisi"}', id2)::jsonb);
    perform keu_jalankan(6, 'keu_ident_simpan', jsonb_build_object('p_id', id2, 'p_alasan', 'Geser jendela ke akhir Desember', 'p_form',
      pg_temp.frm('Survei jendela depan', '{"periode":"Ad-hoc","keList":["Ad-hoc"],"jend":{"mb":11,"mj":"tgl","mn":10,"sb":11,"sj":"akhir","sn":0,"perk":false}}'::jsonb)));
    perform keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"kirim"}', id2)::jsonb);
    perform pg_temp.ok((select not pasca_h15 and menunggu = 'PPK dan Tata Usaha' and rev from keu_v_ident where keu_v_ident.id = id2), 'revisi sebelum H-15: menunggu PPK dan Tata Usaha');
    perform pg_temp.gagal(format($q$select keu_jalankan(2, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, id2), '42501'); -- KPA belum boleh
    perform keu_jalankan(3, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', id2)::jsonb);
    perform pg_temp.ok((select menunggu = 'Tata Usaha' and ok_ppk and not ok_tu from keu_v_ident where keu_v_ident.id = id2), 'PPK menyetujui, tinggal Tata Usaha');
    perform pg_temp.gagal(format($q$select keu_jalankan(2, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"setujui"}')$q$, id2), '42501');
    perform keu_jalankan(8, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', id2)::jsonb);
    perform pg_temp.ok((select menunggu = 'KPA' from keu_v_ident where keu_v_ident.id = id2), 'menunggu KPA');
    h := keu_jalankan(2, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"setujui"}', id2)::jsonb);
    perform pg_temp.ok((h #>> '{}') = 'sah' and (select ver = 2 and not ok_ppk and not ok_tu from keu_ident where keu_ident.id = id2), 'jendela depan: terupdate v2 sah');
  else
    raise notice 'uji jendela depan dilewati (sudah lewat 16 Nov 2026)';
  end if;

  -- ===== batal =====
  h := keu_jalankan(4, 'keu_ident_buat', jsonb_build_object('p_ro', '2906.BMA.005', 'p_form', pg_temp.frm('Survei salah buat')));
  id2 := (h #>> '{}')::bigint;
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"batal","p_catatan":"x"}')$q$, id2), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_ident_aksi', '{"p_id":%s,"p_aksi":"batal","p_catatan":"salah buat survei"}')$q$, kid), '23514'); -- sudah pernah sah
  perform keu_jalankan(4, 'keu_ident_aksi', format('{"p_id":%s,"p_aksi":"batal","p_catatan":"salah buat survei"}', id2)::jsonb);
  perform pg_temp.ok((select status = 'dibatalkan' from keu_ident where keu_ident.id = id2), 'draf dibatalkan');
  h := keu_jalankan(4, 'keu_ident_buat', jsonb_build_object('p_ro', '2906.BMA.005', 'p_form', pg_temp.frm('Survei salah buat')));
  perform pg_temp.ok((h #>> '{}')::bigint > id2, 'nama bekas yang dibatalkan boleh dipakai lagi');

  -- ===== pemetaan paket =====
  select l.kunci_stabil into kunci from keu_v_adm_lembar l where l.ro_kode = '2906.BMA.005' limit 1;
  perform pg_temp.ok(kunci is not null, 'ada baris POK RO uji');
  perform pg_temp.gagal(format($q$select keu_jalankan(12, 'keu_ident_paket_atur', '{"p_ro":"2906.BMA.005","p_kunci":%s,"p_paket":["521211-A"]}')$q$, to_json(kunci)), '42501');
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_ident_paket_atur', '{"p_ro":"2906.BMA.005","p_kunci":"tidak-ada","p_paket":["521211-A"]}')$q$), '23514');
  perform pg_temp.gagal(format($q$select keu_jalankan(4, 'keu_ident_paket_atur', '{"p_ro":"2906.BMA.005","p_kunci":%s,"p_paket":["ngawur"]}')$q$, to_json(kunci)), '23514');
  perform keu_jalankan(4, 'keu_ident_paket_atur', format('{"p_ro":"2906.BMA.005","p_kunci":%s,"p_paket":["521211-A","521211-B"]}', to_json(kunci))::jsonb);
  perform pg_temp.ok((select paket = array['521211-A','521211-B'] from keu_v_ident_paket where ro_kode = '2906.BMA.005' and kunci_stabil = kunci), 'pemetaan tersimpan');
  perform keu_jalankan(4, 'keu_ident_paket_atur', format('{"p_ro":"2906.BMA.005","p_kunci":%s,"p_paket":[]}', to_json(kunci))::jsonb);
  perform pg_temp.ok((select paket = array[]::text[] from keu_v_ident_paket where ro_kode = '2906.BMA.005' and kunci_stabil = kunci), 'pemetaan dikosongkan');

  -- ===== jejak =====
  perform pg_temp.ok((select count(*) >= 18 from keu_v_ident_riwayat where ident_id = kid), 'riwayat tercatat');
  perform pg_temp.ok((select oleh_nama is not null from keu_v_ident_riwayat where ident_id = kid order by kid limit 1), 'nama pelaku pada riwayat');
  perform pg_temp.ok(exists (select 1 from sigap_audit where aksi = 'keu.keu_ident.update' and akun_id = 2), 'audit mencatat akun pelaku');

  -- ===== periode Ad-hoc: satu periode setahun, pola seperti tahunan =====
  w := keu_ident_jendela('{"periode":"Ad-hoc","jend":{"mb":7,"mj":"tgl","mn":3,"sb":8,"sj":"akhir","sn":0}}'::jsonb, 'Ad-hoc', 2026);
  perform pg_temp.ok(w = array['2026-08-03'::date, '2026-09-30'::date], 'jendela Ad-hoc');
  perform pg_temp.ok(keu_ident_jendela('{"periode":"Ad-hoc","jend":{"mb":0}}'::jsonb, 'Triwulan I', 2026) is null, 'nama periode Ad-hoc hanya "Ad-hoc"');
  raise notice 'LULUS 49';
end $$;
rollback;
