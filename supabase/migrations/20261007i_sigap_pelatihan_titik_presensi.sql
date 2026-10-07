-- (7 Okt 2026) Presensi pelatihan: beberapa titik lokasi (Mami Hotel & Ully Hotel Solok), masing-masing beradius sendiri.
-- Presensi diterima bila peserta berada dalam radius SALAH SATU titik aktif.
create table if not exists sigap_pelatihan_titik (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  urut smallint not null default 1,
  nama text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null default 300 check (radius_m between 10 and 5000),
  aktif boolean not null default true
);
create index if not exists sigap_pelatihan_titik_keg on sigap_pelatihan_titik (kegiatan_id, urut);
alter table sigap_pelatihan_titik enable row level security;

-- titik pertama = titik lama di pengaturan (Mami Hotel)
insert into sigap_pelatihan_titik (kegiatan_id, urut, nama, lat, lng, radius_m)
select p.kegiatan_id, 1, coalesce(p.tempat, 'Mami Hotel Solok'), p.presensi_lat, p.presensi_lng, p.presensi_radius_m
from sigap_pelatihan_pengaturan p
where p.presensi_lat is not null
  and not exists (select 1 from sigap_pelatihan_titik t where t.kegiatan_id = p.kegiatan_id);

-- kolom titik/radius di pengaturan tidak dipakai lagi
alter table sigap_pelatihan_pengaturan alter column presensi_lat drop not null;
alter table sigap_pelatihan_pengaturan alter column presensi_lng drop not null;
alter table sigap_pelatihan_pengaturan alter column presensi_radius_m drop not null;

-- titik yang dipakai saat presensi dicatat
alter table sigap_pelatihan_presensi add column if not exists titik_nama text;
