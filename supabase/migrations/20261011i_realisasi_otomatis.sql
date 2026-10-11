-- (11 Okt 2026) Laporan realisasi PML/PPL terisi otomatis dari hasil identifikasi / pendataan -- permintaan user.
-- Hanya-baca; SECURITY DEFINER; hanya service_role (API translok memanggilnya untuk akun yang login).
--  - PML (p_peran = 'pml'): Sub SLS yang diisi akun itu di Lembar Identifikasi, per tanggal WIB (1 baris per Sub SLS).
--  - PPL / korwil (selain 'pml'): hasil TERAKHIR tiap KK pada hari itu (WIB) yang berhasil (terdampak / tidak terdampak), dijumlah per Sub SLS.
--    Definisi "berhasil" sama dengan Monitoring Lapangan (bencana_monitoring_lapangan).
create or replace function public.bencana_realisasi_otomatis(p_akun bigint, p_peran text)
returns table (tanggal date, idsubsls text, n integer, sumber text)
language sql
stable
security definer
set search_path = public
as $$
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
       order by l.kk_id, (l.waktu_kejadian at time zone 'Asia/Jakarta')::date, l.waktu_kejadian desc, l.id desc
    ) x
   where x.hasil in ('terdampak', 'tidak_terdampak')
   group by x.d, x.idsubsls
$$;

revoke execute on function public.bencana_realisasi_otomatis(bigint, text) from public, anon, authenticated;
grant execute on function public.bencana_realisasi_otomatis(bigint, text) to service_role;
