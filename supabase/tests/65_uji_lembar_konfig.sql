-- 65_uji_lembar_konfig.sql -- hanya membaca (SELECT). Jalankan SETELAH 20261027d_lembar_konfig.sql.
-- Hasil lewat raise exception 'HASIL_UJI: ...' (tidak mengubah data).
do $$
declare v_tabel int; v_rls boolean; v_baris int; v_rusak int; v_pk int;
begin
  select count(*) into v_tabel from information_schema.tables where table_schema = 'public' and table_name = 'sigap_lembar_konfig';
  select coalesce(bool_or(c.relrowsecurity), false) into v_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'sigap_lembar_konfig';
  select count(*) into v_pk from pg_constraint where conrelid = 'public.sigap_lembar_konfig'::regclass and contype = 'p';
  select count(*) into v_baris from public.sigap_lembar_konfig;
  select count(*) into v_rusak from public.sigap_lembar_konfig
    where not (konfig ? 'hasil' and konfig ? 'radar' and (konfig -> 'hasil') ?& array['terdampak','tidak_terdampak','tidak_ditemukan']);
  raise exception 'HASIL_UJI: tabel=% (harus 1) | RLS aktif=% (harus true) | kunci utama=% (harus 1) | baris pengaturan=% (0 = semua kegiatan memakai tampilan bawaan) | baris dengan susunan rusak=% (harus 0)',
    v_tabel, v_rls, v_pk, v_baris, v_rusak;
end $$;
