-- skema-sql/20261114q_fase5_rapor_terpadu.sql
--
-- (14 Nov 2026, Fase 5 "Penilaian dan rapor") Rapor terpadu per pegawai organik per bulan dan rekap SKP.
--  keu_dlg_rapor(p_bulan): satu baris per pegawai organik aktif:
--    hari kerja (Senin-Jumat dikurangi libur aktif dan ketersediaan disetujui, sampai hari ini bila bulan berjalan), kapasitas = hari kerja x 100,
--    poin dilaporkan, poin diakui (disetujui: poin diakui atau poin; tidak diakui: 0), hari dengan poin >= 60, rata faktor mutu,
--    lewat tenggat (eskalasi dibuka bulan itu), inisiatif disetujui, penilaian Ketua Tim (kualitas, kepatuhan; keu_dlg_penilaian),
--    penilaian 360 (tampil bila >= 3 penilai; >= 5 penilai: nilai tertinggi dan terendah per penilai dibuang).
--  Ringkasan: pegawai yang pekerjaannya tercatat, rata >= 60 poin per hari kerja, bobot tervalidasi (keu_v_poin_berlaku bersumber riwayat/usul).
--  Hak: pemutus atau pemberi delegasi melihat semua; pegawai lain hanya dirinya sendiri.
--  ATURAN 360 dan bobot rapor masih USUL (menunggu putusan Iqbal); rapor hanya merangkum, tidak memberi skor gabungan.
-- Hanya menambah fungsi baca.

begin;

create or replace function keu_dlg_rapor(p_bulan date default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare v_hari date := keu_dlg_hari_ini(); v_awal date; v_akhir date; v_batas date; v_semua boolean; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  v_awal := date_trunc('month', coalesce(p_bulan, v_hari))::date;
  v_akhir := (v_awal + interval '1 month' - interval '1 day')::date;
  v_batas := least(v_akhir, v_hari);
  v_semua := keu_dlg_putus_ok(p_akun) or coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false);
  with peg as (
    select a.id, a.nama from sigap_akun a where a.aktif and a.jenis = 'organik' and (v_semua or a.id = p_akun)
  ), tgl as (
    select g::date as t from generate_series(v_awal, v_batas, interval '1 day') g
     where extract(isodow from g) < 6 and not exists (select 1 from keu_dlg_libur l where l.tanggal = g::date and l.aktif)
  ), hk as (
    select p.id, count(t.t)::numeric - coalesce((select sum(coalesce(k.fraksi, 1)) from keu_dlg_ketersediaan k, tgl t2
                                                   where k.akun_id = p.id and k.status = 'disetujui' and t2.t between k.mulai and k.selesai), 0) as hari
      from peg p cross join tgl t group by p.id
  ), lap as (
    select d.penerima_akun as akun, l.tanggal, l.poin, l.tinjau_status, l.poin_diakui, l.faktor_akui
      from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id
     where l.tanggal between v_awal and v_akhir
  ), harian as (
    select akun, tanggal, sum(poin) as poin from lap group by akun, tanggal
  ), n360 as (
    select x.dinilai_akun_id as akun, x.penilai_akun_id, avg((x.kinerja + x.kedisiplinan + x.tim + x.kerjasama + x.komunikasi) / 5.0) as nilai
      from sigap_penilaian360 x where (x.dibuat_at at time zone 'Asia/Jakarta')::date between v_awal and v_akhir
     group by x.dinilai_akun_id, x.penilai_akun_id
  ), r360 as (
    select akun, count(*)::int as penilai,
           case when count(*) >= 5 then (sum(nilai) - max(nilai) - min(nilai)) / (count(*) - 2)
                when count(*) >= 3 then avg(nilai) end as nilai
      from n360 group by akun
  ), baris as (
    select p.id as akun, p.nama, greatest(coalesce(h.hari, 0), 0) as hari_kerja,
           coalesce((select sum(poin) from lap where lap.akun = p.id), 0) as poin,
           coalesce((select sum(case when tinjau_status = 'disetujui' then coalesce(poin_diakui, poin) else 0 end) from lap where lap.akun = p.id), 0) as poin_diakui,
           coalesce((select sum(poin) from lap where lap.akun = p.id and tinjau_status = 'menunggu'), 0) as poin_menunggu,
           (select count(*) from lap where lap.akun = p.id)::int as laporan,
           (select count(*) from harian where harian.akun = p.id and harian.poin >= 60)::int as hari_60,
           (select round(avg(faktor_akui), 3) from lap where lap.akun = p.id and faktor_akui is not null) as faktor,
           (select count(*) from keu_dlg_eskalasi e where e.penerima_akun = p.id and (e.mulai_at at time zone 'Asia/Jakarta')::date between v_awal and v_akhir)::int as lewat_tenggat,
           (select count(*) from keu_dlg_delegasi d where d.usulan_oleh = p.id and d.inisiatif_jenis is not null and d.status not in ('usulan','batal')
               and (d.usulan_at at time zone 'Asia/Jakarta')::date between v_awal and v_akhir)::int as inisiatif,
           (select round(avg(n.kualitas), 2) from keu_dlg_penilaian n where n.penerima_akun = p.id and n.periode between v_awal and v_akhir) as kualitas,
           (select round(avg(n.kepatuhan), 2) from keu_dlg_penilaian n where n.penerima_akun = p.id and n.periode between v_awal and v_akhir) as kepatuhan,
           r3.penilai as penilai_360, round(r3.nilai, 2) as nilai_360,
           (select count(*) from keu_dlg_pembinaan b where b.penerima_akun = p.id and (b.dibuat_at at time zone 'Asia/Jakarta')::date between v_awal and v_akhir)::int as pembinaan,
           (select count(*) from keu_dlg_penghargaan g where g.penerima_akun = p.id and (g.dibuat_at at time zone 'Asia/Jakarta')::date between v_awal and v_akhir)::int as penghargaan
      from peg p left join hk h on h.id = p.id left join r360 r3 on r3.akun = p.id
  )
  select jsonb_build_object(
    'bulan', v_awal, 'sampai', v_batas, 'semua', v_semua,
    'baris', coalesce((select jsonb_agg(to_jsonb(b) order by b.nama) from baris b), '[]'::jsonb),
    'ringkas', jsonb_build_object(
      'pegawai', (select count(*) from baris),
      'tercatat', (select count(*) from baris where laporan > 0),
      'min60', (select count(*) from baris where hari_kerja > 0 and poin / hari_kerja >= 60),
      'bobot_total', (select count(*) from keu_v_poin_berlaku),
      'bobot_tervalidasi', (select count(*) from keu_v_poin_berlaku where sumber_berlaku in ('riwayat','usul'))
    )
  ) into r;
  return r;
end $f$;
revoke execute on function keu_dlg_rapor(date, bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_dlg_rapor''' in d) = 0 then
    d := replace(d, '''keu_ident_salin''];', '''keu_ident_salin'',''keu_dlg_rapor''];');
    if position('''keu_dlg_rapor''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
