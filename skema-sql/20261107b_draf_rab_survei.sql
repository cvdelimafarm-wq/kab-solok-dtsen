-- 20261107b_draf_rab_survei.sql
-- Draf layar "RAB per survei": isian yang belum disusun ke RAB (hari dibayar, mode pecah/gabung, volume, harga, jadwal cair, item tujuan,
-- tanda "tidak dialokasikan") disimpan di basis data supaya tidak hilang saat halaman dimuat ulang, dan bisa dilanjutkan dari perangkat lain
-- atau oleh rekan yang berhak. Satu baris per (RAB, identifikasi). Ditulis lewat gerbang keu_tulis (insert atau update), dibaca lewat gerbang baca.
-- Tidak memakai penjejak keu_jejak: draf disimpan otomatis berkali-kali, jadi tidak dicatat sebagai riwayat. Aman dijalankan ulang.

begin;

create table if not exists public.keu_rab_survei_draf (
  rab_id      bigint      not null references public.keu_rab(id),
  ident_id    bigint      not null references public.keu_ident(id),
  isi         jsonb       not null default '{}'::jsonb,
  diubah_oleh bigint      references public.sigap_akun(id),
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now(),
  primary key (rab_id, ident_id),
  constraint keu_rab_survei_draf_isi_check check (jsonb_typeof(isi) = 'object' and pg_column_size(isi) <= 200000)
);

alter table public.keu_rab_survei_draf enable row level security;
revoke all on table public.keu_rab_survei_draf from public, anon, authenticated;
grant select, insert, update, delete on table public.keu_rab_survei_draf to service_role;

create or replace function public.keu_rab_survei_draf_jaga()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare v_st text; v_ro text; v_ro_ident text; v_akun bigint := keu_akun_sesi();
begin
  select status, ro_kode into v_st, v_ro from keu_rab where id = new.rab_id;
  if v_st is null then
    raise exception 'RAB % tidak ada.', new.rab_id using errcode = '23514';
  end if;
  if v_st not in ('draf','dikembalikan') then
    raise exception 'RAB berstatus % tidak dapat diubah (hanya draf atau dikembalikan).', v_st using errcode = '23514';
  end if;
  select ro_kode into v_ro_ident from keu_ident where id = new.ident_id;
  if v_ro_ident is distinct from v_ro then
    raise exception 'Identifikasi % bukan milik RO % dari RAB ini.', new.ident_id, v_ro using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.rab_id <> old.rab_id or new.ident_id <> old.ident_id) then
    raise exception 'RAB dan identifikasi tidak dapat diganti; buat baris baru.' using errcode = '23514';
  end if;
  if v_akun is not null and not (keu_boleh(v_akun, 'rab', v_ro) or keu_boleh(v_akun, 'draf', v_ro)) then
    raise exception 'Akun % tidak berwenang mengubah RAB RO %.', v_akun, v_ro using errcode = '42501';
  end if;
  new.diubah_at := now();
  new.diubah_oleh := coalesce(v_akun, new.diubah_oleh);
  return new;
end
$f$;

drop trigger if exists keu_t1_jaga on public.keu_rab_survei_draf;
create trigger keu_t1_jaga before insert or update on public.keu_rab_survei_draf
  for each row execute function public.keu_rab_survei_draf_jaga();

commit;

-- Pemeriksaan (hanya baca), jalankan sesudahnya:
--   select column_name, data_type from information_schema.columns where table_name = 'keu_rab_survei_draf' order by ordinal_position;
--   select tgname from pg_trigger where tgrelid = 'public.keu_rab_survei_draf'::regclass and not tgisinternal;   -- harus: keu_t1_jaga saja
--   select relrowsecurity from pg_class where oid = 'public.keu_rab_survei_draf'::regclass;                      -- harus: true
