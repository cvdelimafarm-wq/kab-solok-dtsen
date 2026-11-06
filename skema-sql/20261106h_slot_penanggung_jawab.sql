-- 20261106h_slot_penanggung_jawab.sql  (6 Nov 2026)
-- Slot Penanggung Jawab (PJ) dan Wakil PJ per kegiatan. Putusan Iqbal: slot dibuat dulu, nama boleh diisi belakangan; wakil diberi peran
-- `pj_kegiatan` pada kegiatan itu (opsi A, hak sama dengan PJ). Mengisi/mengosongkan slot dilakukan lewat aplikasi (aksi `atur_pj`), yang
-- sekaligus memberi/mencabut peran pj_kegiatan. Peran yang sudah ada sebelumnya TIDAK disentuh (akun 73 dan 357 di kegiatan 2 dan 5).
-- Aman diulang. (Nama `sigap_kegiatan_pj` sudah dipakai tabel lama berbasis email yang kosong dan tidak disentuh.)

do $$
begin
  if to_regclass('public.sigap_kegiatan_penanggung_jawab') is null then
    create table public.sigap_kegiatan_penanggung_jawab (
      kegiatan_id        bigint      not null references public.sigap_kegiatan(id) on delete cascade,
      jabatan            text        not null check (jabatan in ('pj', 'wakil_pj')),
      akun_id            bigint      references public.sigap_akun(id),
      peran_diberikan_id bigint      references public.sigap_akun_peran(id) on delete set null, -- baris peran yang dibuat oleh slot ini (dicabut bersama slot)
      diubah_oleh        text,
      diubah_at          timestamptz not null default now(),
      primary key (kegiatan_id, jabatan)
    );
    create index sigap_kegiatan_penanggung_jawab_akun_idx on public.sigap_kegiatan_penanggung_jawab (akun_id) where akun_id is not null;
    alter table public.sigap_kegiatan_penanggung_jawab enable row level security;
    revoke all on public.sigap_kegiatan_penanggung_jawab from anon, authenticated;
  end if;
end $$;

insert into public.sigap_kegiatan_penanggung_jawab (kegiatan_id, jabatan)
select k.id, j.jabatan
from public.sigap_kegiatan k
cross join (values ('pj'), ('wakil_pj')) as j(jabatan)
where k.aktif
on conflict do nothing;

-- Putusan Iqbal (6 Nov 2026, 19.47): kegiatan 2 (SPDT NTP) PJ = Mailani Putri (akun 357), Wakil PJ = Arini Alva Syaadah (akun 73).
-- Keduanya SUDAH memegang peran pj_kegiatan kegiatan 2, jadi hanya slot yang diisi (peran_diberikan_id kosong = peran lama tidak dikelola slot).
update public.sigap_kegiatan_penanggung_jawab s
set akun_id = 357, diubah_oleh = 'M. Iqbal Hadi (putusan 6 Nov 2026)', diubah_at = now()
where s.kegiatan_id = 2 and s.jabatan = 'pj' and s.akun_id is null
  and exists (select 1 from public.sigap_akun a where a.id = 357 and a.nama ilike 'Mailani%')
  and exists (select 1 from public.sigap_akun_peran ap join public.sigap_peran p on p.id = ap.peran_id where ap.akun_id = 357 and ap.kegiatan_id = 2 and p.kode = 'pj_kegiatan');

update public.sigap_kegiatan_penanggung_jawab s
set akun_id = 73, diubah_oleh = 'M. Iqbal Hadi (putusan 6 Nov 2026)', diubah_at = now()
where s.kegiatan_id = 2 and s.jabatan = 'wakil_pj' and s.akun_id is null
  and exists (select 1 from public.sigap_akun a where a.id = 73 and a.nama ilike 'Arini%')
  and exists (select 1 from public.sigap_akun_peran ap join public.sigap_peran p on p.id = ap.peran_id where ap.akun_id = 73 and ap.kegiatan_id = 2 and p.kode = 'pj_kegiatan');

-- Verifikasi (diharapkan: slot 10, kosong 8, kegiatan_aktif 5; kegiatan 2 terisi Mailani dan Arini):
select count(*) as slot, count(*) filter (where akun_id is null) as kosong,
       (select count(*) from public.sigap_kegiatan where aktif) as kegiatan_aktif
from public.sigap_kegiatan_penanggung_jawab;

select s.kegiatan_id, s.jabatan, a.nama
from public.sigap_kegiatan_penanggung_jawab s
join public.sigap_akun a on a.id = s.akun_id
order by 1, 2;
