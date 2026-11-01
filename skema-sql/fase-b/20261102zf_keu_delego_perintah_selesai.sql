-- 20261102zf_keu_delego_perintah_selesai.sql
-- Delego, tahap 4 (2 Nov 2026). Dijalankan SETELAH zb, zc, zd. Idempoten.
-- keu_dlg_perintah_selesai: satu ketukan "Sudah dilaksanakan" untuk perintah langsung berpenutupan ringan (rapat, koordinasi, urusan kecil).
-- Membuat laporan otomatis (jumlah sesuai perintah; berpenutupan ringan sehingga langsung diakui tanpa tinjau) lalu menutup butir (status selesai).
-- Boleh dilakukan penerima, pemberi, atau pemutus. Perintah yang jadwalnya belum tiba ditolak. Perintah berpenutupan tinjau tetap lewat Lapor harian.
create or replace function keu_dlg_perintah_selesai(p_id bigint, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d keu_dlg_delegasi; v_hari date := keu_dlg_hari_ini(); v_tgl date; v_jml numeric; v_cat text := left(btrim(coalesce(p_catatan, '')), 500); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if p_akun <> d.penerima_akun and p_akun is distinct from d.dibuat_oleh and not keu_dlg_putus_ok(p_akun) then
    raise exception 'Hanya penerima, pemberi, atau Kepala yang menandai perintah ini selesai' using errcode = '42501';
  end if;
  if d.kelas <> 'perintah' or d.mode_tutup <> 'ringan' then
    raise exception 'Hanya perintah langsung berpenutupan ringan yang ditandai selesai dengan satu ketukan; gunakan Lapor harian' using errcode = '23514';
  end if;
  if d.status not in ('baru', 'berjalan') then raise exception 'Perintah ini berstatus %, bukan yang sedang berjalan', d.status using errcode = '23514'; end if;
  if v_hari < d.mulai then raise exception 'Perintah ini dijadwalkan %; belum dapat ditandai selesai', d.mulai using errcode = '23514'; end if;
  v_tgl := least(v_hari, d.tenggat);
  if d.poin_per_satuan is null or d.poin_per_satuan <= 0 then raise exception 'Perintah ini tidak berjenis katalog; gunakan Lapor harian' using errcode = '23514'; end if;
  v_jml := round(d.target_total / d.poin_per_satuan, 4);
  r := keu_dlg_lapor_jumlah(d.id, v_tgl, v_jml, case when v_cat = '' then 'Sudah dilaksanakan.' else v_cat end, '', '[]'::jsonb, p_akun);
  perform set_config('keu.via_fungsi', '1', true);
  update keu_dlg_delegasi set status = 'selesai', diubah_at = now() where id = d.id and status in ('baru', 'berjalan');
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('id', d.id, 'laporan', r, 'status', 'selesai');
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'keu_dlg_perintah_selesai'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

do $$
declare d text; v_baru text := '''keu_dlg_perintah_selesai'',';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_dlg_perintah_selesai''' in d) = 0 then
    d := replace(d, '''keu_dlg_tinjau_bahan'',', '''keu_dlg_tinjau_bahan'',' || v_baru);
    if position('''keu_dlg_perintah_selesai''' in d) = 0 then raise exception 'Penambahan izin gagal: jalankan 20261101zb dulu'; end if;
    execute d;
  end if;
end $$;
