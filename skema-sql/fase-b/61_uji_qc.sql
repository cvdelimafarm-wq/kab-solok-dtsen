-- =====================================================================
-- 61_uji_qc.sql - uji QC Pemahaman Petugas. Jalankan SETELAH 20261026k, dalam satu transaksi; diakhiri galat sengaja sehingga SEMUA dibatalkan
-- (hasil uji dibawa dalam pesan galat "HASIL_UJI: {...}"). Tidak ada data tersimpan.
-- =====================================================================
do $uji$
declare
  v_keg bigint; h jsonb := '{}'::jsonb; ids text[]; d date; i integer; hari jsonb := '[]'::jsonb;
  v_ppl bigint; v_pml bigint; v_ppl2 bigint; st jsonb; so jsonb; jaw jsonb; r jsonb; x jsonb; v_tgl date; v_pak integer; v_unik integer;
  v_semua text[] := '{}'; v_peserta integer; v_pml_n integer; v_ppl_n integer; v_p3 bigint; v_p4 bigint; v_sus timestamptz;
begin
  select id into v_keg from sigap_kegiatan where kode = 'pascabencana_2026';
  h := h || jsonb_build_object('soal_aktif', (select count(*) from sigap_qc_soal where aktif), 'paket', (select count(distinct paket) from sigap_qc_soal),
                               'kata_kunci_kosong', (select count(*) from sigap_qc_soal where cardinality(kata_kunci) = 0));
  select count(*) filter (where peran = 'pml'), count(*) filter (where peran = 'ppl') into v_pml_n, v_ppl_n from sigap_qc_peserta(v_keg);
  h := h || jsonb_build_object('peserta_pml', v_pml_n, 'peserta_ppl', v_ppl_n,
        'ppl_tanpa_pml', (select count(*) from sigap_qc_peserta(v_keg) where peran = 'ppl' and pml_akun_id is null));

  -- 1. Undian 8 hari berturut: 10 soal, 7 paket terwakili tiap hari, tanpa duplikat dalam sehari, 4 hari pertama = 40 soal berbeda
  for i in 0..7 loop
    d := date '2099-01-01' + i;
    ids := sigap_qc_hari_pastikan(v_keg, d);
    select count(distinct s.paket) into v_pak from sigap_qc_soal s where s.id = any (ids);
    hari := hari || jsonb_build_object('hari', i + 1, 'n', cardinality(ids), 'unik', (select count(distinct u) from unnest(ids) u), 'paket', v_pak);
    if i < 4 then v_semua := v_semua || ids; end if;
    if i = 4 then v_semua := v_semua || ids; h := h || jsonb_build_object('unik_5_hari', (select count(distinct u) from unnest(v_semua) u)); end if;
  end loop;
  h := h || jsonb_build_object('undian', hari, 'unik_4_hari', (select count(distinct u) from unnest(v_semua[1:40]) u));
  -- idempoten
  h := h || jsonb_build_object('undian_sama_dua_kali', sigap_qc_hari_pastikan(v_keg, date '2099-01-01') = (select soal_ids from sigap_qc_hari where kegiatan_id = v_keg and tanggal = date '2099-01-01'));
  delete from sigap_qc_hari where tanggal >= date '2099-01-01';

  -- 2. Alur satu PPL (jendela dibuka lebar agar hari ini berlaku)
  update sigap_qc_pengaturan set aktif = true, rilis_jam = '00:00', batas_jam = '23:59', mulai = null, akhir = null where kegiatan_id = v_keg;
  select akun_id, pml_akun_id into v_ppl, v_pml from sigap_qc_peserta(v_keg) where peran = 'ppl' and pml_akun_id is not null order by akun_id limit 1;
  select akun_id into v_ppl2 from sigap_qc_peserta(v_keg) where peran = 'ppl' and pml_akun_id = v_pml and akun_id <> v_ppl order by akun_id limit 1;
  st := sigap_qc_status(v_ppl); v_tgl := (st ->> 'tanggal')::date;
  h := h || jsonb_build_object('status_awal', st - 'rilis_at' - 'batas_at');

  so := sigap_qc_soal_untuk(v_ppl);
  h := h || jsonb_build_object('soal_diterima', jsonb_array_length(so -> 'soal'), 'ada_kunci_bocor', so::text ~ '"kunci"|"penjelasan"');
  -- percobaan 1: semua jawaban SALAH (pilih kode selain kunci)
  select jsonb_object_agg(s ->> 'id', (select o ->> 'kode' from jsonb_array_elements(s -> 'opsi') o where (o ->> 'kode') <> k.kunci order by o ->> 'kode' limit 1))
    into jaw from jsonb_array_elements(so -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
  -- jawaban tidak lengkap harus ditolak
  begin
    perform sigap_qc_jawab(v_ppl, jaw - (select s ->> 'id' from jsonb_array_elements(so -> 'soal') s limit 1));
    h := h || jsonb_build_object('tolak_tidak_lengkap', false);
  exception when others then h := h || jsonb_build_object('tolak_tidak_lengkap', sqlerrm);
  end;
  r := sigap_qc_jawab(v_ppl, jaw);
  h := h || jsonb_build_object('ke1', jsonb_build_object('skor', r -> 'skor', 'lulus', r -> 'lulus', 'sisa_ulang', r -> 'sisa_ulang', 'perlu_ulang', r -> 'perlu_ulang', 'tinjau_n', jsonb_array_length(r -> 'tinjau'),
                'contoh', ((r -> 'tinjau') -> 0) - 'penjelasan' - 'pertanyaan' - 'opsi'));
  h := h || jsonb_build_object('status_setelah_ke1', (sigap_qc_status(v_ppl) - 'rilis_at' - 'batas_at'));
  -- percobaan 2: urutan soal/opsi berbeda dari percobaan 1? (acak per percobaan)
  declare so2 jsonb := sigap_qc_soal_untuk(v_ppl);
  begin
    h := h || jsonb_build_object('urutan_berubah', (select jsonb_agg(s ->> 'id') from jsonb_array_elements(so -> 'soal') s) <> (select jsonb_agg(s ->> 'id') from jsonb_array_elements(so2 -> 'soal') s), 'ke_soal2', so2 -> 'ke');
    -- jawab benar semua
    select jsonb_object_agg(s ->> 'id', k.kunci) into jaw from jsonb_array_elements(so2 -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
    r := sigap_qc_jawab(v_ppl, jaw);
  end;
  h := h || jsonb_build_object('ke2', jsonb_build_object('skor', r -> 'skor', 'lulus', r -> 'lulus', 'perlu_ulang', r -> 'perlu_ulang'));
  st := sigap_qc_status(v_ppl);
  h := h || jsonb_build_object('status_setelah_lulus', jsonb_build_object('perlu', st -> 'perlu', 'lulus', st -> 'lulus', 'skor_terbaik', st -> 'skor_terbaik', 'percobaan', st -> 'percobaan'));
  begin perform sigap_qc_jawab(v_ppl, jaw); h := h || jsonb_build_object('tolak_setelah_lulus', false);
  exception when others then h := h || jsonb_build_object('tolak_setelah_lulus', sqlerrm); end;

  -- 3. PPL lain: 4 percobaan salah semua -> berhenti (1 awal + 3 ulang), percobaan ke-5 ditolak
  if v_ppl2 is not null then
    for i in 1..4 loop
      so := sigap_qc_soal_untuk(v_ppl2);
      select jsonb_object_agg(s ->> 'id', (select o ->> 'kode' from jsonb_array_elements(s -> 'opsi') o where (o ->> 'kode') <> k.kunci order by o ->> 'kode' limit 1))
        into jaw from jsonb_array_elements(so -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
      r := sigap_qc_jawab(v_ppl2, jaw);
    end loop;
    st := sigap_qc_status(v_ppl2);
    h := h || jsonb_build_object('ppl2_setelah_4', jsonb_build_object('perlu', st -> 'perlu', 'percobaan', st -> 'percobaan', 'sisa_ulang', st -> 'sisa_ulang', 'lulus', st -> 'lulus'));
    begin perform sigap_qc_soal_untuk(v_ppl2); h := h || jsonb_build_object('tolak_ke5', false);
    exception when others then h := h || jsonb_build_object('tolak_ke5', sqlerrm); end;
  end if;

  -- 4. Rekap tim untuk PML tersebut dan status PML
  x := sigap_qc_rekap(v_keg, v_tgl, v_pml);
  h := h || jsonb_build_object('rekap', jsonb_build_object('tim', jsonb_array_length(x),
        'jumlah_ppl', x -> 0 -> 'jumlah_ppl', 'sudah', x -> 0 -> 'sudah', 'belum', x -> 0 -> 'belum_mengisi', 'lulus', x -> 0 -> 'lulus', 'rata_awal', x -> 0 -> 'rata_awal',
        'rata_terbaik', x -> 0 -> 'rata_terbaik', 'salah_n', jsonb_array_length(x -> 0 -> 'salah'),
        'ppl', (select jsonb_agg(p - 'akun_id') from jsonb_array_elements(x -> 0 -> 'ppl') p)));
  h := h || jsonb_build_object('rekap_semua_tim', jsonb_array_length(sigap_qc_rekap(v_keg, v_tgl, null)));
  st := sigap_qc_status(v_pml);
  h := h || jsonb_build_object('status_pml', jsonb_build_object('peran', st -> 'peran', 'perlu', st -> 'perlu', 'ppl_belum_n', jsonb_array_length(st -> 'ppl_belum')));
  h := h || jsonb_build_object('belum_selesai', (select count(*) from sigap_qc_belum(v_keg, v_tgl)));
  h := h || jsonb_build_object('kirim_pertama', sigap_qc_kirim_catat(v_keg, v_tgl, 'rilis', v_ppl, 0), 'kirim_kedua', sigap_qc_kirim_catat(v_keg, v_tgl, 'rilis', v_ppl, 0));

  -- 4b. Hari SUSULAN: batas dibuat sudah lewat (rilis 00:00, batas 00:01). Hari biasa -> terlambat; hari susulan -> tidak terlambat, tetap memblokir
  select akun_id into v_p3 from sigap_qc_peserta(v_keg) where peran = 'ppl' and akun_id not in (v_ppl, v_ppl2) order by akun_id limit 1;
  select akun_id into v_p4 from sigap_qc_peserta(v_keg) where peran = 'ppl' and akun_id not in (v_ppl, v_ppl2, v_p3) order by akun_id limit 1;
  update sigap_qc_pengaturan set batas_jam = '00:01', ingat_menit = '{}' where kegiatan_id = v_keg;
  st := sigap_qc_status(v_p3);
  h := h || jsonb_build_object('biasa_lewat_batas', jsonb_build_object('lewat_batas', st -> 'lewat_batas', 'susulan', st -> 'susulan', 'perlu', st -> 'perlu'));
  so := sigap_qc_soal_untuk(v_p3);
  select jsonb_object_agg(s ->> 'id', (select o ->> 'kode' from jsonb_array_elements(s -> 'opsi') o where (o ->> 'kode') <> k.kunci order by o ->> 'kode' limit 1))
    into jaw from jsonb_array_elements(so -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
  r := sigap_qc_jawab(v_p3, jaw);
  h := h || jsonb_build_object('biasa_terlambat', r -> 'terlambat');
  v_sus := sigap_qc_hari_susulan(v_keg, v_tgl, true);
  st := sigap_qc_status(v_p4);
  h := h || jsonb_build_object('susulan_status', jsonb_build_object('lewat_batas', st -> 'lewat_batas', 'susulan', st -> 'susulan', 'perlu', st -> 'perlu', 'ditandai', v_sus is not null));
  so := sigap_qc_soal_untuk(v_p4);
  select jsonb_object_agg(s ->> 'id', (select o ->> 'kode' from jsonb_array_elements(s -> 'opsi') o where (o ->> 'kode') <> k.kunci order by o ->> 'kode' limit 1))
    into jaw from jsonb_array_elements(so -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
  r := sigap_qc_jawab(v_p4, jaw);
  h := h || jsonb_build_object('susulan_terlambat', r -> 'terlambat', 'susulan_skor', r -> 'skor', 'susulan_perlu_ulang', r -> 'perlu_ulang');
  h := h || jsonb_build_object('belum_dengan_skor', (select jsonb_agg(jsonb_build_object('percobaan', b.percobaan, 'skor', b.skor_terbaik) order by b.akun_id) from sigap_qc_belum(v_keg, v_tgl) b where b.akun_id in (v_p3, v_p4)));
  -- pengaktifan SESUDAH batas pada hari tanpa jawaban otomatis menandai hari susulan
  delete from sigap_qc_percobaan where tanggal = v_tgl;
  delete from sigap_qc_hari where kegiatan_id = v_keg and tanggal = v_tgl;
  update sigap_qc_pengaturan set aktif = false where kegiatan_id = v_keg;
  perform sigap_qc_pengaturan_simpan(v_keg, '{"aktif":true}'::jsonb, 'uji');
  select susulan_at into v_sus from sigap_qc_hari where kegiatan_id = v_keg and tanggal = v_tgl;
  h := h || jsonb_build_object('auto_susulan_saat_aktif_lewat_batas', v_sus is not null);
  begin perform sigap_qc_pengaturan_simpan(v_keg, '{"ingat_berkala_menit":10}'::jsonb, 'uji'); h := h || jsonb_build_object('tolak_berkala_10', false);
  exception when others then h := h || jsonb_build_object('tolak_berkala_10', sqlerrm); end;
  perform sigap_qc_pengaturan_simpan(v_keg, '{"ingat_berkala_menit":0}'::jsonb, 'uji');
  perform sigap_qc_pengaturan_simpan(v_keg, '{"ingat_berkala_menit":90}'::jsonb, 'uji');
  h := h || jsonb_build_object('berkala_tersimpan', (select ingat_berkala_menit from sigap_qc_pengaturan where kegiatan_id = v_keg));

  -- 5. Pengaturan: validasi
  begin perform sigap_qc_pengaturan_simpan(v_keg, '{"rilis_jam":"20:00","batas_jam":"19:00"}'::jsonb, 'uji'); h := h || jsonb_build_object('tolak_jam_terbalik', false);
  exception when others then h := h || jsonb_build_object('tolak_jam_terbalik', sqlerrm); end;
  begin perform sigap_qc_pengaturan_simpan(v_keg, '{"rilis_jam":"19:00","batas_jam":"20:00","ingat_menit":[30,70]}'::jsonb, 'uji'); h := h || jsonb_build_object('tolak_menit_lewat', false);
  exception when others then h := h || jsonb_build_object('tolak_menit_lewat', sqlerrm); end;
  -- hak: anon tidak boleh memanggil
  h := h || jsonb_build_object('anon_boleh_status', has_function_privilege('anon', 'public.sigap_qc_status(bigint)', 'execute'),
                               'service_boleh_status', has_function_privilege('service_role', 'public.sigap_qc_status(bigint)', 'execute'),
                               'anon_boleh_tabel', has_table_privilege('anon', 'public.sigap_qc_soal', 'select'));
  raise exception 'HASIL_UJI: %', h::text;
end $uji$;
