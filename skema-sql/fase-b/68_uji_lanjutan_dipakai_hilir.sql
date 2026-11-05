-- 68_uji_lanjutan_dipakai_hilir.sql -- uji dry-run (rollback otomatis) untuk 20261105a. Aman di produksi. Hasil di pesan galat "HASIL=...".
-- Memakai identifikasi 7 (RO 2906.BMA.006) dan akun 354; ubah angkanya bila datanya berbeda. Jalankan SESUDAH 20261105a.
do $uji$
declare o text := ''; r jsonb; l keu_ident_lanjutan; v_isi jsonb; v_ver0 int; v_ver1 int; v_n int; v_keg bigint; a record;
begin
  perform set_config('app.akun_id', '354', true);
  select * into l from keu_ident_lanjutan where ident_id = 7;
  v_ver0 := l.ver; v_isi := l.isi;
  select lanjutan_ver, lanjutan_ver_terbaru into a from keu_v_ident_acuan where ident_id = 7;
  o := o || 'awal acuan=' || a.lanjutan_ver || '/' || a.lanjutan_ver_terbaru || ' v0=' || v_ver0 || ';';

  -- 1. Simpan saja: versi baru tersimpan, hilir tetap di versi lama
  r := keu_lanjutan_simpan(7, jsonb_set(v_isi, '{wilayah}', to_jsonb('UJI hilir A'::text)), '', null, 354, false);
  select * into l from keu_ident_lanjutan where ident_id = 7;
  select lanjutan_ver, lanjutan_ver_terbaru, lanjutan_isi ->> 'wilayah' as w into a from keu_v_ident_acuan where ident_id = 7;
  select count(*) into v_n from keu_v_ident_petugas where ident_id = 7 and lanjutan_ver = v_ver0;
  o := o || 'simpan_saja ver=' || l.ver || ' ver_hilir=' || coalesce(l.ver_hilir::text, 'null') || ' acuan=' || a.lanjutan_ver || '/' || a.lanjutan_ver_terbaru
       || ' wil_hilir_sama=' || (a.w is not distinct from (v_isi ->> 'wilayah')) || ' petugas_hilir=' || v_n || ' hasil_ver_hilir=' || (r ->> 'ver_hilir') || ';';

  -- 2. Simpan saja lagi: penanda lama dipertahankan
  r := keu_lanjutan_simpan(7, jsonb_set(v_isi, '{wilayah}', to_jsonb('UJI hilir B'::text)), '', null, 354, false);
  select * into l from keu_ident_lanjutan where ident_id = 7;
  o := o || 'simpan_saja_2 ver=' || l.ver || ' ver_hilir=' || coalesce(l.ver_hilir::text, 'null') || ';';

  -- 3. Terapkan ke hilir: sesudah H-15 wajib beralasan
  begin perform keu_lanjutan_terapkan(7, 'pendek', 354); o := o || 'SALAH_tanpa_alasan;'; exception when others then o := o || 'tanpa_alasan_ditolak;'; end;
  r := keu_lanjutan_terapkan(7, 'Uji penerapan ke modul hilir', 354);
  select * into l from keu_ident_lanjutan where ident_id = 7;
  select lanjutan_ver, lanjutan_isi ->> 'wilayah' as w into a from keu_v_ident_acuan where ident_id = 7;
  o := o || 'terapkan ver_hilir=' || coalesce(l.ver_hilir::text, 'null') || ' acuan=' || a.lanjutan_ver || ' wil=' || a.w || ' berubah=' || (r ->> 'berubah') || ';';
  r := keu_lanjutan_terapkan(7, 'Uji penerapan ke modul hilir', 354);
  o := o || 'terapkan_ulang berubah=' || (r ->> 'berubah') || ';';

  -- 4. Simpan saja lalu simpan identik dengan terapkan: penanda dilepas tanpa versi baru
  perform keu_lanjutan_simpan(7, jsonb_set(v_isi, '{wilayah}', to_jsonb('UJI hilir C'::text)), '', null, 354, false);
  select * into l from keu_ident_lanjutan where ident_id = 7; v_ver1 := l.ver;
  r := keu_lanjutan_simpan(7, l.isi, 'Uji lepas penanda tanpa ubah isi', null, 354, true);
  select * into l from keu_ident_lanjutan where ident_id = 7;
  o := o || 'identik_terapkan ver=' || l.ver || ' sama=' || (l.ver = v_ver1) || ' ver_hilir=' || coalesce(l.ver_hilir::text, 'null') || ' berubah=' || (r ->> 'berubah') || ';';

  -- 5. Simpan biasa (bawaan): penanda tidak terbentuk
  perform keu_lanjutan_simpan(7, jsonb_set(v_isi, '{wilayah}', to_jsonb('UJI hilir D'::text)), '', null, 354);
  select * into l from keu_ident_lanjutan where ident_id = 7;
  o := o || 'biasa ver_hilir=' || coalesce(l.ver_hilir::text, 'null') || ';';

  -- 6. Riwayat versi tetap lengkap (append-only)
  select count(*) into v_n from keu_ident_lanjutan_versi where ident_id = 7 and ver > v_ver0;
  o := o || 'versi_baru=' || v_n || ';';

  -- 7. Fungsi hilir yang ditambal tetap berjalan, juga saat ada penanda
  perform keu_lanjutan_simpan(7, jsonb_set(v_isi, '{wilayah}', to_jsonb('UJI hilir E'::text)), '', null, 354, false);
  begin perform count(*) from keu_dlg_ketua_ro('2906.BMA.006'); o := o || 'ketua_ro_ok;'; exception when others then o := o || 'ketua_ro_GALAT=' || sqlerrm || ';'; end;
  begin r := keu_dlg_hak(354); o := o || 'dlg_hak_ok ' || jsonb_typeof(r) || ';'; exception when others then o := o || 'dlg_hak_GALAT=' || sqlerrm || ';'; end;
  begin r := keu_dlg_calon('2906.BMA.006', 7, '', 354); o := o || 'dlg_calon_ok lanjutan=' || jsonb_array_length(r -> 'lanjutan') || ';'; exception when others then o := o || 'dlg_calon_GALAT=' || sqlerrm || ';'; end;
  select kegiatan_id into v_keg from keu_ident_kegiatan where ident_id = 7 and dilepas_at is null limit 1;
  if v_keg is not null then
    begin r := keu_usulan_penugasan(7, v_keg, 354); o := o || 'usulan_ok n=' || jsonb_array_length(r) || ';'; exception when others then o := o || 'usulan_GALAT=' || sqlerrm || ';'; end;
  else o := o || 'usulan_dilewati_tanpa_kegiatan;'; end if;

  -- 8. Gerbang basis data (keu_jalankan) mengenal fungsi baru dan argumen p_terapkan
  begin r := keu_jalankan(354, 'keu_lanjutan_terapkan', jsonb_build_object('p_ident', 7, 'p_alasan', 'Uji lewat gerbang panggil')); o := o || 'gerbang_terapkan_ok berubah=' || (r ->> 'berubah') || ';';
  exception when others then o := o || 'gerbang_terapkan_GALAT=' || sqlerrm || ';'; end;
  begin r := keu_jalankan(354, 'keu_lanjutan_simpan', jsonb_build_object('p_ident', 7, 'p_isi', jsonb_set(v_isi, '{wilayah}', to_jsonb('UJI hilir F'::text)), 'p_terapkan', false));
    o := o || 'gerbang_simpan_saja_ok ver_hilir=' || (r ->> 'ver_hilir') || ';';
  exception when others then o := o || 'gerbang_simpan_GALAT=' || sqlerrm || ';'; end;
  -- 9. Isi berubah + terapkan + ada penanda + sesudah H-15: alasan wajib
  begin perform keu_lanjutan_simpan(7, jsonb_set(v_isi, '{wilayah}', to_jsonb('UJI hilir G'::text)), '', null, 354, true); o := o || 'SALAH_terapkan_tanpa_alasan;'; exception when others then o := o || 'terapkan_tanpa_alasan_ditolak;'; end;
  raise exception 'HASIL=%', o;
end $uji$;
