-- 20261102zd_keu_delego_pengingat_tinjau.sql
-- Delego perangkum, tahap 3 (2 Nov 2026). Dijalankan SETELAH zb dan zc. Idempoten.
--   1. keu_dlg_pengingat_tinjau: ringkasan harian (hari kerja, 08:00 WIB) bagi yang menahan alur:
--        - Ketua Tim: laporan menunggu tinjau lebih dari 3 hari kerja; usulan pegawai menunggu lebih dari 3 hari kerja
--        - Kepala: sanggahan yang batas jawab pegawainya sudah lewat atau sudah menunggu putusan
--      Satu notifikasi per orang per jenis per hari (bukan per butir), supaya tidak membanjiri.
--   2. keu_dlg_sinkron_cron: pembungkus keu_dlg_sinkron untuk dijalankan terjadwal (memakai akun pemutus pertama). Penjadwalannya DIKOMENTARI di bawah;
--      aktifkan setelah hasil sinkron manual pertama diperiksa.
create or replace function keu_dlg_pengingat_tinjau()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); r record; n_lap int := 0; n_usul int := 0; n_sg int := 0;
begin
  if keu_dlg_hitung_hk(v_hari, v_hari, array[1,2,3,4,5]::smallint[]) < 1 then
    return jsonb_build_object('dilewati', 'bukan hari kerja');
  end if;
  for r in
    select d.dibuat_oleh as akun, count(*) as n
      from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id
     where l.tinjau_status = 'menunggu' and d.dibuat_oleh is not null and keu_dlg_hk_lewat((l.dikirim_at at time zone 'Asia/Jakarta')::date, v_hari) > 3
     group by d.dibuat_oleh
  loop
    perform keu_dlg_notif2(r.akun, 'delegasi_laporan_tinjau', r.n || ' laporan menunggu tinjau lebih dari 3 hari kerja', 'Setujui, minta revisi, atau sanggah agar pegawai mendapat kepastian.', '/sigap/delego/tinjau', null);
    n_lap := n_lap + 1;
  end loop;
  for r in
    select w as akun, count(*) as n
      from keu_dlg_delegasi d cross join lateral keu_dlg_ketua_ro(d.ro_kode) w
     where d.status = 'usulan' and keu_dlg_hk_lewat((d.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) > 3
     group by w
  loop
    perform keu_dlg_notif2(r.akun, 'delegasi_usulan', r.n || ' usulan pekerjaan pegawai menunggu lebih dari 3 hari kerja', 'Setujui atau tolak supaya pekerjaan pegawai tercatat jelas.', '/sigap/delego/tinjau', null);
    n_usul := n_usul + 1;
  end loop;
  for r in
    select w as akun,
           count(*) filter (where s.status = 'menunggu_jawab' and s.batas_jawab < v_hari) as lewat,
           count(*) filter (where s.status = 'menunggu_putusan') as putusan
      from keu_dlg_sanggah s cross join lateral keu_dlg_pemutus() w
     where s.status <> 'diputus'
     group by w
  loop
    if r.lewat + r.putusan > 0 then
      perform keu_dlg_notif2(r.akun, 'delegasi_sanggah', (r.lewat + r.putusan) || ' sanggahan siap diputuskan', r.putusan || ' sudah dijawab pegawai, ' || r.lewat || ' lewat batas jawab.', '/sigap/delego/monitor', null);
      n_sg := n_sg + 1;
    end if;
  end loop;
  return jsonb_build_object('peninjau_diingatkan', n_lap, 'usulan_diingatkan', n_usul, 'pemutus_diingatkan', n_sg);
end $$;

create or replace function keu_dlg_sinkron_cron()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_akun bigint;
begin
  select x into v_akun from keu_dlg_pemutus() x order by x limit 1;
  if v_akun is null then return jsonb_build_object('dilewati', 'tidak ada akun pemutus'); end if;
  return keu_dlg_sinkron(v_akun);
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('keu_dlg_pengingat_tinjau','keu_dlg_sinkron_cron')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- penjadwalan: ringkasan tinjau setiap hari kerja 08:00 WIB (01:00 UTC)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('delego-pengingat-tinjau-0800', '0 1 * * 1-5', 'select public.keu_dlg_pengingat_tinjau()');
    -- Sinkron otomatis harian 07:00 WIB: AKTIFKAN setelah hasil sinkron manual pertama diperiksa (hapus tanda komentar dua baris di bawah).
    -- perform cron.schedule('delego-sinkron-0700', '0 0 * * 1-5', 'select public.keu_dlg_sinkron_cron()');
  end if;
end $$;
