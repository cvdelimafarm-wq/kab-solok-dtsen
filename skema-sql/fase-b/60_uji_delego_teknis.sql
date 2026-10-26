-- 60_uji_delego_teknis.sql -- uji dry-run (rollback otomatis) untuk 20261026i. Jalankan SETELAH berkas i dalam satu eksekusi; hasil ada di pesan galat "HASIL=...".
-- Memakai akun 354 (Ketua Tim, pemberi), 357 (bukan pemberi), 464 dan 160 (penerima). Semua data uji ikut dibatalkan.
do $$
declare
  r jsonb; n int; v_hari date := keu_dlg_hari_ini(); o text := ''; e jsonb; v_id bigint; v_jenis bigint; v_doc bigint; v_h1 bigint; v_h2 bigint; v_d2 bigint; v_d3 bigint; v_d4 bigint;
  v_rut bigint; v_lang bigint; d keu_dlg_delegasi; v_tw timestamptz;
begin
  select count(*) into n from keu_dlg_jenis where aktif; o := o || 'jenis=' || n || ';';
  select id into v_doc from keu_dlg_jenis where kode = 'periksa_dokumen';
  r := keu_dlg_hak(354);
  o := o || 'hak354 jenis=' || jsonb_array_length(r -> 'jenis') || ' kel=' || jsonb_array_length(r -> 'kelompok') || ' beri_kel=' || jsonb_array_length(r -> 'beri_kelompok') || ';';
  r := keu_dlg_hak(357);
  o := o || 'hak357 beri_kel=' || jsonb_array_length(r -> 'beri_kelompok') || ';';

  -- katalog: bukan pemberi ditolak; pemberi membuat jenis uji dengan tinjau + dua langkah bawaan
  begin perform keu_dlg_jenis_simpan('{"kode":"uji_x","nama":"Uji x","satuan":"x","poin_per_satuan":5}'::jsonb, 357); o := o || 'SALAH_jenis357;'; exception when others then o := o || 'jenis357_ditolak;'; end;
  begin perform keu_dlg_jenis_simpan('{"kode":"uji_y","nama":"Uji y","satuan":"y","poin_per_satuan":5,"perlu_hasil":false,"perlu_tinjau":true}'::jsonb, 354); o := o || 'SALAH_tinjau_tanpa_hasil;'; exception when others then o := o || 'tinjau_tanpa_hasil_ditolak;'; end;
  r := keu_dlg_jenis_simpan(jsonb_build_object('kode', 'uji_x', 'nama', 'Uji berkas', 'satuan', 'berkas', 'poin_per_satuan', 5, 'perlu_hasil', true, 'perlu_tinjau', true,
        'langkah_bawaan', jsonb_build_array('Langkah satu', 'Langkah dua')), 354);
  v_jenis := (r ->> 'id')::bigint;

  -- delegasi Pekerjaan tim berjenis: 357 ditolak, 354 berhasil
  begin
    perform keu_dlg_buat(jsonb_build_object('kelompok', 'TIM-KESRA', 'judul', 'UJI ditolak', 'jenis_id', v_jenis, 'jumlah', 2, 'tenggat', (v_hari + 3)::text,
      'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'))), 357);
    o := o || 'SALAH_buat357;';
  exception when others then o := o || 'buat357_ditolak;'; end;
  begin
    perform keu_dlg_buat(jsonb_build_object('kelompok', 'TIM-TIDAKADA', 'judul', 'UJI kelompok salah', 'jenis_id', v_jenis, 'jumlah', 2, 'tenggat', (v_hari + 3)::text,
      'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'))), 354);
    o := o || 'SALAH_kelompok;';
  exception when others then o := o || 'kelompok_salah_ditolak;'; end;
  r := keu_dlg_buat(jsonb_build_object('kelompok', 'TIM-KESRA', 'judul', 'UJI periksa berkas', 'jenis_id', v_jenis, 'jumlah', 6, 'tenggat', (v_hari + 4)::text,
        'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'))), 354);
  v_id := (r -> 'dibuat' ->> 0)::bigint;
  select * into d from keu_dlg_delegasi where id = v_id;
  o := o || 'buat ro=' || d.ro_kode || ' tt=' || d.target_total || ' th=' || d.target_harian || ' sat=' || d.satuan || ' pps=' || d.poin_per_satuan || ' ph=' || d.perlu_hasil || ' pt=' || d.perlu_tinjau || ';';
  select count(*) into n from keu_dlg_langkah where delegasi_id = v_id; o := o || 'langkah_bawaan=' || n || ';';

  -- langkah: penerima mencentang, bukan penerima ditolak, pemberi mengatur ulang (tambah satu, lepas satu)
  select id into v_lang from keu_dlg_langkah where delegasi_id = v_id order by urut limit 1;
  begin perform keu_dlg_langkah_centang(v_lang, true, 160); o := o || 'SALAH_centang160;'; exception when others then o := o || 'centang160_ditolak;'; end;
  perform keu_dlg_langkah_centang(v_lang, true, 464);
  o := o || 'status_setelah_centang=' || (select status from keu_dlg_delegasi where id = v_id) || ';';
  r := keu_dlg_langkah_atur(v_id, jsonb_build_array(jsonb_build_object('id', v_lang, 'judul', 'Langkah satu (ubah)'), 'Langkah tiga baru'), 354);
  o := o || 'langkah_atur baru=' || (r ->> 'baru') || ' aktif=' || (select count(*) from keu_dlg_langkah where delegasi_id = v_id and aktif) || ' nonaktif=' || (select count(*) from keu_dlg_langkah where delegasi_id = v_id and not aktif)
         || ' centang_tetap=' || (select selesai from keu_dlg_langkah where id = v_lang) || ';';

  -- lapor dengan jumlah satuan: poin = jumlah x pps
  r := keu_dlg_lapor_jumlah(v_id, v_hari, 3, 'uji jumlah', '', '[]'::jsonb, 464);
  o := o || 'lapor_jumlah poin=' || (r ->> 'poin') || ' simpan=' || (select jumlah || '/' || poin from keu_dlg_laporan where delegasi_id = v_id and tanggal = v_hari) || ';';
  begin perform keu_dlg_lapor_jumlah(v_id, v_hari, 5000, '', '', '[]'::jsonb, 464); o := o || 'SALAH_jumlah_besar;'; exception when others then o := o || 'jumlah_besar_ditolak;'; end;

  -- hasil dan tinjau
  begin perform keu_dlg_ubah(v_id, jsonb_build_object('status', 'selesai'), 354); o := o || 'SALAH_selesai_tanpa_hasil;'; exception when others then o := o || 'selesai_tanpa_hasil_ditolak;'; end;
  begin perform keu_dlg_hasil_serah(v_id, jsonb_build_array('https://contoh.id/a'), '', 160); o := o || 'SALAH_serah160;'; exception when others then o := o || 'serah160_ditolak;'; end;
  begin perform keu_dlg_hasil_serah(v_id, jsonb_build_array(jsonb_build_object('path', 'delego/999999/abcdef0123456789abcdef0123456789.jpg')), '', 464); o := o || 'SALAH_path_asing;'; exception when others then o := o || 'path_asing_ditolak;'; end;
  r := keu_dlg_hasil_serah(v_id, jsonb_build_array('https://contoh.id/berkas-1', jsonb_build_object('ket', 'catatan uji', 'path', 'delego/' || v_id || '/abcdef0123456789abcdef0123456789.jpg')), 'versi 1', 464);
  v_h1 := (r ->> 'id')::bigint; o := o || 'serah1 status=' || (r ->> 'status') || ' nomor=' || (r ->> 'nomor') || ';';
  begin perform keu_dlg_hasil_serah(v_id, jsonb_build_array('https://contoh.id/lagi'), '', 464); o := o || 'SALAH_serah_ganda;'; exception when others then o := o || 'serah_ganda_ditolak;'; end;
  begin perform keu_dlg_pindah(v_id, 160, null, 354); o := o || 'SALAH_pindah_tertahan;'; exception when others then o := o || 'pindah_tertahan_ditolak;'; end;
  begin perform keu_dlg_hasil_tinjau(v_h1, 'revisi', '', 354); o := o || 'SALAH_revisi_tanpa_catatan;'; exception when others then o := o || 'revisi_tanpa_catatan_ditolak;'; end;
  begin perform keu_dlg_hasil_tinjau(v_h1, 'diterima', '', 357); o := o || 'SALAH_tinjau357;'; exception when others then o := o || 'tinjau357_ditolak;'; end;
  r := keu_dlg_hasil_tinjau(v_h1, 'revisi', 'Lengkapi lampiran kedua', 354);
  o := o || 'revisi status=' || (r ->> 'status') || ' delegasi=' || (select status from keu_dlg_delegasi where id = v_id) || ';';
  r := keu_dlg_hasil_serah(v_id, jsonb_build_array('https://contoh.id/berkas-2'), 'versi 2', 464);
  v_h2 := (r ->> 'id')::bigint; o := o || 'serah2 nomor=' || (r ->> 'nomor') || ';';
  r := keu_dlg_hasil_tinjau(v_h2, 'diterima', 'Sudah baik', 354);
  o := o || 'diterima selesai=' || (r ->> 'delegasi_selesai') || ' status=' || (select status from keu_dlg_delegasi where id = v_id) || ';';

  -- bacaan: saya(464) membawa langkah + hasil + nama jenis; bahan(tim) membawa kelompok_nama
  r := keu_dlg_saya(464);
  select x into e from jsonb_array_elements(r -> 'delegasi') x where (x ->> 'id')::bigint = v_id;
  o := o || 'saya jenis=' || coalesce(e ->> 'jenis_nama', '-') || ' kel=' || coalesce(e ->> 'kelompok_nama', '-') || ' langkah=' ||
         (select count(*) from jsonb_array_elements(r -> 'langkah') x where (x ->> 'delegasi_id')::bigint = v_id) || ' hasil=' ||
         (select count(*) from jsonb_array_elements(r -> 'hasil') x where (x ->> 'delegasi_id')::bigint = v_id) || ';';
  r := keu_dlg_bahan(null, 'TIM-KESRA', 354);
  o := o || 'bahan_tim delegasi=' || jsonb_array_length(r -> 'delegasi') || ' rutin=' || jsonb_array_length(r -> 'rutin') || ';';

  -- insidental bertenggat jam: menjelang, lewat, serah hasil = melapor selesai
  r := keu_dlg_buat(jsonb_build_object('kelompok', 'TIM-KESRA', 'judul', 'UJI mendadak', 'insidental', true, 'perlu_hasil', true, 'target_harian', 40,
        'mulai', v_hari::text, 'tenggat', (v_hari + 1)::text, 'tenggat_jam', '09:00', 'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'))), 354);
  v_d2 := (r -> 'dibuat' ->> 0)::bigint;
  select * into d from keu_dlg_delegasi where id = v_d2;
  o := o || 'insidental hk=' || cardinality(d.hari_kerja) || ' tw_ada=' || (d.tenggat_waktu is not null) || ';';
  v_tw := d.tenggat_waktu;
  begin perform keu_dlg_buat(jsonb_build_object('kelompok', 'TIM-KESRA', 'judul', 'UJI jam salah', 'tenggat', v_hari::text, 'tenggat_jam', '25:99',
        'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'))), 354); o := o || 'SALAH_jam;'; exception when others then o := o || 'jam_salah_ditolak;'; end;
  r := keu_dlg_pengingat_tenggat(v_tw - interval '1 hour'); o := o || 'tenggat1 menjelang=' || (r ->> 'menjelang') || ' lewat=' || (r ->> 'lewat') || ';';
  r := keu_dlg_pengingat_tenggat(v_tw - interval '1 hour'); o := o || 'tenggat2 menjelang=' || (r ->> 'menjelang') || ';';
  r := keu_dlg_pengingat_tenggat(v_tw + interval '10 minutes'); o := o || 'tenggat3 lewat=' || (r ->> 'lewat') || ';';
  r := keu_dlg_pengingat_tenggat(v_tw + interval '20 minutes'); o := o || 'tenggat4 lewat=' || (r ->> 'lewat') || ';';
  r := keu_dlg_hasil_serah(v_d2, jsonb_build_array('https://contoh.id/mendadak'), 'beres', 464);
  o := o || 'serah_insidental status=' || (r ->> 'status') || ' laporan=' || (r ->> 'laporan_dibuat') || ' delegasi=' || (select status from keu_dlg_delegasi where id = v_d2)
         || ' poin=' || (select coalesce(sum(poin), 0) from keu_dlg_laporan where delegasi_id = v_d2) || ';';
  r := keu_dlg_ubah(v_d2, jsonb_build_object('tenggat_jam', ''), 354); o := o || 'ubah_hapus_jam=' || (r ->> 'hasil') || ';';
  select count(*) into n from keu_notifikasi where jenis in ('delegasi_hasil','delegasi_tinjau','delegasi_tenggat'); o := o || 'notif_baru=' || n || ';';

  -- pindah menyalin kolom baru dan langkah
  r := keu_dlg_buat(jsonb_build_object('kelompok', 'TIM-KESRA', 'judul', 'UJI pindah', 'jenis_id', v_jenis, 'jumlah', 10, 'tenggat', (v_hari + 6)::text,
        'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'))), 354);
  v_d3 := (r -> 'dibuat' ->> 0)::bigint;
  r := keu_dlg_pindah(v_d3, 160, null, 354);
  select * into d from keu_dlg_delegasi where id = (r ->> 'baru')::bigint;
  o := o || 'pindah jenis=' || coalesce(d.jenis_id::text, '-') || ' pps=' || coalesce(d.poin_per_satuan::text, '-') || ' pt=' || d.perlu_tinjau || ' langkah=' ||
         (select count(*) from keu_dlg_langkah where delegasi_id = d.id and aktif) || ';';

  -- templat berulang: bukan pemberi ditolak; pemberi menyimpan; jalan idempoten; pekan depan membuat lagi
  begin perform keu_dlg_rutin_simpan(jsonb_build_object('judul', 'UJI rutin', 'kelompok', 'TIM-KESRA', 'jenis_id', v_doc, 'jumlah', 3, 'frekuensi', 'mingguan',
        'hari', extract(isodow from v_hari)::int, 'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'))), 357); o := o || 'SALAH_rutin357;'; exception when others then o := o || 'rutin357_ditolak;'; end;
  r := keu_dlg_rutin_simpan(jsonb_build_object('judul', 'UJI rutin mingguan', 'kelompok', 'TIM-KESRA', 'jenis_id', v_doc, 'jumlah', 3, 'frekuensi', 'mingguan',
        'hari', extract(isodow from v_hari)::int, 'durasi_hari', 5, 'mulai_berlaku', v_hari::text,
        'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai'), jsonb_build_object('akun', 160, 'peran', 'pegawai'))), 354);
  v_rut := (r ->> 'id')::bigint;
  r := keu_dlg_rutin_jalan(v_hari); o := o || 'rutin1 dibuat=' || (r ->> 'dibuat') || ' ada=' || (r ->> 'sudah_ada') || ' gagal=' || (r ->> 'gagal') || ' ' || (r ->> 'galat') || ';';
  r := keu_dlg_rutin_jalan(v_hari); o := o || 'rutin2 dibuat=' || (r ->> 'dibuat') || ' ada=' || (r ->> 'sudah_ada') || ';';
  r := keu_dlg_rutin_jalan(v_hari + 7); o := o || 'rutin3 dibuat=' || (r ->> 'dibuat') || ' gagal=' || (r ->> 'gagal') || ';';
  r := keu_dlg_rutin_jalan(v_hari + 1); o := o || 'rutin4_hari_lain dibuat=' || (r ->> 'dibuat') || ';';
  select * into d from keu_dlg_delegasi where rutin_id = v_rut order by id limit 1;
  o := o || 'rutin_delegasi tt=' || d.target_total || ' sat=' || d.satuan || ' tenggat=' || (d.tenggat - d.mulai) || ' ph=' || d.perlu_hasil || ';';
  r := keu_dlg_bahan(null, 'TIM-KESRA', 354); o := o || 'bahan rutin=' || jsonb_array_length(r -> 'rutin') || ';';
  perform keu_dlg_rutin_simpan(jsonb_build_object('id', v_rut, 'aktif', false), 354);
  r := keu_dlg_rutin_jalan(v_hari + 14); o := o || 'rutin_nonaktif dibuat=' || (r ->> 'dibuat') || ';';

  -- pengingat 18:00 tetap jalan
  r := keu_dlg_pengingat(v_hari + 1); o := o || 'pengingat18 dikirim=' || (r ->> 'dikirim') || coalesce(' ' || (r ->> 'alasan'), '') || ';';

  -- izin gerbang
  o := o || 'gerbang_hasil_serah=' || (select position('''keu_dlg_hasil_serah''' in pg_get_functiondef(p.oid)) > 0 from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace) || ';';
  o := o || 'notif_check=' || (select (pg_get_constraintdef(oid) like '%delegasi_tenggat%' and pg_get_constraintdef(oid) like '%delegasi_pengingat%' and pg_get_constraintdef(oid) like '%gap_keras%') from pg_constraint
                                where conrelid = 'public.keu_notifikasi'::regclass and conname = 'keu_notifikasi_jenis_check') || ';';
  raise exception 'HASIL=%', o;
end $$;
