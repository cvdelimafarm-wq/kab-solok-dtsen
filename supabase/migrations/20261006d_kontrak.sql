-- (6 Okt 2026) Modul Pengadaan & Kontrak -- permintaan user: template kontrak dari file mail merge,
-- halaman pengisian data yg terisi otomatis, unduh Word per dokumen. Prefix tabel: kontrak_.
-- Akses lewat API server (service role) + izin SIGAP menu 'kontrak.kelola'. RLS aktif tanpa policy.
set statement_timeout = '60s';
set lock_timeout = '10s';

create table if not exists kontrak_master_tahun (
  tahun integer primary key,
  data jsonb not null default '{}'::jsonb,
  diubah_at timestamptz not null default now(),
  diubah_oleh text
);

create table if not exists kontrak_penyedia (
  id bigserial primary key,
  nama text not null,
  npwp text,
  alamat text,
  kota text,
  label_pimpinan text,
  nama_pimpinan text,
  nik text,
  nomor_rekening text,
  bank text,
  nama_rekening text,
  bidang text,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now(),
  diubah_at timestamptz not null default now()
);

create table if not exists kontrak_paket (
  id bigserial primary key,
  tahun integer not null,
  nomor_urut integer,
  nama text not null default '',
  jenis_template text not null default 'paket_meeting',
  penyedia_id bigint references kontrak_penyedia(id),
  isian jsonb not null default '{}'::jsonb,
  timpa jsonb not null default '{}'::jsonb,
  status text not null default 'draf' check (status in ('draf','final','batal')),
  dibuat_oleh text,
  dibuat_at timestamptz not null default now(),
  diubah_oleh text,
  diubah_at timestamptz not null default now()
);
create index if not exists kontrak_paket_tahun_idx on kontrak_paket (tahun, nomor_urut);

alter table kontrak_master_tahun enable row level security;
alter table kontrak_penyedia enable row level security;
alter table kontrak_paket enable row level security;

-- Menu SIGAP + izin untuk Admin Anggaran
insert into sigap_menu (kode, portal, nama, keterangan, urutan) values
  ('kontrak.kelola', 'Pengadaan & Kontrak', 'Paket, master & penyedia', 'Isi data paket pengadaan, unduh dokumen kontrak per dokumen', 200)
on conflict (kode) do nothing;
insert into sigap_peran_izin (peran_id, menu_kode, level)
select id, 'kontrak.kelola', 'kelola' from sigap_peran where kode = 'admin_anggaran'
on conflict do nothing;

-- Master TA 2025 dari file mail merge user (sheet Pejabat & Data Detail)
insert into kontrak_master_tahun (tahun, data, diubah_oleh) values (2025, jsonb_build_object(
  'Nama_PPK', 'Novriady S.Ak', 'NIP_PPK', '19801113 200604 1 003', 'No_SK_PPK', '001', 'Tgl_SK_PPK', '02 Januari 2025',
  'Label_PPK', 'PPK BPS Kabupaten Solok Tahun Anggaran 2025',
  'Nama_Pejabat_Pengadaan', 'M. Iqbal Hadi, SST', 'NIP_Pejabat', '19941006 201701 1 001', 'No_SK_PP', '2', 'Tgl_SK_PP', '02 Januari 2025',
  'Label_Pejabat_Pengadaan', 'Pejabat Pengadaan BPS Kabupaten Solok Tahun Anggaran 2025',
  'DIPA', 'Satuan Kerja BPS Kabupaten Solok Tahun Anggaran 2025 Nomor : DIPA-054.01.2.019979/2025 tanggal 28 Desember 2022',
  'Alamat', 'Jl. Solok-Padang KM 20 Kayu Aro Kecamatan Gunung Talang Kabupaten Solok',
  'Kota_TTD', 'Kayu Aro', 'KPPN', 'Solok', 'Jenis_Kontrak', 'Lumpsum', 'Cara_Pembayaran', 'Pembayaran sekaligus',
  'Denda', 'nilai pekerjaan', 'Jenis_Pekerjaan', 'Jasa lainnya'), 'seed mail merge 2025')
on conflict (tahun) do nothing;

-- Master TA 2026: nama pejabat disalin dari 2025, SK & DIPA dikosongkan (WAJIB diverifikasi user)
insert into kontrak_master_tahun (tahun, data, diubah_oleh) values (2026, jsonb_build_object(
  'Nama_PPK', 'Novriady S.Ak', 'NIP_PPK', '19801113 200604 1 003', 'No_SK_PPK', '', 'Tgl_SK_PPK', '',
  'Label_PPK', 'PPK BPS Kabupaten Solok Tahun Anggaran 2026',
  'Nama_Pejabat_Pengadaan', 'M. Iqbal Hadi, SST', 'NIP_Pejabat', '19941006 201701 1 001', 'No_SK_PP', '', 'Tgl_SK_PP', '',
  'Label_Pejabat_Pengadaan', 'Pejabat Pengadaan BPS Kabupaten Solok Tahun Anggaran 2026',
  'DIPA', '',
  'Alamat', 'Jl. Solok-Padang KM 20 Kayu Aro Kecamatan Gunung Talang Kabupaten Solok',
  'Kota_TTD', 'Kayu Aro', 'KPPN', 'Solok', 'Jenis_Kontrak', 'Lumpsum', 'Cara_Pembayaran', 'Pembayaran sekaligus',
  'Denda', 'nilai pekerjaan', 'Jenis_Pekerjaan', 'Jasa lainnya'), 'seed (salin 2025, perlu verifikasi)')
on conflict (tahun) do nothing;

-- Penyedia dari file mail merge
insert into kontrak_penyedia (nama, npwp, alamat, kota, label_pimpinan, nama_pimpinan, nik, nomor_rekening, bank, nama_rekening, bidang)
select 'PT BERKAT USAHA MAMIPAPI (Mami Hotel)', '84.627.549.3-203.000',
  'Jalan Kartini Nomor 314, Kel. Kampung Jawa, Kec. Tanjung Harapan, Kota Solok, Prop. Sumatera Barat', 'Solok',
  'Manager', 'Riano Oskar', '1372022307820040', '998101000881568', 'BRI', 'PT BERKAT USAHA MAMIPAPI', 'Jasa Perhotelan'
where not exists (select 1 from kontrak_penyedia where nama like 'PT BERKAT USAHA MAMIPAPI%');
insert into kontrak_penyedia (nama, bidang)
select 'PT. PUTI BUNGSU (ROCKY PLAZA HOTEL)', 'Jasa Perhotelan'
where not exists (select 1 from kontrak_penyedia where nama like 'PT. PUTI BUNGSU%');
