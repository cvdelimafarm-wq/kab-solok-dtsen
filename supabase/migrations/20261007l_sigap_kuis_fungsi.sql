-- (7 Okt 2026) Kuis Live: fungsi agregasi (menghindari batas 1000 baris PostgREST). Hanya service_role yang boleh memanggil.
create or replace function public.sigap_kuis_papan(p_ruang bigint)
returns table (akun_id bigint, poin bigint, benar bigint, menjawab bigint, rata_waktu_ms numeric)
language sql stable security invoker set search_path = public as $$
  select p.akun_id,
         coalesce(sum(j.poin), 0)::bigint,
         (count(j.nomor) filter (where j.benar))::bigint,
         count(j.nomor)::bigint,
         round(avg(j.waktu_ms) filter (where j.benar))
  from public.sigap_kuis_peserta p
  left join public.sigap_kuis_jawaban j on j.ruang_id = p.ruang_id and j.akun_id = p.akun_id
  where p.ruang_id = p_ruang
  group by p.akun_id
$$;

create or replace function public.sigap_kuis_per_soal(p_ruang bigint)
returns table (nomor integer, pilihan text, jumlah bigint, jumlah_benar bigint)
language sql stable security invoker set search_path = public as $$
  select j.nomor, j.pilihan, count(*)::bigint, (count(*) filter (where j.benar))::bigint
  from public.sigap_kuis_jawaban j
  where j.ruang_id = p_ruang
  group by j.nomor, j.pilihan
$$;

revoke all on function public.sigap_kuis_papan(bigint) from public, anon, authenticated;
revoke all on function public.sigap_kuis_per_soal(bigint) from public, anon, authenticated;
grant execute on function public.sigap_kuis_papan(bigint) to service_role;
grant execute on function public.sigap_kuis_per_soal(bigint) to service_role;
