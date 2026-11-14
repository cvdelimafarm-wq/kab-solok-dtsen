-- skema-sql/20261114r_fase7_meja_kerja_ruang_keputusan.sql
--
-- (14 Nov 2026, Fase 7 "Meja kerja dan Ruang keputusan")
--  keu_meja_kerja(): semua yang menunggu seorang pegawai lintas modul, satu daftar: butir Delego hari ini, laporan perlu revisi, lewat tenggat
--    yang wajib dijelaskan, laporan dan usulan yang menunggu tinjau (pemberi), lewat tenggat yang menunggu jawaban (pimpinan), sanggahan menunggu
--    jawaban, identifikasi menunggu persetujuan (PPK/TU/KPA), dan notifikasi belum dibaca.
--  keu_ruang_keputusan(): versi baca-saja Ruang keputusan bagi Kepala/pemutus: sinyal dari modul yang sudah ada (naik ke Kepala, sanggahan
--    menunggu putusan, usulan menggantung, temuan Gap keras, SPK mitra belum terbit, pegawai tanpa catatan pekerjaan), tiap sinyal dengan tautan.
-- Pemetaan peran anggaran ke orang nyata (Des 2026) belum dikerjakan: menunggu data dari Iqbal. Hanya menambah fungsi baca.

begin;

create or replace function keu_meja_kerja(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare v_hari date := keu_dlg_hari_ini(); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  with butir as (
    -- pekerjaan saya
    select 'dlg_hari_ini' as kode, 'Delego' as modul, 'Pekerjaan hari ini' as judul,
           count(*)::int as jumlah, 'Butir delegasi yang berjalan hari ini; laporkan sebelum 23.59.' as isi, '/sigap/delego/lapor' as tautan, 'biru' as nada, 30 as urut
      from keu_dlg_delegasi d where d.penerima_akun = p_akun and d.status in ('baru','berjalan') and d.mulai <= v_hari and d.tenggat >= v_hari
       and not exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id and l.tanggal = v_hari)
    union all
    select 'dlg_revisi', 'Delego', 'Laporan perlu revisi', count(*)::int, 'Ketua Tim meminta perbaikan laporan.', '/sigap/delego/saya', 'amber', 10
      from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id where d.penerima_akun = p_akun and l.tinjau_status = 'ditolak'
    union all
    select 'dlg_jelaskan', 'Delego', 'Lewat tenggat, wajib dijelaskan', count(*)::int, 'Jelaskan mengapa pekerjaan belum selesai agar pimpinan dapat menjawab.', '/sigap/delego/saya', 'merah', 5
      from keu_dlg_eskalasi e where e.penerima_akun = p_akun and e.ditutup_at is null and e.dijelaskan_at is null
    union all
    select 'dlg_sanggah', 'Delego', 'Sanggahan menunggu jawaban Anda', count(*)::int, 'Anda berhak menjawab sanggahan sebelum Kepala memutuskan.', '/sigap/delego/saya', 'merah', 6
      from keu_dlg_sanggah s join keu_dlg_delegasi d on d.id = s.delegasi_id where d.penerima_akun = p_akun and s.status = 'menunggu_jawab'
    -- yang harus saya putuskan sebagai pemberi atau pimpinan
    union all
    select 'dlg_tinjau', 'Delego', 'Laporan menunggu tinjau', count(*)::int, 'Setujui sambil menilai mutu, minta revisi, atau sanggah.', '/sigap/delego/tinjau', 'biru', 20
      from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id
     where l.tinjau_status = 'menunggu' and d.penerima_akun <> p_akun and keu_dlg_boleh_tinjau(p_akun, d.id)
    union all
    select 'dlg_usulan', 'Delego', 'Usulan pegawai menunggu jawaban', count(*)::int, 'Setujui atau tolak dengan alasan; inisiatif ikut dihitung.', '/sigap/delego/tinjau', 'biru', 21
      from keu_dlg_delegasi d where d.status = 'usulan' and d.usulan_oleh <> p_akun and keu_dlg_beri(p_akun, d.ro_kode)
    union all
    select 'dlg_jawab', 'Delego', 'Lewat tenggat menunggu jawaban Anda', count(*)::int, 'Perpanjang, alihkan, kurangi target, batalkan, atau tetap dengan bantuan.', '/sigap/delego/tinjau', 'merah', 7
      from keu_dlg_eskalasi e join keu_dlg_delegasi d on d.id = e.delegasi_id
     where e.ditutup_at is null and e.penerima_akun <> p_akun and (d.dibuat_oleh = p_akun or (e.status = 'naik_kepala' and keu_dlg_putus_ok(p_akun)))
    union all
    select 'ident_setuju', 'Identifikasi', 'Identifikasi menunggu persetujuan Anda', count(*)::int, 'Identifikasi survei yang sudah diajukan menunggu persetujuan PPK, Tata Usaha, atau KPA.', '/sigap/kelola/perencanaan/identifikasi', 'amber', 15
      from keu_ident i where i.status = 'draf' and i.diajukan_at is not null and (i.kembali_at is null or i.kembali_at < i.diajukan_at)
       and ((not coalesce(i.ok_ppk, false) and keu_ident_punya(p_akun, 'PPK', i.ro_kode))
         or (not coalesce(i.ok_tu, false) and keu_ident_punya(p_akun, 'TU', i.ro_kode))
         or (coalesce(i.ok_ppk, false) and coalesce(i.ok_tu, false) and keu_ident_punya(p_akun, 'KPA', i.ro_kode)))
    union all
    select 'notif', 'Pemberitahuan', 'Pemberitahuan belum dibaca', count(*)::int, 'Kabar dari anggaran, identifikasi, dan Delego.', '/sigap/kelola/perencanaan/notifikasi', 'abu', 90
      from keu_notifikasi n where n.akun_id = p_akun and n.dibaca_at is null
  )
  select jsonb_build_object('hari_ini', v_hari,
    'butir', coalesce((select jsonb_agg(to_jsonb(b) order by b.urut) from butir b where b.jumlah > 0), '[]'::jsonb),
    'total', (select coalesce(sum(jumlah), 0) from butir where kode <> 'notif'))
    into r;
  return r;
