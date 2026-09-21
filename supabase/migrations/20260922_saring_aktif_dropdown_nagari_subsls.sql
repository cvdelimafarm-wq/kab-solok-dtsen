-- Dropdown Nagari & Sub SLS di tab Penyisiran Usaha (jg dipakai
-- Identifikasi PPL/Jorong/Tetangga) belum ikut menghitung `aktif` sewaktu
-- kolom itu ditambahkan (lihat migrasi 20260921e/f) -- cuma StatTile
-- (penyisiran_summary/_wilayah) yg sempat diperbaiki saat itu, 4 RPC
-- dropdown di bawah ini terlewat. Akibatnya angka pada dropdown Nagari &
-- Sub SLS (mis. "MUARO PANEH (790)") masih menghitung SEMUA baris, bukan
-- cuma yg aktif -- dilaporkan user lewat screenshot, diperbaiki di sini.
--
-- Tidak ada perubahan kode aplikasi (route.ts) yg diperlukan -- keempat
-- fungsi ini dipanggil apa adanya lewat supabase.rpc(...) di
-- app/api/penyisiran/{nagari,subsls}/route.ts, jadi perbaikan di level DB
-- ini langsung berlaku tanpa deploy ulang.
create or replace function public.penyisiran_nagari_list(p_kec text)
returns jsonb
language sql
stable
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('kode', nagari_kode, 'nama', nagari_nama, 'jumlah', jumlah) order by nagari_nama), '[]'::jsonb)
  from (
    select nagari_kode, max(nagari_nama) as nagari_nama, count(*) as jumlah
    from penyisiran_usaha
    where kec_kode = p_kec and nagari_kode is not null and nagari_kode <> '' and aktif
    group by nagari_kode
  ) n;
$function$;

create or replace function public.penyisiran_nagari_list_wilayah(p_kec text, p_wilayah jsonb)
returns jsonb
language sql
stable
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('kode', nagari_kode, 'nama', nagari_nama, 'jumlah', jumlah) order by nagari_nama), '[]'::jsonb)
  from (
    select nagari_kode, max(nagari_nama) as nagari_nama, count(*) as jumlah
    from public.penyisiran_usaha u
    where kec_kode = p_kec and nagari_kode is not null and nagari_kode <> '' and aktif
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p_wilayah, '[]'::jsonb)) w
        where w->>'kec_kode' = u.kec_kode
          and w->>'nagari_kode' = u.nagari_kode
          and w->>'sls_kode' = u.sls_kode
          and (
            w->'subsls_kode' is null
            or jsonb_typeof(w->'subsls_kode') = 'null'
            or u.subsls_kode = any (select jsonb_array_elements_text(w->'subsls_kode'))
          )
      )
    group by nagari_kode
  ) n;
$function$;

create or replace function public.penyisiran_subsls_list(p_kec text, p_nagari text)
returns jsonb
language sql
stable
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('idsubsls', idsubsls, 'label', label, 'jumlah', jumlah) order by label), '[]'::jsonb)
  from (
    select idsubsls, (max(sls_nama) || '-' || max(subsls_kode)) as label, count(*) as jumlah
    from penyisiran_usaha
    where kec_kode = p_kec and nagari_kode = p_nagari and idsubsls is not null and idsubsls <> '' and aktif
    group by idsubsls
  ) s;
$function$;

create or replace function public.penyisiran_subsls_list_wilayah(p_kec text, p_nagari text, p_wilayah jsonb)
returns jsonb
language sql
stable
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('idsubsls', idsubsls, 'label', label, 'jumlah', jumlah) order by label), '[]'::jsonb)
  from (
    select idsubsls, (max(sls_nama) || '-' || max(subsls_kode)) as label, count(*) as jumlah
    from public.penyisiran_usaha u
    where kec_kode = p_kec and nagari_kode = p_nagari and idsubsls is not null and idsubsls <> '' and aktif
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p_wilayah, '[]'::jsonb)) w
        where w->>'kec_kode' = u.kec_kode
          and w->>'nagari_kode' = u.nagari_kode
          and w->>'sls_kode' = u.sls_kode
          and (
            w->'subsls_kode' is null
            or jsonb_typeof(w->'subsls_kode') = 'null'
            or u.subsls_kode = any (select jsonb_array_elements_text(w->'subsls_kode'))
          )
      )
    group by idsubsls
  ) s;
$function$;
