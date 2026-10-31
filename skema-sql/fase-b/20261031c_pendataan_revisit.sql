-- =====================================================================
-- 20261031c_pendataan_revisit.sql
-- SIGAP - Pendataan Pascabencana: REVISIT per Sub SLS (31 Okt 2026)
--
-- Admin menandai Sub SLS "revisit" (Kelola Pendataan > Persiapan > kartu "Permintaan daftar KK ke FASIH" > tab Revisit).
-- Selama bertanda, SEMUA KK di Sub SLS itu mendapat pilihan hasil tambahan di kartu KK Lembar Pendataan:
-- "Tidak terdampak, revisit menjadi terdampak".
--
--  * tiga kategori hasil TIDAK berubah: KK revisit tetap hasil = 'terdampak', jadi Monitoring tetap menghitungnya sebagai terdampak;
--  * penanda revisit disimpan di KK (bencana_pendataan_kk.revisit) dan di log (bencana_pendataan_log.revisit), jadi riwayat tetap utuh;
--  * revisit hanya bermakna untuk hasil 'terdampak'; untuk hasil lain (termasuk 'belum' = urungkan) otomatis false;
--  * penanda per Sub SLS ada di tabel baru bencana_pendataan_revisit (aktif true/false, siapa & kapan);
--  * bencana_pendataan_catat ditambah parameter p_revisit (default false). Fungsi lama (9 parameter) dihapus dalam transaksi yang sama
--    agar tidak ada dua versi yang membingungkan PostgREST. Isi lainnya TIDAK berubah.
--  * aplikasi tetap jalan sebelum SQL ini dijalankan (fitur revisit hanya tersembunyi); sesudahnya tab Revisit di Kelola aktif.
--
-- Aman diulang (if not exists / drop if exists + create). Satu transaksi.
-- =====================================================================
begin;

create table if not exists public.bencana_pendataan_revisit (
  idsubsls    text primary key,
  aktif       boolean     not null default true,
  diatur_oleh bigint      references public.sigap_akun(id),
  diatur_at   timestamptz not null default now()
);
create index if not exists bencana_pendataan_revisit_aktif on public.bencana_pendataan_revisit (idsubsls) where aktif;

alter table public.bencana_pendataan_revisit enable row level security;
revoke all on public.bencana_pendataan_revisit from anon, authenticated;

alter table public.bencana_pendataan_kk  add column if not exists revisit boolean not null default false;
alter table public.bencana_pendataan_log add column if not exists revisit boolean not null default false;

drop function if exists public.bencana_pendataan_catat(bigint, bigint, text, text, timestamptz, uuid, double precision, double precision, real);
drop function if exists public.bencana_pendataan_catat(bigint, bigint, text, text, timestamptz, uuid, double precision, double precision, real, boolean);

create or replace function public.bencana_pendataan_catat(
  p_akun bigint,
  p_kk bigint,
  p_hasil text,
  p_alasan text,
  p_waktu timestamptz,
  p_kunci uuid,
  p_pos_lat double precision default null,
  p_pos_lng double precision default null,
  p_pos_akurasi real default null,
  p_revisit boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kk public.bencana_pendataan_kk%rowtype;
  v_waktu timestamptz;
  v_terkini boolean;
  v_baris bigint;
  v_revisit boolean;
begin
  if p_hasil not in ('terdampak', 'tidak_terdampak', 'tidak_ditemukan', 'belum') then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'hasil_tidak_dikenal');
  end if;
  select * into v_kk from public.bencana_pendataan_kk where id = p_kk and aktif for update;
  if not found then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'kk_tidak_ada');
  end if;
  if not exists (select 1 from public.bencana_pendataan_subsls_akun(p_akun) x where x = v_kk.idsubsls) then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'bukan_wilayah_tim');
  end if;
  v_waktu := least(coalesce(p_waktu, now()), now());
  v_terkini := v_kk.status_at is null or v_waktu >= v_kk.status_at;
  -- revisit hanya bermakna untuk hasil 'terdampak'
  v_revisit := coalesce(p_revisit, false) and p_hasil = 'terdampak';

  insert into public.bencana_pendataan_log (kk_id, akun_id, hasil, alasan, waktu_kejadian, kunci, menjadi_terkini, pos_lat, pos_lng, pos_akurasi_m, revisit)
  values (p_kk, p_akun, p_hasil, nullif(btrim(p_alasan), ''), v_waktu, p_kunci, v_terkini, p_pos_lat, p_pos_lng, p_pos_akurasi, v_revisit)
  on conflict (kunci) do nothing
  returning id into v_baris;
  if v_baris is null then
    return jsonb_build_object('status', 'duplikat');
  end if;

  if v_terkini then
    update public.bencana_pendataan_kk set
      hasil = case when p_hasil = 'belum' then null else p_hasil end,
      alasan = case when p_hasil = 'belum' then null else nullif(btrim(p_alasan), '') end,
      ppl_akun_id = case when p_hasil = 'belum' then null else p_akun end,
      revisit = v_revisit,
      status_at = v_waktu,
      diperbarui_at = now()
    where id = p_kk;
  end if;
  return jsonb_build_object('status', 'tercatat', 'terkini', v_terkini, 'log_id', v_baris);
end $function$;

revoke all on function public.bencana_pendataan_catat(bigint, bigint, text, text, timestamptz, uuid, double precision, double precision, real, boolean) from public, anon, authenticated;
grant execute on function public.bencana_pendataan_catat(bigint, bigint, text, text, timestamptz, uuid, double precision, double precision, real, boolean) to service_role;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Pemeriksaan (jalankan sesudahnya; semua harus sesuai):
--   select column_name from information_schema.columns where table_name in ('bencana_pendataan_kk','bencana_pendataan_log') and column_name = 'revisit';   -- 2 baris
--   select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'bencana_pendataan_catat';                                                 -- 1 baris, berakhir ", p_revisit boolean"
--   select * from public.bencana_pendataan_revisit;                                                                                                       -- kosong (belum ada Sub SLS bertanda)
-- ---------------------------------------------------------------------
