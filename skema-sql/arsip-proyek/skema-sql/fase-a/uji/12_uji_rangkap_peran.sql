\set ON_ERROR_STOP on
-- Uji rangkap peran: hanya Admin menetapkan ketua tim; PPK yang merangkap Admin boleh.
do $$
begin
  perform set_config('app.akun_id','3',true);
  begin
    insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (9,'KETUA','2902.FAN.ZZ1','2026-11-01');
    raise exception 'SEHARUSNYA GAGAL';
  exception when insufficient_privilege then null; end;
  perform set_config('app.akun_id','1',true);
  insert into keu_penugasan(akun_id,peran_kode,berlaku_mulai) values (3,'ADMIN','2026-10-24');
  perform set_config('app.akun_id','3',true);
  insert into keu_penugasan(akun_id,peran_kode,ro_kode,berlaku_mulai) values (9,'KETUA','2902.FAN.ZZ1','2026-11-01');
  if not (keu_boleh(3,'akses') and keu_boleh(3,'sahkan')) then raise exception 'rangkap gagal'; end if;
  perform set_config('app.akun_id','',true);
  raise notice 'LULUS: PPK saja tidak boleh; PPK merangkap Admin boleh menetapkan ketua tim';
end $$;
