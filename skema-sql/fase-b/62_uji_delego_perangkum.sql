-- 62_uji_delego_perangkum.sql -- uji dry-run (rollback otomatis) untuk 20261101zb. Jalankan SETELAH berkas zb dalam satu eksekusi; hasil ada di pesan galat "HASIL=...".
-- Memakai akun 354 (Ketua Tim dan KPA), 357 (bukan pemberi), 464 dan 160 (pegawai) serta kegiatan SIGAP 6 (Seruti). Semua data uji ikut dibatalkan.
do $uji$
declare
  o text := ''; r jsonb; v_hari date := keu_dlg_hari_ini(); v_id bigint; v_lap bigint; v_sg bigint; n int; d keu_dlg_delegasi; l keu_dlg_laporan; s keu_dlg_sanggah; v_jenis bigint; v_sk bigint;
begin
  -- seperti gerbang keu_jalankan: akun sesi terisi sehingga penjaga tabel (keu_ident_jaga) aktif dan fungsi harus memasang bendera sendiri
  perform set_config('app.akun_id', '354', true);
  r := keu_dlg_katalog_skor(354);
  o := o || 'katalog jenis=' || jsonb_array_length(r -> 'jenis') || ' keg=' || jsonb_array_length(r -> 'kegiatan') || ' kel=' || jsonb_array_length(r -> 'kelompok') || ' putus=' || (r ->> 'boleh_putus') || ';';
  select id into v_jenis from keu_dlg_jenis where kode = 'periksa_dokumen';

  -- usulan: kegiatan salah ditolak; skor ekstrem tanpa alasan ditolak; usulan sah berstatus usulan
  begin perform keu_dlg_usul(jsonb_build_object('judul', 'UJI keg salah', 'kegiatan_id', 999999, 'satuan', 'dokumen', 'volume', 2, 'poin_per_satuan', 9, 'tenggat', (v_hari + 4)::text), 464);
    o := o || 'SALAH_keg;'; exception when others then o := o || 'keg_salah_ditolak;'; end;
  begin perform keu_dlg_usul(jsonb_build_object('judul', 'UJI skor ekstrem', 'kegiatan_id', 6, 'satuan', 'dokumen', 'volume', 2, 'poin_per_satuan', 90, 'tenggat', (v_hari + 4)::text), 464);
    o := o || 'SALAH_skor;'; exception when others then o := o || 'skor_ekstrem_ditolak;'; end;
  r := keu_dlg_usul(jsonb_build_object('judul', 'UJI usul pegawai', 'kegiatan_id', 6, 'satuan', 'dokumen', 'volume', 2, 'poin_per_satuan', 9, 'tenggat', (v_hari + 4)::text), 464);
  v_id := (r ->> 'id')::bigint;
  select * into d from keu_dlg_delegasi where id = v_id;
  o := o || 'usul status=' || d.status || ' ro=' || d.ro_kode || ' total=' || d.target_total || ' th=' || d.target_harian || ' keg=' || coalesce(d.kegiatan_id::text, 'null') || ' pembanding=' || (r ->> 'pembanding') || ';';

  -- putusan usulan
  begin perform keu_dlg_usul_putus(v_id, 'setuju', null, '', 357); o := o || 'SALAH_putus357;'; exception when others then o := o || 'putus357_ditolak;'; end;
  begin perform keu_dlg_usul_putus(v_id, 'setuju', null, '', 464); o := o || 'SALAH_putus464;'; exception when others then o := o || 'putus464_ditolak;'; end;
  begin perform keu_dlg_usul_putus(v_id, 'setuju', '{"poin_per_satuan":10}'::jsonb, '', 354); o := o || 'SALAH_skor_tanpa_alasan;'; exception when others then o := o || 'skor_tanpa_alasan_ditolak;'; end;
  r := keu_dlg_tinjau_bahan(354);
  o := o || 'bahan354 usulan=' || jsonb_array_length(r -> 'usulan') || ' pemutus=' || (r ->> 'pemutus') || ';';
  perform keu_dlg_usul_putus(v_id, 'setuju', '{"volume":3}'::jsonb, 'volume disesuaikan', 354);
  select * into d from keu_dlg_delegasi where id = v_id;
  o := o || 'putus status=' || d.status || ' pemberi=' || d.dibuat_oleh || ' total=' || d.target_total || ' usulan_oleh=' || d.usulan_oleh || ';';

  -- laporan, tinjau (tolak, kirim ulang, sanggah), jawab, putus
  perform keu_dlg_lapor_jumlah(v_id, v_hari, 1, 'uji satu', '', '[]'::jsonb, 464);
  select * into l from keu_dlg_laporan where delegasi_id = v_id; v_lap := l.id;
  o := o || 'lapor status=' || l.tinjau_status || ' poin=' || l.poin || ';';
  begin perform keu_dlg_tinjau(v_lap, 'setuju', '', '[]'::jsonb, 357); o := o || 'SALAH_tinjau357;'; exception when others then o := o || 'tinjau357_ditolak;'; end;
  begin perform keu_dlg_tinjau(v_lap, 'setuju', '', '[]'::jsonb, 464); o := o || 'SALAH_tinjau_sendiri;'; exception when others then o := o || 'tinjau_sendiri_ditolak;'; end;
  begin perform keu_dlg_tinjau(v_lap, 'tolak', 'x', '[]'::jsonb, 354); o := o || 'SALAH_tolak_pendek;'; exception when others then o := o || 'tolak_pendek_ditolak;'; end;
  perform keu_dlg_tinjau(v_lap, 'tolak', 'lampiran belum ada', '[]'::jsonb, 354);
  select * into l from keu_dlg_laporan where id = v_lap; o := o || 'tolak status=' || l.tinjau_status || ';';
  perform keu_dlg_lapor_jumlah(v_id, v_hari, 1, 'uji satu revisi', '', '[]'::jsonb, 464);
  select * into l from keu_dlg_laporan where id = v_lap; o := o || 'kirim_ulang status=' || l.tinjau_status || ';';
  begin perform keu_dlg_tinjau(v_lap, 'sanggah', 'terlalu pendek', '[]'::jsonb, 354); o := o || 'SALAH_sanggah_pendek;'; exception when others then o := o || 'sanggah_pendek_ditolak;'; end;
  r := keu_dlg_tinjau(v_lap, 'sanggah', 'Dokumen belum diterima PML pada tanggal laporan dan daftar periksa belum bertanda tangan', '[]'::jsonb, 354);
  v_sg := (r ->> 'sanggah')::bigint;
  select * into l from keu_dlg_laporan where id = v_lap; select * into s from keu_dlg_sanggah where id = v_sg;
  o := o || 'sanggah lap=' || l.tinjau_status || ' sg=' || s.status || ' batas>hari=' || (s.batas_jawab > v_hari) || ';';
  begin perform keu_dlg_lapor_jumlah(v_id, v_hari, 2, 'ubah saat sanggah', '', '[]'::jsonb, 464); o := o || 'SALAH_ubah_saat_sanggah;'; exception when others then o := o || 'ubah_saat_sanggah_ditolak;'; end;
  begin perform keu_dlg_sanggah_jawab(v_sg, 'Sudah saya serahkan ke PML Senin sore', '[]'::jsonb, 160); o := o || 'SALAH_jawab160;'; exception when others then o := o || 'jawab160_ditolak;'; end;
  begin perform keu_dlg_sanggah_jawab(v_sg, 'pendek', '[]'::jsonb, 464); o := o || 'SALAH_jawab_pendek;'; exception when others then o := o || 'jawab_pendek_ditolak;'; end;
  begin perform keu_dlg_sanggah_putus(v_sg, 'benar', null, 'catatan putusan cukup panjang', false, 354); o := o || 'SALAH_putus_sebelum_jawab;'; exception when others then o := o || 'putus_sebelum_jawab_ditolak;'; end;
  perform keu_dlg_sanggah_jawab(v_sg, 'Sudah saya serahkan ke PML Senin sore, tanda terima terlampir', '[]'::jsonb, 464);
  select * into s from keu_dlg_sanggah where id = v_sg; o := o || 'jawab sg=' || s.status || ';';
  begin perform keu_dlg_sanggah_putus(v_sg, 'benar', null, 'catatan putusan cukup panjang', false, 357); o := o || 'SALAH_putus357b;'; exception when others then o := o || 'putus357b_ditolak;'; end;
  begin perform keu_dlg_sanggah_putus(v_sg, 'sebagian', null, 'catatan putusan cukup panjang', false, 354); o := o || 'SALAH_sebagian_tanpa_poin;'; exception when others then o := o || 'sebagian_tanpa_poin_ditolak;'; end;
  begin perform keu_dlg_sanggah_putus(v_sg, 'sebagian', 9, 'catatan putusan cukup panjang', false, 354); o := o || 'SALAH_sebagian_penuh;'; exception when others then o := o || 'sebagian_penuh_ditolak;'; end;
  select count(*) into n from keu_dlg_pembinaan where delegasi_id = v_id;
  perform keu_dlg_sanggah_putus(v_sg, 'sebagian', 4, 'Dua dokumen terbukti diterima, dua lainnya baru lengkap kemudian', true, 354);
  select * into l from keu_dlg_laporan where id = v_lap; select * into s from keu_dlg_sanggah where id = v_sg;
  o := o || 'putusan lap=' || l.tinjau_status || ' diakui=' || l.poin_diakui || ' sg=' || s.status || ' putusan=' || s.putusan || ' bina+=' || ((select count(*) from keu_dlg_pembinaan where delegasi_id = v_id) - n) || ';';

  begin perform keu_dlg_menit_nyata(v_lap, 30, 160); o := o || 'SALAH_menit160;'; exception when others then o := o || 'menit160_ditolak;'; end;
  perform keu_dlg_menit_nyata(v_lap, 30, 464);
  select * into l from keu_dlg_laporan where id = v_lap; o := o || 'menit=' || l.menit_nyata || ' status_tetap=' || l.tinjau_status || ';';

  -- monitor dan bahan
  r := keu_dlg_monitor(v_hari - 3, v_hari, 354);
  o := o || 'monitor capaian=' || jsonb_array_length(r -> 'capaian') || ' peninjau=' || jsonb_array_length(r -> 'peninjau') || ' sanggah=' || jsonb_array_length(r -> 'sanggah')
        || ' cap464=' || coalesce((select (c ->> 'terverifikasi') || '/' || (c ->> 'mandiri') || '/' || (c ->> 'dikoreksi') from jsonb_array_elements(r -> 'capaian') c where (c ->> 'akun')::bigint = 464), 'tidak_ada') || ';';
  r := keu_dlg_tinjau_bahan(464);
  o := o || 'bahan464 sanggah=' || jsonb_array_length(r -> 'sanggah') || ' lap_saya=' || jsonb_array_length(r -> 'saya' -> 'laporan') || ' antrean=' || jsonb_array_length(r -> 'antrean') || ';';

  -- terhalang
  begin perform keu_dlg_terhalang(v_id, 'PBJ', 357); o := o || 'SALAH_terhalang357;'; exception when others then o := o || 'terhalang357_ditolak;'; end;
  perform keu_dlg_terhalang(v_id, 'Menunggu PBJ', 464);
  select * into d from keu_dlg_delegasi where id = v_id; o := o || 'terhalang=' || coalesce(d.terhalang_oleh, 'null') || ';';
  perform keu_dlg_terhalang(v_id, '', 464);
  select * into d from keu_dlg_delegasi where id = v_id; o := o || 'terhalang_hapus=' || coalesce(d.terhalang_oleh, 'null') || ';';

  -- usulan ditolak
  r := keu_dlg_usul(jsonb_build_object('judul', 'UJI usul ditolak', 'kegiatan_id', 6, 'satuan', 'dokumen', 'volume', 1, 'poin_per_satuan', 9, 'tenggat', (v_hari + 3)::text), 160);
  begin perform keu_dlg_usul_putus((r ->> 'id')::bigint, 'tolak', null, '', 354); o := o || 'SALAH_tolak_tanpa_alasan;'; exception when others then o := o || 'tolak_tanpa_alasan_ditolak;'; end;
  perform keu_dlg_usul_putus((r ->> 'id')::bigint, 'tolak', null, 'bukan prioritas kegiatan ini', 354);
  select * into d from keu_dlg_delegasi where id = (r ->> 'id')::bigint; o := o || 'ditolak status=' || d.status || ';';

  -- katalog skor
  begin perform keu_dlg_skor_ajukan('{"nama":"UJI skor dokumen","satuan":"dokumen","poin_per_satuan":90}'::jsonb, 357); o := o || 'SALAH_skor_tanpa_alasan2;'; exception when others then o := o || 'skor_ekstrem2_ditolak;'; end;
  r := keu_dlg_skor_ajukan('{"nama":"UJI skor dokumen","satuan":"dokumen","poin_per_satuan":90,"skor_alasan":"Tiap dokumen memuat 400 butir bukti","kertas_kerja":{"jenis":"dokumen","h":24}}'::jsonb, 357);
  v_sk := (r ->> 'id')::bigint; o := o || 'skor_ajukan peringatan=' || (r ->> 'peringatan') || ' rasio=' || (r ->> 'rasio') || ';';
  begin perform keu_dlg_skor_putus(v_sk, 'setuju', null, '', 357); o := o || 'SALAH_skor_putus357;'; exception when others then o := o || 'skor_putus357_ditolak;'; end;
  begin perform keu_dlg_skor_putus(v_sk, 'setuju', 12, '', 354); o := o || 'SALAH_skor_ubah_tanpa_alasan;'; exception when others then o := o || 'skor_ubah_tanpa_alasan_ditolak;'; end;
  perform keu_dlg_skor_putus(v_sk, 'setuju', 12, 'disesuaikan dengan pembanding', 354);
  select count(*) into n from keu_dlg_jenis where id = v_sk and aktif and skor_status = 'disetujui' and poin_per_satuan = 12; o := o || 'skor_setuju=' || n || ';';

  -- ketersediaan dan rekap
  r := keu_dlg_ketersediaan_catat(jsonb_build_object('jenis', 'cuti', 'mulai', v_hari::text, 'selesai', (v_hari + 2)::text), 464);
  o := o || 'cuti status=' || (r ->> 'status') || ';';
  begin perform keu_dlg_ketersediaan_putus((r ->> 'id')::bigint, 'setuju', 357); o := o || 'SALAH_cuti357;'; exception when others then o := o || 'cuti357_ditolak;'; end;
  perform keu_dlg_ketersediaan_putus((r ->> 'id')::bigint, 'setuju', 354);
  r := keu_dlg_rekap(v_hari, v_hari + 6, 354);
  o := o || 'rekap orang=' || jsonb_array_length(r -> 'orang') || ' lapangan=' || jsonb_array_length(r -> 'lapangan') || ' cuti=' || jsonb_array_length(r -> 'ketersediaan') || ';';
  begin perform keu_dlg_rekap(v_hari, v_hari + 6, 357); o := o || 'rekap357_ok;'; exception when others then o := o || 'rekap357_ditolak;'; end;
  r := keu_dlg_rekap('2026-11-09', '2026-11-13', 354);
  o := o || 'rekap_pekan9 lapangan=' || jsonb_array_length(r -> 'lapangan') || ' jenis=' || coalesce((select string_agg(distinct x ->> 'jenis', ',') from jsonb_array_elements(r -> 'lapangan') x), '') || ';';
  select count(*) into n from keu_dlg_ketua_ro('2906.BMA.006'); o := o || 'ketua_ro2906=' || n || ';';
  select count(*) into n from keu_dlg_pemutus(); o := o || 'pemutus=' || n || ';';
  select count(*) into n from keu_notifikasi where jenis like 'delegasi\_%' and dibuat_at > now() - interval '1 minute'; o := o || 'notif_baru=' || n || ';';

  raise exception 'HASIL=%', o;
end $uji$;
