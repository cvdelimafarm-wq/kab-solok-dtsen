-- (5 Okt 2026) SIGAP Transport Lokal dibuat GENERIK utk semua kegiatan -- permintaan user.
-- Admin anggaran / PJ kegiatan menentukan: kegiatan, periode, peran + tarif + maks hari (default per peran,
-- bisa diubah per petugas), dan siapa petugasnya (dari master ±774 mitra). Halaman petugas hanya membaca.
-- Kwitansi/Visum/Surat Pernyataan TIDAK disimpan sbg file: dirakit dari sigap_hari_kerja saat dibuka;
-- baru dibekukan (sigap_dokumen_final) saat admin menekan "Verifikasi & Kunci" (keputusan user: opsi B).
-- Tidak mengubah tabel modul lain (bencana_* hanya dibaca/di-referensikan).

set statement_timeout = '120s';
set lock_timeout = '10s';

-- 1. Akun petugas SIGAP (master = bencana_mitra + petugas bencana yg tidak ada di mitra)
create table if not exists sigap_akun (
  id bigserial primary key,
  mitra_id bigint unique references bencana_mitra(id),
  petugas_bencana_id bigint unique references bencana_petugas(id),
  nama text not null,
  jenis text not null default 'mitra' check (jenis in ('mitra','organik')),
  nik text,
  nip text,
  alamat_kecamatan text,
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  pin_hash text,
  pin_salt text,
  akun_dibuat_at timestamptz,
  terakhir_masuk_at timestamptz,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now()
);
create index if not exists sigap_akun_nama_idx on sigap_akun (lower(nama));

-- 2. Peran + tarif bebas per kegiatan (tabel tarif lama diperluas)
alter table sigap_kegiatan_tarif drop constraint if exists sigap_kegiatan_tarif_peran_check;
alter table sigap_kegiatan_tarif add column if not exists maks_hari_default integer check (maks_hari_default is null or maks_hari_default > 0);
alter table sigap_kegiatan_tarif add column if not exists urutan integer not null default 0;

-- 3. Surat Tugas (diupload admin anggaran)
create table if not exists sigap_surat_tugas (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  nomor_st text not null,
  tanggal_st date,
  tanggal_mulai date,
  tanggal_selesai date,
  file_path text,
  dibuat_at timestamptz not null default now()
);

-- 4. Penugasan: siapa, di kegiatan apa, sbg apa
create table if not exists sigap_penugasan (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  akun_id bigint not null references sigap_akun(id),
  peran text not null,
  maks_hari integer check (maks_hari is null or maks_hari > 0),  -- null = pakai default peran
  surat_tugas_id bigint references sigap_surat_tugas(id),
  aktif boolean not null default true,
  dikunci_at timestamptz,
  dikunci_oleh text,
  sumber text,
  dibuat_at timestamptz not null default now(),
  unique (kegiatan_id, akun_id)
);
create index if not exists sigap_penugasan_akun_idx on sigap_penugasan (akun_id);

-- 5. PJ kegiatan (ditunjuk admin anggaran)
create table if not exists sigap_kegiatan_pj (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  email text not null,
  ditunjuk_oleh text,
  dibuat_at timestamptz not null default now(),
  unique (kegiatan_id, email)
);

-- 6. Hari kerja (sumber kebenaran Kwitansi/Visum/Surat Pernyataan) + riwayat
create table if not exists sigap_hari_kerja (
  id bigserial primary key,
  penugasan_id bigint not null references sigap_penugasan(id),
  akun_id bigint not null references sigap_akun(id),
  tanggal date not null,
  dipilih_at timestamptz not null default now(),
  unique (penugasan_id, tanggal),
  unique (akun_id, tanggal)          -- 1 tanggal = 1 kegiatan
);
create table if not exists sigap_hari_kerja_riwayat (
  id bigserial primary key,
  penugasan_id bigint not null references sigap_penugasan(id),
  tanggal date not null,
  aksi text not null check (aksi in ('tambah','hapus')),
  oleh text,
  waktu timestamptz not null default now()
);

-- 7. Dokumen beku (diisi sekali saat Verifikasi & Kunci)
create table if not exists sigap_dokumen_final (
  id bigserial primary key,
  penugasan_id bigint not null references sigap_penugasan(id),
  jenis text not null check (jenis in ('kwitansi','visum','surat_pernyataan','laporan','dokumentasi','gabungan')),
  tanggal_mulai date,
  tanggal_selesai date,
  nominal numeric,
  file_path text not null,
  difinalkan_at timestamptz not null default now(),
  difinalkan_oleh text
);

