-- 20261102b — Petugas di Identifikasi lanjutan tertaut ke akun SIGAP.
-- Bila petugas membawa kunci "akun" (id sigap_akun) maka pencocokan memakai id itu;
-- bila tidak (data lama / nama di luar daftar) tetap dicocokkan lewat nama seperti sebelumnya.
-- Aman dijalankan ulang (create or replace). Hanya mengubah satu fungsi baca.
create or replace function public.keu_usulan_penugasan(p_ident bigint, p_kegiatan bigint, p_akun bigint default keu_akun_sesi())
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare i keu_ident; l keu_ident_lanjutan; v_hasil jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  if not keu_ident_lihat(p_akun, i.ro_kode) then raise exception 'Akun % tidak berwenang melihat usulan penugasan RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if not exists (select 1 from keu_ident_kegiatan where ident_id = i.id and kegiatan_id = p_kegiatan and dilepas_at is null) then
    raise exception 'Kegiatan belum ditautkan ke identifikasi ini' using errcode = '23514';
  end if;
  select * into l from keu_ident_lanjutan where ident_id = i.id;
  if not found then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(z) order by z.urut), '[]'::jsonb) into v_hasil from (
    select q.urut, q.kode, q.nama, q.peran as peran_lanjutan, q.peran_sigap, q.calon, q.akun_id, q.akun_nama,
           q.status,
           case q.status
             when 'siap' then 'Siap diterapkan'
             when 'sudah_ada' then 'Sudah memiliki penugasan pada kegiatan ini'
             when 'menyusul' then 'Nama masih menyusul'
             when 'peran_kosong' then 'Peran belum dipilih pada lanjutan'
             when 'tidak_ada' then 'Nama tidak ditemukan di master akun; periksa ejaan atau daftarkan akunnya'
             when 'ambigu' then 'Ada beberapa akun bernama sama; pilih nama dari daftar agar tertaut ke akun, atau tambahkan manual di Kelola translok'
             else 'Peran ' || q.peran_sigap || ' belum punya tarif pada kegiatan ini (isi di Kegiatan dan Tarif)'
           end as catatan
      from (
        select p.urut, p.kode, p.nama, p.peran, p.peran_sigap, c.n as calon, case when c.n = 1 then c.id1 end as akun_id, case when c.n = 1 then c.nama1 end as akun_nama,
               case
                 when p.menyusul or p.nama = '' then 'menyusul'
                 when p.peran is null then 'peran_kosong'
                 when c.n = 0 then 'tidak_ada'
                 when c.n > 1 then 'ambigu'
                 when exists (select 1 from sigap_penugasan s where s.kegiatan_id = p_kegiatan and s.akun_id = c.id1) then 'sudah_ada'
                 when not exists (select 1 from sigap_kegiatan_tarif t where t.kegiatan_id = p_kegiatan and t.peran = p.peran_sigap) then 'tarif_belum'
                 else 'siap'
               end as status
          from (
            select o.ord::int as urut, o.e ->> 'id' as kode, btrim(coalesce(o.e ->> 'nama', '')) as nama, coalesce((o.e ->> 'menyusul')::boolean, false) as menyusul,
                   nullif(o.e ->> 'peran', '') as peran,
                   case nullif(o.e ->> 'peran', '') when 'kortim' then 'korwil' else nullif(o.e ->> 'peran', '') end as peran_sigap,
                   case when (o.e ->> 'akun') ~ '^[0-9]{1,18}$' then (o.e ->> 'akun')::bigint end as akun_ref
              from jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) with ordinality as o(e, ord)
          ) p
          left join lateral (
            select count(*)::int as n, min(a.id) as id1, min(a.nama) as nama1
              from sigap_akun a
             where a.aktif and p.nama <> ''
               and ( (p.akun_ref is not null and a.id = p.akun_ref)
                  or (p.akun_ref is null and keu_norm_nama(a.nama) = keu_norm_nama(p.nama)) )
          ) c on true
      ) q
  ) z;
  return v_hasil;
end $function$;
