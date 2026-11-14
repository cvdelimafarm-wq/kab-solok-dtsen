-- supabase/tests/89_uji_rujukan_hari.sql (14 Nov 2026, Fase 3)
-- Uji kering: menyamakan batas hari kerja PPL kegiatan 6 (Seruti TW IV) dengan hari dibayar RAB ident 7 (4 hari). Tidak menyimpan apa pun.
-- Hasil 14 Nov: UJI_LULUS hasil={"ok": true, "diubah": 15} n_ppl_4=15 riwayat=1
do $$
declare a bigint; r jsonb; n int;
begin
  select id into a from sigap_akun where nama ilike '%iqbal%' and jenis='organik' limit 1;
  if not keu_boleh_penugasan_kegiatan(a, 6) then raise exception 'UJI_TIDAK_BERWENANG akun %', a; end if;
  r := keu_rujukan_terapkan_hari(7, 6, 'ppl', 4, 'hari:ppl:Triwulan IV', a);
  select count(*) into n from sigap_penugasan where kegiatan_id=6 and aktif and peran='ppl' and maks_hari=4;
  raise exception 'UJI_LULUS hasil=% n_ppl_4=% riwayat=%', r, n, (select count(*) from keu_rujukan_riwayat);
end $$;
