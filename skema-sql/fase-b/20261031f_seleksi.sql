-- 20261031f_seleksi.sql
-- (31 Okt 2026) Paket 2 arus kegiatan: rancangan perekrutan petugas oleh PJ survei (penunjukan langsung atau seleksi).
-- Tahap ini hanya RANCANGAN + wilayah sampel + pratinjau kandidat. Peserta, soal, nilai, peringkat, dan pengumuman menyusul (tabel terpisah).
-- Dijalankan Iqbal sendiri. Aman diulang. Tidak ada hapus: seleksi yang dibatalkan berstatus 'batal'.

create table if not exists public.sigap_seleksi (
  id              bigint generated always as identity primary key,
  kegiatan_id     bigint      not null references public.sigap_kegiatan(id) on delete cascade,
  nama            text        not null check (char_length(nama) between 3 and 120),
  jalur           text        not null default 'seleksi' check (jalur in ('penunjukan', 'seleksi')),
  status          text        not null default 'draft'   check (status in ('draft', 'dibuka', 'ditutup', 'selesai', 'batal')),
  kebutuhan_ppl   integer     not null default 0 check (kebutuhan_ppl >= 0),
  kebutuhan_pml   integer     not null default 0 check (kebutuhan_pml >= 0),
  sudah_ppl       integer     not null default 0 check (sudah_ppl >= 0),   -- sudah di-plot pegawai organik
  sudah_pml       integer     not null default 0 check (sudah_pml >= 0),
  syarat          jsonb       not null default '{}'::jsonb,                -- {domisili:{aktif,level}, jarak:{aktif,maks_km}}
  jadwal_buka     timestamptz,
  jadwal_tutup    timestamptz,
  peringkat_level text        not null default 'kabupaten' check (peringkat_level in ('kecamatan', 'nagari', 'kabupaten')),
  tampil_nilai    boolean     not null default false,
  dibuat_oleh     bigint      references public.sigap_akun(id) on delete set null,
  dibuat_at       timestamptz not null default now(),
  diubah_oleh     bigint      references public.sigap_akun(id) on delete set null,
  diubah_at       timestamptz not null default now(),
  check (jadwal_tutup is null or jadwal_buka is null or jadwal_tutup > jadwal_buka),
  check (sudah_ppl <= kebutuhan_ppl and sudah_pml <= kebutuhan_pml)
);
create index if not exists sigap_seleksi_kegiatan_idx on public.sigap_seleksi (kegiatan_id, status);

create table if not exists public.sigap_seleksi_wilayah (
  seleksi_id     bigint  not null references public.sigap_seleksi(id) on delete cascade,
  kode           text    not null,
  nama           text    not null,
  kecamatan      text,
  nagari         text,
  lat            double precision,
  lng            double precision,
  jumlah_sampel  integer not null default 0 check (jumlah_sampel >= 0),
  kebutuhan_ppl  integer not null default 0 check (kebutuhan_ppl >= 0),
  kebutuhan_pml  integer not null default 0 check (kebutuhan_pml >= 0),
  primary key (seleksi_id, kode)
);

-- Hanya diakses lewat API server (service role); tanpa kebijakan = klien anon/auth tidak bisa membaca.
alter table public.sigap_seleksi          enable row level security;
alter table public.sigap_seleksi_wilayah  enable row level security;
