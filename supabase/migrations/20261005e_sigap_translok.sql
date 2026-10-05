-- (5 Okt 2026) SIGAP (Sistem Informasi Gerak Anggaran & Pertanggungjawaban) -- modul pertama:
-- Pelaksanaan > Transport Lokal (SPDT NTP 2026 & Pendataan Pascabencana). Petugas mengisi
-- realisasi harian MANUAL (lokasi, jumlah ruta, kendala) + 5 foto dokumentasi per hari.
-- Upload foto hanya pada hari yg sama s.d. 23:59 WIB; tanggal terlewat hanya bisa dibuka
-- admin anggaran lewat izin susulan (berlaku s.d. 23:59 WIB hari izin diberikan).
-- Prefix tabel sigap_* (tidak mengubah tabel spj_* penyisiran).

create table if not exists public.sigap_kegiatan (
  id bigint generated always as identity primary key,
  kode text not null unique,                 -- 'spdt_ntp_2026' | 'pascabencana_2026'
  nama text not null,
  kode_anggaran text,                        -- s.d. akun, mis. 054.01.GG.2907.BMA.009.052.A.524113
  tanggal_mulai date,
  tanggal_selesai date,
  aktif boolean not null default true,
  satuan_realisasi text not null default 'ruta', -- label angka realisasi (ruta / keluarga / dokumen)
  dibuat_at timestamptz not null default now()
);

-- Tarif & kuota per peran, diambil dari baris detail RKKS 524113 kegiatan.
create table if not exists public.sigap_kegiatan_tarif (
  id bigint generated always as identity primary key,
  kegiatan_id bigint not null references public.sigap_kegiatan(id),
  peran text not null check (peran in ('ppl','pml')),
  uraian_detail text not null,
  tarif numeric not null,
  kuota_ok numeric,
  label_jabatan text not null,
  unique (kegiatan_id, peran)
);

create table if not exists public.sigap_realisasi (
  id bigint generated always as identity primary key,
  kegiatan_id bigint not null references public.sigap_kegiatan(id),
  petugas_id bigint not null references public.bencana_petugas(id),
  tanggal date not null,
  lokasi jsonb not null default '[]'::jsonb, -- [{kecamatan, nagari, jorong, idsubsls?}]
  jumlah_realisasi integer not null check (jumlah_realisasi >= 0),
  kendala text,
  dibuat_at timestamptz not null default now(),
  diperbarui_at timestamptz not null default now(),
  unique (kegiatan_id, petugas_id, tanggal),
  -- aturan rangkap: 1 petugas hanya boleh 1 kegiatan translok per tanggal
  unique (petugas_id, tanggal)
);

create table if not exists public.sigap_dokumentasi (
  id bigint generated always as identity primary key,
  kegiatan_id bigint not null references public.sigap_kegiatan(id),
  petugas_id bigint not null references public.bencana_petugas(id),
  tanggal date not null,
  slot smallint not null check (slot between 1 and 5),
  file_path text not null,
  file_nama_asli text,
  ukuran_byte integer,
  susulan boolean not null default false,
  diunggah_at timestamptz not null default now(),
  unique (kegiatan_id, petugas_id, tanggal, slot)
);

create table if not exists public.sigap_izin_susulan (
  id bigint generated always as identity primary key,
  kegiatan_id bigint not null references public.sigap_kegiatan(id),
  petugas_id bigint not null references public.bencana_petugas(id),
  tanggal date not null,
  alasan text,
  diberikan_oleh text not null,
  diberikan_at timestamptz not null default now(),
  berlaku_sampai timestamptz not null
);
create index if not exists sigap_izin_cari on public.sigap_izin_susulan (petugas_id, tanggal);

alter table public.sigap_kegiatan enable row level security;
alter table public.sigap_kegiatan_tarif enable row level security;
alter table public.sigap_realisasi enable row level security;
alter table public.sigap_dokumentasi enable row level security;
alter table public.sigap_izin_susulan enable row level security;

insert into storage.buckets (id, name, public) values ('sigap-files', 'sigap-files', false) on conflict (id) do nothing;

-- Data awal (RKKS 30 Sep 2026). Rentang tanggal Surat Tugas menyusul (diisi admin).
insert into public.sigap_kegiatan (kode, nama, kode_anggaran, satuan_realisasi) values
  ('pascabencana_2026', 'Pendataan Pascabencana 2026', '054.01.GG.2907.BMA.009.052.A.524113', 'keluarga'),
  ('spdt_ntp_2026', 'SPDT NTP 2026', '054.01.GG.2903.BMA.008.052.A.524113', 'ruta')
on conflict (kode) do nothing;

insert into public.sigap_kegiatan_tarif (kegiatan_id, peran, uraian_detail, tarif, kuota_ok, label_jabatan)
select k.id, v.peran, v.uraian, v.tarif, v.kuota, v.label
from public.sigap_kegiatan k
join (values
  ('pascabencana_2026', 'ppl', 'Transport lokal Petugas PPL', 150000, 3458, 'PPL Pendataan Pascabencana'),
  ('pascabencana_2026', 'pml', 'Transport Lokal PML', 150000, 980, 'PML Pendataan Pascabencana'),
  ('spdt_ntp_2026', 'ppl', 'Transport lokal SPDT NTP', 58472, 500, 'PPL SPDT NTP 2026'),
  ('spdt_ntp_2026', 'pml', 'Transport lokal SPDT NTP', 58472, 500, 'PML SPDT NTP 2026')
) as v(kode, peran, uraian, tarif, kuota, label) on v.kode = k.kode
on conflict (kegiatan_id, peran) do nothing;
