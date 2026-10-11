-- (11 Okt 2026) Rekap hasil identifikasi untuk semua PML/PPL (tombol di tahap Pendataan) -- permintaan user.
-- Hanya-baca; SECURITY DEFINER; hanya service_role (API memeriksa bahwa pemanggil PML/PPL/korwil atau admin).
-- Yang dikeluarkan HANYA identitas wilayah + status (terdampak / tidak terdampak); tidak ada angka KK atau rincian dampak.
-- Sub SLS yang belum diisi tidak ikut (rekap = hasil identifikasi yang sudah ada).

create or replace function public.bencana_rekap_identifikasi()
returns table (idsubsls text, kecamatan text, nagari text, sls text, sub_sls text, tidak_terdampak boolean)
language sql
stable
security definer
set search_path = public
as $$
  select h.idsubsls, w.kecamatan, w.nagari, w.sls, w.sub_sls, coalesce(h.tidak_terdampak, false)
    from public.bencana_identifikasi_subsls h
    join public.bencana_wilayah w on w.idsubsls = h.idsubsls
   where h.diisi_at is not null
   order by w.kecamatan, w.nagari, w.sls, w.sub_sls
$$;

revoke execute on function public.bencana_rekap_identifikasi() from public, anon, authenticated;
grant execute on function public.bencana_rekap_identifikasi() to service_role;