end $f$;
revoke execute on function keu_meja_kerja(bigint) from public, anon, authenticated;

create or replace function keu_ruang_keputusan(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare v_hari date := keu_dlg_hari_ini(); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (keu_dlg_putus_ok(p_akun) or coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false)) then
    raise exception 'Ruang keputusan untuk Kepala dan pemberi delegasi' using errcode = '42501';
  end if;
  with sinyal as (
    select 'naik_kepala' as kode, 'Lewat tenggat naik ke Kepala' as judul, 'merah' as nada, '/sigap/delego/tinjau' as tautan, 1 as urut,
           coalesce(jsonb_agg(jsonb_build_object('teks', d.judul, 'sub', a.nama || ' · tenggat ' || to_char(e.tenggat, 'DD-MM-YYYY')) order by e.mulai_at), '[]'::jsonb) as isi
      from keu_dlg_eskalasi e join keu_dlg_delegasi d on d.id = e.delegasi_id join sigap_akun a on a.id = e.penerima_akun
     where e.ditutup_at is null and e.status = 'naik_kepala'
    union all
    select 'sanggah', 'Sanggahan menunggu putusan', 'merah', '/sigap/delego/monitor', 2,
           coalesce(jsonb_agg(jsonb_build_object('teks', d.judul, 'sub', a.nama || ' · diajukan ' || to_char(s.diajukan_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY')) order by s.diajukan_at), '[]'::jsonb)
      from keu_dlg_sanggah s join keu_dlg_delegasi d on d.id = s.delegasi_id join sigap_akun a on a.id = d.penerima_akun
     where s.status = 'menunggu_putusan'
    union all
    select 'gap_keras', 'Temuan Gap keras', 'amber', '/sigap/kelola/perencanaan/identifikasi', 3,
           coalesce(jsonb_agg(jsonb_build_object('teks', i.nama, 'sub', g.n_keras || ' temuan keras · versi ' || g.ver, 'tautan', '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/gap') order by g.dibuat_at desc), '[]'::jsonb)
      from keu_gap g join keu_ident i on i.id = g.ident_id
     where g.n_keras > 0 and g.ver = (select max(x.ver) from keu_gap x where x.ident_id = g.ident_id)
    union all
    select 'spk', 'SPK mitra belum terbit', 'amber', '/sigap/kelola/perencanaan/identifikasi', 4,
           coalesce(jsonb_agg(jsonb_build_object('teks', x.nama, 'sub', x.belum || ' dari ' || x.mitra || ' mitra belum ber-SPK', 'tautan', '/sigap/kelola/perencanaan/identifikasi/' || x.id || '/kebutuhan')), '[]'::jsonb)
      from (select i.id, i.nama,
                   (select count(*) from jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) p where p ->> 'status' = 'Mitra') as mitra,
                   (select count(*) from jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) p
                     where p ->> 'status' = 'Mitra' and not exists (select 1 from keu_ident_dokumen dd where dd.ident_id = i.id and dd.jenis = 'tugas' and dd.kunci = p ->> 'id' and dd.status = 'terbit')) as belum
              from keu_ident i join keu_ident_lanjutan l on l.ident_id = i.id where i.status = 'sah') x
     where x.belum > 0
    union all
    select 'usulan', 'Usulan pegawai menggantung', 'amber', '/sigap/delego/tinjau', 5,
           coalesce(jsonb_agg(jsonb_build_object('teks', d.judul, 'sub', a.nama || ' · ' || keu_dlg_hk_lewat((d.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) || ' hari kerja') order by d.usulan_at), '[]'::jsonb)
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.usulan_oleh
     where d.status = 'usulan' and keu_dlg_hk_lewat((d.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) > 3
    union all
    select 'tanpa_catatan', 'Pegawai belum mencatat pekerjaan pekan ini', 'abu', '/sigap/delego/rapor', 6,
           coalesce(jsonb_agg(jsonb_build_object('teks', a.nama, 'sub', 'belum ada laporan Delego sejak ' || to_char(date_trunc('week', v_hari), 'DD-MM-YYYY')) order by a.nama), '[]'::jsonb)
      from sigap_akun a
     where a.aktif and a.jenis = 'organik'
       and not exists (select 1 from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id where d.penerima_akun = a.id and l.tanggal >= date_trunc('week', v_hari)::date)
  )
  select jsonb_build_object('hari_ini', v_hari, 'pemutus', keu_dlg_putus_ok(p_akun),
    'sinyal', coalesce((select jsonb_agg(jsonb_build_object('kode', s.kode, 'judul', s.judul, 'nada', s.nada, 'tautan', s.tautan, 'jumlah', jsonb_array_length(s.isi), 'isi', s.isi) order by s.urut) from sinyal s), '[]'::jsonb))
    into r;
  return r;
end $f$;
revoke execute on function keu_ruang_keputusan(bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_meja_kerja''' in d) = 0 then
    d := replace(d, '''keu_dlg_rapor''];', '''keu_dlg_rapor'',''keu_meja_kerja'',''keu_ruang_keputusan''];');
    if position('''keu_meja_kerja''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
