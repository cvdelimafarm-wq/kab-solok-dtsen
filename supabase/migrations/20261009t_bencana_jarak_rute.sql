-- (9 Okt 2026) Jarak rute jalan (bukan garis lurus) rumah petugas -> Sub SLS -- permintaan user: "harusnya pakai jarak rute jalan".
-- Diisi skrip scripts/hitung-jarak-rute.mjs (OSRM, profil mengemudi). Dibaca server /api/bencana/konfirmasi/[token].
create table if not exists public.bencana_jarak_rute (
  petugas_id bigint not null,
  idsubsls text not null,
  jarak_km numeric(8,2) not null check (jarak_km >= 0),
  durasi_menit numeric(8,1),
  sumber text not null default 'osrm_driving',
  dihitung_at timestamptz not null default now(),
  primary key (petugas_id, idsubsls)
);
create index if not exists bencana_jarak_rute_subsls on public.bencana_jarak_rute(idsubsls);
alter table public.bencana_jarak_rute enable row level security;
