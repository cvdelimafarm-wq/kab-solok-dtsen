-- 81_uji_laporan_umum.sql -- uji fungsi laporan umum (hanya-baca; tidak mengubah data).
-- Jalankan SETELAH migrasi 20261030f. Hasil: galat sengaja `HASIL_UJI: {...}`; semua ok_* harus true.
do $uji$
declare h jsonb; s jsonb;
begin
  s := public.sigap_laporan_umum((select id from public.sigap_kegiatan where kode = 'spdt_ntp_2026'));
  h := jsonb_build_object(
    'ok_fungsi', to_regprocedure('public.sigap_laporan_umum(bigint)') is not null,
    'ok_kunci', s ?& array['dibuat_at','kegiatan','petugas','surat_tugas','sasaran','realisasi','dokumentasi','qc','dokumen_pml','petugas_nilai'],
    'ok_kegiatan', s->'kegiatan'->>'nama' is not null,
    'ok_petugas_nilai_array', jsonb_typeof(s->'petugas_nilai') = 'array',
    'ok_foto_cocok', (s->'dokumentasi'->>'foto')::int = (select count(*) from public.sigap_dokumentasi d
                       where d.kegiatan_id = (select id from public.sigap_kegiatan where kode = 'spdt_ntp_2026') and d.nonaktif_at is null),
    'ok_kk_cocok', (s->'sasaran'->>'kk')::int = (select count(*) from public.sigap_spdt_kk
                       where kegiatan_id = (select id from public.sigap_kegiatan where kode = 'spdt_ntp_2026')),
    'ok_kegiatan_kosong', (public.sigap_laporan_umum(-1)->>'dibuat_at') is not null,
    'ok_hanya_service_role', not has_function_privilege('anon', 'public.sigap_laporan_umum(bigint)', 'execute')
                             and not has_function_privilege('authenticated', 'public.sigap_laporan_umum(bigint)', 'execute')
                             and has_function_privilege('service_role', 'public.sigap_laporan_umum(bigint)', 'execute')
  );
  raise exception 'HASIL_UJI: %', h;
end
$uji$;
