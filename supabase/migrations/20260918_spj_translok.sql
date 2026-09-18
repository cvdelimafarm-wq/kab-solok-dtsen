-- Skema utk menu baru "Administrasi / SPJ Translok" -- kelengkapan SPJ
-- perjalanan dinas dalam kota (translok) yg dihasilkan LANGSUNG dari
-- sistem: Kwitansi, Surat Tugas (upload asli), Visum, Laporan, Dokumentasi
-- foto, dan Surat Keterangan Tidak Menggunakan Kendaraan Dinas.
--
-- Dipakai oleh DUA jenis akun personal yg SUDAH ADA (bukan tabel akun
-- baru) -- sesuai keputusan: PPL TIDAK ikut menu ini, krn translok hanya
-- relevan utk yg benar2 turun ke lapangan & dapat honor transport:
--  - "penyisiran" -> petugas_penyisiran_akun (tab Identifikasi Jorong /
--    Penyisiran Usaha / Manajemen Target)
--  - "tetangga"   -> tetangga_akun (tab Identifikasi Tetangga/Lainnya)
-- Kolom petugas_id di semua tabel SPJ di bawah TIDAK bisa dibuat FK asli
-- (dua kemungkinan tabel sumber tergantung petugas_jenis) -- validasi
-- "petugas_id ini benar ada di tabel yg sesuai" dilakukan di kode
-- (app/api/penyisiran/spj/*), bukan di database.
--
-- Semua tabel: RLS aktif, TANPA policy publik -- akses hanya lewat
-- SUPABASE_SERVICE_ROLE_KEY dari API routes, pola sama dgn seluruh tabel
-- penyisiran/akun lainnya di proyek ini.

-- ---------- Kolom identitas tambahan ----------
-- NIP -- dipakai di Surat Pernyataan Tidak Menggunakan Kendaraan Dinas
-- (menggantikan kolom "Sobat ID" pada template asal yg khusus utk
-- Mitra Statistik/PPL, tidak relevan utk Petugas Penyisiran & Tetangga).
-- Nullable krn tidak semua petugas/tetangga berstatus ASN.
alter table petugas_penyisiran_akun add column if not exists nip text;
alter table tetangga_akun add column if not exists nip text;

-- ---------- 1. Surat Tugas (file ASLI diupload, bukan digenerate) ----------
-- Diupload oleh PENGELOLA (allow-list SAMA dgn Manajemen Target, lihat
-- lib/manajemenTargetAkses.ts) -- total sekitar 30-an file utk satu
-- periode, ditautkan ke satu/lebih petugas lewat spj_surat_tugas_petugas
-- di bawah (satu ST bisa berlaku utk banyak petugas sekaligus, mis. ST
-- kolektif satu tim).
create table if not exists spj_surat_tugas (
  id bigserial primary key,
  nomor_st text not null,
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  -- Path relatif di Supabase Storage, bucket "spj-files" (dibuat di
  -- bawah) -- BUKAN url publik, selalu diakses lewat signed URL dari API
  -- server (bucket private, tanpa policy publik).
  file_path text not null,
  file_nama_asli text,
  keterangan text,
  uploaded_by text,
  created_at timestamptz not null default now()
);
alter table spj_surat_tugas enable row level security;

create table if not exists spj_surat_tugas_petugas (
  id bigserial primary key,
  surat_tugas_id bigint not null references spj_surat_tugas(id) on delete cascade,
  petugas_jenis text not null check (petugas_jenis in ('penyisiran', 'tetangga')),
  petugas_id bigint not null,
  created_at timestamptz not null default now(),
  unique (surat_tugas_id, petugas_jenis, petugas_id)
);
alter table spj_surat_tugas_petugas enable row level security;
create index if not exists idx_spj_stp_petugas on spj_surat_tugas_petugas (petugas_jenis, petugas_id);

-- ---------- 2. Visum (RENCANA kunjungan, bukan realisasi) ----------
-- Meniru format lembar Visum SPD standar (3 etape: berangkat dari tempat
-- kedudukan -> tiba di tujuan -> kembali ke tempat kedudukan), tapi
-- semua tanggal di sini adalah RENCANA yg diisi petugas sendiri sebelum
-- berangkat -- bukan hasil pencatatan realisasi kunjungan.
create table if not exists spj_visum (
  id bigserial primary key,
  surat_tugas_id bigint not null references spj_surat_tugas(id) on delete cascade,
  petugas_jenis text not null check (petugas_jenis in ('penyisiran', 'tetangga')),
  petugas_id bigint not null,
  -- Rencana wilayah dituju -- boleh diisi bebas (mis. "Kubung") atau
  -- dipilih dari dropdown kecamatan/nagari yg sama dgn tab lain, makanya
  -- kec_kode/nagari_kode ikut disimpan (opsional) selain nama bebasnya.
  rencana_tujuan text not null,
  rencana_kec_kode text,
  rencana_kec_nama text,
  rencana_nagari_kode text,
  rencana_nagari_nama text,
  tempat_kedudukan text not null default 'Solok',
  tanggal_berangkat date not null,
  tanggal_tiba_tujuan date not null,
  tanggal_berangkat_kembali date,
  tanggal_tiba_kembali date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (surat_tugas_id, petugas_jenis, petugas_id)
);
alter table spj_visum enable row level security;

-- ---------- 3. Laporan Perjalanan Dinas ----------
-- Bisa narasi bebas ATAU otomatis dari template (jorong/nagari/kec yg
-- dikunjungi + rekap status ditemukan/tidak ditemukan/pindah dll), data
-- template diambil dari penyisiran_usaha (kolom penyisiran_oleh_id /
-- penyisiran_oleh) & penyisiran_riwayat (audit log per tanggal) --
-- SUDAH ADA, lihat migrasi 20260918_penyisiran_petugas_pasti_monitoring.sql
-- & 20260918_penyisiran_riwayat_audit_log.sql. rekap_snapshot menyimpan
-- HASIL tarikan data pada saat laporan dibuat/dicetak (supaya PDF yg
-- sudah jadi tidak berubah kalau data penyisiran diedit belakangan) --
-- kalau datanya ternyata salah, user diarahkan mengoreksi di tab
-- Penyisiran dulu baru muat ulang laporan (lihat catatan permintaan
-- user), bukan mengedit rekap_snapshot secara manual.
create table if not exists spj_laporan (
  id bigserial primary key,
  surat_tugas_id bigint not null references spj_surat_tugas(id) on delete cascade,
  petugas_jenis text not null check (petugas_jenis in ('penyisiran', 'tetangga')),
  petugas_id bigint not null,
  tanggal date not null,
  mode text not null check (mode in ('template', 'bebas')) default 'template',
  narasi text,
  rekap_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (surat_tugas_id, petugas_jenis, petugas_id, tanggal)
);
alter table spj_laporan enable row level security;

-- ---------- 4. Dokumentasi (maks 5 slot foto/petugas/hari) ----------
-- slot 1..5 = sebelum berangkat, sampai lokasi, saat mendata, akan
-- pulang, sampai di rumah (urutan TETAP, sesuai permintaan user) --
-- dipakai sistem utk menyusun otomatis ke PDF sesuai template.
create table if not exists spj_dokumentasi_foto (
  id bigserial primary key,
  surat_tugas_id bigint not null references spj_surat_tugas(id) on delete cascade,
  petugas_jenis text not null check (petugas_jenis in ('penyisiran', 'tetangga')),
  petugas_id bigint not null,
  tanggal date not null,
  slot smallint not null check (slot between 1 and 5),
  file_path text not null,
  file_nama_asli text,
  created_at timestamptz not null default now(),
  unique (surat_tugas_id, petugas_jenis, petugas_id, tanggal, slot)
);
alter table spj_dokumentasi_foto enable row level security;

-- ---------- 5. Kwitansi ----------
-- Nominal & terbilang diinput MANUAL tiap kali (tidak ada tarif tetap
-- tersimpan di sistem, sesuai keputusan user) -- Bendahara Pengeluaran &
-- Pejabat Pembuat Komitmen (PPK) TIDAK disimpan per baris krn selalu
-- sama (nama/NIP tetap, di-hardcode di kode -- lihat
-- lib/spjPejabat.ts -- bukan di tabel ini).
create table if not exists spj_kwitansi (
  id bigserial primary key,
  surat_tugas_id bigint not null references spj_surat_tugas(id) on delete cascade,
  petugas_jenis text not null check (petugas_jenis in ('penyisiran', 'tetangga')),
  petugas_id bigint not null,
  nominal numeric not null check (nominal >= 0),
  terbilang text not null,
  untuk_perjalanan_dinas_pada text not null,
  tanggal_spd date not null,
  tanggal_kwitansi date not null default current_date,
  created_at timestamptz not null default now(),
  created_by text,
  unique (surat_tugas_id, petugas_jenis, petugas_id)
);
alter table spj_kwitansi enable row level security;

-- ---------- 6. Surat Keterangan Tidak Menggunakan Kendaraan Dinas ----------
create table if not exists spj_surat_pernyataan_kendaraan (
  id bigserial primary key,
  surat_tugas_id bigint not null references spj_surat_tugas(id) on delete cascade,
  petugas_jenis text not null check (petugas_jenis in ('penyisiran', 'tetangga')),
  petugas_id bigint not null,
  tanggal_pelaksanaan date not null,
  created_at timestamptz not null default now(),
  unique (surat_tugas_id, petugas_jenis, petugas_id)
);
alter table spj_surat_pernyataan_kendaraan enable row level security;

-- ---------- Storage bucket utk file ST asli & foto dokumentasi ----------
-- PRIVATE (public = false) -- selalu diakses lewat signed URL yg
-- dibuat server pakai SUPABASE_SERVICE_ROLE_KEY, sama sekali tidak ada
-- policy publik (konsisten dgn pola RLS seluruh proyek ini).
insert into storage.buckets (id, name, public)
values ('spj-files', 'spj-files', false)
on conflict (id) do nothing;
