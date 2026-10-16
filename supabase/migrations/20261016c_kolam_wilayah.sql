-- (16 Okt 2026) KOLAM WILAYAH KERJA pendataan pascabencana -- Sub SLS berstatus Terdampak (FASIH, 16 Okt 2026) yang belum terplot ke tim.
-- Dijalankan SENDIRI oleh pemilik di Supabase > SQL Editor (proyek nlwkpakyfprugqwklxiu). Satu transaksi; gagal = tidak ada yang berubah. Aman diulang (idempotent).
-- Tidak menghapus data. Tidak mengubah plotting yang sudah ada.
--
-- Aturan (keputusan pemilik, 16 Okt 2026):
--  * Hanya tim (PML) yang wilayah kerja awalnya SELESAI > 70% KK (KK ber-hasil / KK aktif di daftar) yang boleh memilih dari kolam.
--  * Maksimal 2 Sub SLS sekali pilih. Pilih lagi hanya bila SELURUH tambahan dari kolam sudah selesai >= 50% KK.
--  * Satu Sub SLS satu tim; tercatat tim mana (pml_id) dan kapan (diminta_at). Pilihan kolam TIDAK menghabiskan kuota total 7/9/11.
--  * Pilihan = permintaan ke admin (sama dengan plotting biasa) + baris bencana_alokasi_subsls (pml, ppl, 'keroyok', terkunci) dalam SATU transaksi,
--    sehingga peta, daftar KK, monitoring, dan translok tim langsung ikut. Batal -> baris alokasi yang dibuat pilihan itu dilepas (bencana_kolam_lepas).
--
-- Isi:
--  1) Tabel bencana_kolam_subsls (daftar kolam) + diisi dari 194 Sub SLS Terdampak Excel FASIH (hanya yang belum punya PML)
--  2) Kolom bencana_pendataan_permintaan.dari_kolam dan alokasi_id
--  3) Fungsi bencana_kolam_progres, bencana_kolam_daftar, bencana_kolam_pilih, bencana_kolam_lepas
--  4) bencana_pendataan_minta_total (batas 7/9/11) tidak lagi menghitung permintaan dari kolam

begin;

-- 1) daftar kolam -------------------------------------------------------------------------------------------------------
create table if not exists public.bencana_kolam_subsls (
  idsubsls text primary key check (idsubsls ~ '^[0-9]{16}$'),
  sumber text not null default 'FASIH 16 Okt 2026',
  aktif boolean not null default true,
  ditambah_at timestamptz not null default now()
);
alter table public.bencana_kolam_subsls enable row level security;

insert into public.bencana_kolam_subsls (idsubsls)
select t.id
from unnest(array['1303040002000900','1303040002001200','1303040002001300','1303040002001400','1303050002000101','1303050002000102','1303050002000103','1303050002000104','1303050002000105','1303050002000106','1303050002001401','1303050002001405','1303050004000103','1303050004000104','1303050004000105','1303050004000106','1303050004000202','1303050004000203','1303050004000301','1303050004000304','1303050004000601','1303050004000602','1303071002000101','1303080001000501','1303080001000801','1303080001000802','1303080004000601','1303080004000602','1303080004000702','1303080005000201','1303080005000202','1303080007000104','1303080007000108','1303080007000109','1303080007000111','1303080007000201','1303080007000202','1303080007000204','1303080007000205','1303080007000303','1303090005000100','1303100006000200','1303110006000101','1303110006000102','1303110006000103','1303110006000200','1303110006000300','1303110006000400','1303110006000501','1303110006000502','1303110007000101','1303110007000102','1303110007000103','1303110007000104','1303110007000105','1303110007000106','1303110007000107','1303110007000108','1303110007000109','1303110007000110','1303110007000201','1303110007000202','1303110007000203','1303110007000204','1303110007000205','1303110007000206','1303110007000207','1303110007000208','1303110007000209','1303110007000301','1303110007000302','1303110007000303','1303110007000304','1303110007000305','1303110007000306','1303110007000307','1303110007000308','1303110007000401','1303110007000402','1303110007000403','1303110007000404','1303110007000405','1303110007000406','1303110007000407','1303110007000408','1303110007000409','1303110008000101','1303110008000102','1303110008000103','1303110008000104','1303110008000105','1303110008000106','1303110008000201','1303110008000202','1303110008000203','1303110008000502','1303110008000503','1303110008000504','1303110008000505','1303110008000506','1303110008000507','1303110008000701','1303110008000702','1303120007000100','1303120009000102','1303120009000800','1303130001000101','1303130001000102','1303130001000601','1303130001000602','1303130002000101','1303130002000102','1303130002000103','1303130002000200','1303130004000101','1303130004000102','1303130004000103','1303130004000200','1303130004000300','1303130004000400','1303130004000501','1303130004000502','1303130004000600','1303130004000701','1303130004000702','1303130004000703','1303130004000801','1303130004000802','1303130004000803','1303130004000804','1303130004000900','1303130004001001','1303130004001002','1303130004001101','1303130004001102','1303130004001201','1303130004001202','1303130005000101','1303130005000103','1303130005000201','1303130005000202','1303130005000301','1303130005000302','1303130005000303','1303130005000401','1303130005000402','1303130005000501','1303130005000502','1303130005000503','1303130005000600','1303130006000102','1303130006000201','1303130006000202','1303130006000203','1303130006000205','1303130006000301','1303130006000302','1303130006000303','1303130006000402','1303130006000403','1303140001000100','1303140001000201','1303140001000202','1303140001000300','1303140001000400','1303140001000500','1303140002000101','1303140002000102','1303140002000103','1303140002000104','1303140002000105','1303140002000106','1303140002000107','1303140002000201','1303140002000202','1303140002000203','1303140002000301','1303140002000302','1303140002000303','1303140002000304','1303140002000401','1303140002000402','1303140002000403','1303140002000404','1303140002000501','1303140002000502','1303140002000503','1303140002000504','1303140002000505','1303140002000601','1303140002000602','1303140002000603','1303140002000604','1303140002000605']::text[]) as t(id)
where exists (select 1 from public.bencana_wilayah w where w.idsubsls = t.id)
  and not exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = t.id and a.pml_id is not null)
