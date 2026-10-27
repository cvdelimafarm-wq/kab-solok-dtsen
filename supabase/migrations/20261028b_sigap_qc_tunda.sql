-- =====================================================================
-- 20261028b_sigap_qc_tunda.sql
-- SIGAP - QC Pemahaman: tombol "Tunda 2 jam" pada pengingat (28 Okt 2026)
--
-- Petugas yang belum sempat mengerjakan QC dapat menunda pengingat push 2 jam (dari tombol pada notifikasi di Android/komputer,
-- atau tombol "Ingatkan lagi 2 jam" di modal QC, yang berlaku juga di iPhone). Yang ditunda HANYA notifikasi pengingat:
-- modal pemblokir tetap berlaku sampai nilai 100. Selama tunda berlaku pengingat terjadwal biasa tidak dikirim; saat tunda berakhir
-- dikirim satu pengingat (bila belum 100), dan pengingat TENGGAT (tepat jam batas) tetap dikirim walau sedang menunda.
-- Tunda tidak pernah melewati jam batas pada hari biasa: bila 2 jam jatuh sesudah batas, tunda berakhir tepat di batas.
--
-- Semua akses lewat API server (service_role); tabel tanpa kebijakan RLS. Aman diulang. Tidak mengubah fungsi/tabel QC yang sudah ada.
-- =====================================================================

create table if not exists public.sigap_qc_tunda (
  kegiatan_id bigint      not null references public.sigap_kegiatan(id),
  tanggal     date        not null,
  akun_id     bigint      not null,
  ke          smallint    not null check (ke >= 1),
  via         text        not null default 'modal' check (via in ('notifikasi', 'modal')),
  dibuat_at   timestamptz not null default now(),
  sampai      timestamptz not null,
  primary key (kegiatan_id, tanggal, akun_id, ke)
);
create index if not exists sigap_qc_tunda_hari_idx on public.sigap_qc_tunda (kegiatan_id, tanggal, akun_id);

alter table public.sigap_qc_tunda enable row level security;
revoke all on public.sigap_qc_tunda from anon, authenticated;

-- Menunda pengingat petugas p_akun selama p_menit (15-720; bawaan 120). Hanya bila QC aktif dan petugas masih wajib mengerjakan.
-- Dua tekanan dalam 60 detik dianggap satu (mis. ketukan ganda): mengembalikan tunda yang sama dengan "ulang": true.
create or replace function public.sigap_qc_tunda(p_akun bigint, p_menit integer default 120, p_via text default 'modal')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st jsonb; v_keg bigint; v_tgl date; v_batas timestamptz; v_sampai timestamptz; v_ke integer; t record; v_potong boolean := false;
begin
  if p_menit is null or p_menit < 15 or p_menit > 720 then raise exception 'Lama tunda harus 15-720 menit' using errcode = 'P0001'; end if;
  if p_via is null or p_via not in ('notifikasi', 'modal') then raise exception 'Sumber tunda tidak sah' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('sigap_qc_tunda:' || p_akun));
  st := sigap_qc_status(p_akun);
  if not coalesce((st ->> 'aktif')::boolean, false) or not coalesce((st ->> 'perlu')::boolean, false) then
    raise exception 'Tidak ada QC yang perlu ditunda' using errcode = 'P0001';
  end if;
  v_keg := (st ->> 'kegiatan_id')::bigint; v_tgl := (st ->> 'tanggal')::date; v_batas := (st ->> 'batas_at')::timestamptz;

  select * into t from sigap_qc_tunda where kegiatan_id = v_keg and tanggal = v_tgl and akun_id = p_akun order by ke desc limit 1;
  if found and t.dibuat_at > now() - interval '60 seconds' then
    return jsonb_build_object('sampai', t.sampai, 'ke', t.ke, 'sampai_batas', t.sampai >= v_batas, 'ulang', true);
  end if;

  v_sampai := now() + make_interval(mins => p_menit);
  -- hari biasa sebelum batas: tunda berakhir paling lambat tepat di batas (pengingat tenggat tetap dikirim)
  if not coalesce((st ->> 'susulan')::boolean, false) and not coalesce((st ->> 'lewat_batas')::boolean, false) and v_sampai > v_batas then
    v_sampai := v_batas; v_potong := true;
  end if;
  v_ke := coalesce(t.ke, 0) + 1;
  insert into sigap_qc_tunda (kegiatan_id, tanggal, akun_id, ke, via, sampai) values (v_keg, v_tgl, p_akun, v_ke, p_via, v_sampai);
  return jsonb_build_object('sampai', v_sampai, 'ke', v_ke, 'sampai_batas', v_potong, 'ulang', false);
end $$;

-- Tunda terakhir tiap petugas pada satu hari (untuk cron: siapa yang sedang menunda, dan tunda mana yang sudah berakhir).
create or replace function public.sigap_qc_tunda_aktif(p_kegiatan bigint, p_tanggal date)
returns table (akun_id bigint, ke smallint, sampai timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (t.akun_id) t.akun_id, t.ke, t.sampai
    from sigap_qc_tunda t
   where t.kegiatan_id = p_kegiatan and t.tanggal = p_tanggal
   order by t.akun_id, t.ke desc
$$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'sigap\_qc\_tunda%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
