-- (11 Okt 2026) Rekap identifikasi: target dan realisasi per PML ("monitoring target realisasi") -- permintaan user.
-- Hanya-baca; SECURITY DEFINER; hanya service_role (API rekap memeriksa pemanggil PML/PPL/korwil atau admin).
-- Target = Sub SLS pada SLS yang dialokasikan ke PML itu (pelaksana / pendamping, dihitung terpisah agar tidak ganda);
-- realisasi = dari target itu, yang sudah diidentifikasi (diisi_at tidak null), dipecah terdampak / tidak terdampak.
create or replace function public.bencana_rekap_pml()
returns table (pml_id bigint, nama text, peran text, target integer, realisasi integer, terdampak integer, tidak_terdampak integer)
language sql
stable
security definer
set search_path = public
as $$
  with sub as (
    select a.pml_pelaksana_id as pel, a.pml_pendamping_id as pen,
           (h.diisi_at is not null) as sudah, coalesce(h.tidak_terdampak, false) as tdk
      from public.bencana_wilayah w
      join public.bencana_identifikasi_alokasi a on a.idsls = left(w.idsubsls, 14)
      left join public.bencana_identifikasi_subsls h on h.idsubsls = w.idsubsls
  ),
  per as (
    select pel as pid, 'pelaksana'::text as pr, sudah, tdk from sub where pel is not null
    union all
    select pen, 'pendamping'::text, sudah, tdk from sub where pen is not null
  )
  select p.id, p.nama, x.pr, x.target, x.realisasi, x.terdampak, x.tidak
    from (
      select pid, pr,
             (count(*))::int as target,
             (count(*) filter (where sudah))::int as realisasi,
             (count(*) filter (where sudah and not tdk))::int as terdampak,
             (count(*) filter (where sudah and tdk))::int as tidak
        from per group by pid, pr
    ) x
    join public.bencana_petugas p on p.id = x.pid
   order by p.nama, x.pr
$$;

revoke execute on function public.bencana_rekap_pml() from public, anon, authenticated;
grant execute on function public.bencana_rekap_pml() to service_role;
