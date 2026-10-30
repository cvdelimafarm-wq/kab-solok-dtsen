-- 82_uji_sampel_sls.sql -- uji alokasi sampel per SLS. Semua data uji dibuat DI DALAM satu blok yang dibatalkan (galat sengaja), jadi tidak ada yang tersimpan.
-- Jalankan SETELAH migrasi 20261030g. Hasil: galat sengaja `HASIL_UJI: {...}`; semua ok_* harus true.
do $uji$
declare
  k bigint; a1 bigint; a2 bigint; a3 bigint; h jsonb;
  r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; r5 jsonb; r6 jsonb; r7 jsonb; r8 jsonb;
  id_u1 bigint; id_u2 bigint; id_c1 bigint; id_c2 bigint; id_lain bigint;
  baris jsonb;
begin
  select min(id) into k from public.sigap_kegiatan;
  select id into a1 from public.sigap_akun order by id limit 1;
  select id into a2 from public.sigap_akun where id > a1 order by id limit 1;
  select id into a3 from public.sigap_akun where id > a2 order by id limit 1;

  baris := jsonb_build_array(
    jsonb_build_object('kode_wilayah','1303010001000100','kode_sls','13030100010001','nama_responden','Uji Utama 1','status','utama','lat',-0.78,'lng',100.65,'ppl_akun_id',a1,'pml_akun_id',a2,'ppl_nama','P1','pml_nama','M1'),
    jsonb_build_object('kode_wilayah','1303010001000100','kode_sls','13030100010001','nama_responden','Uji Utama 2','status','utama','ppl_akun_id',a1,'pml_akun_id',a2,'ppl_nama','P1','pml_nama','M1'),
    jsonb_build_object('kode_wilayah','1303010001000100','kode_sls','13030100010001','nama_responden','Uji Cadangan 1','status','cadangan','ppl_akun_id',a1,'pml_akun_id',a2,'ppl_nama','P1','pml_nama','M1'),
    jsonb_build_object('kode_wilayah','1303010001000100','kode_sls','13030100010001','nama_responden','Uji Cadangan 2','status','cadangan','ppl_akun_id',a1,'pml_akun_id',a2,'ppl_nama','P1','pml_nama','M1'),
    jsonb_build_object('kode_wilayah','1303010002000100','kode_sls','13030100020001','nama_responden','Uji Lain Utama','status','utama','ppl_akun_id',a3,'pml_akun_id',a2,'ppl_nama','P3','pml_nama','M1'),
    jsonb_build_object('kode_wilayah','1303010002000100','kode_sls','13030100020001','nama_responden','Uji Lain Cadangan','status','cadangan','ppl_akun_id',a3,'pml_akun_id',a2,'ppl_nama','P3','pml_nama','M1')
  );

  r1 := public.sigap_sampel_impor(k, 'uji', 'uji.xlsx', baris, null, false);
  select id into id_u1 from public.sigap_sampel where kegiatan_id = k and nama_responden = 'Uji Utama 1' and nonaktif_at is null;
  select id into id_u2 from public.sigap_sampel where kegiatan_id = k and nama_responden = 'Uji Utama 2' and nonaktif_at is null;
  select id into id_c1 from public.sigap_sampel where kegiatan_id = k and nama_responden = 'Uji Cadangan 1' and nonaktif_at is null;
  select id into id_c2 from public.sigap_sampel where kegiatan_id = k and nama_responden = 'Uji Cadangan 2' and nonaktif_at is null;
  select id into id_lain from public.sigap_sampel where kegiatan_id = k and nama_responden = 'Uji Lain Cadangan' and nonaktif_at is null;

  r2 := public.sigap_sampel_ganti(k, a1, id_u1, id_c1, 'responden pindah');             -- harus ok
  r3 := public.sigap_sampel_ganti(k, a1, id_u1, id_c2, 'coba dua kali');                -- utama sudah diganti -> ditolak
  r4 := public.sigap_sampel_ganti(k, a1, id_u2, id_c1, 'cadangan dipakai');             -- cadangan sudah dipakai -> ditolak
  r5 := public.sigap_sampel_ganti(k, a3, id_u2, id_c2, 'bukan PPL-nya');                -- PPL lain -> ditolak
  r6 := public.sigap_sampel_ganti(k, a1, id_u2, id_lain, 'beda SLS');                   -- SLS lain -> ditolak
  r7 := public.sigap_sampel_impor(k, 'uji', 'ulang.xlsx', baris, null, false);          -- ada penggantian -> ditolak
  r8 := public.sigap_sampel_impor(k, 'uji', 'ulang.xlsx', baris, null, true);           -- paksa -> ok

  h := jsonb_build_object(
    'ok_impor', (r1->>'ok')::boolean and (r1->>'jumlah')::int = 6 and (r1->>'utama')::int = 3 and (r1->>'cadangan')::int = 3,
    'ok_ganti', (r2->>'ok')::boolean,
    'ok_utama_sekali', not (r3->>'ok')::boolean,
    'ok_cadangan_sekali', not (r4->>'ok')::boolean,
    'ok_hanya_ppl_sendiri', not (r5->>'ok')::boolean,
    'ok_satu_sls', not (r6->>'ok')::boolean,
    'ok_impor_ulang_ditolak', not (r7->>'ok')::boolean and r7->>'kode' = 'ADA_PENGGANTIAN',
    'ok_impor_paksa', (r8->>'ok')::boolean,
    'ok_aktif_6', (select count(*) from public.sigap_sampel where kegiatan_id = k and nonaktif_at is null) = 6,
    'ok_lama_nonaktif', (select count(*) from public.sigap_sampel where kegiatan_id = k and nonaktif_at is not null) = 6,
    'ok_tanda_hilang', not exists (select 1 from public.sigap_sampel where kegiatan_id = k and nonaktif_at is null and menggantikan_id is not null),
    'ok_batal_ganti', true,
    'ok_hanya_service_role', not has_function_privilege('anon', 'public.sigap_sampel_impor(bigint,text,text,jsonb,jsonb,boolean)', 'execute')
                             and not has_function_privilege('authenticated', 'public.sigap_sampel_ganti(bigint,bigint,bigint,bigint,text)', 'execute')
                             and has_function_privilege('service_role', 'public.sigap_sampel_batal_ganti(bigint,bigint,bigint,boolean)', 'execute')
                             and not has_table_privilege('anon', 'public.sigap_sampel', 'select')
                             and not has_table_privilege('authenticated', 'public.sigap_sampel', 'select')
                             and (select relrowsecurity from pg_class where oid = 'public.sigap_sampel'::regclass)
  );

  -- batal ganti diuji pada alokasi baru (setelah impor paksa tanda hilang)
  select id into id_u1 from public.sigap_sampel where kegiatan_id = k and nama_responden = 'Uji Utama 1' and nonaktif_at is null;
  select id into id_c1 from public.sigap_sampel where kegiatan_id = k and nama_responden = 'Uji Cadangan 1' and nonaktif_at is null;
  perform public.sigap_sampel_ganti(k, a1, id_u1, id_c1, 'ulang');
  r5 := public.sigap_sampel_batal_ganti(k, a3, id_c1, false);   -- PPL lain tidak boleh
  r6 := public.sigap_sampel_batal_ganti(k, a3, id_c1, true);    -- admin boleh
  h := h || jsonb_build_object('ok_batal_ganti', not (r5->>'ok')::boolean and (r6->>'ok')::boolean
    and not exists (select 1 from public.sigap_sampel where id = id_c1 and menggantikan_id is not null));

  raise exception 'HASIL_UJI: %', h;
end
$uji$;
