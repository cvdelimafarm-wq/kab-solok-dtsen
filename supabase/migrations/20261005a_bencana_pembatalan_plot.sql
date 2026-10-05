-- (5 Okt 2026) Pembatalan plotting PPL yang juga PPL SPDT NTP 2026 -- permintaan user.
-- Satu baris per petugas yg plotting-nya dibatalkan. Kolom data_lama menyimpan
-- keadaan SEBELUM pembatalan (peran, atasan_id, baris alokasi) sbg cadangan
-- agar bisa dikembalikan. Pesan ditampilkan di halaman undangan/konfirmasi.
create table if not exists public.bencana_pembatalan_plot (
  petugas_id bigint primary key references public.bencana_petugas(id),
  alasan text not null,
  pesan text not null,
  data_lama jsonb,
  dibuat_at timestamptz not null default now()
);
alter table public.bencana_pembatalan_plot enable row level security;

-- (5 Okt 2026) Pemberitahuan ke PML: PML tim lama + kapan PML menekan "Oke" (berhenti tampil).
alter table public.bencana_pembatalan_plot add column if not exists pml_id bigint references public.bencana_petugas(id);
alter table public.bencana_pembatalan_plot add column if not exists pml_dibaca_at timestamptz;
update public.bencana_pembatalan_plot set pml_id = (data_lama->>'atasan_id')::bigint where pml_id is null and data_lama ? 'atasan_id';
