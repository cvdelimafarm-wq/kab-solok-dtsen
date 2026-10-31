-- 20261031o_anomali_petugas.sql
-- (31 Okt 2026) Lingkar anomali petugas: impor anomali dari Excel (template SIGAP baku), penugasan otomatis ke petugas (PPL/PML) untuk dikonfirmasi,
-- antrean "perlu dicocokkan" untuk nama yang tidak ketemu/ambigu, dan ingatan alias nama. TIDAK menyentuh tabel kp_anomali_* (pipeline konsistensi KP).
-- Dijalankan Iqbal sendiri (Supabase SQL editor). Aman diulang (IF NOT EXISTS).

create table if not exists public.sigap_anomali_batch (
  id           bigint generated always as identity primary key,
  kegiatan_id  bigint      not null references public.sigap_kegiatan(id),
  periode      text,
  sumber       text        not null default 'lain' check (sumber in ('pantau', 'vsen26m', 'lain')),
  fase         text        not null default 'pra_pelatihan' check (fase in ('pra_pelatihan', 'pemeriksaan')),
  nama_berkas  text,
  total        integer     not null default 0,
  cocok        integer     not null default 0,
  perlu_cocok  integer     not null default 0,
  duplikat     integer     not null default 0,
  diimpor_oleh bigint      references public.sigap_akun(id) on delete set null,
  dibuat_at    timestamptz not null default now()
);

create table if not exists public.sigap_anomali_temuan (
  id              bigint generated always as identity primary key,
  batch_id        bigint      not null references public.sigap_anomali_batch(id),
  kegiatan_id     bigint      not null references public.sigap_kegiatan(id),
  akun_id         bigint      references public.sigap_akun(id) on delete set null,
  pml_akun_id     bigint      references public.sigap_akun(id) on delete set null,
  nama_asal       text        not null,
  kode_temuan     text        not null,
  id_sampel       text,
  periode         text,
  fase            text        not null default 'pra_pelatihan' check (fase in ('pra_pelatihan', 'pemeriksaan')),
  keterangan      text,
  rincian         jsonb       not null default '{}'::jsonb,
  kunci           text        not null,
  status          text        not null default 'menunggu' check (status in ('perlu_cocok', 'menunggu', 'dikonfirmasi')),
  penyebab        text,
  catatan         text        check (catatan is null or char_length(catatan) <= 500),
  dikonfirmasi_at timestamptz,
  dikonfirmasi_oleh bigint    references public.sigap_akun(id) on delete set null,
  dibuat_at       timestamptz not null default now()
);

-- impor ulang berkas yang sama tidak menggandakan temuan
create unique index if not exists sigap_anomali_temuan_kunci_uq on public.sigap_anomali_temuan (kegiatan_id, kunci);
create index if not exists sigap_anomali_temuan_akun_idx on public.sigap_anomali_temuan (akun_id, status);
create index if not exists sigap_anomali_temuan_keg_idx on public.sigap_anomali_temuan (kegiatan_id, status);
create index if not exists sigap_anomali_temuan_batch_idx on public.sigap_anomali_temuan (batch_id);
create index if not exists sigap_anomali_temuan_kode_idx on public.sigap_anomali_temuan (kode_temuan);

-- ingatan pencocokan nama -> akun (diisi admin saat mencocokkan; dipakai impor berikutnya)
create table if not exists public.sigap_anomali_alias (
  alias_norm  text        primary key,
  akun_id     bigint      not null references public.sigap_akun(id) on delete cascade,
  dibuat_oleh bigint      references public.sigap_akun(id) on delete set null,
  dibuat_at   timestamptz not null default now()
);

-- Hanya diakses lewat API server (service role); tanpa kebijakan = klien anon/auth tidak bisa membaca.
alter table public.sigap_anomali_batch  enable row level security;
alter table public.sigap_anomali_temuan enable row level security;
alter table public.sigap_anomali_alias  enable row level security;
