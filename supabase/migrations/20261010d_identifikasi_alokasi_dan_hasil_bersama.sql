-- (10 Okt 2026) Pembagian Sub SLS identifikasi ke PML dibuat TERPISAH dari plotting PPL (permintaan user):
--  * bencana_identifikasi_alokasi: per SLS (semua Sub SLS di bawahnya ikut) -> 1 PML PELAKSANA (terdekat) + 1 PML PENDAMPING; keduanya bertanggung jawab.
--  * bencana_identifikasi_subsls: hasil identifikasi dipakai BERSAMA oleh pelaksana & pendamping, jadi kunci = idsubsls saja;
--    pml_id = PML yang terakhir menyimpan. (Tabel masih kosong saat diubah.)
-- Hasil identifikasi kelak menjadi dasar plotting wilayah tugas PPL.
create table if not exists public.bencana_identifikasi_alokasi (
  idsls               text        primary key,           -- 14 digit (idsubsls tanpa 2 digit terakhir)
  iddesa              text        not null,              -- 10 digit
  pml_pelaksana_id    bigint      not null references public.bencana_petugas(id),
  pml_pendamping_id   bigint      not null references public.bencana_petugas(id),
  jarak_km            numeric,                            -- garis lurus ke koordinat PML pelaksana; null bila PML belum punya lokasi
  catatan             text,
  dibuat_at           timestamptz not null default now(),
  constraint identifikasi_alokasi_beda check (pml_pelaksana_id <> pml_pendamping_id)
);
alter table public.bencana_identifikasi_alokasi enable row level security;

do $$
begin
  if (select count(*) from public.bencana_identifikasi_subsls) = 0 then
    alter table public.bencana_identifikasi_subsls drop constraint if exists bencana_identifikasi_subsls_pkey;
    alter table public.bencana_identifikasi_subsls add primary key (idsubsls);
  end if;
end $$;
comment on column public.bencana_identifikasi_subsls.pml_id is 'PML yang terakhir menyimpan (pelaksana atau pendamping); hasil dipakai bersama';
