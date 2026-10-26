-- 59_uji_delego_lanjutan.sql -- uji dry-run (rollback otomatis) untuk 20261026g. Jalankan SETELAH berkas g dalam satu eksekusi; hasil ada di pesan galat "HASIL=...".
do $$
declare
  r jsonb; n int; v_hari date := keu_dlg_hari_ini(); o text := ''; e jsonb; v_ver int;
begin
  select count(*) into n from keu_dlg_libur; o := o || 'libur=' || n || ';';
  select count(*) into n from keu_dlg_libur where aktif and tanggal between '2026-10-26' and '2026-12-31'; o := o || 'libur_sisa2026=' || n || ';';
  r := keu_dlg_hak(354); o := o || 'hak_libur=' || jsonb_array_length(r -> 'libur') || ' bobot=' || (r -> 'bobot')::text || ';';

  perform keu_dlg_target_atur(5, v_hari + 3, 45, 'Uji fiktif target', 354);
  r := keu_dlg_saya(357);
  select x into e from jsonb_array_elements(r -> 'delegasi') x where (x ->> 'id')::int = 5;
  o := o || 'saya5 target=' || (e ->> 'target_harian') || ' riwayat=' || jsonb_array_length(e -> 'riwayat_target') || ' iv=' || coalesce(e ->> 'ident_ver', '-') || '/' || coalesce(e ->> 'ident_ver_kini', '-') || ';';
  o := o || 'pada+2=' || keu_dlg_target_pada(5, v_hari + 2) || ' pada+3=' || keu_dlg_target_pada(5, v_hari + 3) || ';';

  begin perform keu_dlg_target_atur(5, v_hari - 1, 10, 'alasan uji', 354); o := o || 'SALAH_surut;'; exception when others then o := o || 'surut_ditolak;'; end;
  begin perform keu_dlg_target_atur(5, v_hari + 1, 10, 'xx', 357); o := o || 'SALAH_bukan_pemberi;'; exception when others then o := o || 'bukan_pemberi_ditolak;'; end;

  r := keu_dlg_ubah(5, jsonb_build_object('target_harian', 30), 354); o := o || 'ubah_sama=' || (r ->> 'hasil') || ';';
  r := keu_dlg_ubah(5, jsonb_build_object('target_harian', 50), 354); o := o || 'ubah_50=' || (r ->> 'hasil') || ' pada0=' || keu_dlg_target_pada(5, v_hari) || ' pada+3=' || keu_dlg_target_pada(5, v_hari + 3) || ' pada+4=' || keu_dlg_target_pada(5, v_hari + 4) || ';';
  select count(*) into n from keu_dlg_target where delegasi_id = 5; o := o || 'riwayat5=' || n || ';';

  begin perform keu_dlg_bobot_atur('{"ketepatan":25,"capaian":25,"kualitas":25,"kepatuhan":26}'::jsonb, 354); o := o || 'SALAH_bobot;'; exception when others then o := o || 'bobot_101_ditolak;'; end;
  perform keu_dlg_bobot_atur('{"ketepatan":30,"capaian":30,"kualitas":20,"kepatuhan":20}'::jsonb, 354);
  o := o || 'bobot_baru=' || (keu_dlg_hak(354) -> 'bobot')::text || ';';

  begin perform keu_dlg_libur_atur('2026-12-31', 'Uji libur', 'lainnya', true, 357); o := o || 'SALAH_libur_357;'; exception when others then o := o || 'libur_357_ditolak;'; end;
  perform keu_dlg_libur_atur('2026-12-31', 'Uji libur fiktif', 'lainnya', true, 354);
  perform keu_dlg_libur_atur('2026-12-24', '', 'cuti_bersama', false, 354);
  select count(*) into n from keu_dlg_libur where tanggal = '2026-12-31' and aktif; o := o || 'libur_baru=' || n || ' ';
  select count(*) into n from keu_dlg_libur where tanggal = '2026-12-24' and not aktif; o := o || 'cuti_off=' || n || ';';

  select count(*) into n from keu_dlg_delegasi where ident_id is not null and ident_ver is null; o := o || 'ident_ver_null=' || n || ';';

  r := keu_dlg_pindah(5, 464, null, 354);
  select x into e from jsonb_array_elements(keu_dlg_saya(464) -> 'delegasi') x where (x ->> 'id')::bigint = (r ->> 'baru')::bigint;
  o := o || 'pindah status_lama=' || (r ->> 'status_lama') || ' baru_target=' || (e ->> 'target_harian') || ' iv=' || coalesce(e ->> 'ident_ver', '-') || ';';

  r := keu_dlg_buat(jsonb_build_object('ident_id', 1, 'judul', 'UJI buat dengan ident_ver', 'tenggat', (v_hari + 5)::text, 'penerima', jsonb_build_array(jsonb_build_object('akun', 160, 'peran', 'pegawai'))), 354);
  select ident_ver into v_ver from keu_dlg_delegasi where id = ((r -> 'dibuat' ->> 0)::bigint);
  o := o || 'buat_iv=' || coalesce(v_ver::text, '-') || ' ver_ident=' || (select ver from keu_ident where id = 1) || ';';
  perform keu_dlg_tinjau_ident(((r -> 'dibuat' ->> 0)::bigint), 354);

  r := keu_dlg_bahan(1, null, 354); o := o || 'bahan_n=' || jsonb_array_length(r -> 'delegasi') || ';';
  raise exception 'HASIL=%', o;
end $$;
