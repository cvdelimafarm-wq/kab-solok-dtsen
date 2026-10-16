-- 20261016e_kolam_izin.sql
-- (16 Okt 2026) Kolam wilayah kerja: IZIN KHUSUS -- PML yang dikecualikan dari syarat "wilayah awal selesai > 70%" (keputusan pemilik).
-- Syarat lain TETAP berlaku bagi PML yang diberi izin: maks. 2 Sub SLS sekali pilih; pilih lagi hanya setelah seluruh tambahan dari kolam selesai >= 50%;
-- satu Sub SLS satu tim; kuota 7/9/11 tidak terpakai.
-- Prasyarat: 20261016c_kolam_wilayah.sql sudah dijalankan. Idempotent. Tidak ada data dihapus.
--
-- Isi: (1) tabel bencana_kolam_izin + izin pertama: tim Lucky Melan Sari (bencana_petugas id 200);
--      (2) bencana_kolam_progres menambah kunci 'izin_wilayah' (true/false);
--      (3) bencana_kolam_pilih melewati syarat wilayah bila PML punya izin.
-- Mencabut izin nanti: update public.bencana_kolam_izin set aktif = false where pml_id = 200;
-- Menambah PML lain nanti:  insert into public.bencana_kolam_izin (pml_id, alasan) values (<id petugas PML>, '<alasan>');

begin;

create table if not exists public.bencana_kolam_izin (
  pml_id bigint primary key references public.bencana_petugas(id),
  alasan text not null default '',
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now()
);
alter table public.bencana_kolam_izin enable row level security;

insert into public.bencana_kolam_izin (pml_id, alasan)
select p.id, 'Wilayah kerja habis (kuota pengajuan terpakai); izin pemilik 16 Okt 2026'
from public.bencana_petugas p
where p.id = 200 and p.nama ilike 'Lucky Melan Sari%'
on conflict (pml_id) do nothing;

-- (2) progres: tambah izin_wilayah ---------------------------------------------------------------------------------------
create or replace function public.bencana_kolam_progres(p_pml bigint)
 returns jsonb
 language sql stable security definer set search_path to 'public'
as $function$
  with kolam as (
    select p.idsubsls from public.bencana_pendataan_permintaan p
    where p.pml_id = p_pml and p.dari_kolam and p.status in ('menunggu','sudah_keluar')
  ), awal as (
    select distinct a.idsubsls from public.bencana_alokasi_subsls a
    where a.pml_id = p_pml and a.idsubsls not in (select idsubsls from kolam)
  )
  select jsonb_build_object(
    'awal_total',      (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.idsubsls in (select idsubsls from awal)),
    'awal_didata',     (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.hasil is not null and k.idsubsls in (select idsubsls from awal)),
    'tambahan_sub',    (select count(*) from kolam),
    'tambahan_total',  (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.idsubsls in (select idsubsls from kolam)),
    'tambahan_didata', (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.hasil is not null and k.idsubsls in (select idsubsls from kolam)),
    'izin_wilayah',    exists (select 1 from public.bencana_kolam_izin z where z.pml_id = p_pml and z.aktif)
  );
$function$;

-- (3) pilih: lewati syarat wilayah bila ada izin ---------------------------------------------------------------------------
create or replace function public.bencana_kolam_pilih(p_pml bigint, p_akun bigint, p_tanggal date, p_pilihan jsonb, p_maks int, p_syarat_awal numeric, p_syarat_tambahan numeric)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  baru int; pr jsonb; aw_t int; aw_d int; tm_n int; tm_t int; tm_d int; izin boolean;
  r jsonb; ids bigint[] := '{}'; nid bigint; aid bigint; ppl_pet bigint; sub text;
begin
  baru := jsonb_array_length(p_pilihan);
  if baru < 1 then return jsonb_build_object('status','ditolak','alasan','kosong'); end if;
  perform pg_advisory_xact_lock(hashtextextended('kolam_wilayah', 0));

  pr := public.bencana_kolam_progres(p_pml);
  aw_t := (pr->>'awal_total')::int; aw_d := (pr->>'awal_didata')::int;
  tm_n := (pr->>'tambahan_sub')::int; tm_t := (pr->>'tambahan_total')::int; tm_d := (pr->>'tambahan_didata')::int;
  izin := coalesce((pr->>'izin_wilayah')::boolean, false);

  -- syarat 1: wilayah awal selesai LEBIH DARI p_syarat_awal persen (dikecualikan bila PML punya izin khusus)
  if not izin and (aw_t = 0 or aw_d * 100 <= p_syarat_awal * aw_t) then
    return jsonb_build_object('status','ditolak','alasan','wilayah','d',aw_d,'t',aw_t);
  end if;
  -- syarat 2: seluruh tambahan sebelumnya selesai SEKURANGNYA p_syarat_tambahan persen
  if tm_n > 0 and (tm_t = 0 or tm_d * 100 < p_syarat_tambahan * tm_t) then
    return jsonb_build_object('status','ditolak','alasan','tambahan','d',tm_d,'t',tm_t,'n',tm_n);
  end if;
  -- syarat 3: paling banyak p_maks Sub SLS sekali pilih
  if baru > p_maks then
    return jsonb_build_object('status','ditolak','alasan','maks','maks',p_maks);
  end if;

  for r in select * from jsonb_array_elements(p_pilihan) loop
    sub := r->>'idsubsls';
    if not exists (select 1 from public.bencana_kolam_subsls k where k.idsubsls = sub and k.aktif) then
      return jsonb_build_object('status','ditolak','alasan','bukan_kolam','idsubsls',sub);
    end if;
    if exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = sub and a.pml_id is not null) then
      return jsonb_build_object('status','ditolak','alasan','diambil','idsubsls',sub);
    end if;
    select petugas_bencana_id into ppl_pet from public.sigap_akun where id = (r->>'ppl_akun_id')::bigint;
    if ppl_pet is null then
      return jsonb_build_object('status','ditolak','alasan','ppl_tanpa_petugas','idsubsls',sub);
    end if;
    begin
      insert into public.bencana_pendataan_permintaan (idsubsls, pml_id, ppl_akun_id, tanggal, diminta_oleh, dari_kolam)
      values (sub, p_pml, (r->>'ppl_akun_id')::bigint, p_tanggal, p_akun, true) returning id into nid;
      insert into public.bencana_alokasi_subsls (idsubsls, ppl_id, pml_id, mode_kerja, terkunci)
      values (sub, ppl_pet, p_pml, 'keroyok', true) returning id into aid;
      update public.bencana_pendataan_permintaan set alokasi_id = aid where id = nid;
      ids := ids || nid;
    exception when unique_violation then
      raise exception 'DIAMBIL';
    end;
  end loop;
  return jsonb_build_object('status','ok','ids', to_jsonb(ids));
exception when raise_exception then
  if sqlerrm = 'DIAMBIL' then return jsonb_build_object('status','ditolak','alasan','diambil'); end if;
  raise;
end;
$function$;

revoke all on function public.bencana_kolam_progres(bigint) from public, anon, authenticated;
revoke all on function public.bencana_kolam_pilih(bigint, bigint, date, jsonb, int, numeric, numeric) from public, anon, authenticated;
grant execute on function public.bencana_kolam_progres(bigint) to service_role;
grant execute on function public.bencana_kolam_pilih(bigint, bigint, date, jsonb, int, numeric, numeric) to service_role;

do $$
declare n int;
begin
  select count(*) into n from public.bencana_kolam_izin where aktif;
  raise notice 'izin kolam aktif: % (perkiraan 1: Lucky Melan Sari)', n;
end $$;

commit;