on conflict (idsubsls) do nothing;

-- 2) kolom penanda ------------------------------------------------------------------------------------------------------
alter table public.bencana_pendataan_permintaan add column if not exists dari_kolam boolean not null default false;
alter table public.bencana_pendataan_permintaan add column if not exists alokasi_id bigint;
create index if not exists bencana_pendataan_permintaan_kolam on public.bencana_pendataan_permintaan (pml_id) where dari_kolam;

-- 3a) progres tim: wilayah awal dan tambahan dari kolam (KK ber-hasil / KK aktif) -----------------------------------------
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
    'tambahan_didata', (select count(*) from public.bencana_pendataan_kk k where k.aktif and k.hasil is not null and k.idsubsls in (select idsubsls from kolam))
  );
$function$;

-- 3b) isi kolam: yang masih bebas + yang sudah dipilih tim (lengkap: siapa dan kapan) -------------------------------------
create or replace function public.bencana_kolam_daftar()
 returns jsonb
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'idsubsls', x.idsubsls, 'kecamatan', x.kecamatan, 'nagari', x.nagari, 'sls', x.sls, 'sub_sls', x.sub_sls,
    'kk', x.kk, 'didata', x.didata, 'diambil_pml_id', x.pml_id, 'diambil_nama', x.pml_nama, 'diambil_at', x.diminta_at
  ) order by x.kecamatan, x.nagari, x.sls, x.sub_sls), '[]'::jsonb)
  from (
    select k.idsubsls, w.kecamatan, w.nagari, w.sls, w.sub_sls,
      (select count(*) from public.bencana_pendataan_kk q where q.idsubsls = k.idsubsls and q.aktif)::int as kk,
      (select count(*) from public.bencana_pendataan_kk q where q.idsubsls = k.idsubsls and q.aktif and q.hasil is not null)::int as didata,
      pr.pml_id, pn.nama as pml_nama, pr.diminta_at
    from public.bencana_kolam_subsls k
    join public.bencana_wilayah w on w.idsubsls = k.idsubsls
    left join lateral (
      select p.id, p.pml_id, p.diminta_at from public.bencana_pendataan_permintaan p
      where p.idsubsls = k.idsubsls and p.dari_kolam and p.status in ('menunggu','sudah_keluar') order by p.id desc limit 1
    ) pr on true
    left join public.bencana_petugas pn on pn.id = pr.pml_id
    where k.aktif
      and (pr.id is not null or not exists (select 1 from public.bencana_alokasi_subsls a where a.idsubsls = k.idsubsls and a.pml_id is not null))
  ) x;
$function$;

-- 3c) pilih dari kolam (atomik; satu kunci global agar dua PML tidak mengambil Sub SLS yang sama) ---------------------------
create or replace function public.bencana_kolam_pilih(p_pml bigint, p_akun bigint, p_tanggal date, p_pilihan jsonb, p_maks int, p_syarat_awal numeric, p_syarat_tambahan numeric)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  baru int; pr jsonb; aw_t int; aw_d int; tm_n int; tm_t int; tm_d int;
  r jsonb; ids bigint[] := '{}'; nid bigint; aid bigint; ppl_pet bigint; sub text;
