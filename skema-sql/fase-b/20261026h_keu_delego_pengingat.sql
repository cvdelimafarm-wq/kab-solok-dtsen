-- =====================================================================
-- 20261026h_keu_delego_pengingat.sql
-- SIGAP - Delego: pengingat laporan harian pukul 18:00 WIB. Bergantung pada 20261026g (libur, jenis notifikasi 'delegasi_pengingat'). Aman diulang.
--
-- keu_dlg_pengingat(p_hari): mengirim SATU notifikasi lonceng per akun per hari kepada penerima delegasi (baru/berjalan) yang hari ini adalah hari kerjanya,
-- masih dalam masa delegasi, dan BELUM mengirim laporan. Tidak dikirim pada tanggal libur aktif (keu_dlg_libur). Idempoten: panggilan kedua pada hari yang sama
-- tidak mengirim ulang. Tidak masuk daftar izin gerbang (hanya dijalankan penjadwal basis data).
--
-- Jadwal: pg_cron, setiap hari pukul 11:00 UTC = 18:00 WIB (hari kerja dan libur disaring oleh fungsi). Nama jadwal: delego-pengingat-1800.
-- Bila pg_cron tidak terpasang, bagian jadwal dilewati dengan peringatan; fungsi tetap dapat dipanggil manual.
-- =====================================================================

create or replace function keu_dlg_pengingat(p_hari date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hari date := coalesce(p_hari, keu_dlg_hari_ini()); v_dow int := extract(isodow from v_hari)::int; v_kirim int := 0; r record; v_isi text;
begin
  if exists (select 1 from keu_dlg_libur where tanggal = v_hari and aktif) then
    return jsonb_build_object('hari', v_hari, 'dikirim', 0, 'alasan', 'libur');
  end if;
  for r in
    select d.penerima_akun as akun, count(*) as n, string_agg(left(d.judul, 50), '; ' order by d.id) as daftar
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun and a.aktif
     where d.status in ('baru','berjalan') and v_hari between d.mulai and d.tenggat and v_dow = any (d.hari_kerja)
       and not exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id and l.tanggal = v_hari)
       and not exists (select 1 from keu_notifikasi x where x.akun_id = d.penerima_akun and x.jenis = 'delegasi_pengingat' and (x.dibuat_at at time zone 'Asia/Jakarta')::date = v_hari)
     group by d.penerima_akun
  loop
    v_isi := 'Batas lapor hari ini pukul 23:59 WIB. Belum dilaporkan: ' || left(r.daftar, 600) || '.';
    perform keu_dlg_notif(r.akun, 'delegasi_pengingat', null,
      case when r.n = 1 then 'Laporan harian belum dikirim' else r.n || ' laporan harian belum dikirim' end, v_isi, null);
    v_kirim := v_kirim + 1;
  end loop;
  return jsonb_build_object('hari', v_hari, 'dikirim', v_kirim);
end $$;

revoke execute on function keu_dlg_pengingat(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('delego-pengingat-1800', '0 11 * * *', 'select public.keu_dlg_pengingat()');
  else
    raise warning 'pg_cron belum terpasang: jadwal pengingat 18:00 tidak dibuat. Aktifkan ekstensi pg_cron lalu jalankan berkas ini lagi.';
  end if;
end $$;
