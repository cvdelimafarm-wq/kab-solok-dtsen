-- =====================================================================
-- 69_uji_qc_tunda.sql - uji "Tunda 2 jam" QC Pemahaman. Jalankan SETELAH 20261028b_sigap_qc_tunda.sql, dalam satu transaksi; diakhiri galat
-- sengaja sehingga SEMUA dibatalkan (hasil uji dibawa dalam pesan galat "HASIL_UJI: {...}"). Tidak ada data tersimpan, termasuk perubahan
-- pengaturan sementara di dalam uji. Memakai petugas yang BELUM mengisi hari ini, supaya jawaban asli tidak tersentuh.
-- =====================================================================
do $uji$
declare
  v_keg bigint; h jsonb := '{}'::jsonb; v_a bigint; v_b bigint; v_c bigint; st jsonb; r jsonb; r2 jsonb; so jsonb; jaw jsonb; v_tgl date; v_wib timestamp;
begin
  select id into v_keg from sigap_kegiatan where kode = 'pascabencana_2026';
  update sigap_qc_pengaturan set aktif = true, rilis_jam = '00:00', batas_jam = '23:59', mulai = null, akhir = null where kegiatan_id = v_keg;
  v_wib := now() at time zone 'Asia/Jakarta';
  v_tgl := v_wib::date;
  h := h || jsonb_build_object('hari_uji', v_tgl, 'jam_wib', to_char(v_wib, 'HH24:MI'));

  select q.akun_id into v_a from sigap_qc_peserta(v_keg) q where q.peran = 'ppl'
     and not exists (select 1 from sigap_qc_percobaan c where c.kegiatan_id = v_keg and c.tanggal = v_tgl and c.akun_id = q.akun_id) order by q.akun_id limit 1;
  select q.akun_id into v_b from sigap_qc_peserta(v_keg) q where q.peran = 'ppl' and q.akun_id <> v_a
     and not exists (select 1 from sigap_qc_percobaan c where c.kegiatan_id = v_keg and c.tanggal = v_tgl and c.akun_id = q.akun_id) order by q.akun_id limit 1;
  select q.akun_id into v_c from sigap_qc_peserta(v_keg) q where q.peran = 'ppl' and q.akun_id not in (v_a, v_b)
     and not exists (select 1 from sigap_qc_percobaan c where c.kegiatan_id = v_keg and c.tanggal = v_tgl and c.akun_id = q.akun_id) order by q.akun_id limit 1;
  h := h || jsonb_build_object('petugas_uji_tersedia', jsonb_build_array(v_a is not null, v_b is not null, v_c is not null));

  -- 1. tunda biasa (via notifikasi)
  r := sigap_qc_tunda(v_a, 120, 'notifikasi');
  h := h || jsonb_build_object('tunda1', jsonb_build_object('ke', r -> 'ke', 'ulang', r -> 'ulang', 'sampai_batas', r -> 'sampai_batas',
        'menit_ke_depan', round(extract(epoch from ((r ->> 'sampai')::timestamptz - now())) / 60)));
  -- 2. tekan ganda < 60 dtk: tunda yang sama
  r2 := sigap_qc_tunda(v_a, 120, 'modal');
  h := h || jsonb_build_object('tunda_ganda', jsonb_build_object('ke', r2 -> 'ke', 'ulang', r2 -> 'ulang', 'sama', (r2 ->> 'sampai') = (r ->> 'sampai')));
  -- 3. daftar tunda aktif
  h := h || jsonb_build_object('tunda_aktif', (select jsonb_agg(jsonb_build_object('ke', t.ke, 'akun_cocok', t.akun_id = v_a)) from sigap_qc_tunda_aktif(v_keg, v_tgl) t where t.akun_id = v_a));
  -- 4. tunda ke-2 sesudah ketukan lama (geser dibuat_at ke belakang agar tidak dianggap ketukan ganda)
  update sigap_qc_tunda set dibuat_at = now() - interval '5 minutes' where kegiatan_id = v_keg and tanggal = v_tgl and akun_id = v_a;
  r2 := sigap_qc_tunda(v_a, 120, 'modal');
  h := h || jsonb_build_object('tunda2', jsonb_build_object('ke', r2 -> 'ke', 'ulang', r2 -> 'ulang'),
                               'tunda_aktif_terbaru_ke', (select ke from sigap_qc_tunda_aktif(v_keg, v_tgl) where akun_id = v_a));
  -- 5. validasi masukan
  begin perform sigap_qc_tunda(v_a, 10, 'modal'); h := h || jsonb_build_object('tolak_10_menit', false);
  exception when others then h := h || jsonb_build_object('tolak_10_menit', sqlerrm); end;
  begin perform sigap_qc_tunda(v_a, 120, 'lain'); h := h || jsonb_build_object('tolak_via', false);
  exception when others then h := h || jsonb_build_object('tolak_via', sqlerrm); end;

  -- 6. tunda dipotong di jam batas (hanya bila belum lewat pukul 22.00 WIB, agar batas +30 menit tidak melewati tengah malam)
  if v_b is not null and v_wib::time < time '22:00' then
    update sigap_qc_pengaturan set batas_jam = (v_wib + interval '30 minutes')::time where kegiatan_id = v_keg;
    r := sigap_qc_tunda(v_b, 120, 'modal');
    h := h || jsonb_build_object('tunda_dipotong', jsonb_build_object('sampai_batas', r -> 'sampai_batas', 'menit_ke_depan', round(extract(epoch from ((r ->> 'sampai')::timestamptz - now())) / 60)));
    update sigap_qc_pengaturan set batas_jam = time '23:59' where kegiatan_id = v_keg;
  end if;

  -- 7. sudah 100 -> tidak boleh menunda lagi
  if v_c is not null then
    so := sigap_qc_soal_untuk(v_c);
    select jsonb_object_agg(s ->> 'id', k.kunci) into jaw from jsonb_array_elements(so -> 'soal') s join sigap_qc_soal k on k.id = s ->> 'id';
    r := sigap_qc_jawab(v_c, jaw);
    begin perform sigap_qc_tunda(v_c, 120, 'modal'); h := h || jsonb_build_object('tolak_setelah_100', false);
    exception when others then h := h || jsonb_build_object('tolak_setelah_100', sqlerrm); end;
  end if;

  -- 8. hak eksekusi dan tabel
  h := h || jsonb_build_object('anon_boleh_tunda', has_function_privilege('anon', 'public.sigap_qc_tunda(bigint,integer,text)', 'execute'),
                               'service_boleh_tunda', has_function_privilege('service_role', 'public.sigap_qc_tunda(bigint,integer,text)', 'execute'),
                               'anon_boleh_aktif', has_function_privilege('anon', 'public.sigap_qc_tunda_aktif(bigint,date)', 'execute'),
                               'anon_boleh_tabel', has_table_privilege('anon', 'public.sigap_qc_tunda', 'select'));
  raise exception 'HASIL_UJI: %', h::text;
end $uji$;
