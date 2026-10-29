-- =====================================================================
-- 62_uji_qc_per_kegiatan.sql - uji QC Pemahaman PER KEGIATAN. Jalankan SETELAH 20261029c_qc_per_kegiatan.sql, dalam satu transaksi;
-- diakhiri galat sengaja sehingga SEMUA dibatalkan (hasil uji dibawa dalam pesan galat "HASIL_UJI: {...}"). Tidak ada data tersimpan.
-- Memakai kegiatan ber-id 2 (SPDT NTP) sebagai kegiatan uji dan kegiatan Pascabencana sebagai pembanding.
-- =====================================================================
do $uji$
declare
  k1 bigint; k2 bigint := 2; h jsonb := '{}'::jsonb; so jsonb; jaw jsonb; r jsonb; st jsonb; ids text[]; v_tgl date; v_ppl bigint; v_pml bigint; v_dua bigint;
  i integer; v_n integer; v_isodow integer; v_urut1 text; v_urut2 text; x jsonb;
begin
  select id into k1 from sigap_kegiatan where kode = 'pascabencana_2026';
  if not exists (select 1 from sigap_kegiatan where id = k2) then raise exception 'Kegiatan uji (id 2) tidak ada'; end if;
  h := h || jsonb_build_object('k1', k1, 'k2', k2,
        'soal_k1', (select count(*) from sigap_qc_soal where kegiatan_id = k1), 'soal_tanpa_kegiatan', (select count(*) from sigap_qc_soal where kegiatan_id is null),
        'soal_k2_awal', (select count(*) from sigap_qc_soal where kegiatan_id = k2));

  -- 1. Bank soal kegiatan uji (12 soal, 3 paket). Kode milik kegiatan lain ditolak; tanpa kegiatan ditolak.
  for i in 1..12 loop
    perform sigap_qc_soal_simpan(jsonb_build_object('id', 'UJI-' || lpad(i::text, 2, '0'), 'kegiatan_id', k2, 'paket', 1 + (i - 1) / 4, 'judul_paket', 'Paket uji ' || (1 + (i - 1) / 4),
              'nomor', 1 + (i - 1) % 4, 'pertanyaan', 'Soal uji nomor ' || i, 'opsi', jsonb_build_object('A', 'a', 'B', 'b', 'C', 'c', 'D', 'd'), 'kunci', 'B', 'penjelasan', 'uji'));
  end loop;
  begin perform sigap_qc_soal_simpan(jsonb_build_object('id', 'LAT-11', 'kegiatan_id', k2, 'paket', 1, 'pertanyaan', 'Kode milik kegiatan lain', 'opsi', jsonb_build_object('A','a','B','b','C','c','D','d'), 'kunci', 'A'));
        h := h || jsonb_build_object('tolak_kode_kegiatan_lain', false);
  exception when others then h := h || jsonb_build_object('tolak_kode_kegiatan_lain', sqlerrm); end;
  begin perform sigap_qc_soal_simpan(jsonb_build_object('id', 'UJI-99', 'paket', 1, 'pertanyaan', 'Tanpa kegiatan', 'opsi', jsonb_build_object('A','a','B','b','C','c','D','d'), 'kunci', 'A'));
        h := h || jsonb_build_object('tolak_tanpa_kegiatan', false);
  exception when others then h := h || jsonb_build_object('tolak_tanpa_kegiatan', sqlerrm); end;
  -- mengubah soal milik sendiri (kode sama, kegiatan sama) tetap boleh
  perform sigap_qc_soal_simpan(jsonb_build_object('id', 'UJI-01', 'kegiatan_id', k2, 'paket', 1, 'nomor', 1, 'pertanyaan', 'Soal uji nomor 1 (diubah)', 'opsi', jsonb_build_object('A','a','B','b','C','c','D','d'), 'kunci', 'B'));
  h := h || jsonb_build_object('soal_k2', (select count(*) from sigap_qc_soal where kegiatan_id = k2), 'soal_k1_tetap', (select count(*) from sigap_qc_soal where kegiatan_id = k1));

  -- 2. Pengaturan: bank kosong ditolak untuk kegiatan lain; opsi baru divalidasi
  begin perform sigap_qc_pengaturan_simpan(k2, '{"nilai_lulus":0}'::jsonb, 'uji'); h := h || jsonb_build_object('tolak_nilai_lulus_0', false);
  exception when others then h := h || jsonb_build_object('tolak_nilai_lulus_0', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(k2, '{"hari_rilis":[]}'::jsonb, 'uji'); h := h || jsonb_build_object('tolak_hari_kosong', false);
  exception when others then h := h || jsonb_build_object('tolak_hari_kosong', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(k2, '{"hari_rilis":[8]}'::jsonb, 'uji'); h := h || jsonb_build_object('tolak_hari_8', false);
  exception when others then h := h || jsonb_build_object('tolak_hari_8', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(k2, '{"peran_peserta":["supervisor"]}'::jsonb, 'uji'); h := h || jsonb_build_object('tolak_peran', false);
  exception when others then h := h || jsonb_build_object('tolak_peran', sqlerrm); end;
  -- Pascabencana dimatikan agar yang diuji hanya kegiatan uji
  update sigap_qc_pengaturan set aktif = false where kegiatan_id = k1;
  perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('aktif', true, 'rilis_jam', '00:00', 'batas_jam', '23:59', 'rekap_jam', '00:00', 'ingat_menit', '[]'::jsonb,
            'soal_per_hari', 5, 'maks_ulang', 3, 'wajib_ulang', false, 'nilai_lulus', 80, 'undi_acak', false, 'acak_tampil', false,
            'peran_peserta', '["ppl"]'::jsonb, 'hari_rilis', '[1,2,3,4,5,6,7]'::jsonb, 'rekap_pml', false, 'mulai', null, 'akhir', null), 'uji');
  h := h || jsonb_build_object('pengaturan_k2', (select to_jsonb(g) - 'diubah_at' - 'diubah_oleh' from sigap_qc_pengaturan g where g.kegiatan_id = k2));

  -- 3. Peserta hanya PPL
  h := h || jsonb_build_object('peserta_k2', (select jsonb_build_object('pml', count(*) filter (where peran = 'pml'), 'ppl', count(*) filter (where peran = 'ppl')) from sigap_qc_peserta(k2)));
  select akun_id into v_ppl from sigap_qc_peserta(k2) where peran = 'ppl' order by akun_id limit 1;
  select akun_id into v_dua from sigap_qc_peserta(k2) where peran = 'ppl' and akun_id <> v_ppl order by akun_id limit 1;
  select akun_id into v_pml from sigap_penugasan where kegiatan_id = k2 and peran = 'pml' and aktif order by akun_id limit 1;
  if v_pml is not null then h := h || jsonb_build_object('pml_k2_status_aktif', sigap_qc_status_k(v_pml, k2) -> 'aktif'); end if;

  -- 4. Undian berurutan (undi_acak=false): hari 1 = 5 soal pertama menurut (paket, nomor); hari 2 = 5 berikutnya yang paling lama tidak dipakai
  ids := sigap_qc_undi(k2, 5);
  h := h || jsonb_build_object('undi_urut_1', to_jsonb(ids));
  v_tgl := (sigap_qc_status_k(v_ppl, k2) ->> 'tanggal')::date;
  ids := sigap_qc_hari_pastikan(k2, v_tgl);
  h := h || jsonb_build_object('hari_k2', to_jsonb(ids), 'hari_hanya_soal_k2', (select bool_and(s.kegiatan_id = k2) from sigap_qc_soal s where s.id = any (ids)));

  -- 5. Tampilan tidak diacak: urutan soal sama pada dua pemanggilan; ada nama kegiatan
  so := sigap_qc_soal_untuk(v_ppl);
  h := h || jsonb_build_object('soal_diterima', jsonb_array_length(so -> 'soal'), 'kegiatan_di_soal', so ->> 'kegiatan_id',
        'urutan_tetap', (select jsonb_agg(s ->> 'id') from jsonb_array_elements(so -> 'soal') s) = (select jsonb_agg(s ->> 'id') from jsonb_array_elements(sigap_qc_soal_untuk(v_ppl) -> 'soal') s),
        'opsi_urut', (so -> 'soal' -> 0 -> 'opsi') #>> '{0,kode}');

  -- 6. Nilai lulus 80: 4 dari 5 benar = lulus; wajib_ulang=false: tidak ada percobaan kedua
  select jsonb_object_agg(s ->> 'id', case when n = 1 then 'A' else 'B' end) into jaw from (select s, row_number() over () as n from jsonb_array_elements(so -> 'soal') s) t(s, n);
  r := sigap_qc_jawab(v_ppl, jaw);
  h := h || jsonb_build_object('ke1', jsonb_build_object('skor', r -> 'skor', 'benar', r -> 'benar', 'lulus', r -> 'lulus', 'nilai_lulus', r -> 'nilai_lulus', 'perlu_ulang', r -> 'perlu_ulang', 'kegiatan', r ->> 'kegiatan_id'));
  st := sigap_qc_status_k(v_ppl, k2);
  h := h || jsonb_build_object('status_lulus', jsonb_build_object('perlu', st -> 'perlu', 'lulus', st -> 'lulus', 'maks', st -> 'maks_percobaan'));
  -- petugas kedua: 3 dari 5 benar = belum lulus, tetapi wajib_ulang=false -> tidak diminta mengulang
  if v_dua is not null then
    so := sigap_qc_soal_untuk(v_dua);
    select jsonb_object_agg(s ->> 'id', case when n <= 2 then 'A' else 'B' end) into jaw from (select s, row_number() over () as n from jsonb_array_elements(so -> 'soal') s) t(s, n);
    r := sigap_qc_jawab(v_dua, jaw);
    st := sigap_qc_status_k(v_dua, k2);
    h := h || jsonb_build_object('ke1_dua', jsonb_build_object('skor', r -> 'skor', 'lulus', r -> 'lulus', 'perlu_ulang', r -> 'perlu_ulang'),
          'status_dua', jsonb_build_object('perlu', st -> 'perlu', 'lulus', st -> 'lulus'));
    begin perform sigap_qc_soal_untuk(v_dua); h := h || jsonb_build_object('tolak_ulang_tanpa_wajib', false);
    exception when others then h := h || jsonb_build_object('tolak_ulang_tanpa_wajib', sqlerrm); end;
  end if;
  h := h || jsonb_build_object('belum_tanpa_wajib', (select count(*) from sigap_qc_belum(k2, v_tgl)));
  x := sigap_qc_rekap(k2, v_tgl, null);
  h := h || jsonb_build_object('rekap_k2', (select jsonb_build_object('lulus', sum((g ->> 'lulus')::int), 'sudah', sum((g ->> 'sudah')::int), 'belum', sum((g ->> 'belum_mengisi')::int)) from jsonb_array_elements(x) g));

  -- 7. rekap_pml=false: PML tidak mendapat modal rekap kegiatan ini
  h := h || jsonb_build_object('rekap_untuk_pml_mati', case when v_pml is null then null else sigap_qc_rekap_untuk(v_pml) end);

  -- 8. wajib_ulang=true, nilai_lulus=100: perilaku lama pada kegiatan uji
  perform sigap_qc_pengaturan_simpan(k2, '{"wajib_ulang":true,"nilai_lulus":100}'::jsonb, 'uji');
  st := sigap_qc_status_k(v_dua, k2);
  h := h || jsonb_build_object('status_dua_wajib', jsonb_build_object('perlu', st -> 'perlu', 'lulus', st -> 'lulus', 'maks', st -> 'maks_percobaan'),
        'status_ppl_nilai100', (select jsonb_build_object('perlu', s -> 'perlu', 'lulus', s -> 'lulus') from (select sigap_qc_status_k(v_ppl, k2) s) q));

  -- 9. Hari rilis: kecualikan hari ini -> hari berlaku mundur ke hari rilis terakhir (hari kemarin atau sebelumnya)
  v_isodow := extract(isodow from (now() at time zone 'Asia/Jakarta')::date);
  perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('hari_rilis', (select jsonb_agg(d) from generate_series(1, 7) d where d <> v_isodow)), 'uji');
  st := sigap_qc_status_k(v_ppl, k2);
  h := h || jsonb_build_object('hari_ini_dikecualikan', jsonb_build_object('hari_ini', (now() at time zone 'Asia/Jakarta')::date, 'berlaku', st -> 'tanggal', 'aktif', st -> 'aktif'));
  perform sigap_qc_pengaturan_simpan(k2, '{"hari_rilis":[1,2,3,4,5,6,7]}'::jsonb, 'uji');
  begin perform sigap_qc_pengaturan_simpan(k2, jsonb_build_object('hari_rilis', jsonb_build_array(v_isodow)), 'uji'); exception when others then null; end;
  h := h || jsonb_build_object('fungsi_hari_berlaku', jsonb_build_object(
        'rabu_pagi_hari_rilis_sen_jum', sigap_qc_hari_berlaku(timestamp '2026-10-28 07:00', time '19:00', array[1,5]::smallint[]),
        'sabtu_malam_hari_rilis_sen_jum', sigap_qc_hari_berlaku(timestamp '2026-10-31 20:00', time '19:00', array[1,5]::smallint[]),
        'senin_sore_sebelum_rilis', sigap_qc_hari_berlaku(timestamp '2026-10-26 10:00', time '19:00', array[1,5]::smallint[])));

  -- 10. Pemilih: petugas yang ikut dua kegiatan. Kegiatan terkecil yang MASIH wajib didahulukan; yang sudah selesai dilewati.
  select a.akun_id into v_ppl from sigap_qc_peserta(k1) a join sigap_qc_peserta(k2) b on b.akun_id = a.akun_id and b.peran = 'ppl' where a.peran = 'ppl' order by a.akun_id limit 1;
  if v_ppl is not null then
    update sigap_qc_pengaturan set aktif = true, rilis_jam = '00:00', batas_jam = '23:59', mulai = null, akhir = null, rekap_jam = '00:00', ingat_menit = '{}' where kegiatan_id = k1;
    update sigap_qc_pengaturan set peran_peserta = '{pml,ppl}' where kegiatan_id = k2;
    delete from sigap_qc_percobaan where akun_id = v_ppl;
    st := sigap_qc_status(v_ppl);
    h := h || jsonb_build_object('pemilih_awal', jsonb_build_object('kegiatan', st -> 'kegiatan_id', 'nama', st ->> 'kegiatan_nama', 'perlu', st -> 'perlu'));
    -- selesaikan kegiatan 1 dengan semua benar
    so := sigap_qc_soal_untuk(v_ppl);
    select jsonb_object_agg(s ->> 'id', k.kunci) into jaw from jsonb_array_elements(so -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
    r := sigap_qc_jawab(v_ppl, jaw);
    h := h || jsonb_build_object('k1_selesai', jsonb_build_object('kegiatan', r -> 'kegiatan_id', 'lulus', r -> 'lulus', 'jumlah', r -> 'jumlah'));
    st := sigap_qc_status(v_ppl);
    h := h || jsonb_build_object('pemilih_sesudah_k1', jsonb_build_object('kegiatan', st -> 'kegiatan_id', 'nama', st ->> 'kegiatan_nama', 'perlu', st -> 'perlu', 'percobaan', st -> 'percobaan'));
    so := sigap_qc_soal_untuk(v_ppl);
    select jsonb_object_agg(s ->> 'id', k.kunci) into jaw from jsonb_array_elements(so -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
    r := sigap_qc_jawab(v_ppl, jaw);
    h := h || jsonb_build_object('k2_selesai', jsonb_build_object('kegiatan', r -> 'kegiatan_id', 'lulus', r -> 'lulus', 'jumlah', r -> 'jumlah'));
    st := sigap_qc_status(v_ppl);
    h := h || jsonb_build_object('pemilih_semua_selesai', jsonb_build_object('kegiatan', st -> 'kegiatan_id', 'perlu', st -> 'perlu'));
    -- tinjau tanpa kegiatan memilih kegiatan dari percobaan hari itu
    h := h || jsonb_build_object('tinjau_k1', sigap_qc_tinjau(v_ppl, v_tgl, 1, k1) ->> 'kegiatan_id', 'tinjau_k2', sigap_qc_tinjau(v_ppl, v_tgl, 1, k2) ->> 'kegiatan_id');
  else
    h := h || jsonb_build_object('pemilih', 'dilewati: tidak ada PPL yang ikut dua kegiatan');
  end if;

  -- 11. Peserta PML: rekap_pml menyala -> rekap kegiatan yang memiliki hari kemarin muncul; penandaan baca per kegiatan
  select akun_id into v_pml from sigap_qc_peserta(k1) where peran = 'pml' order by akun_id limit 1;
  if v_pml is not null then
    v_tgl := (now() at time zone 'Asia/Jakarta')::date - 1;
    perform sigap_qc_hari_pastikan(k1, v_tgl);
    x := sigap_qc_rekap_untuk(v_pml);
    h := h || jsonb_build_object('rekap_untuk_pml', jsonb_build_object('ada', x -> 'ada', 'kegiatan', x -> 'kegiatan_id', 'tanggal', x -> 'tanggal'));
    h := h || jsonb_build_object('tandai_baca', sigap_qc_rekap_baca_tandai(v_pml, v_tgl, k1));
    h := h || jsonb_build_object('sesudah_baca', (sigap_qc_rekap_untuk(v_pml) ->> 'ada'));   -- terpisah: fungsi STABLE memakai snapshot pernyataan
    h := h || jsonb_build_object('tandai_baca_bukan_pml', sigap_qc_rekap_baca_tandai(v_ppl, v_tgl, k1));
  end if;

  -- 12. Hak
  h := h || jsonb_build_object('anon_boleh_status_k', has_function_privilege('anon', 'public.sigap_qc_status_k(bigint,bigint)', 'execute'),
                               'service_boleh_status_k', has_function_privilege('service_role', 'public.sigap_qc_status_k(bigint,bigint)', 'execute'),
                               'anon_boleh_lulus', has_function_privilege('anon', 'public.sigap_qc_lulus(bigint,integer,integer)', 'execute'),
                               'anon_boleh_tabel', has_table_privilege('anon', 'public.sigap_qc_soal', 'select'));
  raise exception 'HASIL_UJI: %', h::text;
end $uji$;
