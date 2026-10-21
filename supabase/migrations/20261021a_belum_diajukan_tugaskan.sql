-- 20261021a_belum_diajukan_tugaskan.sql
-- (21 Okt 2026) Tab "Belum diajukan" + penugasan admin. SUDAH DITERAPKAN ke Supabase (nlwkpakyfprugqwklxiu) lewat SQL satu per satu;
-- berkas ini hanya catatan di repo supaya cocok dengan database (aman dijalankan ulang: create or replace / if not exists).

alter table public.bencana_pendataan_permintaan add column if not exists dari_admin boolean not null default false;
comment on column public.bencana_pendataan_permintaan.dari_admin is 'true = ditugaskan admin (tab Belum diajukan); tidak memakai kuota 7/9/11 PML';

-- kuota PML: yang dari_kolam dan dari_admin tidak dihitung
create or replace function public.bencana_pendataan_minta_total(p_pml bigint, p_akun bigint, p_tanggal date, p_pilihan jsonb, p_maks integer default 5)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  terpakai int;
  baru int;
  r jsonb;
  ids bigint[] := '{}';
  nid bigint;
begin
  baru := jsonb_array_length(p_pilihan);
  if baru < 1 then return jsonb_build_object('status','ditolak','alasan','kosong'); end if;
  perform pg_advisory_xact_lock(hashtextextended('pendataan_minta_' || p_pml::text, 0));
  select count(*) into terpakai from bencana_pendataan_permintaan where pml_id = p_pml and status <> 'dibatalkan' and not dari_kolam and not dari_admin;
  if terpakai + baru > p_maks then
    return jsonb_build_object('status','ditolak','alasan','melebihi_batas','sisa', greatest(p_maks - terpakai, 0));
  end if;
  for r in select * from jsonb_array_elements(p_pilihan) loop
    begin
      insert into bencana_pendataan_permintaan (idsubsls, pml_id, ppl_akun_id, tanggal, diminta_oleh)
      values (r->>'idsubsls', p_pml, (r->>'ppl_akun_id')::bigint, p_tanggal, p_akun) returning id into nid;
      ids := ids || nid;
    exception when unique_violation then
      raise exception 'SUDAH_DIMINTA';
    end;
  end loop;
  return jsonb_build_object('status','ok','ids', to_jsonb(ids));
exception when raise_exception then
  if sqlerrm = 'SUDAH_DIMINTA' then return jsonb_build_object('status','ditolak','alasan','sudah_diminta'); end if;
  raise;
end;
$function$;

