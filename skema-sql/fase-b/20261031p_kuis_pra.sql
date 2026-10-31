-- 20261031p_kuis_pra.sql
-- (31 Okt 2026) Kuis PRA pelatihan: soal dipilih PER PETUGAS menurut riwayat anomalinya (sigap_anomali_temuan, SQL 20261031o) dari bank soal QC berkode "KT-<KODE>-<urut>".
-- Modul ringan terpisah dari mesin QC Pemahaman (tidak mengubah fungsi sigap_qc_*). Dijalankan Iqbal sendiri (Supabase SQL editor). Aman diulang.
-- Prasyarat: 20261031o sudah dijalankan.

create table if not exists public.sigap_kuis_pra_pengaturan (
  kegiatan_id        bigint      primary key references public.sigap_kegiatan(id) on delete cascade,  -- kegiatan PELATIHAN
  aktif              boolean     not null default false,
  kegiatan_anomali_id bigint     references public.sigap_kegiatan(id) on delete set null,              -- survei yang anomalinya dipakai memilih soal
  kegiatan_bank_id   bigint      references public.sigap_kegiatan(id) on delete set null,              -- kegiatan pemilik bank soal (sigap_qc_soal.kegiatan_id)
  jumlah_soal        smallint    not null default 10 check (jumlah_soal between 1 and 30),
  maks_percobaan     smallint    not null default 3  check (maks_percobaan between 1 and 10),
  nilai_lulus        smallint    not null default 70 check (nilai_lulus between 0 and 100),
  wajib_lulus        boolean     not null default false,
  buka_at            timestamptz,
  tutup_at           timestamptz,
  diubah_at          timestamptz not null default now(),
  diubah_oleh        bigint      references public.sigap_akun(id) on delete set null,
  check (tutup_at is null or buka_at is null or tutup_at > buka_at)
);

create table if not exists public.sigap_kuis_pra_percobaan (
  id          bigint generated always as identity primary key,
  kegiatan_id bigint      not null references public.sigap_kegiatan(id) on delete cascade,
  akun_id     bigint      not null references public.sigap_akun(id) on delete cascade,
  ke          smallint    not null check (ke >= 1),
  soal_ids    text[]      not null,
  jawaban     jsonb,
  benar       integer,
  jumlah      integer,
  skor        numeric(5,2),
  mulai_at    timestamptz not null default now(),
  selesai_at  timestamptz,
  unique (kegiatan_id, akun_id, ke)
);
create index if not exists sigap_kuis_pra_percobaan_akun_idx on public.sigap_kuis_pra_percobaan (kegiatan_id, akun_id);

-- Hanya diakses lewat API server (service role); tanpa kebijakan = klien anon/auth tidak bisa membaca.
alter table public.sigap_kuis_pra_pengaturan enable row level security;
alter table public.sigap_kuis_pra_percobaan  enable row level security;
