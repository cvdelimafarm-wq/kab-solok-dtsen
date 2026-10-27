-- 64_uji_terdampak_fasih.sql -- hanya membaca (SELECT). Jalankan SETELAH 20261027c_terdampak_fasih_resmi.sql.
-- Hasil lewat raise exception 'HASIL_UJI: ...' (tidak mengubah data). Pemeriksaan "cocok antara Excel dan SIGAP": SEMUA angka berikut harus sesuai.
do $$
declare v_acuan int; v_terdampak int; v_aktif int; v_nonaktif int; v_aktif_bukan int; v_terdampak_nonaktif int; v_tt_aktif int; v_trigger int; v_kolam_beku int;
        v_sub_alokasi_aktif int; v_terdampak_tanpa_alokasi int; v_kk_terdampak_tanpa_alokasi int; v_keluar_beku int; v_kk_didata_beku int;
begin
  select count(*), count(*) filter (where terdampak) into v_acuan, v_terdampak from public.bencana_terdampak_fasih;
  select count(*) filter (where not nonaktif), count(*) filter (where nonaktif) into v_aktif, v_nonaktif from public.bencana_wilayah;
  select count(*) into v_aktif_bukan from public.bencana_wilayah w where not w.nonaktif and not exists (select 1 from public.bencana_terdampak_fasih t where t.idsubsls = w.idsubsls and t.terdampak);
  select count(*) into v_terdampak_nonaktif from public.bencana_wilayah w join public.bencana_terdampak_fasih t on t.idsubsls = w.idsubsls and t.terdampak where w.nonaktif;
  select count(*) into v_tt_aktif from public.bencana_wilayah w join public.bencana_terdampak_fasih t on t.idsubsls = w.idsubsls and not t.terdampak where not w.nonaktif;
  select count(*) into v_trigger from pg_trigger where tgname = 'bencana_permintaan_tolak_nonaktif' and not tgisinternal;
  select count(*) into v_kolam_beku from jsonb_array_elements(public.bencana_kolam_daftar()) e join public.bencana_wilayah w on w.idsubsls = e->>'idsubsls' where w.nonaktif;
  select count(distinct a.idsubsls) into v_sub_alokasi_aktif from public.bencana_alokasi_subsls a join public.bencana_wilayah w on w.idsubsls = a.idsubsls where not w.nonaktif;
  select count(*) into v_terdampak_tanpa_alokasi from public.bencana_wilayah w where not w.nonaktif and not exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = w.idsubsls);
  select count(*) into v_kk_terdampak_tanpa_alokasi from public.bencana_pendataan_kk k join public.bencana_wilayah w on w.idsubsls = k.idsubsls where k.aktif and not w.nonaktif and not exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = w.idsubsls);
  select count(distinct p.idsubsls) into v_keluar_beku from public.bencana_pendataan_permintaan p join public.bencana_wilayah w on w.idsubsls = p.idsubsls where w.nonaktif and p.status in ('menunggu','sudah_keluar');
  select count(*) into v_kk_didata_beku from public.bencana_pendataan_kk k join public.bencana_wilayah w on w.idsubsls = k.idsubsls where w.nonaktif and k.aktif and k.hasil is not null;
  raise exception 'HASIL_UJI: acuan=% (harus 656) terdampak=% (harus 198) | wilayah aktif=% (harus 198) nonaktif=% (harus 886) | aktif tapi bukan terdampak=% (harus 0) terdampak tapi nonaktif=% (harus 0) tidak-terdampak-FASIH tapi aktif=% (harus 0) | pemicu=% (harus 1) kolam memuat nonaktif=% (harus 0) | INFO: Sub SLS aktif beralokasi=% tanpa alokasi=% (KK aktif tanpa alokasi=%) permintaan menunggu/sudah_keluar di Sub SLS nonaktif=% KK sudah didata di Sub SLS nonaktif=%',
    v_acuan, v_terdampak, v_aktif, v_nonaktif, v_aktif_bukan, v_terdampak_nonaktif, v_tt_aktif, v_trigger, v_kolam_beku, v_sub_alokasi_aktif, v_terdampak_tanpa_alokasi, v_kk_terdampak_tanpa_alokasi, v_keluar_beku, v_kk_didata_beku;
end $$;