-- Sub SLS yang belum diajukan (tidak ada permintaan menunggu/sudah keluar), aktif, dan sudah diplot atau masih di kolam; + plotting awal & pengajuan terakhir
create or replace function public.bencana_belum_diajukan()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'idsubsls', x.idsubsls, 'kecamatan', x.kecamatan, 'nagari', x.nagari, 'sls', x.sls, 'sub_sls', x.sub_sls,
    'kk', x.kk, 'didata', x.didata, 'kolam', x.kolam, 'plotting', x.plotting, 'terakhir', x.terakhir
  ) order by x.kecamatan, x.nagari, x.sls, x.sub_sls), '[]'::jsonb)
  from (
    select w.idsubsls, w.kecamatan, w.nagari, w.sls, w.sub_sls,
      (select count(*) from public.bencana_pendataan_kk q where q.idsubsls = w.idsubsls and q.aktif)::int as kk,
      (select count(*) from public.bencana_pendataan_kk q where q.idsubsls = w.idsubsls and q.aktif and q.hasil is not null)::int as didata,
      exists (select 1 from public.bencana_kolam_subsls k where k.idsubsls = w.idsubsls and k.aktif) as kolam,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'pml_id', a.pml_id, 'pml_nama', pm.nama, 'ppl_id', a.ppl_id, 'ppl_nama', pp.nama,
          'mode_kerja', a.mode_kerja, 'porsi_kk', a.porsi_kk, 'terkunci', a.terkunci
        ) order by a.id)
        from public.bencana_alokasi_subsls a
        left join public.bencana_petugas pm on pm.id = a.pml_id
        left join public.bencana_petugas pp on pp.id = a.ppl_id
        where a.idsubsls = w.idsubsls and a.pml_id is not null
      ), '[]'::jsonb) as plotting,
      (
        select jsonb_build_object(
          'status', p.status, 'pml_nama', pn.nama, 'waktu', coalesce(p.dibatalkan_at, p.diminta_at),
          'perlu_hapus', (p.status = 'dibatalkan' and p.selesai_at is not null and p.batal_diproses_at is null),
          'dari_kolam', p.dari_kolam, 'dari_admin', p.dari_admin
        )
        from public.bencana_pendataan_permintaan p
        left join public.bencana_petugas pn on pn.id = p.pml_id
        where p.idsubsls = w.idsubsls
        order by p.id desc limit 1
      ) as terakhir
    from public.bencana_wilayah w
    where not w.nonaktif
      and not exists (select 1 from public.bencana_pendataan_permintaan p where p.idsubsls = w.idsubsls and p.status in ('menunggu','sudah_keluar'))
      and (
        exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = w.idsubsls and a.pml_id is not null)
        or exists (select 1 from public.bencana_kolam_subsls k where k.idsubsls = w.idsubsls and k.aktif)
      )
  ) x;
$function$;

-- Daftar tim tujuan penugasan: PML peserta pelatihan + PPL-nya (peserta, aktif, punya akun aktif)
create or replace function public.bencana_tim_untuk_tugas()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'pml_id', m.id, 'pml_nama', m.nama,
    'sub', (select count(distinct a.idsubsls) from public.bencana_alokasi_subsls a where a.pml_id = m.id)::int,
    'ppl', coalesce((
      select jsonb_agg(jsonb_build_object(
        'petugas_id', t.id, 'nama', t.nama,
        'akun_id', (select min(ak.id) from public.sigap_akun ak where ak.petugas_bencana_id = t.id and ak.aktif)
      ) order by t.nama)
      from public.bencana_petugas t
      where t.peran = 'ppl' and t.aktif and t.atasan_id = m.id and public.bencana_peserta_pelatihan(t.id)
        and exists (select 1 from public.sigap_akun ak where ak.petugas_bencana_id = t.id and ak.aktif)
    ), '[]'::jsonb)
  ) order by m.nama), '[]'::jsonb)
  from public.bencana_petugas m
  where m.peran = 'pml' and m.aktif and public.bencana_peserta_pelatihan(m.id);
$function$;

