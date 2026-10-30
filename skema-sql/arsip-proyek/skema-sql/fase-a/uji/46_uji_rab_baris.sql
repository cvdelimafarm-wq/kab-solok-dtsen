\set ON_ERROR_STOP on
-- Uji berkas n: tampilan keu_v_rab_baris dan keu_v_rab_jejak. Dijalankan sesudah 45.
do $$
declare n1 int; n2 int; v text;
begin
  foreach v in array array['keu_v_rab_baris','keu_v_rab_jejak'] loop
    if not has_table_privilege('service_role', v, 'select') then raise exception 'GAGAL: service_role harus boleh select %', v; end if;
    if has_table_privilege('anon', v, 'select') or has_table_privilege('authenticated', v, 'select') then raise exception 'GAGAL: anon/authenticated tidak boleh select %', v; end if;
    if not exists (select 1 from pg_class c where c.relname = v and 'security_invoker=true' = any (c.reloptions)) then raise exception 'GAGAL: % harus security_invoker', v; end if;
  end loop;
  select count(*) into n1 from keu_v_rab_baris;
  select count(*) into n2 from keu_rab_baris;
  if n1 <> n2 then raise exception 'GAGAL: jumlah rincian tampilan % <> tabel %', n1, n2; end if;
  -- rab_id dan pok_kunci sesuai item
  if exists (select 1 from keu_v_rab_baris v join keu_rab_item i on i.id = v.item_id where v.rab_id <> i.rab_id or v.pok_kunci is distinct from i.pok_kunci) then
    raise exception 'GAGAL: rab_id/pok_kunci tidak sesuai item';
  end if;
  -- jumlah_dikunci mencerminkan jumlah_tetap
  if exists (select 1 from keu_v_rab_baris v join keu_rab_baris b on b.id = v.baris_id where v.jumlah_dikunci <> (b.jumlah_tetap is not null) or v.jumlah <> b.jumlah) then
    raise exception 'GAGAL: jumlah_dikunci/jumlah tidak sesuai';
  end if;
  select count(*) into n1 from keu_v_rab_jejak;
  select count(*) into n2 from keu_rab_riwayat;
  if n1 <> n2 then raise exception 'GAGAL: jumlah riwayat tampilan % <> tabel %', n1, n2; end if;
  if exists (select 1 from keu_v_rab_jejak v join keu_rab_riwayat r on r.id = v.id join sigap_akun a on a.id = r.oleh where v.oleh_nama is distinct from a.nama) then
    raise exception 'GAGAL: nama pelaku riwayat tidak sesuai';
  end if;
  if exists (select 1 from information_schema.columns where table_name in ('keu_v_rab_baris','keu_v_rab_jejak') and column_name in ('nik','nip','email','oleh','dibuat_oleh')) then
    raise exception 'GAGAL: kolom pribadi atau id akun ikut tampil';
  end if;
end $$;
select 'LULUS 46_uji_rab_baris' as hasil;
