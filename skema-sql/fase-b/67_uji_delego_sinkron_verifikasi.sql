-- 67_uji_delego_sinkron_verifikasi.sql -- uji dry-run (rollback otomatis) untuk 20261102zg dengan DATA FIKTIF yang ikut dibatalkan. Aman di produksi.
-- Jalankan SETELAH zg. Hasil di pesan galat "HASIL=...".
do $uji$
declare o text := ''; r jsonb; v_ro text := '2906.BMA.006'; v_dok bigint; v_id bigint; n int; v_ppk bigint; v_up bigint; v_butir keu_dlg_delegasi;
begin
  perform set_config('app.akun_id', '354', true);
  select t.akun_id into v_ppk from keu_penugasan t where t.peran_kode = 'PPK' and t.dibatalkan_at is null and t.masa @> current_date limit 1;
  select id into v_dok from keu_master_dok where aktif order by id limit 1;
  select a.id into v_up from sigap_akun a where a.aktif and a.jenis = 'organik' and a.id <> coalesce(v_ppk, 0) and a.id <> 354 order by a.id limit 1;
  o := o || 'ppk=' || coalesce(v_ppk::text, '-') || ' dok=' || v_dok || ';';
  -- data fiktif: satu dokumen terunggah milik pengunggah lain
  perform set_config('keu.via_fungsi', '1', true);
  insert into keu_adm_dok(kunci_stabil, ro_kode, dok_id, status, berkas_nama, berkas_hash, berkas_ukuran, berkas_path, diunggah_oleh, diunggah_at, diubah_oleh)
  values ('UJI-FIKTIF-DOK', v_ro, v_dok, 'terunggah', 'uji.pdf', repeat('a', 64), 1234, 'uji/uji.pdf', v_up, now(), v_up) returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);
  r := keu_dlg_sinkron(354);
  o := o || 'sinkron1 dibuat=' || (r ->> 'dibuat') || ' aktif=' || (r ->> 'sumber_aktif') || ';';
  select count(*) into n from keu_dlg_delegasi where sumber_jenis = 'adm' and sumber_id = v_id::text and sumber_varian like 'verif\_%';
  o := o || 'butir_verif=' || n || ';';
  select count(*) into n from keu_dlg_delegasi where sumber_jenis = 'adm' and sumber_id = v_id::text and penerima_akun = v_up;
  o := o || 'butir_untuk_pengunggah=' || n || ' (harus 0);';
  r := keu_dlg_sinkron(354);
  o := o || 'sinkron2_idempoten dibuat=' || (r ->> 'dibuat') || ';';
  -- terverifikasi -> butir ditutup otomatis
  perform set_config('keu.via_fungsi', '1', true);
  update keu_adm_dok set status = 'terverifikasi', diverifikasi_oleh = coalesce(v_ppk, 354), diverifikasi_at = now() where id = v_id;
  perform set_config('keu.via_fungsi', '', true);
  r := keu_dlg_sinkron(354);
  o := o || 'sinkron3 ditutup=' || (r ->> 'ditutup') || ';';
  select count(*) into n from keu_dlg_delegasi where sumber_jenis = 'adm' and sumber_id = v_id::text and status = 'selesai';
  o := o || 'butir_selesai=' || n || ';';
  raise exception 'HASIL=%', o;
end $uji$;
