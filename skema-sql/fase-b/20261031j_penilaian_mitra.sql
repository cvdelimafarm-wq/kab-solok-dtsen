-- 20261031j_penilaian_mitra.sql  (31 Okt 2026)  Penilaian Mitra per kegiatan (tab "Penilaian Mitra" di Peran & Akses).
-- Syarat: tabel sigap_akun, sigap_kegiatan, bencana_petugas sudah ada. Aman dijalankan ulang.
--
-- Satu KOLOM per kegiatan (sigap_penilaian_kolom); kegiatan baru = kolom baru. Satu NILAI 1-5 per (kolom, Mitra) (sigap_penilaian_mitra),
-- boleh dengan catatan. Nilai lama bencana_petugas.nilai_kinerja (sumber SE2026, 410 petugas) dipindah menjadi kolom "SE2026".
--
-- Halaman Bencana dan peringkat seleksi masih membaca bencana_petugas.nilai_kinerja. Supaya tidak rusak, kolom itu kini DITURUNKAN
-- otomatis oleh trigger: rata-rata semua penilaian Mitra tersebut, dibulatkan ke bilangan bulat 1-5 (catatan_kinerja = catatan terbaru).
-- Jangan lagi mengisi bencana_petugas.nilai_kinerja langsung; isi lewat tab Penilaian Mitra.

-- 1) Kolom penilaian (satu per kegiatan)
create table if not exists sigap_penilaian_kolom (
  id          bigint generated always as identity primary key,
  kode        text   not null unique check (kode ~ '^[A-Za-z0-9_-]{1,40}$'),
  nama        text   not null check (char_length(nama) between 1 and 120),
  kegiatan_id bigint references sigap_kegiatan(id) on delete set null,
  urutan      int    not null default 0,
  dibuka      boolean not null default true,
  dibuat_oleh bigint references sigap_akun(id) on delete set null,
  dibuat_at   timestamptz not null default now()
);

-- 2) Nilai per Mitra per kolom
create table if not exists sigap_penilaian_mitra (
  kolom_id    bigint   not null references sigap_penilaian_kolom(id) on delete cascade,
  akun_id     bigint   not null references sigap_akun(id) on delete cascade,
  nilai       smallint not null check (nilai between 1 and 5),
  catatan     text check (catatan is null or char_length(catatan) <= 500),
  dinilai_oleh bigint references sigap_akun(id) on delete set null,
  diubah_at   timestamptz not null default now(),
  primary key (kolom_id, akun_id)
);
create index if not exists sigap_penilaian_mitra_akun_idx on sigap_penilaian_mitra (akun_id);

alter table sigap_penilaian_kolom enable row level security;
alter table sigap_penilaian_mitra enable row level security;

-- 3) Turunan ke bencana_petugas.nilai_kinerja (dibaca halaman Bencana dan seleksi lama)
create or replace function sigap_penilaian_turunkan() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_akun bigint := coalesce(new.akun_id, old.akun_id);
  v_petugas bigint;
  v_rata numeric;
  v_catatan text;
begin
  select petugas_bencana_id into v_petugas from sigap_akun where id = v_akun;
  if v_petugas is null then
    return null;
  end if;
  select avg(nilai) into v_rata from sigap_penilaian_mitra where akun_id = v_akun;
  select catatan into v_catatan from sigap_penilaian_mitra
    where akun_id = v_akun and catatan is not null and btrim(catatan) <> ''
    order by diubah_at desc, kolom_id desc limit 1;
  update bencana_petugas
     set nilai_kinerja = case when v_rata is null then null else least(5, greatest(1, round(v_rata)))::smallint end,
         nilai_kinerja_sumber = case when v_rata is null then null else 'penilaian_mitra' end,
         catatan_kinerja = v_catatan
   where id = v_petugas;
  return null;
end $$;

drop trigger if exists sigap_penilaian_turunkan_tr on sigap_penilaian_mitra;
create trigger sigap_penilaian_turunkan_tr
  after insert or update or delete on sigap_penilaian_mitra
  for each row execute function sigap_penilaian_turunkan();

-- 4) Kolom SE2026 + pemindahan nilai lama (hanya yang belum ada; aman diulang)
insert into sigap_penilaian_kolom (kode, nama, urutan)
values ('SE2026', 'Sensus Ekonomi 2026', 1)
on conflict (kode) do nothing;

insert into sigap_penilaian_mitra (kolom_id, akun_id, nilai, catatan)
select k.id, a.id, p.nilai_kinerja, nullif(btrim(p.catatan_kinerja), '')
  from sigap_penilaian_kolom k
  join sigap_akun a on a.petugas_bencana_id is not null
  join bencana_petugas p on p.id = a.petugas_bencana_id
 where k.kode = 'SE2026'
   and p.nilai_kinerja between 1 and 5
   and coalesce(p.nilai_kinerja_sumber, 'SE2026') = 'SE2026'
on conflict (kolom_id, akun_id) do nothing;
