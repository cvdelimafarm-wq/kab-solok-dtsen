-- 20261107d_catat_pembayaran.sql
-- Langkah 3 rancangan "Kebutuhan, neraca RO, revisi": PJ Administrasi mencatat pembayaran di SIGAP (sementara manual) dan menutup baris RAB.
-- Pembayaran RESMI tetap lewat SAKTI; catatan ini adalah catatan kerja SIGAP yang kelak disinkronkan dengan SAKTI (status dicatat -> tercermin).
--
--  1. Peran PJADM (PJ Administrasi, lingkup global: beberapa orang per kantor, seluruh anggaran) dan kewenangan bayar_catat
--     (diberikan ke PJADM dan PPK). Penugasan orangnya lewat tab "Tim dan akses" yang sudah ada (peran global, ro_kode kosong).
--  2. Tabel keu_pembayaran: satu baris = satu catatan pada satu baris RAB.
--       jenis  bayar : pembayaran (jumlah > 0)            batal : baris RAB tidak jadi dibayar (jumlah 0, wajib catatan >= 5 huruf)
--       menutup      : baris RAB dianggap selesai (tidak ada pembayaran lanjutan). Matikan untuk pembayaran bertahap.
--       status       : dicatat (belum tampak di realisasi SAKTI, tetap dihitung sebagai kebutuhan) atau tercermin (sudah ada di realisasi SAKTI)
--       tautan       : alamat Google Drive (atau tautan lain, http/https) bukti dukung dan penatausahaan SPJ; boleh diisi menyusul
--     Koreksi = batalkan catatan (alasan wajib) lalu catat ulang; jumlah, tanggal, dan baris RAB tidak dapat diubah.
--  3. Penjaga trigger: hak bayar_catat pada RO (bila ada sesi akun), item RAB harus milik RAB dan RO itu serta BUKAN item baru (belum ada di POK,
--     belum dapat dibayar), baris harus milik item itu, tanggal tidak boleh di masa depan (WIB), kolom dasar tidak dapat diubah.
-- Ditulis lewat gerbang keu_tulis (insert atau update dengan kunci {id}), dibaca lewat gerbang baca. Tanpa DELETE. Aman dijalankan ulang.

begin;

-- 1. peran dan kewenangan ---------------------------------------------------------------------------------------------------------
insert into public.keu_master_peran (kode, nama, ket, lingkup, urut, aktif)
select 'PJADM', 'PJ Administrasi', 'Mencatat pembayaran, menutup baris RAB, dan menatausahakan SPJ untuk seluruh anggaran kantor (beberapa orang).', 'global',
       coalesce((select max(urut) from public.keu_master_peran), 0) + 1, true
where not exists (select 1 from public.keu_master_peran where kode = 'PJADM');

insert into public.keu_master_kewenangan (kode, nama, ket, urut, aktif)
select 'bayar_catat', 'Mencatat pembayaran dan menutup baris RAB', 'Mencatat pembayaran di SIGAP (sebelum sinkron dengan SAKTI), menautkan bukti dukung, dan menutup baris RAB.',
       coalesce((select max(urut) from public.keu_master_kewenangan), 0) + 1, true
where not exists (select 1 from public.keu_master_kewenangan where kode = 'bayar_catat');

insert into public.keu_master_kewenangan_peran (kewenangan_kode, peran_kode, perlu_pemberian, ket)
select 'bayar_catat', p, false, ''
from (values ('PJADM'), ('PPK')) v(p)
where not exists (select 1 from public.keu_master_kewenangan_peran x where x.kewenangan_kode = 'bayar_catat' and x.peran_kode = v.p);

-- 2. tabel ------------------------------------------------------------------------------------------------------------------------
create table if not exists public.keu_pembayaran (
  id             bigint generated always as identity primary key,
  ro_kode        text        not null references public.keu_ro(kode),
  rab_id         bigint      not null references public.keu_rab(id),
  rab_item_id    bigint      not null references public.keu_rab_item(id),
  rab_baris_id   bigint      references public.keu_rab_baris(id) on delete set null,
  pok_kunci      text        not null,
  jenis          text        not null default 'bayar',
  tanggal        date        not null,
  jumlah         numeric(18,2) not null default 0,
  menutup        boolean     not null default true,
  status         text        not null default 'dicatat',
  nomor_ref      text,
  tautan         text,
  catatan        text,
  dicatat_oleh   bigint      references public.sigap_akun(id),
  tercermin_oleh bigint      references public.sigap_akun(id),
  tercermin_at   timestamptz,
  dibatalkan_at  timestamptz,
  dibatalkan_oleh bigint     references public.sigap_akun(id),
  alasan_batal   text,
  dibuat_at      timestamptz not null default now(),
  diubah_at      timestamptz not null default now(),
  constraint keu_pembayaran_jenis_check   check (jenis in ('bayar','batal')),
  constraint keu_pembayaran_status_check  check (status in ('dicatat','tercermin')),
  constraint keu_pembayaran_jumlah_check  check ((jenis = 'bayar' and jumlah > 0) or (jenis = 'batal' and jumlah = 0)),
  constraint keu_pembayaran_batal_check   check (jenis <> 'batal' or (rab_baris_id is not null and menutup and char_length(btrim(coalesce(catatan, ''))) >= 5)),
  constraint keu_pembayaran_ref_check     check (nomor_ref is null or char_length(nomor_ref) <= 100),
  constraint keu_pembayaran_tautan_check  check (tautan is null or (char_length(tautan) <= 500 and tautan ~* '^https?://[^[:space:]]+$')),
  constraint keu_pembayaran_catatan_check check (catatan is null or char_length(catatan) <= 500),
  constraint keu_pembayaran_alasan_check  check (dibatalkan_at is null or char_length(btrim(coalesce(alasan_batal, ''))) >= 5)
);

