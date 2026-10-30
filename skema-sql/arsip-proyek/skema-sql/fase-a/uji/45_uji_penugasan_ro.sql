\set ON_ERROR_STOP on
-- Uji berkas m: tampilan keu_v_penugasan_ro. Dijalankan sesudah 44. Semua data uji dibatalkan (rollback) di akhir.
begin;
do $$
declare n int; r record; v_batal bigint;
begin
  -- hak: hanya service_role yang boleh membaca; tampilan memakai hak pemanggil
  perform 1 where not has_table_privilege('service_role', 'keu_v_penugasan_ro', 'select');
  if found then raise exception 'GAGAL: service_role harus boleh select'; end if;
  if has_table_privilege('anon', 'keu_v_penugasan_ro', 'select') or has_table_privilege('authenticated', 'keu_v_penugasan_ro', 'select') then
    raise exception 'GAGAL: anon/authenticated tidak boleh select';
  end if;
  if not exists (select 1 from pg_class c where c.relname = 'keu_v_penugasan_ro' and 'security_invoker=true' = any (c.reloptions)) then
    raise exception 'GAGAL: tampilan harus security_invoker';
  end if;

  -- penugasan dasar dari uji sebelumnya: ketua RO 005 muncul dengan nama akun dan aktif hari ini
  select * into r from keu_v_penugasan_ro where sumber = 'penugasan' and peran_kode = 'KETUA' and ro_kode = '2906.BMA.005' and aktif_hari_ini;
  if not found then raise exception 'GAGAL: ketua RO 005 tidak tampil'; end if;
  if r.akun_nama is null or length(r.akun_nama) = 0 then raise exception 'GAGAL: nama akun kosong'; end if;

  -- yang dibatalkan tidak tampil; yang belum mulai tampil tetapi tidak aktif hari ini; yang sudah lewat tampil tidak aktif
  insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai, berlaku_sampai, dibatalkan_at) values (11, 'PBJ', '2906.BMA.005', '2026-01-01', null, now());
  insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai) values (12, 'PBJ', '2906.BMA.005', current_date + 30);
  insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai, berlaku_sampai) values (10, 'PBJ', '2906.BMA.005', '2026-01-01', '2026-01-31');
  insert into keu_penugasan(akun_id, peran_kode, ro_kode, berlaku_mulai) values (8, 'PBJ', '2906.BMA.005', current_date);
  select count(*) into n from keu_v_penugasan_ro where peran_kode = 'PBJ' and ro_kode = '2906.BMA.005' and akun_id = 11;
  if n <> 0 then raise exception 'GAGAL: penugasan yang dibatalkan tampil (%)', n; end if;
  select count(*) into n from keu_v_penugasan_ro where peran_kode = 'PBJ' and ro_kode = '2906.BMA.005' and akun_id = 12 and not aktif_hari_ini;
  if n <> 1 then raise exception 'GAGAL: penugasan yang belum mulai harus tampil dan tidak aktif (%)', n; end if;
  select count(*) into n from keu_v_penugasan_ro where peran_kode = 'PBJ' and ro_kode = '2906.BMA.005' and akun_id = 10 and not aktif_hari_ini;
  if n <> 1 then raise exception 'GAGAL: penugasan yang sudah lewat harus tampil dan tidak aktif (%)', n; end if;
  select count(*) into n from keu_v_penugasan_ro where peran_kode = 'PBJ' and ro_kode = '2906.BMA.005' and akun_id = 8 and aktif_hari_ini;
  if n <> 1 then raise exception 'GAGAL: penugasan yang mulai hari ini harus aktif (%)', n; end if;

  -- akses Administrasi: tampil sebagai AKSES_ADM; ro_kode kosong = semua RO; yang dibatalkan tidak tampil
  insert into keu_akses_adm(akun_id, ro_kode, berlaku_mulai) values (9, null, '2026-01-01');
  insert into keu_akses_adm(akun_id, ro_kode, berlaku_mulai, dibatalkan_at) values (11, '2906.BMA.005', '2026-01-01', now()) returning id into v_batal;
  select count(*) into n from keu_v_penugasan_ro where sumber = 'akses_adm' and peran_kode = 'AKSES_ADM' and ro_kode is null and akun_id = 9 and aktif_hari_ini;
  if n <> 1 then raise exception 'GAGAL: akses administrasi semua RO tidak tampil (%)', n; end if;
  select count(*) into n from keu_v_penugasan_ro where sumber = 'akses_adm' and id = v_batal;
  if n <> 0 then raise exception 'GAGAL: akses administrasi dibatalkan tampil (%)', n; end if;

  -- tidak membuka data pribadi: hanya kolom yang dijanjikan
  select count(*) into n from information_schema.columns where table_name = 'keu_v_penugasan_ro'
    and column_name in ('nik','nip','email','kata_sandi','pin','telepon');
  if n <> 0 then raise exception 'GAGAL: kolom pribadi ikut tampil'; end if;
end $$;
rollback;
select 'LULUS 45_uji_penugasan_ro' as hasil;
