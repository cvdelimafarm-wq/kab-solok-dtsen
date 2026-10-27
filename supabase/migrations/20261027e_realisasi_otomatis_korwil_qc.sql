-- =====================================================================
-- 20261027e_realisasi_otomatis_korwil_qc.sql   (REVISI 27 Okt 2026 sore: hanya lembar QC LENGKAP; Monitoring Lapangan ikut)
-- Permintaan user: korwil dihitung dari Lembar Quality Check (sigap_qc_lembar, lembar yang disimpan korwil sebagai pemeriksa), bukan Lembar Pendataan KK.
--  * Yang dihitung = lembar LENGKAP saja: ringkas->>'lengkap' = 'true'. Lembar yang baru terisi sebagian tidak dihitung.
--  * Mulai tanggal 2026-10-27 (WIB). Sebelum tanggal itu korwil TETAP dari pendataan (agar hari lampau yang sudah "dianggap" tidak hilang).
--  * Tanggal batas harus sama dengan BATAS_QC_KORWIL di lib/realisasiOtomatis.ts.
-- Dua fungsi diganti (tanda tangan dan kolom hasil SAMA, jadi CREATE OR REPLACE; hak akses tetap, hanya service_role). Tanpa hapus data.
--   1) bencana_realisasi_otomatis(p_akun, p_peran)  -> laporan realisasi otomatis (translok, kwitansi, PDF).
--   2) bencana_monitoring_lapangan(p_dari, p_sampai, p_kegiatan) -> Monitoring Lapangan (admin). Untuk korwil sejak batas, kolom kk_berhasil / agg_kk
--      berisi jumlah lembar QC lengkap, kk_tdk_ditemukan = 0 (kode membedakannya lewat tanggal: lib/lapangan.ts hariQc).
-- PML dan PPL TIDAK berubah. Jalankan oleh user (DDL produksi). Aman sebelum/sesudah deploy kode.
-- =====================================================================

