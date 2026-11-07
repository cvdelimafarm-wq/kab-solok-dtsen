-- 20261107g_ganti_cadangan.sql
-- Tahap B rancangan "sampel lintas survei": PENGGANTIAN sampel utama dengan cadangan, atas persetujuan PML.
-- Syarat: 20261107e (master/alokasi) dan 20261107f (tag + jendela) sudah dijalankan.
--
--  1. sigap_sampel_konfig.sinkron_ke_master : 'tidak' (bawaan) | 'usulan'. 'usulan' menandai pengajuan ber-alasan tidak ditemukan/pindah/kosong sebagai
--                            USULAN pembaruan master KK (tidak mengubah master; Ketua meninjau di menu Master, tahap C). 'otomatis' sengaja belum ada.
--  2. sigap_sampel_ganti    : satu baris = satu pengajuan (kegiatan, KK utama, KK cadangan, alasan baku, catatan) beserta keputusan PML/admin. Riwayat tidak dihapus.
--  3. Fungsi (security definer, hanya service_role):
--       sigap_ganti_ajukan(kegiatan, akun, utama_kk, cadangan_kk, alasan, catatan)  PPL pemilik sub SLS, hanya SESUDAH jendela terkunci
--       sigap_ganti_batal(kegiatan, akun, id)                                         pengaju membatalkan selama masih menunggu
--       sigap_ganti_putus(kegiatan, akun, id, setuju, catatan, admin)                 PML sub SLS (atau admin atas nama) menyetujui/menolak
--
-- Aturan inti:
--   * Selama jendela rilis TERBUKA PPL cukup melepas/menandai ulang (A2); pengajuan hanya berlaku sesudah daftar sampel DIKUNCI.
--   * Yang bisa diganti: sampel utama yang belum berhasil didata (hasil kosong, menolak, atau tidak ditemukan). Pengganti: sampel cadangan sub SLS yang sama,
--     belum berhasil, bebas dipilih PPL (tanpa urutan). Satu pengajuan menunggu per KK utama dan per KK cadangan.
--   * Persetujuan atomik: tag utama lama dilepas (riwayat tetap), tag cadangan dilepas lalu dipasang kembali sebagai UTAMA; jumlah utama per sub SLS tetap.
--     Pengajuan yang tag-nya sudah berubah saat diputus ditolak sistem (TAG_BERUBAH) agar tidak ada penggantian kosong.
--   * Keputusan hanya oleh PML sub SLS itu; admin (Ketua/Wakil, izin dicek di API) boleh memutus atas nama dan tercatat sebagai 'admin'. Penolakan wajib bercatatan.
--   * Aturan 'boleh_ganti' kegiatan dihormati (sigap_sampel_konfig.boleh_ganti; bawaan boleh).
-- Aman dijalankan ulang.

begin;

alter table public.sigap_sampel_konfig add column if not exists sinkron_ke_master text not null default 'tidak' check (sinkron_ke_master in ('tidak', 'usulan'));
comment on column public.sigap_sampel_konfig.sinkron_ke_master is 'Penggantian cadangan: tidak = tak menyentuh master KK; usulan = tandai usulan pembaruan master (Ketua meninjau).';

create table if not exists public.sigap_sampel_ganti (
  id             bigint generated always as identity primary key,
  kegiatan_id    bigint not null references public.sigap_kegiatan(id) on delete cascade,
  idsubsls       text   not null references public.master_wilayah(idsubsls),
  utama_kk_id    bigint not null references public.master_kk(id),
  cadangan_kk_id bigint not null references public.master_kk(id),
  alasan         text   not null check (alasan in ('tidak_ditemukan', 'menolak', 'pindah', 'kosong', 'lainnya')),
  catatan        text,
  status         text   not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  usul_master    boolean not null default false,
  diajukan_oleh  bigint references public.sigap_akun(id),
  diajukan_nama  text,
  diajukan_at    timestamptz not null default now(),
  diputus_oleh   bigint references public.sigap_akun(id),
  diputus_nama   text,
  diputus_at     timestamptz,
  putus_sebagai  text check (putus_sebagai is null or putus_sebagai in ('pml', 'admin')),
  catatan_putus  text,
  check (utama_kk_id <> cadangan_kk_id)
);
create unique index if not exists sigap_sampel_ganti_utama_uq on public.sigap_sampel_ganti (kegiatan_id, utama_kk_id) where status = 'menunggu';
create unique index if not exists sigap_sampel_ganti_cad_uq on public.sigap_sampel_ganti (kegiatan_id, cadangan_kk_id) where status = 'menunggu';
create index if not exists sigap_sampel_ganti_keg_idx on public.sigap_sampel_ganti (kegiatan_id, id desc);
create index if not exists sigap_sampel_ganti_sub_idx on public.sigap_sampel_ganti (kegiatan_id, idsubsls);

