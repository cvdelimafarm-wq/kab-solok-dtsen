-- (6 Okt 2026) Log login & durasi pemakaian SIGAP -- permintaan user (cek kapan terakhir & berapa lama login).
-- 1 baris = 1 sesi (mulai_at s.d. terakhir_aktif_at); diisi saat masuk & lewat detak halaman (lib/sigapLog.ts).
set statement_timeout = '60s';
set lock_timeout = '10s';
create table if not exists sigap_log_sesi (
  id bigserial primary key,
  akun_id bigint not null references sigap_akun(id),
  mulai_at timestamptz not null default now(),
  terakhir_aktif_at timestamptz not null default now(),
  halaman text,
  perangkat text,
  cara text
);
create index if not exists sigap_log_sesi_akun_idx on sigap_log_sesi (akun_id, terakhir_aktif_at desc);
alter table sigap_log_sesi enable row level security;