-- 8. Realisasi / dokumentasi / izin: kunci baru per penugasan (tabel masih kosong)
alter table sigap_realisasi add column if not exists penugasan_id bigint references sigap_penugasan(id);
alter table sigap_realisasi alter column petugas_id drop not null;
alter table sigap_realisasi alter column kegiatan_id drop not null;
create unique index if not exists sigap_realisasi_penugasan_tgl_uq on sigap_realisasi (penugasan_id, tanggal);

alter table sigap_dokumentasi add column if not exists penugasan_id bigint references sigap_penugasan(id);
alter table sigap_dokumentasi alter column petugas_id drop not null;
alter table sigap_dokumentasi alter column kegiatan_id drop not null;
create unique index if not exists sigap_dokumentasi_penugasan_tgl_slot_uq on sigap_dokumentasi (penugasan_id, tanggal, slot);

alter table sigap_izin_susulan add column if not exists penugasan_id bigint references sigap_penugasan(id);
alter table sigap_izin_susulan alter column petugas_id drop not null;
alter table sigap_izin_susulan alter column kegiatan_id drop not null;

-- RLS: hanya diakses lewat service-role di route API
alter table sigap_akun enable row level security;
alter table sigap_surat_tugas enable row level security;
alter table sigap_penugasan enable row level security;
alter table sigap_kegiatan_pj enable row level security;
alter table sigap_hari_kerja enable row level security;
alter table sigap_hari_kerja_riwayat enable row level security;
alter table sigap_dokumen_final enable row level security;

-- 9. Isi awal akun dari master mitra (1 akun per nama ternormalisasi) + petugas bencana di luar mitra
insert into sigap_akun (mitra_id, nama, nik, alamat_kecamatan)
select distinct on (lower(regexp_replace(trim(m.nama),'\s+',' ','g')))
  m.id, trim(m.nama), nullif(trim(m.nik),''), m.alamat_kecamatan
from bencana_mitra m
where coalesce(trim(m.nama),'') <> ''
order by lower(regexp_replace(trim(m.nama),'\s+',' ','g')), (nullif(trim(m.nik),'') is null), m.id
on conflict (mitra_id) do nothing;

update sigap_akun a set petugas_bencana_id = p.id,
  jenis = case when p.status_kepegawaian = 'organik' then 'organik' else 'mitra' end,
  nip = coalesce(a.nip, p.nip)
from bencana_petugas p
where a.petugas_bencana_id is null
  and lower(regexp_replace(trim(p.nama),'\s+',' ','g')) = lower(regexp_replace(trim(a.nama),'\s+',' ','g'))
  and not exists (select 1 from sigap_akun x where x.petugas_bencana_id = p.id);

insert into sigap_akun (petugas_bencana_id, nama, jenis, nip, alamat_kecamatan)
select p.id, trim(p.nama), case when p.status_kepegawaian='organik' then 'organik' else 'mitra' end, p.nip, p.alamat_kecamatan
from bencana_petugas p
where not exists (select 1 from sigap_akun a where a.petugas_bencana_id = p.id)
on conflict (petugas_bencana_id) do nothing;

-- 10. Impor penugasan yg sudah ada (aturan lama) -> kegiatan 1 (Pascabencana) & 2 (SPDT NTP)
insert into sigap_penugasan (kegiatan_id, akun_id, peran, sumber)
select k.id, a.id, p.peran, 'impor_plotting_bencana'
from bencana_petugas p
join sigap_akun a on a.petugas_bencana_id = p.id
join sigap_kegiatan k on k.kode = 'pascabencana_2026'
where p.aktif and coalesce(p.status_kontak_pendaftaran_bencana,'') <> 'menolak'
  and ((p.peran = 'ppl' and p.atasan_id is not null)
    or (p.peran = 'pml' and (exists (select 1 from bencana_petugas x where x.atasan_id = p.id)
                          or exists (select 1 from bencana_alokasi_subsls s where s.pml_id = p.id))))
on conflict (kegiatan_id, akun_id) do nothing;

insert into sigap_penugasan (kegiatan_id, akun_id, peran, sumber)
select distinct on (a.id) k.id, a.id,
  case when upper(coalesce(l.peran_kegiatan,'')) = 'PML' then 'pml' else 'ppl' end, 'impor_kegiatan_lain'
from bencana_petugas_kegiatan_lain l
join bencana_petugas p on p.id = l.petugas_id and p.aktif
join sigap_akun a on a.petugas_bencana_id = p.id
join sigap_kegiatan k on k.kode = 'spdt_ntp_2026'
where upper(coalesce(l.kegiatan,'')) like '%SPDT NTP%'
on conflict (kegiatan_id, akun_id) do nothing;

-- Penanda panduan login pertama (Langkah 1-5) sudah selesai.
alter table sigap_akun add column if not exists onboarding_selesai_at timestamptz;
