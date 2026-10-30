-- =====================================================================
-- 78_uji_qc_sumber_soal.sql - uji "Sumber soal harian" (semua / paket / pilihan). Jalankan SETELAH 20261030b, dalam satu transaksi;
-- diakhiri galat sengaja sehingga SEMUA dibatalkan (hasil dibawa dalam pesan galat "HASIL_UJI: {...}"). Tidak ada data tersimpan.
-- Memakai kegiatan id 2 (SPDT NTP) dengan soal uji pada paket 90-92 (tidak bentrok dengan bank soal asli).
-- Harapan ringkas: lihat kunci "harapan" di akhir hasil; semua nilai "ok_*" harus true dan "tolak_*" berisi pesan galat (bukan false).
-- =====================================================================
do $uji$
declare
  k1 bigint; k2 bigint := 2; h jsonb := '{}'::jsonb; ids text[]; id_k1 text; ids_hari text[];
  dasar jsonb := jsonb_build_object('aktif', false, 'rilis_jam', '00:00', 'batas_jam', '23:59', 'rekap_jam', '00:00', 'ingat_menit', '[]'::jsonb,
                  'soal_per_hari', 4, 'maks_ulang', 3, 'wajib_ulang', true, 'nilai_lulus', 100, 'undi_acak', true, 'acak_tampil', true,
                  'peran_peserta', '["ppl"]'::jsonb, 'hari_rilis', '[1,2,3,4,5,6,7]'::jsonb, 'rekap_pml', false, 'mulai', null, 'akhir', null,
                  -- (30 Okt) eksplisit: pengaturan nyata kegiatan 2 bisa sudah 'paket'/'pilihan', dan simpan tidak mengubah kolom yang tidak dikirim
                  'sumber_soal', 'semua', 'paket_pilihan', '[]'::jsonb, 'soal_pilihan', '[]'::jsonb);
  i integer; p integer;
