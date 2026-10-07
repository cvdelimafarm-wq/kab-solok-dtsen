-- (8 Okt 2026) Kelas bawaan inda/instruktur untuk Adu Sigap: filter kelas langsung terbuka di kelasnya.
-- akun 354 M. Iqbal Hadi -> Kelas 2; 49 Anggun Munef -> Kelas 1; 200 Faisal Siddiq -> Kelas 3; 464 Nurafiza Thamrin -> Kelas 4 (kegiatan 3).
create table if not exists sigap_kuis_instruktur_kelas (
  kegiatan_id bigint not null,
  akun_id bigint not null,
  kelas smallint not null check (kelas between 1 and 4),
  primary key (kegiatan_id, akun_id)
);
alter table sigap_kuis_instruktur_kelas enable row level security;
insert into sigap_kuis_instruktur_kelas (kegiatan_id, akun_id, kelas) values
  (3, 354, 2), (3, 49, 1), (3, 200, 3), (3, 464, 4)
on conflict (kegiatan_id, akun_id) do update set kelas = excluded.kelas;
