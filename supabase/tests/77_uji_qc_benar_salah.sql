-- =====================================================================
-- 77_uji_qc_benar_salah.sql - uji soal 2 pilihan (Benar/Salah). Jalankan SETELAH 20261029c dan 20261029d, dalam satu transaksi;
-- diakhiri galat sengaja sehingga SEMUA dibatalkan (hasil dibawa dalam pesan galat "HASIL_UJI: {...}"). Tidak ada data tersimpan.
-- Memakai kegiatan id 2 (SPDT NTP). Soal lain di kegiatan itu dimatikan HANYA di dalam transaksi uji.
-- =====================================================================
do $uji$
declare
  k1 bigint; k2 bigint := 2; h jsonb := '{}'::jsonb; so jsonb; jaw jsonb; r jsonb; v_ppl bigint; i integer; x jsonb;
  tf jsonb := jsonb_build_object('A', 'Benar', 'B', 'Salah');
  em text;
begin
  select id into k1 from sigap_kegiatan where kode = 'pascabencana_2026';
  h := h || jsonb_build_object('soal_k1_awal', (select count(*) from sigap_qc_soal where kegiatan_id = k1));

  -- 1. Soal 2 pilihan diterima (kunci huruf kecil dinormalkan); soal 4 pilihan tetap diterima
  for i in 1..3 loop
    perform sigap_qc_soal_simpan(jsonb_build_object('id', 'BS-0' || i, 'kegiatan_id', k2, 'paket', 1, 'nomor', i, 'pertanyaan', 'Pernyataan Benar/Salah nomor ' || i, 'opsi', tf, 'kunci', case when i = 2 then 'a' else 'B' end));
  end loop;
  perform sigap_qc_soal_simpan(jsonb_build_object('id', 'BS-04', 'kegiatan_id', k2, 'paket', 2, 'nomor', 1, 'pertanyaan', 'Soal empat pilihan biasa', 'opsi', jsonb_build_object('A','a','B','b','C','c','D','d'), 'kunci', 'C'));
  h := h || jsonb_build_object('tersimpan', (select jsonb_object_agg(id, jsonb_build_object('kunci', kunci, 'opsi', (select array_agg(k order by k) from jsonb_object_keys(opsi) k))) from sigap_qc_soal where id like 'BS-0%'));

  -- 2. Penolakan
  begin perform sigap_qc_soal_simpan(jsonb_build_object('id', 'BS-X1', 'kegiatan_id', k2, 'paket', 1, 'pertanyaan', 'C tanpa D', 'opsi', jsonb_build_object('A','a','B','b','C','c'), 'kunci', 'A')); h := h || jsonb_build_object('tolak_c_tanpa_d', false);
  exception when others then h := h || jsonb_build_object('tolak_c_tanpa_d', sqlerrm); end;
  begin perform sigap_qc_soal_simpan(jsonb_build_object('id', 'BS-X2', 'kegiatan_id', k2, 'paket', 1, 'pertanyaan', 'Kunci C pada dua pilihan', 'opsi', tf, 'kunci', 'C')); h := h || jsonb_build_object('tolak_kunci_c', false);
  exception when others then h := h || jsonb_build_object('tolak_kunci_c', sqlerrm); end;
  begin perform sigap_qc_soal_simpan(jsonb_build_object('id', 'BS-X3', 'kegiatan_id', k2, 'paket', 1, 'pertanyaan', 'Hanya pilihan A', 'opsi', jsonb_build_object('A','a'), 'kunci', 'A')); h := h || jsonb_build_object('tolak_hanya_a', false);
  exception when others then h := h || jsonb_build_object('tolak_hanya_a', sqlerrm); end;
  begin insert into sigap_qc_soal (id, kegiatan_id, paket, judul_paket, nomor, pertanyaan, opsi, kunci, penjelasan, kata_kunci, aktif)
        values ('BS-X4', k2, 1, 'x', 1, 'Langsung ke tabel, kunci C', tf, 'C', '', '{}', true); h := h || jsonb_build_object('tolak_tabel_kunci_c', false);
  exception when check_violation then h := h || jsonb_build_object('tolak_tabel_kunci_c', 'check_violation'); end;
  begin insert into sigap_qc_soal (id, kegiatan_id, paket, judul_paket, nomor, pertanyaan, opsi, kunci, penjelasan, kata_kunci, aktif)
        values ('BS-X5', k2, 1, 'x', 1, 'Langsung ke tabel, C tanpa D', jsonb_build_object('A','a','B','b','C','c'), 'A', '', '{}', true); h := h || jsonb_build_object('tolak_tabel_c_tanpa_d', false);
  exception when check_violation then h := h || jsonb_build_object('tolak_tabel_c_tanpa_d', 'check_violation'); end;

  -- 3. Alur petugas: hanya BS-01..BS-04 yang aktif di kegiatan uji; tampilan diacak (acak_tampil) tetapi pilihan Benar/Salah tetap berurutan
  update sigap_qc_pengaturan set aktif = false where kegiatan_id = k1;
  update sigap_qc_soal set aktif = false where kegiatan_id = k2 and id not like 'BS-0%';
  perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('aktif', true, 'rilis_jam', '00:00', 'batas_jam', '23:59', 'rekap_jam', '00:00', 'ingat_menit', '[]'::jsonb,
            'soal_per_hari', 4, 'maks_ulang', 3, 'wajib_ulang', true, 'nilai_lulus', 100, 'undi_acak', false, 'acak_tampil', true,
            'peran_peserta', '["ppl"]'::jsonb, 'hari_rilis', '[1,2,3,4,5,6,7]'::jsonb, 'rekap_pml', false, 'mulai', null, 'akhir', null), 'uji');
  select akun_id into v_ppl from sigap_qc_peserta(k2) where peran = 'ppl' order by akun_id limit 1;
  so := sigap_qc_soal_untuk(v_ppl);
  h := h || jsonb_build_object('soal_diterima', jsonb_array_length(so -> 'soal'),
        'urutan_pilihan_bs', (select jsonb_agg(jsonb_build_object('id', s ->> 'id', 'kode', (select jsonb_agg(o ->> 'kode' order by ord) from jsonb_array_elements(s -> 'opsi') with ordinality t(o, ord))))
                                from jsonb_array_elements(so -> 'soal') s where s ->> 'id' like 'BS-0%' and s ->> 'id' <> 'BS-04'),
        'empat_pilihan_lengkap', (select jsonb_array_length(s -> 'opsi') from jsonb_array_elements(so -> 'soal') s where s ->> 'id' = 'BS-04'));

  -- jawaban C/D pada soal 2 pilihan ditolak ("belum dijawab"), jawaban benar = skor 100
  select jsonb_object_agg(s ->> 'id', case s ->> 'id' when 'BS-01' then 'C' when 'BS-02' then 'A' when 'BS-03' then 'B' else 'C' end) into jaw from jsonb_array_elements(so -> 'soal') s;
  begin perform sigap_qc_jawab(v_ppl, jaw); h := h || jsonb_build_object('tolak_jawab_c_pada_dua_pilihan', false);
  exception when others then h := h || jsonb_build_object('tolak_jawab_c_pada_dua_pilihan', sqlerrm); end;
  select jsonb_object_agg(s ->> 'id', case s ->> 'id' when 'BS-01' then 'B' when 'BS-02' then 'A' when 'BS-03' then 'B' else 'C' end) into jaw from jsonb_array_elements(so -> 'soal') s;
  r := sigap_qc_jawab(v_ppl, jaw);
  h := h || jsonb_build_object('jawab_benar', jsonb_build_object('skor', r ->> 'skor', 'benar', r ->> 'benar', 'lulus', r ->> 'lulus'),
        'tinjau_ada', r is not null);

  -- 4. Pascabencana tidak terpengaruh
  h := h || jsonb_build_object('soal_k1_akhir', (select count(*) from sigap_qc_soal where kegiatan_id = k1 and aktif),
        'semua_empat_pilihan_k1', (select bool_and(opsi ? 'C' and opsi ? 'D') from sigap_qc_soal where kegiatan_id = k1),
        'anon_boleh_simpan', has_function_privilege('anon', 'public.sigap_qc_soal_simpan(jsonb)', 'execute'),
        'service_boleh_simpan', has_function_privilege('service_role', 'public.sigap_qc_soal_simpan(jsonb)', 'execute'));
  raise exception 'HASIL_UJI: %', h;
end $uji$;
