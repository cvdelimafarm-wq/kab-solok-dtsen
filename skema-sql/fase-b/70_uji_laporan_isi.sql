-- 70_uji_laporan_isi.sql -- HANYA SELECT. Jalankan setelah 20261028c_laporan_isi.sql. Semua kolom "ok" harus true.
-- 1. tabel & RLS & fungsi ada
select 'tabel_ada' as uji, to_regclass('public.sigap_laporan_isi_konfig') is not null as ok
union all
select 'rls_aktif', coalesce((select relrowsecurity from pg_class where oid = 'public.sigap_laporan_isi_konfig'::regclass), false)
union all
select 'fungsi_ada', to_regprocedure('public.sigap_isi_harian(bigint[],date,date,bigint)') is not null
union all
-- 2. jumlah "didata" (terdampak + tidak terdampak) per PPL per hari = jumlah realisasi otomatis (sumber pendataan) -- semua PPL kegiatan 1
select 'cocok_realisasi_otomatis_ppl', not exists (
  with ppl as (select p.akun_id from public.sigap_penugasan p where p.kegiatan_id = 1 and p.peran = 'ppl'),
  a as (
    select (e->>'t')::date as tanggal, (e->>'a')::bigint as akun, sum((e->>'n')::int) as n
      from jsonb_array_elements(public.sigap_isi_harian((select array_agg(akun_id) from ppl), date '2026-10-01', date '2026-12-31', 1)) e
     where e->>'h' in ('terdampak', 'tidak_terdampak') group by 1, 2
  ),
  b as (
    select r.tanggal, p.akun_id as akun, sum(r.n)::bigint as n
      from ppl p cross join lateral public.bencana_realisasi_otomatis(p.akun_id, 'ppl') r
     where r.sumber = 'pendataan' and r.tanggal between date '2026-10-01' and date '2026-12-31' group by 1, 2
  )
  select 1 from a full join b using (tanggal, akun) where coalesce(a.n, 0) <> coalesce(b.n, 0)
)
union all
-- 3. hak: anon/authenticated tidak boleh memanggil fungsi atau membaca tabel
select 'anon_tak_boleh', not has_function_privilege('anon', 'public.sigap_isi_harian(bigint[],date,date,bigint)', 'execute') and not has_table_privilege('anon', 'public.sigap_laporan_isi_konfig', 'select');
