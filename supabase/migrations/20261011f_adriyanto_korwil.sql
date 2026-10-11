-- (11 Okt 2026) Adriyanto = pegawai organik yang bertindak sebagai korwil; status PML hanya saat pelatihan -- permintaan user.
--  1. Cadangan 17 SLS identifikasi milik Adriyanto ke schema arsip, lalu dibagi ulang ke PML terdekat (tanpa batas beban,
--     sama seperti 104 Sub SLS: identifikasi boleh beda PML dengan pendataan). Tidak ada baris yang dihapus.
--  2. bencana_petugas.peran Adriyanto (id 5): 'pml' -> 'korwil'. Statusnya sebagai peserta pelatihan tetap (dari penugasan kegiatan 3).
--  3. bencana_monitoring_lapangan: pegawai organik non-PML/PPL (korwil) ikut tampil sebagai peran 'korwil' di setiap tanggal.
--     Pemulihan bila perlu: update bencana_petugas set peran = 'pml' where id = 5; salin balik pml_pelaksana_id dari arsip.cadangan_idf_alokasi_adriyanto_20261011.

create schema if not exists arsip;
create table if not exists arsip.cadangan_idf_alokasi_adriyanto_20261011 as
  select a.*, now() as dicadangkan_at from public.bencana_identifikasi_alokasi a where a.pml_pelaksana_id = 5;
alter table arsip.cadangan_idf_alokasi_adriyanto_20261011 enable row level security;
revoke all on arsip.cadangan_idf_alokasi_adriyanto_20261011 from anon, authenticated;

update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=12.5 where idsls='13030600010001' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=230, jarak_km=26.0 where idsls='13030600030003' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=30.8 where idsls='13030610020001' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=31.0 where idsls='13030610020002' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=29.9 where idsls='13030610020003' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=33.6 where idsls='13030610020004' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=28.8 where idsls='13030610020005' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=32.5 where idsls='13030610020006' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=33.7 where idsls='13030610020007' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=24.5 where idsls='13030610030001' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=25.8 where idsls='13030610030002' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=26.1 where idsls='13030610030003' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=10.1 where idsls='13030700040001' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=10.2 where idsls='13030700040004' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=11.2 where idsls='13030700040005' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=11.1 where idsls='13030700040006' and pml_pelaksana_id=5;
update public.bencana_identifikasi_alokasi set pml_pelaksana_id=96, jarak_km=11.4 where idsls='13030700040007' and pml_pelaksana_id=5;

update public.bencana_petugas set peran = 'korwil' where id = 5 and peran = 'pml';

create or replace function public.bencana_monitoring_lapangan(
  p_dari date,
  p_sampai date,
  p_kegiatan bigint default 1
) returns table (
  akun_id bigint,
  nama text,
  peran text,
  pml_id bigint,
  pml_nama text,
  tanggal date,
  sub_idf integer,
  kk_berhasil integer,
  kk_tdk_ditemukan integer,
  agg_sub integer,
  agg_kk integer,
  hari_kerja boolean,
  ada_laporan boolean,
  jumlah_foto integer
)
language sql
stable
security definer
set search_path = public
as $$
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
  hk as (
    select h.akun_id as akun, h.tanggal as d
      from public.sigap_hari_kerja h
      join public.sigap_penugasan p on p.id = h.penugasan_id
     where p.kegiatan_id = p_kegiatan and p.aktif
     group by 1, 2
  ),
  lap as (
    select p.akun_id as akun, r.tanggal as d
      from public.sigap_realisasi r
      join public.sigap_penugasan p on p.id = r.penugasan_id
     where r.kegiatan_id = p_kegiatan
     group by 1, 2
  ),
  foto as (
    select p.akun_id as akun, f.tanggal as d, count(distinct f.slot)::int as n
      from public.sigap_dokumentasi f
      join public.sigap_penugasan p on p.id = f.penugasan_id
     where f.kegiatan_id = p_kegiatan
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
         -- korwil = pegawai organik yang tidak berperan PML/PPL (selalu tampil, tidak bergantung pada wilayah)
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
         coalesce(kk.berhasil, 0),
         coalesce(kk.tdk, 0),
         (select coalesce(sum(i2.n), 0)::int from idf i2 where i2.akun = o.akun and i2.d <= t.d),
         (select coalesce(sum(k2.berhasil), 0)::int from kk k2 where k2.akun = o.akun and k2.d <= t.d),
         exists (select 1 from hk where hk.akun = o.akun and hk.d = t.d),
         exists (select 1 from lap where lap.akun = o.akun and lap.d = t.d),
         coalesce(foto.n, 0)
    from orang o
    cross join batas b
    cross join lateral (select g::date as d from generate_series(b.dari, b.sampai, interval '1 day') g) t
    left join public.bencana_petugas pm on pm.id = o.pml
    left join idf on idf.akun = o.akun and idf.d = t.d
    left join kk on kk.akun = o.akun and kk.d = t.d
    left join foto on foto.akun = o.akun and foto.d = t.d
   order by t.d desc, o.nama
$$;

revoke execute on function public.bencana_monitoring_lapangan(date, date, bigint) from public, anon, authenticated;
grant execute on function public.bencana_monitoring_lapangan(date, date, bigint) to service_role;
