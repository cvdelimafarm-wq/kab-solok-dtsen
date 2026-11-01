-- 65_uji_delego_pengingat_tinjau.sql -- uji dry-run (rollback otomatis) untuk 20261102zd. Aman di produksi. Hasil di pesan galat "HASIL=...".
do $uji$
declare o text := ''; r jsonb; v_hari date := keu_dlg_hari_ini(); n int; n2 int;
begin
  perform set_config('app.akun_id', '354', true);
  select count(*) into n from keu_notifikasi;
  r := keu_dlg_pengingat_tinjau();
  select count(*) into n2 from keu_notifikasi;
  o := o || 'pengingat=' || r::text || ' notif_baru=' || (n2 - n) || ';';
  begin perform keu_dlg_pengingat_tinjau(); o := o || 'ulang_ok;'; exception when others then o := o || 'SALAH_ulang;'; end;
  r := keu_dlg_sinkron_cron();
  o := o || 'sinkron_cron=' || r::text || ';';
  raise exception 'HASIL=%', o;
end $uji$;
