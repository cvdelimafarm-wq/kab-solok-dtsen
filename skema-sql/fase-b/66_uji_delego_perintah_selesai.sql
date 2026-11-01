-- 66_uji_delego_perintah_selesai.sql -- uji dry-run (rollback otomatis) untuk 20261102zf. Aman di produksi. Hasil di pesan galat "HASIL=...".
do $uji$
declare o text := ''; r jsonb; v_hari date := keu_dlg_hari_ini(); v_jenis bigint; v_id bigint; v_id2 bigint; d keu_dlg_delegasi; l keu_dlg_laporan; k text;
begin
  perform set_config('app.akun_id', '354', true);
  select id into v_jenis from keu_dlg_jenis where nama ilike 'Rapat%' and aktif limit 1;
  select kode into k from keu_dlg_kelompok where aktif order by urut limit 1;
  r := keu_dlg_buat(jsonb_build_object('kelompok', k, 'judul', 'UJI perintah selesai', 'bobot', 1, 'mulai', v_hari, 'tenggat', v_hari, 'hari_kerja', jsonb_build_array(extract(isodow from v_hari)::int),
        'jenis_id', v_jenis, 'jumlah', 1, 'perlu_hasil', false, 'perlu_tinjau', false, 'langkah', '[]'::jsonb,
        'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai', 'pj_bidang', ''))), 354);
  v_id := (r -> 'dibuat' ->> 0)::bigint;
  -- belum diatur sebagai perintah ringan: ditolak
  begin perform keu_dlg_perintah_selesai(v_id, '', 464); o := o || 'SALAH_bukan_perintah;'; exception when others then o := o || 'bukan_perintah_ditolak;'; end;
  perform keu_dlg_atur_urusan(v_id, jsonb_build_object('kelas', 'perintah', 'mode_tutup', 'ringan'), 354);
  begin perform keu_dlg_perintah_selesai(v_id, '', 160); o := o || 'SALAH_orang_lain;'; exception when others then o := o || 'orang_lain_ditolak;'; end;
  r := keu_dlg_perintah_selesai(v_id, '', 464);
  select * into d from keu_dlg_delegasi where id = v_id;
  select * into l from keu_dlg_laporan where delegasi_id = v_id;
  o := o || 'selesai status=' || d.status || ' lap_status=' || l.tinjau_status || ' poin=' || l.poin || ' jumlah=' || l.jumlah || ';';
  begin perform keu_dlg_perintah_selesai(v_id, '', 464); o := o || 'SALAH_dua_kali;'; exception when others then o := o || 'dua_kali_ditolak;'; end;
  -- jadwal belum tiba
  r := keu_dlg_buat(jsonb_build_object('kelompok', k, 'judul', 'UJI perintah besok', 'bobot', 1, 'mulai', v_hari + 3, 'tenggat', v_hari + 3, 'hari_kerja', jsonb_build_array(extract(isodow from v_hari + 3)::int),
        'jenis_id', v_jenis, 'jumlah', 1, 'perlu_hasil', false, 'perlu_tinjau', false, 'langkah', '[]'::jsonb,
        'penerima', jsonb_build_array(jsonb_build_object('akun', 464, 'peran', 'pegawai', 'pj_bidang', ''))), 354);
  v_id2 := (r -> 'dibuat' ->> 0)::bigint;
  perform keu_dlg_atur_urusan(v_id2, jsonb_build_object('kelas', 'perintah', 'mode_tutup', 'ringan'), 354);
  begin perform keu_dlg_perintah_selesai(v_id2, '', 464); o := o || 'SALAH_belum_tiba;'; exception when others then o := o || 'belum_tiba_ditolak;'; end;
  raise exception 'HASIL=%', o;
end $uji$;
