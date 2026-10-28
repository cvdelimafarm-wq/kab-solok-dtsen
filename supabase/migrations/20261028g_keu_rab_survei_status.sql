-- =====================================================================
-- 20261028g_keu_rab_survei_status.sql
-- SIGAP - Status RAB per survei (keputusan pengguna 28 Okt 2026: status TERSIMPAN per survei).
-- Satu baris per (RAB, identifikasi): status 'draf' (bawaan) atau 'siap' (penyusun menyatakan rincian RAB survei ini lengkap dan siap diajukan bersama RAB).
-- Disahkan tidak disimpan di sini: pengesahan mengikuti status RAB (keu_rab.status), supaya tidak ada dua sumber kebenaran.
-- Aturan di basis data:
--   * hanya boleh diubah saat RAB berstatus draf atau dikembalikan, oleh akun yang berwenang atas RO (hak rab atau draf), dan identifikasinya harus milik RO yang sama;
--   * status 'siap' hanya sah bila ada sedikitnya satu baris RAB bertanda identifikasi itu pada RAB tersebut;
--   * setiap baris RAB bertanda identifikasi yang ditambah, diubah, atau dihapus menurunkan status 'siap' kembali ke 'draf' (angka berubah, penyusun perlu menyatakan siap lagi).
-- Penulisan lewat keu_tulis (insert lalu update; kunci utama = rab_id + ident_id). Tanpa DELETE/DROP. Aman diulang.
-- Bergantung pada 20261028f. Uji: 74_uji_rab_survei_status.sql. Kembaran TypeScript: lib/keu/rabStatus.ts.
-- =====================================================================
create table if not exists keu_rab_survei (
  rab_id      bigint not null references keu_rab(id),
  ident_id    bigint not null references keu_ident(id),
  status      text not null default 'draf' check (status in ('draf','siap')),
  catatan     text not null default '' check (char_length(catatan) <= 500),
  diubah_oleh bigint references sigap_akun(id),
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now(),
  primary key (rab_id, ident_id)
);
create index if not exists keu_rab_survei_ident_idx on keu_rab_survei(ident_id);
comment on table keu_rab_survei is 'Status RAB per survei: draf atau siap. Disahkan mengikuti status RAB.';

alter table keu_rab_survei enable row level security;
revoke all on keu_rab_survei from anon, authenticated;
grant all on keu_rab_survei to service_role;

create or replace function keu_rab_survei_jaga() returns trigger
language plpgsql security definer set search_path = public as $f$
declare v_st text; v_ro text; v_ro_ident text; v_akun bigint := keu_akun_sesi();
begin
  select status, ro_kode into v_st, v_ro from keu_rab where id = new.rab_id;
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
  if new.status = 'siap' and not exists (
    select 1 from keu_rab_baris b join keu_rab_item i on i.id = b.item_id where i.rab_id = new.rab_id and b.ident_id = new.ident_id
  ) then
    raise exception 'Status Siap butuh sedikitnya satu rincian RAB dari identifikasi ini.' using errcode = '23514';
  end if;
  new.diubah_at := now();
  new.diubah_oleh := coalesce(v_akun, new.diubah_oleh);
  return new;
end $f$;

drop trigger if exists keu_t1_jaga on keu_rab_survei;
create trigger keu_t1_jaga before insert or update on keu_rab_survei for each row execute function keu_rab_survei_jaga();
drop trigger if exists keu_t9_jejak on keu_rab_survei;
create trigger keu_t9_jejak after insert or update on keu_rab_survei for each row execute function keu_jejak();

-- baris RAB bertanda identifikasi berubah -> status 'siap' turun ke 'draf'
create or replace function keu_rab_survei_turun() returns trigger
language plpgsql security definer set search_path = public as $f$
declare v_rab bigint;
begin
  if tg_op in ('UPDATE','DELETE') and old.ident_id is not null then
    select rab_id into v_rab from keu_rab_item where id = old.item_id;
    update keu_rab_survei set status = 'draf' where rab_id = v_rab and ident_id = old.ident_id and status = 'siap';
  end if;
  if tg_op in ('INSERT','UPDATE') and new.ident_id is not null then
    select rab_id into v_rab from keu_rab_item where id = new.item_id;
    update keu_rab_survei set status = 'draf' where rab_id = v_rab and ident_id = new.ident_id and status = 'siap';
  end if;
  return null;
end $f$;

drop trigger if exists keu_t6_survei_turun on keu_rab_baris;
create trigger keu_t6_survei_turun after insert or update or delete on keu_rab_baris for each row execute function keu_rab_survei_turun();