begin
  baru := jsonb_array_length(p_pilihan);
  if baru < 1 then return jsonb_build_object('status','ditolak','alasan','kosong'); end if;
  perform pg_advisory_xact_lock(hashtextextended('kolam_wilayah', 0));

  pr := public.bencana_kolam_progres(p_pml);
  aw_t := (pr->>'awal_total')::int; aw_d := (pr->>'awal_didata')::int;
  tm_n := (pr->>'tambahan_sub')::int; tm_t := (pr->>'tambahan_total')::int; tm_d := (pr->>'tambahan_didata')::int;

  -- syarat 1: wilayah awal selesai LEBIH DARI p_syarat_awal persen
  if aw_t = 0 or aw_d * 100 <= p_syarat_awal * aw_t then
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

-- 3d) lepas pilihan kolam yang dibatalkan: hanya baris alokasi yang DIBUAT pilihan itu; ditolak bila sudah ada KK ber-hasil ---
create or replace function public.bencana_kolam_lepas(p_permintaan bigint)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare p record; n int;
begin
  select id, idsubsls, pml_id, status, dari_kolam, alokasi_id into p from public.bencana_pendataan_permintaan where id = p_permintaan;
  if not found or not p.dari_kolam or p.status <> 'dibatalkan' then return jsonb_build_object('status','tidak_berlaku'); end if;
  if p.alokasi_id is null then return jsonb_build_object('status','ok','dilepas',0); end if;
  if exists (select 1 from public.bencana_pendataan_kk k where k.idsubsls = p.idsubsls and k.aktif and k.hasil is not null) then
    return jsonb_build_object('status','ditolak','alasan','sudah_didata');
  end if;
  delete from public.bencana_alokasi_subsls where id = p.alokasi_id and pml_id = p.pml_id;
  get diagnostics n = row_count;
  return jsonb_build_object('status','ok','dilepas',n);
end;
$function$;

-- 4) batas total 7/9/11 tidak menghitung permintaan dari kolam (isi sama dengan versi 14 Okt, ditambah "and not dari_kolam") -----
create or replace function public.bencana_pendataan_minta_total(p_pml bigint, p_akun bigint, p_tanggal date, p_pilihan jsonb, p_maks int default 5)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
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
  select count(*) into terpakai from bencana_pendataan_permintaan where pml_id = p_pml and status <> 'dibatalkan' and not dari_kolam;
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

revoke all on function public.bencana_kolam_progres(bigint) from public, anon, authenticated;
revoke all on function public.bencana_kolam_daftar() from public, anon, authenticated;
revoke all on function public.bencana_kolam_pilih(bigint, bigint, date, jsonb, int, numeric, numeric) from public, anon, authenticated;
revoke all on function public.bencana_kolam_lepas(bigint) from public, anon, authenticated;
revoke all on function public.bencana_pendataan_minta_total(bigint, bigint, date, jsonb, int) from public, anon, authenticated;
grant execute on function public.bencana_kolam_progres(bigint) to service_role;
grant execute on function public.bencana_kolam_daftar() to service_role;
grant execute on function public.bencana_kolam_pilih(bigint, bigint, date, jsonb, int, numeric, numeric) to service_role;
grant execute on function public.bencana_kolam_lepas(bigint) to service_role;
grant execute on function public.bencana_pendataan_minta_total(bigint, bigint, date, jsonb, int) to service_role;

-- Pemeriksaan akhir; gagal = rollback otomatis
do $$
declare n int;
begin
  select count(*) into n from public.bencana_kolam_subsls where aktif;
  if n < 1 then raise exception 'Kolam kosong -- periksa bencana_wilayah / bencana_alokasi_subsls'; end if;
  raise notice 'Kolam wilayah: % Sub SLS aktif (perkiraan 84 pada 16 Okt 2026)', n;
end $$;

commit;

-- Pemeriksaan sesudahnya:
--   select count(*) from public.bencana_kolam_subsls;                       -- perkiraan 84
--   select jsonb_array_length(public.bencana_kolam_daftar());               -- sama
--   select public.bencana_kolam_progres(431);                               -- progres tim Lia angraini
--
-- Untuk menutup kolam (tidak ada data yang hilang):  update public.bencana_kolam_subsls set aktif = false;
-- Untuk mengembalikan pilihan kolam yang keliru: batalkan lewat layar PML ("Batalkan" / "Ajukan pembatalan") -- bukan lewat SQL.
