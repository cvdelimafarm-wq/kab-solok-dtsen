-- (28 Sep 2026, permintaan user) Tambah 2 kolom baru di penyisiran_usaha:
-- nama_pemilik_usaha & no_hp_pemilik_usaha -- supaya kartu "Penyisiran
-- Usaha" bisa menampilkan nama pemilik/pengusaha & no HP-nya, khusus utk
-- baris yg berasal dari Daftar Usaha Konstruksi SE2026 (kolom
-- nama_pengusaha/no_hp di Excel sumber "DUTL dan Konstruksi SE2026" /
-- "Konfirm Konstruksi dan DUTL"). Baris DUTL & data lama TIDAK selalu
-- punya info ini (sumbernya tidak menyediakan kolom itu) -- keduanya
-- boleh NULL, kartu otomatis sembunyikan baris info ini kalau
-- nama_pemilik_usaha DAN no_hp_pemilik_usaha kosong (lihat render 👤/📞 di
-- app/seruti/penyisiran-usaha.tsx, tepat di bawah baris alamat 📍).
--
-- Kedua kolom nullable, TIDAK ADA constraint -- tidak mempengaruhi baris
-- yang sudah ada sama sekali (semua terisi NULL secara default).
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase (ALTER TABLE);
-- file ini cuma catatan riwayat migrasi di repo, spt migrasi-migrasi
-- sebelumnya. Kolom baru juga ditambahkan ke daftar SELECT di
-- /api/penyisiran/list & /api/penyisiran/tambah-manual, serta ke interface
-- Row + render kartu di app/seruti/penyisiran-usaha.tsx.

ALTER TABLE penyisiran_usaha
  ADD COLUMN IF NOT EXISTS nama_pemilik_usaha text,
  ADD COLUMN IF NOT EXISTS no_hp_pemilik_usaha text;
