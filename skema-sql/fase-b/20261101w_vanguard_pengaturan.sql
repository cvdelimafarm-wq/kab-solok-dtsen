-- 20261101w_vanguard_pengaturan.sql
--
-- (1 Nov 2026) VANGUARD V5a: pengaturan per kegiatan dan cacahan kalkulator. AMAN DIULANG. Dijalankan Iqbal sendiri. Prasyarat: 20261101v_vanguard.sql.
-- Kode tahan SQL ini belum dijalankan: tanpa tabel, pengaturan dibaca sebagai bawaan (semua level terbuka, tanpa jadwal, tanpa batas lulus, tanpa batas percobaan)
-- dan cacahan kalkulator tidak disimpan (percobaan tetap tercatat). Hanya server (service role) yang menulis dan membaca: RLS aktif tanpa kebijakan.

create table if not exists sigap_vanguard_pengaturan (
  kegiatan_id    bigint      primary key references sigap_kegiatan(id) on delete cascade,
  level_dibuka   text[]      not null default '{}'::text[],                                   -- kosong = semua level
  nilai_lulus    smallint    check (nilai_lulus between 1 and 100),                            -- persen kasus (dari yang dibuka) yang harus benar; null = tanpa batas lulus
  buka_at        timestamptz,                                                                  -- null = langsung
  tutup_at       timestamptz,                                                                  -- null = tanpa batas
  maks_percobaan smallint    check (maks_percobaan between 1 and 200),                         -- per kasus per petugas; null = bawaan sistem (200)
  diubah_oleh    text,
  diubah_at      timestamptz not null default now(),
  check (level_dibuka <@ array['A','B','C','D','E','G','H']::text[]),
  check (buka_at is null or tutup_at is null or tutup_at > buka_at)
);

create table if not exists sigap_vanguard_kalkulator (
  kegiatan_id bigint      not null references sigap_kegiatan(id) on delete cascade,
  akun_id     bigint      not null references sigap_akun(id),
  jumlah      integer     not null default 0 check (jumlah >= 0),                               -- berapa kali kalkulator dipakai (ekspresi), tanpa isi ekspresi
  terakhir_at timestamptz not null default now(),
  primary key (kegiatan_id, akun_id)
);

alter table sigap_vanguard_pengaturan enable row level security;
alter table sigap_vanguard_kalkulator enable row level security;

-- Cek cepat (harus 2):
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sigap_vanguard_pengaturan','sigap_vanguard_kalkulator');
