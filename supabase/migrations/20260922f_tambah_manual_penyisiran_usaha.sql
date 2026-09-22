-- Kolom baru utk fitur "➕ Tambah Target KK Baru" (permintaan user) --
-- petugas lapangan (PPL/PML) bisa menambah 1 baris keluarga baru langsung
-- dari tab Penyisiran Usaha (mis. ditemukan saat menyisir, belum ada di
-- daftar bulk-upload), lewat modal sederhana (Nama KRT + Kecamatan/
-- Nagari/Sub SLS + Alamat opsional). Baris baru diisi dgn nilai default
-- yg SAMA persis dgn baris hasil upload biasa (status_kunjungan='belum',
-- aktif=true, dst) supaya diperlakukan IDENTIK oleh RowCard/checklist
-- yg sudah ada -- BEDANYA cuma 2 kolom penanda ini, utk ketertelusuran
-- (bisa dibedakan dari data hasil unggah massal kapan pun perlu, mis.
-- laporan/QC).
alter table public.penyisiran_usaha
  add column if not exists ditambah_manual boolean not null default false,
  add column if not exists ditambah_manual_oleh text;
