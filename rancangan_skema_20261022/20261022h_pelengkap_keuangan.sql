-- =====================================================================
-- 20261022h_pelengkap_keuangan.sql
-- Pelengkap anggaran: jendela/langkah/berkas revisi, impor POK sebagian gagal,
-- aturan validasi, bukti wajib, rekonsiliasi, SPJ, pengadaan.
-- Bergantung pada a sampai f. Tanpa DROP/DELETE. RLS aktif tanpa policy.
-- Komitmen/realisasi/pembayaran TIDAK dibuat tabel sendiri: komitmen dan
-- realisasi = keu_transaksi (jenis); pembayaran honor = mitra_pembayaran.
-- =====================================================================

-- Jendela waktu pengajuan revisi (diisi admin dari ketentuan terbaru)
create table keu_revisi_jendela (
  id          bigint generated always as identity primary key,
  tahun       smallint not null references keu_tahun_anggaran(tahun),
  jenis       text not null check (jenis in ('pagu','rincian','administratif')),
  buka        date not null,
  tutup       date not null,
  status_isi  text not null default 'belum_diisi' check (status_isi in ('belum_diisi','ilustrasi','diisi_admin','terverifikasi')),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  catatan     text,
  diubah_oleh bigint references sigap_akun(id),
  check (tutup >= buka),
  exclude using gist (tahun with =, jenis with =, daterange(buka, tutup, '[]') with &&)
);
comment on table keu_revisi_jendela is 'Jendela pengajuan revisi per jenis. Tanggal DIISI ADMIN dari teks PMK 62/2023 jo 107/2024 jo 41/2026 terbaru; tidak dikarang. Di luar jendela: simpan sebagai draf, jalur mendesak butuh alasan dan persetujuan KPA.';

-- Langkah persetujuan revisi (empat-mata)
create table keu_revisi_langkah (
  id          bigint generated always as identity primary key,
  revisi_id   bigint not null references keu_revisi(id),
  urutan      smallint not null check (urutan >= 1),
  peran       text not null check (peran in ('operator_anggaran','pj_kegiatan','ketua_tim','ppk','ppspm','bendahara','kpa')),
  akun_id     bigint references sigap_akun(id),
  keputusan   text not null default 'menunggu' check (keputusan in ('menunggu','setuju','tolak','minta_perbaikan')),
  alasan      text,
  diputuskan_at timestamptz,
  unique (revisi_id, urutan),
  check (keputusan = 'menunggu' or (akun_id is not null and diputuskan_at is not null)),
  check (keputusan not in ('tolak','minta_perbaikan') or length(btrim(coalesce(alasan, ''))) >= 10)
);
comment on table keu_revisi_langkah is 'Rantai persetujuan revisi. Pemberi persetujuan tidak boleh pengaju revisi (trigger); tolak/minta perbaikan wajib alasan.';
create function keu_revisi_langkah_jaga() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_pengaju bigint;
begin
  select pengaju_id into v_pengaju from keu_revisi where id = new.revisi_id;
  if new.keputusan = 'setuju' and new.akun_id = v_pengaju then
    raise exception 'Pengaju revisi tidak boleh menyetujui revisinya sendiri' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger keu_revisi_langkah_jaga_tr before insert or update on keu_revisi_langkah
  for each row execute function keu_revisi_langkah_jaga();
create trigger keu_revisi_langkah_jejak_tr after insert or update on keu_revisi_langkah
  for each row execute function tkl_catat_jejak();

create table keu_revisi_berkas (
  id        bigint generated always as identity primary key,
  revisi_id bigint not null references keu_revisi(id),
  bukti_id  bigint not null references tkl_bukti(id),
  jenis     text not null check (jenis in ('usulan','nota_dinas','telaah','dipa_baru','lainnya')),
  unique (revisi_id, bukti_id)
);
comment on table keu_revisi_berkas is 'Lampiran bukti revisi. Pengajuan tanpa bukti tetap bisa dikirim tetapi ditandai pada telaah PPK.';

