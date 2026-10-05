-- (6 Okt 2026) SIGAP: tempat kedudukan petugas tidak diisi ulang -- permintaan user.
-- Koordinat tempat tinggal diambil dari master (bencana_mitra / bencana_petugas) dan ditampilkan; petugas
-- memverifikasi dgn lokasi HP saat ini. Bila selisih > 5 km, petugas wajib menulis alasan.
-- Format kecamatan master "(050) LEMBAH GUMANTI" dirapikan menjadi "LEMBAH GUMANTI".
set statement_timeout = '60s';
set lock_timeout = '10s';
alter table sigap_akun add column if not exists domisili_lat double precision;
alter table sigap_akun add column if not exists domisili_lng double precision;
alter table sigap_akun add column if not exists domisili_sumber text;
alter table sigap_akun add column if not exists verif_lat double precision;
alter table sigap_akun add column if not exists verif_lng double precision;
alter table sigap_akun add column if not exists verif_akurasi_m double precision;
alter table sigap_akun add column if not exists verif_jarak_m double precision;
alter table sigap_akun add column if not exists verif_alasan text;
alter table sigap_akun add column if not exists verif_at timestamptz;

update sigap_akun a set domisili_lat = m.latitude, domisili_lng = m.longitude, domisili_sumber = coalesce('master mitra: ' || m.sumber_koordinat, 'master mitra')
from bencana_mitra m where m.id = a.mitra_id and a.domisili_lat is null and m.latitude is not null and m.longitude is not null;
update sigap_akun a set domisili_lat = b.lat, domisili_lng = b.lng, domisili_sumber = 'data petugas bencana'
from bencana_petugas b where b.id = a.petugas_bencana_id and a.domisili_lat is null and b.lat is not null and b.lng is not null;

update sigap_akun a set alamat_kecamatan = coalesce(m.alamat_kecamatan, a.alamat_kecamatan)
from bencana_mitra m where m.id = a.mitra_id and a.alamat_kecamatan is null;
update sigap_akun set alamat_kecamatan = upper(trim(regexp_replace(alamat_kecamatan, '^\(\d+\)\s*', '')))
where alamat_kecamatan ~ '^\(\d+\)';