-- Penugasan admin: pilihan = [{idsubsls, pml_id, ppl_akun_id}]. Atomik (satu transaksi, kunci kolam). Bila PML tujuan beda dari plotting awal, alokasi PML lain
-- dipindah (barisnya dikembalikan di "diganti" untuk audit; ditolak bila sudah ada KK yang didata). Membuat permintaan menunggu bertanda dari_admin.
create or replace function public.bencana_admin_tugaskan(p_akun bigint, p_tanggal date, p_pilihan jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  r jsonb; sub text; pml bigint; pplakun bigint; ppl_pet bigint; nid bigint;
  ids bigint[] := '{}'; lama jsonb; diganti jsonb := '[]'::jsonb; ada_target boolean; ada_lain boolean;
begin
  if jsonb_array_length(p_pilihan) < 1 then return jsonb_build_object('status','ditolak','alasan','kosong'); end if;
  perform pg_advisory_xact_lock(hashtextextended('kolam_wilayah', 0));

  for r in select * from jsonb_array_elements(p_pilihan) loop
    sub := r->>'idsubsls'; pml := (r->>'pml_id')::bigint; pplakun := (r->>'ppl_akun_id')::bigint;

    if exists (select 1 from public.bencana_wilayah w where w.idsubsls = sub and w.nonaktif) then raise exception 'TUGAS|nonaktif|%', sub; end if;
    if not exists (select 1 from public.bencana_wilayah w where w.idsubsls = sub) then raise exception 'TUGAS|tidak_ada|%', sub; end if;
    if not exists (select 1 from public.bencana_pendataan_kk k where k.idsubsls = sub and k.aktif) then raise exception 'TUGAS|tanpa_kk|%', sub; end if;

    select ak.petugas_bencana_id into ppl_pet from public.sigap_akun ak where ak.id = pplakun and ak.aktif;
    if ppl_pet is null
       or not exists (select 1 from public.bencana_petugas t where t.id = ppl_pet and t.aktif and t.peran = 'ppl' and t.atasan_id = pml)
       or not exists (select 1 from public.bencana_petugas t where t.id = pml and t.aktif and t.peran = 'pml') then
      raise exception 'TUGAS|ppl_bukan_tim|%', sub;
    end if;

    select exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = sub and a.pml_id = pml) into ada_target;
    select exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = sub and a.pml_id is not null and a.pml_id <> pml) into ada_lain;

    if ada_lain then
      if exists (select 1 from public.bencana_pendataan_kk k where k.idsubsls = sub and k.aktif and k.hasil is not null) then
        raise exception 'TUGAS|sudah_didata|%', sub;
      end if;
      select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into lama
        from public.bencana_alokasi_subsls a where a.idsubsls = sub and a.pml_id is not null and a.pml_id <> pml;
      delete from public.bencana_alokasi_subsls where idsubsls = sub and pml_id is not null and pml_id <> pml;
      diganti := diganti || jsonb_build_array(jsonb_build_object('idsubsls', sub, 'dari', lama));
    end if;

    if not ada_target then
      insert into public.bencana_alokasi_subsls (idsubsls, ppl_id, pml_id, mode_kerja, terkunci)
      values (sub, ppl_pet, pml, 'keroyok', true)
      on conflict (idsubsls, ppl_id) do update set pml_id = excluded.pml_id, mode_kerja = 'keroyok', terkunci = true;
    end if;

    begin
      insert into public.bencana_pendataan_permintaan (idsubsls, pml_id, ppl_akun_id, tanggal, diminta_oleh, dari_admin)
      values (sub, pml, pplakun, p_tanggal, p_akun, true) returning id into nid;
      ids := ids || nid;
    exception when unique_violation then
      raise exception 'TUGAS|sudah_diminta|%', sub;
    end;
  end loop;
  return jsonb_build_object('status','ok','ids', to_jsonb(ids), 'diganti', diganti);
exception
  when raise_exception then
    if sqlerrm like 'TUGAS|%' then
      return jsonb_build_object('status','ditolak','alasan', split_part(sqlerrm, '|', 2), 'idsubsls', split_part(sqlerrm, '|', 3));
    end if;
    if sqlerrm = 'SUB_NONAKTIF' then return jsonb_build_object('status','ditolak','alasan','nonaktif'); end if;
    raise;
  when check_violation then
    return jsonb_build_object('status','ditolak','alasan','bukan_peserta');
end;
$function$;

-- hanya service_role (server Next.js) yang boleh memanggil (pelajaran insiden RLS: jangan biarkan anon/authenticated mengeksekusi fungsi SECURITY DEFINER)
revoke all on function public.bencana_belum_diajukan() from public, anon, authenticated;
revoke all on function public.bencana_tim_untuk_tugas() from public, anon, authenticated;
revoke all on function public.bencana_admin_tugaskan(bigint, date, jsonb) from public, anon, authenticated;
grant execute on function public.bencana_belum_diajukan() to service_role;
grant execute on function public.bencana_tim_untuk_tugas() to service_role;
grant execute on function public.bencana_admin_tugaskan(bigint, date, jsonb) to service_role;
