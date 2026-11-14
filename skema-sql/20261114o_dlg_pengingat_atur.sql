-- skema-sql/20261114o_dlg_pengingat_atur.sql
--
-- (14 Nov 2026, Fase 4d "Pengaturan pengingat") Satu halaman aturan pengingat dan eskalasi Delego.
--  * keu_dlg_eskalasi_setelan.ringkasan_pagi (bawaan MATI, menunggu Iqbal menyalakan): ringkasan pagi 07.15 WIB hari kerja per pegawai.
--  * keu_dlg_ringkasan_pagi(): satu notifikasi per pegawai yang punya butir berjalan, butir lewat tenggat, atau laporan perlu revisi.
--  * keu_dlg_pengingat_bahan(): setelan eskalasi, setelan mutu, dan daftar jadwal Delego (cron) beserta putaran terakhirnya.
--  * keu_dlg_eskalasi_atur: ikut mengubah ringkasan_pagi.
-- Saluran: push dan lonceng saja (WhatsApp belum, keputusan 13 Nov). Hanya menambah.

begin;

alter table keu_dlg_eskalasi_setelan add column if not exists ringkasan_pagi boolean not null default false;

do $$
declare d text := pg_get_functiondef('keu_dlg_eskalasi_atur'::regproc);
begin
  if position('ringkasan_pagi' in d) = 0 then
    d := replace(d, 'aktif = coalesce((p_data->>''aktif'')::boolean, aktif),', 'aktif = coalesce((p_data->>''aktif'')::boolean, aktif),' || chr(10) || '    ringkasan_pagi = coalesce((p_data->>''ringkasan_pagi'')::boolean, ringkasan_pagi),');
    if position('ringkasan_pagi' in d) = 0 then raise exception 'keu_dlg_eskalasi_atur tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

create or replace function keu_dlg_ringkasan_pagi(p_hari date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_hari date := coalesce(p_hari, keu_dlg_hari_ini()); s keu_dlg_eskalasi_setelan; r record; v_n int := 0; v_isi text;
begin
  select * into s from keu_dlg_eskalasi_setelan where id = 1;
  if not s.ringkasan_pagi then return jsonb_build_object('aktif', false); end if;
  if extract(isodow from v_hari) > 5 or exists (select 1 from keu_dlg_libur l where l.tanggal = v_hari and l.aktif) then
    return jsonb_build_object('hari_kerja', false);
  end if;
  for r in
    with butir as (
      select d.penerima_akun as akun, count(*)::int n, coalesce(sum(keu_dlg_target_pada(d.id, v_hari)), 0) as target
        from keu_dlg_delegasi d
       where d.status in ('baru','berjalan') and d.mulai <= v_hari and d.tenggat >= v_hari and (d.hari_kerja is null or extract(isodow from v_hari)::smallint = any(d.hari_kerja))
       group by d.penerima_akun
    ), lewat as (
      select e.penerima_akun as akun, count(*)::int n from keu_dlg_eskalasi e where e.ditutup_at is null group by e.penerima_akun
    ), revisi as (
      select d.penerima_akun as akun, count(*)::int n from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id
       where l.tinjau_status = 'ditolak' and l.tanggal >= v_hari - 30 group by d.penerima_akun
    )
    select a.id as akun, coalesce(b.n, 0) as n_butir, coalesce(b.target, 0) as target, coalesce(lw.n, 0) as n_lewat, coalesce(rv.n, 0) as n_revisi
      from sigap_akun a left join butir b on b.akun = a.id left join lewat lw on lw.akun = a.id left join revisi rv on rv.akun = a.id
     where a.aktif and (b.n is not null or lw.n is not null or rv.n is not null)
  loop
    v_isi := r.n_butir || ' pekerjaan hari ini' || case when r.target > 0 then ' (target ' || trim(to_char(round(r.target, 1), 'FM999990.#')) || ' poin)' else '' end
      || case when r.n_lewat > 0 then '; ' || r.n_lewat || ' lewat tenggat perlu dijelaskan' else '' end
      || case when r.n_revisi > 0 then '; ' || r.n_revisi || ' laporan perlu revisi' else '' end || '.';
    perform keu_dlg_notif2(r.akun, 'delegasi_pengingat', 'Ringkasan pagi Delego', v_isi, '/sigap/delego/jadwal', null);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('dikirim', v_n);
end $f$;
revoke execute on function keu_dlg_ringkasan_pagi(date) from public, anon, authenticated;

create or replace function keu_dlg_pengingat_bahan(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public', 'cron' as $f$
declare r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select jsonb_build_object(
    'boleh_ubah', keu_dlg_putus_ok(p_akun),
    'eskalasi', (select to_jsonb(s) - 'diubah_oleh' || jsonb_build_object('diubah_nama', a.nama) from keu_dlg_eskalasi_setelan s left join sigap_akun a on a.id = s.diubah_oleh where s.id = 1),
    'mutu', (select to_jsonb(m) - 'diubah_oleh' || jsonb_build_object('diubah_nama', a.nama) from keu_dlg_mutu_setelan m left join sigap_akun a on a.id = m.diubah_oleh where m.id = 1),
    'jadwal', coalesce((select jsonb_agg(jsonb_build_object('nama', j.jobname, 'jadwal', j.schedule, 'aktif', j.active,
                         'terakhir', (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
                         'gagal_terakhir', (select d.status = 'failed' from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1))
                         order by j.jobname)
                        from cron.job j where j.jobname like 'delego-%'), '[]'::jsonb)
  ) into r;
  return r;
end $f$;
revoke execute on function keu_dlg_pengingat_bahan(bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_dlg_pengingat_bahan''' in d) = 0 then
    d := replace(d, '''keu_dlg_inisiatif_rekap''];', '''keu_dlg_inisiatif_rekap'',''keu_dlg_pengingat_bahan''];');
    if position('''keu_dlg_pengingat_bahan''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;

-- Jadwal (di luar transaksi): hari kerja 07.15 WIB (00.15 UTC). Fungsi tidak mengirim apa pun selama ringkasan_pagi mati.
select cron.schedule('delego-ringkasan-0715', '15 0 * * 1-5', 'select public.keu_dlg_ringkasan_pagi()');
