-- (11 Okt 2026) Rekap identifikasi: tampilkan juga Sub SLS yang BELUM diidentifikasi -- permintaan user.
-- Cakupan: semua Sub SLS pada SLS yang sudah dialokasikan ke PML (bencana_identifikasi_alokasi), ditambah Sub SLS yang sudah diisi.
-- SLS yang belum dialokasikan belum jadi tanggung jawab siapa pun, jadi tidak ikut (621 Sub SLS saat dibuat: 156 sudah, 465 belum).
-- Keluaran tetap hanya identitas wilayah + status: sudah=false -> belum diidentifikasi; sudah=true -> tidak_terdampak menentukan terdampak / tidak.
-- Dibuat sebagai fungsi BARU (_v2) karena tipe keluaran bertambah satu kolom dan DROP fungsi lama macet di sesi ini;
-- fungsi lama bencana_rekap_identifikasi() tidak dipakai lagi (aksesnya tetap hanya service_role) dan boleh di-drop belakangan.

create or replace function public.bencana_rekap_identifikasi_v2()
returns table (idsubsls text, kecamatan text, nagari text, sls text, sub_sls text, tidak_terdampak boolean, sudah boolean)
language sql
stable
security definer
set search_path = public
as $$
  select w.idsubsls, w.kecamatan, w.nagari, w.sls, w.sub_sls, coalesce(h.tidak_terdampak, false), (h.diisi_at is not null)
    from public.bencana_wilayah w
    left join public.bencana_identifikasi_subsls h on h.idsubsls = w.idsubsls
   where exists (select 1 from public.bencana_identifikasi_alokasi a where a.idsls = left(w.idsubsls, 14))
      or h.diisi_at is not null
   order by w.kecamatan, w.nagari, w.sls, w.sub_sls
$$;

revoke execute on function public.bencana_rekap_identifikasi_v2() from public, anon, authenticated;
grant execute on function public.bencana_rekap_identifikasi_v2() to service_role;
