-- (7 Okt 2026) SIGAP PEDIA -- test trigger imutabilitas & penanda perlu_ditinjau.
-- Jalankan di SQL Editor SETELAH 20261007b_sigap_pedia_trigger.sql. Seluruh test di dalam transaksi yg
-- di-ROLLBACK di akhir: tidak meninggalkan data apa pun (urutan id bigserial saja yg maju).
-- Hasil: satu baris per test, kolom "lulus" harus true semua.

begin;

create temp table _hasil (test text, lulus boolean, catatan text) on commit drop;

do $$
declare v_id bigint; v_nomor text; v_nomor2 text; v_file bigint; v_reg bigint; ok boolean;
begin
  -- 1. nomor registrasi otomatis & berurutan per tahun
  select id, nomor_registrasi into v_id, v_nomor from pedia_entri_baru(jsonb_build_object(
    'kategori_id', (select id from pedia_kategori where kode = 'PD.04'), 'judul', 'UJI: SPD PP harian', 'jawaban', 'uji', 'kesimpulan', 'uji'));
  select nomor_registrasi into v_nomor2 from pedia_entri_baru(jsonb_build_object('kategori_id', (select id from pedia_kategori where kode = 'HN.01'), 'judul', 'UJI 2'));
  insert into _hasil values ('nomor format SP/PD.04/####/tahun', v_nomor ~ '^SP/PD\.04/\d{4}/\d{4}$', v_nomor);
  insert into _hasil values ('nomor urut berlanjut lintas kategori',
    split_part(v_nomor2, '/', 3)::int = split_part(v_nomor, '/', 3)::int + 1, v_nomor || ' -> ' || v_nomor2);

  -- 2. insert langsung tanpa RPC tetap dapat nomor dari trigger
  insert into pedia_entri (nomor_registrasi, tahun, nomor_urut, kategori_id, judul)
  values ('PALSU/1', 1900, 1, (select id from pedia_kategori where kode = 'LN.01'), 'UJI insert langsung')
  returning nomor_registrasi into v_nomor2;
  insert into _hasil values ('insert langsung -> nomor dibuat trigger', v_nomor2 ~ '^SP/LN\.01/', v_nomor2);

  -- 3. nomor tidak bisa diubah
  ok := false;
  begin update pedia_entri set nomor_registrasi = 'X' where id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('UPDATE nomor_registrasi ditolak', ok, null);

  -- 4. file bukti: insert ok, update/delete ditolak
  insert into pedia_file (entri_id, jenis, nama_asli, ukuran, sha256, path, tsa_status)
  values (v_id, 'pdf', 'uji.pdf', 10, repeat('a', 64), 'uji/' || v_id || '/uji.pdf', 'ok') returning id into v_file;
  ok := false;
  begin update pedia_file set sha256 = repeat('b', 64) where id = v_file; exception when others then ok := true; end;
  insert into _hasil values ('UPDATE file bukti ditolak', ok, null);
  ok := false;
  begin delete from pedia_file where id = v_file; exception when others then ok := true; end;
  insert into _hasil values ('DELETE file bukti ditolak', ok, null);

  -- 5. regulasi diubah -> entri perlu_ditinjau
  insert into pedia_regulasi (jenis, nomor, tahun, judul) values ('PMK', 'UJI/PMK.05/2099', 2099, 'regulasi uji') returning id into v_reg;
  insert into pedia_entri_regulasi (entri_id, regulasi_id) values (v_id, v_reg);
  update pedia_entri set status = 'final', difinalkan_at = now() where id = v_id;
  update pedia_regulasi set status = 'diubah', diubah_oleh_teks = 'PMK uji pengganti' where id = v_reg;
  insert into _hasil select 'regulasi diubah -> perlu_ditinjau (walau final)', perlu_ditinjau, alasan_tinjau from pedia_entri where id = v_id;

  -- 6. entri final: UPDATE isi & DELETE ditolak; file baru ditolak
  ok := false;
  begin update pedia_entri set jawaban = 'diubah' where id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('UPDATE isi entri final ditolak', ok, null);
  ok := false;
  begin delete from pedia_entri where id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('DELETE entri final ditolak', ok, null);
  ok := false;
  begin
    insert into pedia_file (entri_id, jenis, nama_asli, ukuran, sha256, path) values (v_id, 'pdf', 'baru.pdf', 1, repeat('c', 64), 'uji/' || v_id || '/baru.pdf');
  exception when others then ok := true; end;
  insert into _hasil values ('tambah file ke entri final ditolak', ok, null);
  ok := false;
  begin delete from pedia_entri_regulasi where entri_id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('hapus dasar hukum entri final ditolak', ok, null);

  -- 7. pembatalan entri final tetap boleh (dgn alasan), lalu terkunci total
  ok := false;
  begin update pedia_entri set status = 'dibatalkan' where id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('batal tanpa alasan ditolak', ok, null);
  update pedia_entri set status = 'dibatalkan', dibatalkan_alasan = 'uji pembatalan', dibatalkan_oleh = 'uji', dibatalkan_at = now(), status_sebelum_batal = 'final' where id = v_id;
  ok := false;
  begin update pedia_entri set status = 'final' where id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('entri dibatalkan tidak bisa dipulihkan', ok, null);

  -- 8. audit log: tambah via RPC ok & rantai utuh; UPDATE/DELETE/INSERT liar ditolak
  perform pedia_audit_tambah(null, 'uji', '127.0.0.1', 'uji_audit', v_id, null, '{"a":1}'::jsonb);
  perform pedia_audit_tambah(null, 'uji', '127.0.0.1', 'uji_audit', v_id, null, '{"a":2}'::jsonb);
  insert into _hasil select 'rantai audit utuh', not exists (select 1 from pedia_audit_cek_rantai()), null;
  ok := false;
  begin update pedia_audit set aksi = 'x' where entri_id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('UPDATE audit ditolak', ok, null);
  ok := false;
  begin delete from pedia_audit where entri_id = v_id; exception when others then ok := true; end;
  insert into _hasil values ('DELETE audit ditolak', ok, null);
  ok := false;
  begin insert into pedia_audit (aksi, hash_sebelum, hash) values ('liar', 'x', 'y'); exception when others then ok := true; end;
  insert into _hasil values ('INSERT audit tanpa rantai benar ditolak', ok, null);

  -- 9. kategori terpakai tidak bisa dihapus
  ok := false;
  begin delete from pedia_kategori where kode = 'PD.04'; exception when others then ok := true; end;
  insert into _hasil values ('DELETE kategori terpakai ditolak', ok, null);

  -- 10. pencarian
  insert into _hasil select 'cari "PMK UJI" menemukan entri', exists (select 1 from pedia_cari_entri('UJI PMK') where entri_id = v_id), null;
end $$;

select * from _hasil;
rollback;