-- Impor POK dengan toleransi baris gagal
create table keu_impor_batch (
  id            bigint generated always as identity primary key,
  tahun         smallint not null references keu_tahun_anggaran(tahun),
  jenis         text not null check (jenis in ('pok','sbm','rpd')),
  nama_berkas   text not null,
  hash_berkas   text not null check (hash_berkas ~ '^[0-9a-f]{64}$'),
  baris_total   integer not null check (baris_total >= 0),
  baris_masuk   integer not null default 0 check (baris_masuk >= 0),
  baris_ditolak integer not null default 0 check (baris_ditolak >= 0),
  status        text not null default 'berjalan' check (status in ('berjalan','selesai','selesai_sebagian','gagal')),
  versi_hasil_id bigint references keu_pok_versi(id),
  diimpor_oleh  bigint not null references sigap_akun(id),
  dibuat_at     timestamptz not null default now(),
  selesai_at    timestamptz,
  check (status in ('berjalan','gagal') or baris_masuk + baris_ditolak = baris_total),
  check (status <> 'selesai' or baris_ditolak = 0),
  check (status <> 'selesai_sebagian' or (baris_ditolak > 0 and baris_masuk > 0))
);
comment on table keu_impor_batch is 'Satu catatan per percobaan impor. Satu baris salah tidak membatalkan baris benar; impor ulang aman karena kunci_stabil unik per versi. Berkas asli diarsipkan dengan hash.';
create table keu_impor_galat (
  id          bigint generated always as identity primary key,
  batch_id    bigint not null references keu_impor_batch(id),
  nomor_baris integer not null check (nomor_baris >= 1),
  kolom       text not null,
  kode_galat  text not null check (kode_galat in ('wajib_kosong','format','duplikat','akun_tak_dikenal','angka_negatif','jumlah_tidak_cocok','lainnya')),
  pesan       text not null,
  nilai_asli  text,
  unique (batch_id, nomor_baris, kolom)
);
create trigger keu_impor_batch_jejak_tr after insert or update on keu_impor_batch
  for each row execute function tkl_catat_jejak();

-- Aturan validasi anggaran (katalog; penegakan di objek teknis yang disebut)
create table keu_aturan_validasi (
  id          bigint generated always as identity primary key,
  kode        text not null unique check (kode ~ '^V[0-9]{2}$'),
  uraian      text not null,
  tingkat     text not null check (tingkat in ('blok','peringatan','info')),
  saat        text not null,
  tindakan_pengguna text,
  penegak     text not null,
  aktif       boolean not null default true
);
comment on column keu_aturan_validasi.penegak is 'Nama objek teknis penegak (constraint/trigger/view) atau "aplikasi" bila belum di database.';
insert into keu_aturan_validasi (kode, uraian, tingkat, saat, tindakan_pengguna, penegak) values
 ('V01','Jumlah baris = volume × harga satuan; kolom jumlah tidak dapat diketik','blok','Simpan RAB dan unggah POK','Perbaiki volume atau harga','kolom generated keu_rab_baris.jumlah'),
 ('V03','Komitmen + realisasi ≤ pagu baris POK','blok','Menerbitkan SPK, surat tugas, pembayaran','Ajukan pergeseran atau kurangi volume','trigger keu_transaksi_jaga_pagu'),
 ('V13','Empat-mata: pengusul ≠ penyetuju; penyusun RAB ≠ penyetuju RAB','blok','Persetujuan dan finalisasi','Minta pejabat lain','CHECK keu_rab_versi, keu_revisi; trigger keu_revisi_langkah_jaga')
on conflict do nothing;

create table keu_bukti_wajib (
  id              bigint generated always as identity primary key,
  jenis_transaksi text not null check (jenis_transaksi in ('honor_mitra','translok','perjalanan_dinas','paket_meeting','pengadaan','lainnya')),
  akun_kode       text check (akun_kode is null or akun_kode ~ '^[0-9]{6}$'),
  jenis_bukti     text not null,
  tahap           text not null check (tahap in ('komitmen','realisasi','pembayaran')),
  wajib           boolean not null default true,
  status_isi      text not null default 'ilustrasi' check (status_isi in ('ilustrasi','diisi_admin','terverifikasi')),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  berlaku_mulai   date not null default date '2026-01-01',
  berlaku_sampai  date,
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  unique nulls not distinct (jenis_transaksi, akun_kode, jenis_bukti, tahap, berlaku_mulai)
);
comment on table keu_bukti_wajib is 'Daftar periksa bukti per jenis transaksi dan tahap. Dipakai gerbang pembayaran honor mitra (mitra_dokumen_lengkap). Isi awal ilustrasi; admin menyesuaikan dengan ketentuan.';
insert into keu_bukti_wajib (jenis_transaksi, jenis_bukti, tahap) values
 ('honor_mitra','spk_ditandatangani','pembayaran'),
 ('honor_mitra','bast','pembayaran'),
 ('honor_mitra','rekening_terverifikasi','pembayaran')
