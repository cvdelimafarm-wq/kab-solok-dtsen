-- 80_uji_kegiatan_fitur.sql -- uji profil fitur kegiatan (hanya-baca; tidak mengubah data).
-- Jalankan SETELAH migrasi 20261030e. Hasil: galat sengaja `HASIL_UJI: {...}`; semua ok_* harus true.
do $uji$
declare h jsonb;
begin
  h := jsonb_build_object(
    'ok_kolom_strategi', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sigap_kegiatan' and column_name = 'strategi'),
    'ok_pasca', (select strategi = 'status_per_sasaran' from public.sigap_kegiatan where kode = 'pascabencana_2026'),
    'ok_spdt', (select strategi = 'lembar_bantu' from public.sigap_kegiatan where kode = 'spdt_ntp_2026'),
    'ok_pelatihan', (select coalesce(bool_and(strategi = 'pelatihan'), true) from public.sigap_kegiatan where jenis = 'pelatihan'),
    'ok_strategi_sah', not exists (select 1 from public.sigap_kegiatan where strategi not in ('status_per_sasaran', 'lembar_bantu', 'sampel_sls', 'pelatihan', 'umum')),
    'ok_tabel_fitur', to_regclass('public.sigap_kegiatan_fitur') is not null,
    'ok_rls', (select relrowsecurity from pg_class where oid = 'public.sigap_kegiatan_fitur'::regclass),
    'ok_hanya_service_role', not has_table_privilege('anon', 'public.sigap_kegiatan_fitur', 'select') and not has_table_privilege('authenticated', 'public.sigap_kegiatan_fitur', 'select')
                             and has_table_privilege('service_role', 'public.sigap_kegiatan_fitur', 'insert')
  );
  raise exception 'HASIL_UJI: %', h;
end
$uji$;