create index if not exists keu_pembayaran_ro_idx   on public.keu_pembayaran (ro_kode, rab_id);
create index if not exists keu_pembayaran_baris_idx on public.keu_pembayaran (rab_baris_id);

alter table public.keu_pembayaran enable row level security;
revoke all on table public.keu_pembayaran from public, anon, authenticated;
grant select, insert, update, delete on table public.keu_pembayaran to service_role;

-- 3. penjaga -----------------------------------------------------------------------------------------------------------------------
create or replace function public.keu_pembayaran_jaga()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare
  v_akun bigint := keu_akun_sesi();
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_item record;
begin
  if v_akun is not null and not keu_boleh(v_akun, 'bayar_catat', new.ro_kode) then
    raise exception 'Akun % tidak berwenang mencatat pembayaran RO %.', v_akun, new.ro_kode using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select i.rab_id, i.baru, i.pok_kunci, r.ro_kode into v_item
      from keu_rab_item i join keu_rab r on r.id = i.rab_id where i.id = new.rab_item_id;
    if not found then raise exception 'Item RAB % tidak ada.', new.rab_item_id using errcode = '23514'; end if;
    if v_item.rab_id <> new.rab_id or v_item.ro_kode <> new.ro_kode then
      raise exception 'Item RAB bukan milik RAB dan RO ini.' using errcode = '23514';
    end if;
    if v_item.baru or v_item.pok_kunci is null then
      raise exception 'Item ini belum ada di POK sehingga belum dapat dibayar. Tunggu sampai revisi POK disahkan.' using errcode = '23514';
    end if;
    new.pok_kunci := v_item.pok_kunci;
    if new.rab_baris_id is not null and not exists (select 1 from keu_rab_baris b where b.id = new.rab_baris_id and b.item_id = new.rab_item_id) then
      raise exception 'Baris RAB bukan bagian dari item ini.' using errcode = '23514';
    end if;
    if new.rab_baris_id is null then new.menutup := false; end if;
    if new.tanggal > v_hari then raise exception 'Tanggal pembayaran tidak boleh di masa depan.' using errcode = '23514'; end if;
    new.dicatat_oleh := coalesce(v_akun, new.dicatat_oleh);
    new.dibatalkan_at := null; new.dibatalkan_oleh := null; new.alasan_batal := null;
    if new.status = 'tercermin' then
      new.tercermin_at := now(); new.tercermin_oleh := coalesce(v_akun, new.tercermin_oleh);
    else
      new.tercermin_at := null; new.tercermin_oleh := null;
    end if;
  else
    if old.dibatalkan_at is not null then
      raise exception 'Catatan yang sudah dibatalkan tidak dapat diubah.' using errcode = '23514';
    end if;
    if new.ro_kode <> old.ro_kode or new.rab_id <> old.rab_id or new.rab_item_id <> old.rab_item_id
       or new.rab_baris_id is distinct from old.rab_baris_id or new.pok_kunci <> old.pok_kunci or new.jenis <> old.jenis
       or new.tanggal <> old.tanggal or new.jumlah <> old.jumlah or new.menutup <> old.menutup or new.dicatat_oleh is distinct from old.dicatat_oleh then
      raise exception 'Jumlah, tanggal, jenis, dan baris RAB tidak dapat diubah. Batalkan catatan lalu catat ulang.' using errcode = '23514';
    end if;
    if new.dibatalkan_at is not null then
      new.dibatalkan_at := now(); new.dibatalkan_oleh := coalesce(v_akun, new.dibatalkan_oleh);
    else
      new.dibatalkan_oleh := null; new.alasan_batal := null;
    end if;
    if new.status is distinct from old.status then
      if new.status = 'tercermin' then
        new.tercermin_at := now(); new.tercermin_oleh := coalesce(v_akun, new.tercermin_oleh);
      else
        new.tercermin_at := null; new.tercermin_oleh := null;
      end if;
    else
      new.tercermin_at := old.tercermin_at; new.tercermin_oleh := old.tercermin_oleh;
    end if;
  end if;
  new.diubah_at := now();
  return new;
end
$f$;

drop trigger if exists keu_t1_jaga on public.keu_pembayaran;
create trigger keu_t1_jaga before insert or update on public.keu_pembayaran
  for each row execute function public.keu_pembayaran_jaga();

commit;

-- Pemeriksaan (hanya baca), jalankan sesudahnya:
--   select kode, nama, lingkup, aktif from keu_master_peran where kode = 'PJADM';                                   -- 1 baris
--   select peran_kode from keu_master_kewenangan_peran where kewenangan_kode = 'bayar_catat' order by 1;           -- PJADM, PPK
--   select tgname from pg_trigger where tgrelid = 'public.keu_pembayaran'::regclass and not tgisinternal;          -- keu_t1_jaga saja
--   select relrowsecurity from pg_class where oid = 'public.keu_pembayaran'::regclass;                             -- true
--   select count(*) from keu_pembayaran;                                                                            -- 0
-- Sesudah itu: beri peran PJADM kepada orang yang bertugas lewat tab "Tim dan akses" (peran global, tanpa RO).
