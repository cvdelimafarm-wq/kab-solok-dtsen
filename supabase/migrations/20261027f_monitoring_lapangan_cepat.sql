-- 27 Okt 2026 - Monitoring Lapangan dipercepat (tahap 1 dari 2).
-- Membuat fungsi BARU bencana_monitoring_lapangan_cepat dengan kolom, arti angka, dan aturan yang SAMA
-- dengan bencana_monitoring_lapangan. Fungsi lama TIDAK disentuh di berkas ini.
-- Perbedaan hanya cara hitung: jumlah kumulatif (agg_sub, agg_kk) memakai window function
-- (satu kali urut) sebagai ganti subquery per baris yang memindai ulang tabel 1.750 kali.
-- Setelah berkas ini jalan, jalankan 67_uji_monitoring_lapangan_cepat.sql (harus 0 selisih),
-- baru jalankan 20261027g_monitoring_lapangan_ganti.sql.

create or replace function public.bencana_monitoring_lapangan_cepat(p_dari date, p_sampai date, p_kegiatan bigint default 1)
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
  -- lembar Quality Check LENGKAP per korwil per tanggal (dipakai untuk peran korwil sejak 2026-10-27)
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
  ),
  -- kerangka: setiap orang x setiap tanggal dalam jendela
  kerangka as (
    select o.akun, o.nama, o.peran, o.pml, t.d
      from orang o
      cross join batas b
      cross join lateral (select g::date as d from generate_series(b.dari, b.sampai, interval '1 day') g) t
  ),
  -- jejak: kejadian per orang per tanggal digabung dengan baris kerangka (n = 0), lalu dijumlahkan berurutan
  jejak as (
    select akun, d, n as a, 0 as b, 0 as c, false as baris_kerangka from idf
    union all select akun, d, 0, berhasil, 0, false from kk
    union all select akun, d, 0, 0, n, false from qc
    union all select akun, d, 0, 0, 0, true from kerangka
  ),
  -- jumlah kumulatif sampai tanggal itu (termasuk tanggal itu), juga untuk kejadian sebelum jendela
  kum as (
    select akun, d, baris_kerangka,
           (sum(a) over w)::int as k_idf,
           (sum(b) over w)::int as k_kk,
           (sum(c) over w)::int as k_qc
      from jejak
    window w as (partition by akun order by d)
  )
  select g.akun, g.nama, g.peran, g.pml, pm.nama, g.d,
         coalesce(idf.n, 0),
         case when g.peran = 'korwil' and g.d >= date '2026-10-27' then coalesce(qc.n, 0) else coalesce(kk.berhasil, 0) end,
         case when g.peran = 'korwil' and g.d >= date '2026-10-27' then 0 else coalesce(kk.tdk, 0) end,
         kum.k_idf,
         case when g.peran = 'korwil' and g.d >= date '2026-10-27' then kum.k_qc else kum.k_kk end,
         hk.akun is not null,
         lap.akun is not null,
         coalesce(foto.n, 0)
    from kerangka g
    join kum on kum.baris_kerangka and kum.akun = g.akun and kum.d = g.d
    left join public.bencana_petugas pm on pm.id = g.pml
    left join idf on idf.akun = g.akun and idf.d = g.d
    left join kk on kk.akun = g.akun and kk.d = g.d
    left join qc on qc.akun = g.akun and qc.d = g.d
    left join foto on foto.akun = g.akun and foto.d = g.d
    left join hk on hk.akun = g.akun and hk.d = g.d
    left join lap on lap.akun = g.akun and lap.d = g.d
   order by g.d desc, g.nama, g.akun
$function$;

revoke all on function public.bencana_monitoring_lapangan_cepat(date, date, bigint) from public, anon, authenticated;
grant execute on function public.bencana_monitoring_lapangan_cepat(date, date, bigint) to service_role;
