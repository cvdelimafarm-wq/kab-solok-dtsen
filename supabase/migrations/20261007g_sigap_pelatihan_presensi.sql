-- (7 Okt 2026) SIGAP > Pelatihan > Presensi radius dari lokasi pelatihan (Mami Hotel Solok).
-- Pengaturan titik & jam per kegiatan; catatan presensi (diterima / ditolak / manual oleh panitia).
create table if not exists sigap_pelatihan_pengaturan (
  kegiatan_id bigint primary key references sigap_kegiatan(id),
  presensi_lat double precision not null,
  presensi_lng double precision not null,
  presensi_radius_m integer not null default 300 check (presensi_radius_m between 10 and 5000),
  presensi_buka_at timestamptz not null,
  presensi_tutup_at timestamptz not null,
  akurasi_maks_m integer not null default 100 check (akurasi_maks_m between 10 and 1000),
  tempat text,
  diubah_at timestamptz not null default now()
);
alter table sigap_pelatihan_pengaturan enable row level security;

create table if not exists sigap_pelatihan_presensi (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  akun_id bigint not null references sigap_akun(id) on delete cascade,
  penugasan_id bigint references sigap_penugasan(id),
  at timestamptz not null default now(),
  diterima boolean not null,
  lat double precision,
  lng double precision,
  akurasi_m double precision,
  jarak_m double precision,
  manual boolean not null default false,
  alasan text,
  dicatat_oleh text
);
-- satu presensi diterima per peserta
create unique index if not exists sigap_pelatihan_presensi_unik on sigap_pelatihan_presensi (kegiatan_id, akun_id) where diterima;
create index if not exists sigap_pelatihan_presensi_keg on sigap_pelatihan_presensi (kegiatan_id, at);
alter table sigap_pelatihan_presensi enable row level security;

insert into sigap_pelatihan_pengaturan (kegiatan_id, presensi_lat, presensi_lng, presensi_radius_m, presensi_buka_at, presensi_tutup_at, akurasi_maks_m, tempat)
select k.id, -0.7868501201205192, 100.65382199136447, 300, timestamptz '2026-10-08 06:00:00+07', timestamptz '2026-10-08 18:00:00+07', 100, 'Mami Hotel Solok'
from sigap_kegiatan k where k.kode='pelatihan_psp_pascabencana_2026'
on conflict (kegiatan_id) do nothing;