create or replace function public.bencana_realisasi_otomatis(p_akun bigint, p_peran text)
 returns table(tanggal date, idsubsls text, n integer, sumber text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select (i.diisi_at at time zone 'Asia/Jakarta')::date, i.idsubsls, 1, 'identifikasi'::text
    from public.bencana_identifikasi_subsls i
   where p_peran = 'pml' and i.diisi_oleh_akun = p_akun and i.diisi_at is not null
  union all
  select x.d, x.idsubsls, (count(*))::int, 'pendataan'::text
    from (
      select distinct on (l.kk_id, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date)
             (l.waktu_kejadian at time zone 'Asia/Jakarta')::date as d, k.idsubsls, l.hasil
        from public.bencana_pendataan_log l
        join public.bencana_pendataan_kk k on k.id = l.kk_id and k.aktif
       where p_peran <> 'pml' and l.akun_id = p_akun
         and (p_peran <> 'korwil' or (l.waktu_kejadian at time zone 'Asia/Jakarta')::date < date '2026-10-27')
       order by l.kk_id, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date, l.waktu_kejadian desc, l.id desc
    ) x
   where x.hasil in ('terdampak', 'tidak_terdampak')
   group by x.d, x.idsubsls
  union all
  select q.tanggal, k.idsubsls, (count(*))::int, 'qc'::text
    from public.sigap_qc_lembar q
    left join public.bencana_pendataan_kk k on k.id = q.kk_id
   where p_peran = 'korwil' and q.pemeriksa_akun_id = p_akun and q.tanggal >= date '2026-10-27'
     and q.ringkas->>'lengkap' = 'true'
   group by q.tanggal, k.idsubsls
$function$;

create or replace function public.bencana_monitoring_lapangan(p_dari date, p_sampai date, p_kegiatan bigint default 1)
 returns table(akun_id bigint, nama text, peran text, pml_id bigint, pml_nama text, tanggal date, sub_idf integer, kk_berhasil integer, kk_tdk_ditemukan integer, agg_sub integer, agg_kk integer, hari_kerja boolean, ada_laporan boolean, jumlah_foto integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with hari_ini as (
    select (now() at time zone 'Asia/Jakarta')::date as h
  ),
  idf as (
    select i.diisi_oleh_akun as akun, (i.diisi_at at time zone 'Asia/Jakarta')::date as d, count(*)::int as n
      from public.bencana_identifikasi_subsls i
     where i.diisi_at is not null and i.diisi_oleh_akun is not null
     group by 1, 2
  ),
  kk_hari as (
    select distinct on (x.akun, x.kk, x.d) x.akun, x.kk, x.d, x.hasil
      from (
        select l.akun_id as akun, l.kk_id as kk, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date as d,
               l.hasil, l.waktu_kejadian as wk, l.id as lid
          from public.bencana_pendataan_log l
          join public.bencana_pendataan_kk k on k.id = l.kk_id and k.aktif
      ) x
     order by x.akun, x.kk, x.d, x.wk desc, x.lid desc
  ),
  kk as (
    select akun, d,
           (count(*) filter (where hasil in ('terdampak', 'tidak_terdampak')))::int as berhasil,
           (count(*) filter (where hasil = 'tidak_ditemukan'))::int as tdk
      from kk_hari
     group by 1, 2
  ),
  -- (27 Okt 2026) lembar Quality Check LENGKAP per korwil per tanggal (dipakai untuk peran korwil sejak 2026-10-27)
  qc as (
    select q.pemeriksa_akun_id as akun, q.tanggal as d, count(*)::int as n
      from public.sigap_qc_lembar q
     where q.tanggal >= date '2026-10-27' and q.kegiatan_id = p_kegiatan and q.ringkas->>'lengkap' = 'true'
     group by 1, 2
  ),
  hk as (
    select h.akun_id as akun, h.tanggal as d
      from public.sigap_hari_kerja h
      join public.sigap_penugasan p on p.id = h.penugasan_id
     where p.kegiatan_id = p_kegiatan and p.aktif and h.batal_at is null
     group by 1, 2
  ),
  lap as (
    select p.akun_id as akun, r.tanggal as d
      from public.sigap_realisasi r
      join public.sigap_penugasan p on p.id = r.penugasan_id
     where r.kegiatan_id = p_kegiatan and r.nonaktif_at is null
     group by 1, 2
  ),
  foto as (
    select p.akun_id as akun, f.tanggal as d, count(distinct f.slot)::int as n
      from public.sigap_dokumentasi f
      join public.sigap_penugasan p on p.id = f.penugasan_id
     where f.kegiatan_id = p_kegiatan and f.nonaktif_at is null
     group by 1, 2
  ),
  orang as (
    select s.id as akun, p.nama,
           case when p.peran in ('pml', 'ppl') then p.peran else 'korwil' end as peran,
           case when p.peran = 'pml' then p.id when p.peran = 'ppl' then p.atasan_id else null end as pml
      from public.sigap_akun s
      join public.bencana_petugas p on p.id = s.petugas_bencana_id and p.aktif
     where s.aktif
       and (
         (p.status_kepegawaian = 'organik' and (p.peran is null or p.peran = 'korwil'))
         or (p.peran in ('pml', 'ppl') and (
         exists (select 1 from public.bencana_alokasi_subsls a where (p.peran = 'pml' and a.pml_id = p.id) or (p.peran = 'ppl' and a.ppl_id = p.id))
         or (p.peran = 'pml' and exists (select 1 from public.bencana_identifikasi_alokasi x where x.pml_pelaksana_id = p.id or x.pml_pendamping_id = p.id))
         or s.id in (select akun from idf)
         or s.id in (select akun from kk)
         or s.id in (select akun from hk)
       ))
       )
  ),
  batas as (
    select greatest(
             coalesce(p_dari, (select min(d) from (select d from idf union all select d from kk union all select d from hk) u), (select h from hari_ini)),
             least(coalesce(p_sampai, (select h from hari_ini)), (select h from hari_ini)) - 92
           ) as dari,
           least(coalesce(p_sampai, (select h from hari_ini)), (select h from hari_ini)) as sampai
  )
  select o.akun, o.nama, o.peran, o.pml, pm.nama, t.d,
         coalesce(idf.n, 0),
         case when o.peran = 'korwil' and t.d >= date '2026-10-27' then coalesce(qc.n, 0) else coalesce(kk.berhasil, 0) end,
         case when o.peran = 'korwil' and t.d >= date '2026-10-27' then 0 else coalesce(kk.tdk, 0) end,
         (select coalesce(sum(i2.n), 0)::int from idf i2 where i2.akun = o.akun and i2.d <= t.d),
         case when o.peran = 'korwil' and t.d >= date '2026-10-27'
              then (select coalesce(sum(q2.n), 0)::int from qc q2 where q2.akun = o.akun and q2.d <= t.d)
              else (select coalesce(sum(k2.berhasil), 0)::int from kk k2 where k2.akun = o.akun and k2.d <= t.d) end,
         exists (select 1 from hk where hk.akun = o.akun and hk.d = t.d),
         exists (select 1 from lap where lap.akun = o.akun and lap.d = t.d),
         coalesce(foto.n, 0)
    from orang o
    cross join batas b
    cross join lateral (select g::date as d from generate_series(b.dari, b.sampai, interval '1 day') g) t
    left join public.bencana_petugas pm on pm.id = o.pml
    left join idf on idf.akun = o.akun and idf.d = t.d
    left join kk on kk.akun = o.akun and kk.d = t.d
    left join qc on qc.akun = o.akun and qc.d = t.d
    left join foto on foto.akun = o.akun and foto.d = t.d
   order by t.d desc, o.nama
$function$;
