-- 79_uji_laporan_sementara.sql -- uji fungsi sigap_laporan_sementara (hanya-baca; tidak mengubah data).
-- Jalankan SETELAH migrasi 20261030d. Hasil: galat sengaja `HASIL_UJI: {...}`; semua ok_* harus true.
do $uji$
declare r jsonb; h jsonb;
begin
  r := public.sigap_laporan_sementara(1, 3);
  h := jsonb_build_object(
    'ok_kunci', r ?& array['dibuat_at','kegiatan','identifikasi','petugas','wilayah_kerja','pendataan','kecamatan','pelatihan','dokumentasi','qc','petugas_nilai'],
    'ok_sasaran', (r #>> '{pendataan,sasaran}')::int > 0,
    'ok_didata_le_sasaran', (r #>> '{pendataan,didata}')::int <= (r #>> '{pendataan,sasaran}')::int,
    'ok_hasil_jumlah', (r #>> '{pendataan,terdampak}')::int + (r #>> '{pendataan,tidak_terdampak}')::int + (r #>> '{pendataan,tidak_ditemukan}')::int = (r #>> '{pendataan,didata}')::int,
    'ok_kec_jumlah', (select coalesce(sum((k->>'sasaran')::int),0) from jsonb_array_elements(r->'kecamatan') k) = (r #>> '{pendataan,sasaran}')::int,
    'ok_harian_jumlah', (select coalesce(sum((k->>'n')::int),0) from jsonb_array_elements(r #> '{pendataan,harian}') k) = (r #>> '{pendataan,didata}')::int,
    'ok_nilai_array', jsonb_typeof(r->'petugas_nilai') = 'array',
    'ok_nilai_kunci', not exists (select 1 from jsonb_array_elements(r->'petugas_nilai') k where not (k ?& array['akun_id','nama','peran','hadir','qc_percobaan'])),
    'ok_service_role_saja', not has_function_privilege('anon', 'public.sigap_laporan_sementara(bigint,bigint)', 'execute')
                            and not has_function_privilege('authenticated', 'public.sigap_laporan_sementara(bigint,bigint)', 'execute')
  );
  raise exception 'HASIL_UJI: %', h;
end
$uji$;
