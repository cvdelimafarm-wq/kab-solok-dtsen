-- 20261108b_kelas_pelatihan.sql
-- (8 Nov 2026) Pengaturan kelas per pelatihan. Sebelumnya Adu Sigap selalu menampilkan Kelas 1-4 + "Semua Kelas" untuk semua
-- pelatihan; kini setiap pelatihan punya daftar kelas sendiri (nomor 1..20, nama, kuota).
--   1. Tabel master sigap_pelatihan_kelas(kegiatan_id, nomor, nama, kuota).
--   2. Batas CHECK kelas pada tabel kuis/instruktur dilonggarkan dari 4 menjadi 20 (ruang & kuis_kelas: 0..20, 0 = Semua Kelas;
--      instruktur_kelas: 1..20).
--   3. Isi awal: kelas yang SUDAH dipakai (peserta aktif, instruktur, pengaturan kuis, ruang); bila kosong -> Kelas 1.
--      Khusus kegiatan 7 (Pelatihan Seruti TW IV, 1 kelas): disatukan menjadi 1 kelas; baris instruktur & peserta tanpa kelas
--      dirapikan ke Kelas 1. Pelatihan yang hanya punya satu kelas: peserta aktif tanpa kelas diisi Kelas 1.
--   4. Pemicu: pelatihan baru otomatis punya Kelas 1.
-- Aman dijalankan ulang (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP CONSTRAINT IF EXISTS).

begin;

create table if not exists public.sigap_pelatihan_kelas (
  kegiatan_id bigint   not null references public.sigap_kegiatan(id) on delete cascade,
  nomor       smallint not null check (nomor between 1 and 20),
  nama        text     not null check (char_length(btrim(nama)) between 1 and 60),
  kuota       smallint check (kuota is null or kuota between 1 and 500),
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now(),
  primary key (kegiatan_id, nomor)
);
alter table public.sigap_pelatihan_kelas enable row level security;
comment on table public.sigap_pelatihan_kelas is 'Daftar kelas per pelatihan (nomor 1..20). Nomor 0 (Semua Kelas) tidak disimpan; ia hanya ada bila kelas > 1.';

-- longgarkan batas kelas 4 -> 20
alter table public.sigap_kuis_ruang            drop constraint if exists sigap_kuis_ruang_kelas_check;
alter table public.sigap_kuis_ruang            add  constraint sigap_kuis_ruang_kelas_check check (kelas >= 0 and kelas <= 20);
alter table public.sigap_kuis_kelas            drop constraint if exists sigap_kuis_kelas_kelas_check;
alter table public.sigap_kuis_kelas            add  constraint sigap_kuis_kelas_kelas_check check (kelas >= 0 and kelas <= 20);
alter table public.sigap_kuis_instruktur_kelas drop constraint if exists sigap_kuis_instruktur_kelas_kelas_check;
alter table public.sigap_kuis_instruktur_kelas add  constraint sigap_kuis_instruktur_kelas_kelas_check check (kelas >= 1 and kelas <= 20);

-- rapikan khusus Pelatihan Seruti TW IV (1 kelas): instruktur salah kelas -> Kelas 1
update public.sigap_kuis_instruktur_kelas i
   set kelas = 1
  from public.sigap_kegiatan k
 where k.id = i.kegiatan_id and k.kode = 'pelatihan_seruti_tw4_2026' and i.kelas <> 1;

-- isi awal dari data yang sudah ada
insert into public.sigap_pelatihan_kelas (kegiatan_id, nomor, nama)
select x.kegiatan_id, x.nomor, 'Kelas ' || x.nomor
  from (
    select k.id as kegiatan_id, n.nomor
      from public.sigap_kegiatan k
      cross join lateral (
        select distinct v.nomor from (
          select p.kelas::int as nomor from public.sigap_penugasan p where p.kegiatan_id = k.id and p.aktif and p.kelas between 1 and 20
          union all select i.kelas::int from public.sigap_kuis_instruktur_kelas i where i.kegiatan_id = k.id and i.kelas between 1 and 20
          union all select q.kelas::int from public.sigap_kuis_kelas q where q.kegiatan_id = k.id and q.kelas between 1 and 20
          union all select r.kelas::int from public.sigap_kuis_ruang r where r.kegiatan_id = k.id and r.kelas between 1 and 20
          union all select 1
        ) v
        where k.kode <> 'pelatihan_seruti_tw4_2026' or v.nomor = 1
      ) n
     where k.jenis = 'pelatihan'
  ) x
on conflict (kegiatan_id, nomor) do nothing;

-- pelatihan yang hanya punya satu kelas: peserta aktif tanpa kelas masuk ke kelas itu
update public.sigap_penugasan p
   set kelas = (select min(c.nomor) from public.sigap_pelatihan_kelas c where c.kegiatan_id = p.kegiatan_id)
 where p.aktif and p.kelas is null
   and (select count(*) from public.sigap_pelatihan_kelas c where c.kegiatan_id = p.kegiatan_id) = 1;

-- pelatihan baru -> otomatis Kelas 1
create or replace function public.sigap_kegiatan_kelas_bawaan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.jenis = 'pelatihan' then
    insert into public.sigap_pelatihan_kelas (kegiatan_id, nomor, nama) values (new.id, 1, 'Kelas 1')
    on conflict (kegiatan_id, nomor) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists sigap_kegiatan_kelas_bawaan_trg on public.sigap_kegiatan;
create trigger sigap_kegiatan_kelas_bawaan_trg
  after insert on public.sigap_kegiatan
  for each row execute function public.sigap_kegiatan_kelas_bawaan();

commit;
