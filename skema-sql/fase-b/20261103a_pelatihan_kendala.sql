-- 20261103a_pelatihan_kendala.sql
--
-- (3 Nov 2026) Kelola Pelatihan > Kendala: catatan keputusan saat ada kendala (tahap pertama: petugas menolak / mundur). AMAN DIULANG. Dijalankan Iqbal sendiri.
-- Satu baris = satu keputusan. `snapshot` menyimpan keadaan sebelum keputusan (penugasan, hierarki, bawahan) supaya keputusan bisa DIURUNGKAN.
-- Hanya server (service role) yang menulis dan membaca: RLS aktif tanpa kebijakan. Tanpa tabel ini panel Kendala tampil dengan petunjuk menjalankan SQL ini; fitur lain tetap jalan.
--   keputusan: ganti   = calon baru mewarisi peran, kelas, atasan, dan bawahan petugas lama (calon langsung masuk daftar dan diundang)
--              kosong  = tempat dibiarkan kosong sementara (tercatat, muncul di daftar "menunggu pengganti")
--              alihkan = tempat diambil alih petugas yang sudah ada; TIDAK dibagi rata, jadi bebannya bisa ganda
--   selesai_at     = keputusan 'kosong' yang kemudian diganti keputusan lain
--   dibatalkan_at  = keputusan diurungkan

create table if not exists sigap_pelatihan_kendala (
  id                bigserial   primary key,
  kegiatan_id       bigint      not null references sigap_kegiatan(id) on delete cascade,
  jenis             text        not null default 'petugas_mundur' check (jenis in ('petugas_mundur')),
  akun_id           bigint      not null references sigap_akun(id),
  keputusan         text        not null check (keputusan in ('ganti','kosong','alihkan')),
  pengganti_akun_id bigint      references sigap_akun(id),
  peran             text,
  kelas             smallint,
  atasan_akun_id    bigint      references sigap_akun(id),
  catatan           text,
  snapshot          jsonb       not null default '{}'::jsonb,
  oleh              bigint      references sigap_akun(id),
  at                timestamptz not null default now(),
  selesai_at        timestamptz,
  dibatalkan_at     timestamptz,
  dibatalkan_oleh   bigint      references sigap_akun(id),
  check (jsonb_typeof(snapshot) = 'object')
);

create index if not exists sigap_pelatihan_kendala_kegiatan_idx on sigap_pelatihan_kendala (kegiatan_id, at desc);
create index if not exists sigap_pelatihan_kendala_terbuka_idx on sigap_pelatihan_kendala (kegiatan_id, akun_id) where dibatalkan_at is null and selesai_at is null;

alter table sigap_pelatihan_kendala enable row level security;

-- Cek cepat (harus 1):
--   select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'sigap_pelatihan_kendala';
