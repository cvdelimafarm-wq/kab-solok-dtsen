-- 63_uji_delego_sinkron.sql -- uji dry-run (rollback otomatis) untuk 20261101zc. Aman di produksi: tidak menambah baris di tabel sumber, hanya memanggil fungsi.
-- Jalankan SETELAH berkas zc. Hasil ada di pesan galat "HASIL=...". Semua butir yang dibuat sinkron ikut dibatalkan.
do $uji$
declare o text := ''; r jsonb; v_hari date := keu_dlg_hari_ini(); v_id bigint; n int;
begin
  perform set_config('app.akun_id', '354', true);
  begin perform keu_dlg_sinkron(357); o := o || 'SALAH_357;'; exception when others then o := o || 'sinkron357_ditolak;'; end;
  r := keu_dlg_sinkron(354);
  o := o || 'sinkron1 dibuat=' || (r ->> 'dibuat') || ' ditutup=' || (r ->> 'ditutup') || ' aktif=' || (r ->> 'sumber_aktif') || ';';
  r := keu_dlg_sinkron(354);
  o := o || 'sinkron2_idempoten dibuat=' || (r ->> 'dibuat') || ' ditutup=' || (r ->> 'ditutup') || ';';
  select count(*) into n from keu_dlg_delegasi where sumber_jenis in ('revisi','adm','pengadaan') and status = 'baru';
  o := o || 'butir_otomatis_aktif=' || n || ';';
  select id into v_id from keu_dlg_delegasi where status in ('baru','berjalan') order by id desc limit 1;
  if v_id is not null then
    begin perform keu_dlg_atur_urusan(v_id, jsonb_build_object('kelas', 'ngawur')); o := o || 'SALAH_kelas;'; exception when others then o := o || 'kelas_ngawur_ditolak;'; end;
    begin perform keu_dlg_atur_urusan(v_id, jsonb_build_object('kelas', 'proses'), 357); o := o || 'SALAH_357b;'; exception when others then o := o || 'atur357_ditolak;'; end;
    r := keu_dlg_atur_urusan(v_id, jsonb_build_object('mode_tutup', 'ringan', 'kelas', 'perintah'));
    o := o || 'atur=' || (r ->> 'kelas') || '/' || (r ->> 'mode_tutup') || ';';
  end if;
  r := keu_dlg_kalibrasi(354);
  o := o || 'kalibrasi jenis=' || jsonb_array_length(r -> 'jenis') || ';';
  begin perform keu_dlg_kalibrasi(357); o := o || 'SALAH_kal357;'; exception when others then o := o || 'kal357_ditolak;'; end;
  raise exception 'HASIL=%', o;
end $uji$;