alter table public.sigap_sampel_ganti enable row level security;
revoke all on table public.sigap_sampel_ganti from anon, authenticated;
grant all on table public.sigap_sampel_ganti to service_role;
grant usage, select on all sequences in schema public to service_role;
comment on table public.sigap_sampel_ganti is 'Pengajuan penggantian sampel utama dengan cadangan (stage 2) dan keputusan PML/admin.';

-- 3a. pengajuan (PPL) ---------------------------------------------------------------------------------------------------------------
create or replace function public.sigap_ganti_ajukan(p_kegiatan bigint, p_akun bigint, p_utama bigint, p_cadangan bigint, p_alasan text, p_catatan text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_u record; v_c record; v_ppl bigint; v_status text; v_boleh boolean; v_sinkron text;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_id bigint; v_usul boolean;
begin
  if p_alasan is null or p_alasan not in ('tidak_ditemukan', 'menolak', 'pindah', 'kosong', 'lainnya') then
    return jsonb_build_object('ok', false, 'kode', 'ALASAN_TIDAK_SAH', 'pesan', 'Pilih alasan penggantian yang tersedia.');
  end if;
  if p_alasan = 'lainnya' and char_length(coalesce(v_catatan, '')) < 5 then
    return jsonb_build_object('ok', false, 'kode', 'CATATAN_WAJIB', 'pesan', 'Alasan "lainnya" wajib diberi catatan (minimal 5 huruf).');
  end if;
  if v_catatan is not null and char_length(v_catatan) > 500 then
    return jsonb_build_object('ok', false, 'kode', 'CATATAN_PANJANG', 'pesan', 'Catatan maksimal 500 huruf.');
  end if;
  if p_utama is not distinct from p_cadangan then
    return jsonb_build_object('ok', false, 'kode', 'KK_SAMA', 'pesan', 'KK utama dan cadangan tidak boleh sama.');
  end if;

  select t.id, t.idsubsls, t.peran, t.hasil into v_u from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = p_utama and t.dilepas_at is null;
  if not found or v_u.peran <> 'utama' then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_UTAMA', 'pesan', 'KK yang diganti harus berstatus sampel utama.');
  end if;
  perform pg_advisory_xact_lock(hashtext('sigap_tag:' || p_kegiatan::text || ':' || v_u.idsubsls));
  -- baca ulang sesudah kunci
  select t.id, t.idsubsls, t.peran, t.hasil into v_u from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = p_utama and t.dilepas_at is null;
  if not found or v_u.peran <> 'utama' then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_UTAMA', 'pesan', 'KK yang diganti harus berstatus sampel utama.');
  end if;

  select b.ppl_akun_id into v_ppl from public.sigap_tag_batas(p_kegiatan, v_u.idsubsls) b;
  if v_ppl is distinct from p_akun then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_PPL', 'pesan', 'Hanya PPL sub SLS ini yang dapat mengajukan penggantian.');
  end if;
  select coalesce((select k.boleh_ganti from public.sigap_sampel_konfig k where k.kegiatan_id = p_kegiatan), true),
         coalesce((select k.sinkron_ke_master from public.sigap_sampel_konfig k where k.kegiatan_id = p_kegiatan), 'tidak')
    into v_boleh, v_sinkron;
  if not v_boleh then
    return jsonb_build_object('ok', false, 'kode', 'GANTI_DILARANG', 'pesan', 'Kegiatan ini tidak mengizinkan penggantian sampel oleh PPL.');
  end if;
  v_status := public.sigap_jendela_status(p_kegiatan);
  if v_status = 'belum' then
    return jsonb_build_object('ok', false, 'kode', 'JENDELA_BELUM', 'pesan', 'Penandaan sampel belum dibuka, belum ada sampel yang dikunci.');
  end if;
  if v_status = 'terbuka' then
    return jsonb_build_object('ok', false, 'kode', 'MASIH_TERBUKA', 'pesan', 'Penandaan sampel masih dibuka. Lepas atau tandai ulang langsung; pengajuan penggantian berlaku setelah daftar sampel dikunci.');
  end if;
  if v_u.hasil = 'didata' then
    return jsonb_build_object('ok', false, 'kode', 'SUDAH_DIDATA', 'pesan', 'Sampel utama ini sudah berhasil didata, tidak perlu diganti.');
  end if;

  select t.id, t.idsubsls, t.peran, t.hasil into v_c from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = p_cadangan and t.dilepas_at is null;
  if not found or v_c.peran <> 'cadangan' or v_c.idsubsls <> v_u.idsubsls then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_CADANGAN', 'pesan', 'Pengganti harus sampel cadangan pada sub SLS yang sama.');
  end if;
  if v_c.hasil is not null then
    return jsonb_build_object('ok', false, 'kode', 'CADANGAN_SUDAH_HASIL', 'pesan', 'Cadangan ini sudah punya hasil pendataan.');
  end if;
  if exists (select 1 from public.sigap_sampel_ganti g where g.kegiatan_id = p_kegiatan and g.status = 'menunggu' and (g.utama_kk_id in (p_utama, p_cadangan) or g.cadangan_kk_id in (p_utama, p_cadangan))) then
    return jsonb_build_object('ok', false, 'kode', 'SUDAH_DIAJUKAN', 'pesan', 'KK ini sudah ada dalam pengajuan yang menunggu keputusan PML.');
  end if;

  v_usul := v_sinkron = 'usulan' and p_alasan in ('tidak_ditemukan', 'pindah', 'kosong');
  insert into public.sigap_sampel_ganti (kegiatan_id, idsubsls, utama_kk_id, cadangan_kk_id, alasan, catatan, usul_master, diajukan_oleh, diajukan_nama)
  values (p_kegiatan, v_u.idsubsls, p_utama, p_cadangan, p_alasan, v_catatan, v_usul, p_akun, (select a.nama from public.sigap_akun a where a.id = p_akun))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$function$;

-- 3b. pembatalan oleh pengaju -------------------------------------------------------------------------------------------------------
create or replace function public.sigap_ganti_batal(p_kegiatan bigint, p_akun bigint, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_g record; v_status text;
begin
  select g.id, g.diajukan_oleh, g.idsubsls into v_g from public.sigap_sampel_ganti g where g.id = p_id and g.kegiatan_id = p_kegiatan;
  if not found then
    return jsonb_build_object('ok', false, 'kode', 'TIDAK_ADA', 'pesan', 'Pengajuan tidak ditemukan.');
  end if;
  perform pg_advisory_xact_lock(hashtext('sigap_tag:' || p_kegiatan::text || ':' || v_g.idsubsls));
  select g.status into v_status from public.sigap_sampel_ganti g where g.id = p_id;
  if v_g.diajukan_oleh is distinct from p_akun then
    return jsonb_build_object('ok', false, 'kode', 'BUKAN_PENGAJU', 'pesan', 'Hanya pengaju yang dapat membatalkan pengajuan ini.');
  end if;
  if v_status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'kode', 'SUDAH_DIPUTUS', 'pesan', 'Pengajuan ini sudah diputuskan, tidak dapat dibatalkan.');
  end if;
  update public.sigap_sampel_ganti set status = 'dibatalkan', diputus_at = now(), diputus_oleh = p_akun, diputus_nama = (select a.nama from public.sigap_akun a where a.id = p_akun), putus_sebagai = null where id = p_id;
  return jsonb_build_object('ok', true);
end
$function$;

-- 3c. keputusan PML / admin ---------------------------------------------------------------------------------------------------------
create or replace function public.sigap_ganti_putus(p_kegiatan bigint, p_akun bigint, p_id bigint, p_setuju boolean, p_catatan text, p_admin boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_g record; v_pml bigint; v_u record; v_c record;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_nama text := (select a.nama from public.sigap_akun a where a.id = p_akun);
begin
  select g.id, g.idsubsls, g.utama_kk_id, g.cadangan_kk_id, g.diajukan_oleh into v_g from public.sigap_sampel_ganti g where g.id = p_id and g.kegiatan_id = p_kegiatan;
  if not found then
    return jsonb_build_object('ok', false, 'kode', 'TIDAK_ADA', 'pesan', 'Pengajuan tidak ditemukan.');
  end if;
  perform pg_advisory_xact_lock(hashtext('sigap_tag:' || p_kegiatan::text || ':' || v_g.idsubsls));
  if (select g.status from public.sigap_sampel_ganti g where g.id = p_id) <> 'menunggu' then
    return jsonb_build_object('ok', false, 'kode', 'SUDAH_DIPUTUS', 'pesan', 'Pengajuan ini sudah diputuskan.');
  end if;
  if not coalesce(p_admin, false) then
    select a.pml_akun_id into v_pml from public.sigap_alokasi_wilayah a where a.kegiatan_id = p_kegiatan and a.idsubsls = v_g.idsubsls and a.nonaktif_at is null;
    if v_pml is null or v_pml is distinct from p_akun then
      return jsonb_build_object('ok', false, 'kode', 'BUKAN_PML', 'pesan', 'Hanya PML sub SLS ini yang dapat memutuskan pengajuan.');
    end if;
  end if;

  if p_setuju is not true then
    if char_length(coalesce(v_catatan, '')) < 3 then
      return jsonb_build_object('ok', false, 'kode', 'CATATAN_TOLAK_WAJIB', 'pesan', 'Penolakan wajib diberi catatan (minimal 3 huruf) agar PPL tahu alasannya.');
    end if;
    update public.sigap_sampel_ganti set status = 'ditolak', diputus_at = now(), diputus_oleh = p_akun, diputus_nama = v_nama,
      putus_sebagai = case when coalesce(p_admin, false) then 'admin' else 'pml' end, catatan_putus = v_catatan where id = p_id;
    return jsonb_build_object('ok', true, 'status', 'ditolak');
  end if;

  select t.id, t.peran, t.hasil into v_u from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = v_g.utama_kk_id and t.dilepas_at is null;
  if not found or v_u.peran <> 'utama' or v_u.hasil = 'didata' then
    return jsonb_build_object('ok', false, 'kode', 'TAG_BERUBAH', 'pesan', 'Sampel utama berubah sejak diajukan (dilepas atau sudah didata). Tolak pengajuan ini.');
  end if;
  select t.id, t.peran, t.hasil into v_c from public.sigap_sampel_tag t where t.kegiatan_id = p_kegiatan and t.kk_id = v_g.cadangan_kk_id and t.dilepas_at is null;
  if not found or v_c.peran <> 'cadangan' or v_c.hasil is not null then
    return jsonb_build_object('ok', false, 'kode', 'TAG_BERUBAH', 'pesan', 'Sampel cadangan berubah sejak diajukan. Tolak pengajuan ini.');
  end if;

  update public.sigap_sampel_tag set dilepas_at = now(), dilepas_oleh = p_akun, alasan_lepas = 'diganti cadangan (pengajuan #' || p_id || ')' where id = v_u.id;
  update public.sigap_sampel_tag set dilepas_at = now(), dilepas_oleh = p_akun, alasan_lepas = 'naik jadi utama (pengajuan #' || p_id || ')' where id = v_c.id;
  insert into public.sigap_sampel_tag (kegiatan_id, idsubsls, kk_id, peran, via, ditandai_oleh)
  values (p_kegiatan, v_g.idsubsls, v_g.cadangan_kk_id, 'utama', 'hp', v_g.diajukan_oleh);
  update public.sigap_sampel_ganti set status = 'disetujui', diputus_at = now(), diputus_oleh = p_akun, diputus_nama = v_nama,
    putus_sebagai = case when coalesce(p_admin, false) then 'admin' else 'pml' end, catatan_putus = v_catatan where id = p_id;
  return jsonb_build_object('ok', true, 'status', 'disetujui');
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'sigap_ganti_ajukan(bigint,bigint,bigint,bigint,text,text)',
    'sigap_ganti_batal(bigint,bigint,bigint)',
    'sigap_ganti_putus(bigint,bigint,bigint,boolean,text,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;

-- Verifikasi (hasil yang diharapkan: kolom_sinkron 1, tabel 1, rls_aktif true, fungsi_ada 3)
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sigap_sampel_konfig' and column_name = 'sinkron_ke_master') as kolom_sinkron,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'sigap_sampel_ganti') as tabel,
  (select relrowsecurity from pg_class where oid = 'public.sigap_sampel_ganti'::regclass) as rls_aktif,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('sigap_ganti_ajukan', 'sigap_ganti_batal', 'sigap_ganti_putus')) as fungsi_ada;