on conflict do nothing;

-- Rekonsiliasi bulanan realisasi SIGAP, RPD, dan catatan SAKTI
create table keu_rekonsiliasi (
  id            bigint generated always as identity primary key,
  ro_node_id    bigint not null references keu_pok_node(id),
  bulan         date not null check (extract(day from bulan) = 1),
  rencana_rpd   numeric(18,0) not null default 0 check (rencana_rpd >= 0),
  realisasi_sigap numeric(18,0) not null default 0 check (realisasi_sigap >= 0),
  realisasi_sakti numeric(18,0) check (realisasi_sakti is null or realisasi_sakti >= 0),
  selisih_sakti numeric(18,0) generated always as (realisasi_sigap - realisasi_sakti) stored,
  deviasi_rpd   numeric(18,0) generated always as (realisasi_sigap - rencana_rpd) stored,
  status        text not null default 'draf' check (status in ('draf','dikunci')),
  disusun_oleh  bigint not null references sigap_akun(id),
  diverifikasi_oleh bigint references sigap_akun(id),
  catatan       text,
  unique (ro_node_id, bulan),
  check (diverifikasi_oleh is null or diverifikasi_oleh <> disusun_oleh),
  check (status <> 'dikunci' or diverifikasi_oleh is not null),
  check (status <> 'dikunci' or selisih_sakti is null or selisih_sakti = 0 or catatan is not null)
);
comment on table keu_rekonsiliasi is 'Rekonsiliasi bulanan per RO. Dikunci hanya setelah diverifikasi orang lain; selisih terhadap SAKTI yang tidak nol wajib dijelaskan di catatan.';
create trigger keu_rekonsiliasi_jejak_tr after insert or update on keu_rekonsiliasi
  for each row execute function tkl_catat_jejak();

-- SPJ per transaksi
create table keu_spj (
  id            bigint generated always as identity primary key,
  transaksi_id  bigint not null references keu_transaksi(id),
  status        text not null check (status in ('diterima','dikembalikan','lengkap')),
  alasan        text,
  diterima_oleh bigint not null references sigap_akun(id),
  dicatat_at    timestamptz not null default now(),
  check (status <> 'dikembalikan' or length(btrim(coalesce(alasan, ''))) >= 10)
);
create index keu_spj_transaksi_idx on keu_spj (transaksi_id, dicatat_at desc);
comment on table keu_spj is 'Riwayat penerimaan SPJ oleh bendahara. Dikembalikan wajib alasan. Berdampingan dengan spj_* generasi lama yang dibekukan sebagai arsip SE2026.';

-- Pengadaan barang/jasa (paket)
create table keu_pengadaan (
  id           bigint generated always as identity primary key,
  kegiatan_id  bigint not null references sigap_kegiatan(id),
  pok_detail_id bigint references keu_pok_detail(id),
  uraian       text not null,
  metode       text,
  nilai        numeric(18,0) not null check (nilai > 0),
  status       text not null default 'rencana' check (status in ('rencana','berjalan','selesai','batal')),
  ppk_id       bigint not null references sigap_akun(id),
  pelaksana_id bigint references sigap_akun(id),
  tkl_regulasi_id bigint references tkl_regulasi(id),
  dibuat_at    timestamptz not null default now(),
  check (pelaksana_id is null or pelaksana_id <> ppk_id)
);
comment on column keu_pengadaan.metode is 'Metode pengadaan diisi dari ketentuan berlaku (Perpres 16/2018 jo 12/2021 jo 46/2025); tidak dibatasi daftar di sini karena ambang nilai belum diverifikasi.';
create trigger keu_pengadaan_jejak_tr after insert or update on keu_pengadaan
  for each row execute function tkl_catat_jejak();

alter table keu_revisi_jendela  enable row level security;
alter table keu_revisi_langkah  enable row level security;
alter table keu_revisi_berkas   enable row level security;
alter table keu_impor_batch     enable row level security;
alter table keu_impor_galat     enable row level security;
alter table keu_aturan_validasi enable row level security;
alter table keu_bukti_wajib     enable row level security;
alter table keu_rekonsiliasi    enable row level security;
alter table keu_spj             enable row level security;
alter table keu_pengadaan       enable row level security;