begin
  select id into k1 from sigap_kegiatan where kode = 'pascabencana_2026';
  select id into id_k1 from sigap_qc_soal where kegiatan_id = k1 order by id limit 1;

  -- soal uji: paket 90 (2), 91 (2), 92 (2)
  for p in 90..92 loop
    for i in 1..2 loop
      perform sigap_qc_soal_simpan(jsonb_build_object('id', 'SS-' || p || '-' || i, 'kegiatan_id', k2, 'paket', p, 'nomor', i, 'pertanyaan', 'Soal uji sumber ' || p || '-' || i,
                'opsi', jsonb_build_object('A','a','B','b','C','c','D','d'), 'kunci', 'A'));
    end loop;
  end loop;

  -- 1. bawaan: semua
  perform sigap_qc_pengaturan_simpan(k2, dasar, 'uji');
  h := h || jsonb_build_object('bawaan_semua', (select sumber_soal from sigap_qc_pengaturan where kegiatan_id = k2));
  h := h || jsonb_build_object('ok_semua_memuat_paket_uji', (select count(*) = 6 from unnest(sigap_qc_undi(k2, 1000)) x where x like 'SS-%'));

  -- 2. paket 90 saja
  perform sigap_qc_pengaturan_simpan(k2, dasar || jsonb_build_object('sumber_soal', 'paket', 'paket_pilihan', '[90]'::jsonb), 'uji');
  ids := sigap_qc_undi(k2, 10);
  h := h || jsonb_build_object('paket_90', ids, 'ok_paket_90', ids @> array['SS-90-1','SS-90-2'] and cardinality(ids) = 2);

  -- 3. paket 90 dan 91, jumlah 4 -> semua soal dua paket itu, tidak ada paket 92
  perform sigap_qc_pengaturan_simpan(k2, dasar || jsonb_build_object('sumber_soal', 'paket', 'paket_pilihan', '[91,90,91]'::jsonb), 'uji');
  ids := sigap_qc_undi(k2, 4);
  h := h || jsonb_build_object('paket_90_91', ids, 'tersimpan_paket', (select to_jsonb(paket_pilihan) from sigap_qc_pengaturan where kegiatan_id = k2),
        'ok_paket_90_91', cardinality(ids) = 4 and not exists (select 1 from unnest(ids) x where x like 'SS-92-%' or x not like 'SS-%'));

  -- 4. centang soal: hanya dua soal itu, walau diminta 5
  perform sigap_qc_pengaturan_simpan(k2, dasar || jsonb_build_object('sumber_soal', 'pilihan', 'soal_pilihan', '["SS-92-1","SS-91-2"]'::jsonb), 'uji');
  ids := sigap_qc_undi(k2, 5);
  h := h || jsonb_build_object('pilihan', ids, 'ok_pilihan', ids @> array['SS-92-1','SS-91-2'] and cardinality(ids) = 2);

  -- 5. soal nonaktif tidak ikut walau terpilih
  perform sigap_qc_pengaturan_simpan(k2, dasar || jsonb_build_object('sumber_soal', 'paket', 'paket_pilihan', '[90]'::jsonb), 'uji');
  update sigap_qc_soal set aktif = false where id = 'SS-90-1';
  ids := sigap_qc_undi(k2, 10);
  h := h || jsonb_build_object('paket_90_satu_nonaktif', ids, 'ok_nonaktif_dilewati', ids = array['SS-90-2']);
  update sigap_qc_soal set aktif = true where id = 'SS-90-1';

  -- 6. soal hari ini mengikuti kolam
  ids_hari := sigap_qc_hari_pastikan(k2, date '2030-01-07');
  h := h || jsonb_build_object('ok_hari_dari_kolam', ids_hari @> array['SS-90-1','SS-90-2'] and cardinality(ids_hari) = 2);

  -- 7. penolakan
  begin perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('sumber_soal', 'acak'), 'uji'); h := h || jsonb_build_object('tolak_sumber_asing', false);
  exception when others then h := h || jsonb_build_object('tolak_sumber_asing', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('sumber_soal', 'paket', 'paket_pilihan', '[]'::jsonb), 'uji'); h := h || jsonb_build_object('tolak_paket_kosong', false);
  exception when others then h := h || jsonb_build_object('tolak_paket_kosong', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('sumber_soal', 'paket', 'paket_pilihan', '[99]'::jsonb), 'uji'); h := h || jsonb_build_object('tolak_paket_tanpa_soal', false);
  exception when others then h := h || jsonb_build_object('tolak_paket_tanpa_soal', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('sumber_soal', 'pilihan', 'soal_pilihan', '[]'::jsonb), 'uji'); h := h || jsonb_build_object('tolak_pilihan_kosong', false);
  exception when others then h := h || jsonb_build_object('tolak_pilihan_kosong', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('sumber_soal', 'pilihan', 'soal_pilihan', to_jsonb(array[id_k1])), 'uji'); h := h || jsonb_build_object('tolak_soal_kegiatan_lain', false);
  exception when others then h := h || jsonb_build_object('tolak_soal_kegiatan_lain', sqlerrm); end;
  update sigap_qc_soal set aktif = false where id in ('SS-91-1','SS-91-2');
  begin perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('sumber_soal', 'pilihan', 'soal_pilihan', '["SS-91-1","SS-91-2"]'::jsonb), 'uji'); h := h || jsonb_build_object('tolak_semua_nonaktif', false);
  exception when others then h := h || jsonb_build_object('tolak_semua_nonaktif', sqlerrm); end;
  begin update sigap_qc_pengaturan set sumber_soal = 'xyz' where kegiatan_id = k2; h := h || jsonb_build_object('tolak_tabel_sumber_asing', false);
  exception when check_violation then h := h || jsonb_build_object('tolak_tabel_sumber_asing', 'check_violation'); end;

  -- 7b. kecocokan hari rilis vs tanggal periode (31 Okt 2026 = Sabtu, 1 Nov = Minggu, 2 Nov = Senin)
  begin perform sigap_qc_pengaturan_simpan(k2, dasar || jsonb_build_object('hari_rilis', '[1,2,3,4,5]'::jsonb, 'mulai', '2026-10-31', 'akhir', '2026-11-01'), 'uji'); h := h || jsonb_build_object('tolak_periode_tanpa_hari_rilis', false);
  exception when others then h := h || jsonb_build_object('tolak_periode_tanpa_hari_rilis', sqlerrm); end;
  perform sigap_qc_pengaturan_simpan(k2, dasar || jsonb_build_object('hari_rilis', '[1,2,3,4,5]'::jsonb, 'mulai', '2026-10-31', 'akhir', '2026-11-02'), 'uji');
  h := h || jsonb_build_object('ok_periode_memuat_senin', (select mulai = date '2026-10-31' and akhir = date '2026-11-02' from sigap_qc_pengaturan where kegiatan_id = k2));
  begin perform sigap_qc_pengaturan_simpan(k2, dasar || jsonb_build_object('mulai', '2026-11-05', 'akhir', '2026-11-01'), 'uji'); h := h || jsonb_build_object('tolak_akhir_sebelum_mulai', false);
  exception when others then h := h || jsonb_build_object('tolak_akhir_sebelum_mulai', sqlerrm); end;

  -- 8. kegiatan lain tidak terpengaruh; hak eksekusi
  h := h || jsonb_build_object('k1_sumber', (select sumber_soal from sigap_qc_pengaturan where kegiatan_id = k1),
        'anon_boleh_simpan', has_function_privilege('anon', 'public.sigap_qc_pengaturan_simpan(bigint,jsonb,text)', 'execute'),
        'service_boleh_simpan', has_function_privilege('service_role', 'public.sigap_qc_pengaturan_simpan(bigint,jsonb,text)', 'execute'));
  h := h || jsonb_build_object('harapan', 'semua ok_* true; tolak_* berisi pesan; k1_sumber = semua; hak eksekusi sama dengan sebelum migrasi (create or replace tidak mengubah hak)');
  raise exception 'HASIL_UJI: %', h;
end $uji$;
