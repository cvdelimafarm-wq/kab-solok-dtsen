-- 20261107c_niat_butir.sql
-- Langkah 2 rancangan "Kebutuhan, neraca RO, revisi": rencana tindakan (niat) per butir POK pada satu RO, sebelum jendela revisi dibuka.
--   Butir Lebih  : biarkan (bawaan, tidak perlu disimpan) atau lepas (donor; jumlah dilepas).
--   Butir Kurang : tunda (bawaan), tambal (dari donor), atau tambahan (minta tambahan pagu); jumlah = nilai yang dimaksud.
-- Satu baris per (RO, butir). Butir dikenali dengan kunci_stabil POK (keu_v_adm_lembar.kunci_stabil), jadi bertahan antarversi POK.
-- Ini NIAT, bukan revisi: tidak mengubah POK maupun RAB. Ditulis lewat gerbang keu_tulis (insert atau update), dibaca lewat gerbang baca.
-- Hak: kewenangan kek_catat (ketua tim dan admin RO) pada RO bersangkutan. Tidak memakai penjejak keu_jejak (niat boleh diubah berkali-kali).
-- Aman dijalankan ulang.

begin;

create table if not exists public.keu_niat_butir (
  ro_kode      text        not null,
  pok_kunci    text        not null,
  niat         text        not null,
  jumlah       numeric(18,2),
  catatan      text,
  diubah_oleh  bigint      references public.sigap_akun(id),
  dibuat_at    timestamptz not null default now(),
  diubah_at    timestamptz not null default now(),
  primary key (ro_kode, pok_kunci),
  constraint keu_niat_butir_niat_check check (niat in ('biarkan','lepas','tunda','tambal','tambahan')),
  constraint keu_niat_butir_jumlah_check check (jumlah is null or jumlah >= 0),
  constraint keu_niat_butir_jumlah_perlu check (niat in ('biarkan','tunda') or jumlah is not null),
  constraint keu_niat_butir_catatan_check check (catatan is null or char_length(catatan) <= 500)
);

alter table public.keu_niat_butir enable row level security;
revoke all on table public.keu_niat_butir from public, anon, authenticated;
grant select, insert, update, delete on table public.keu_niat_butir to service_role;

create or replace function public.keu_niat_butir_jaga()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare v_akun bigint := keu_akun_sesi();
begin
  if tg_op = 'UPDATE' and (new.ro_kode <> old.ro_kode or new.pok_kunci <> old.pok_kunci) then
    raise exception 'RO dan butir tidak dapat diganti; buat baris baru.' using errcode = '23514';
  end if;
  if not exists (select 1 from keu_ro where kode = new.ro_kode) then
    raise exception 'RO % tidak ada.', new.ro_kode using errcode = '23514';
  end if;
  if v_akun is not null and not keu_boleh(v_akun, 'kek_catat', new.ro_kode) then
    raise exception 'Akun % tidak berwenang mencatat rencana tindakan RO %.', v_akun, new.ro_kode using errcode = '42501';
  end if;
  new.diubah_at := now();
  new.diubah_oleh := coalesce(v_akun, new.diubah_oleh);
  return new;
end
$f$;

drop trigger if exists keu_t1_jaga on public.keu_niat_butir;
create trigger keu_t1_jaga before insert or update on public.keu_niat_butir
  for each row execute function public.keu_niat_butir_jaga();

commit;

-- Pemeriksaan (hanya baca), jalankan sesudahnya:
--   select column_name, data_type from information_schema.columns where table_name = 'keu_niat_butir' order by ordinal_position;
--   select tgname from pg_trigger where tgrelid = 'public.keu_niat_butir'::regclass and not tgisinternal;   -- harus: keu_t1_jaga saja
--   select relrowsecurity from pg_class where oid = 'public.keu_niat_butir'::regclass;                      -- harus: true
