-- 63_uji_qc_kuesioner.sql -- hanya membaca (SELECT). Jalankan setelah 20261027b_qc_kuesioner.sql.
-- Hasil lewat raise exception 'HASIL_UJI: ...' (tidak mengubah data).
do $$
declare v_tabel int; v_fn int; v_rls int; v_idx int; v_n int; v_a int;
begin
  select count(*) into v_tabel from information_schema.tables where table_schema='public' and table_name in ('sigap_qc_kuesioner','sigap_qc_lembar');
  select count(*) into v_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('sigap_qc_kuesioner_unggah','sigap_qc_kuesioner_aktifkan');
  select count(*) into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('sigap_qc_kuesioner','sigap_qc_lembar') and c.relrowsecurity;
  select count(*) into v_idx from pg_indexes where schemaname='public' and indexname in ('sigap_qc_kuesioner_aktif_uq','sigap_qc_lembar_uq');
  select count(*), count(*) filter (where aktif) into v_n, v_a from sigap_qc_kuesioner;
  raise exception 'HASIL_UJI: tabel=% (harus 2) fungsi=% (harus 2) rls=% (harus 2) indeks=% (harus 2) kuesioner=% aktif=%', v_tabel, v_fn, v_rls, v_idx, v_n, v_a;
end $$;
