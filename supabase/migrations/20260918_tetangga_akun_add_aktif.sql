-- Sudah diterapkan langsung ke database lewat MCP Supabase; file ini cuma
-- catatan riwayat migrasi di repo.
--
-- Kolom `aktif` jg diperlukan di tetangga_akun (sebelumnya cuma ada di
-- petugas_penyisiran_akun) -- satu roster dipakai lintas TIGA fungsi
-- (Penyisiran Usaha, Identifikasi Jorong, Identifikasi Tetangga/Lainnya),
-- dan status aktif/nonaktif harus SELALU disamakan di kedua tabel akun utk
-- orang yang sama (lihat app/api/penyisiran/petugas-toggle-aktif/route.ts).
-- Akun yang tidak lagi dipakai DINONAKTIFKAN, TIDAK dihapus -- riwayat
-- kunjungan/identifikasi yang sudah tercatat tetap utuh.
alter table tetangga_akun add column if not exists aktif boolean not null default true;

-- Roster AKTIF (28 orang, per keputusan pengguna) SENGAJA TIDAK disertakan
-- di sini (data pribadi) -- diterapkan langsung lewat MCP Supabase: SEMUA
-- akun lama dinonaktifkan dulu (aktif=false) di kedua tabel, lalu 28 nama
-- pada roster final diaktifkan lagi (upsert berdasar nama_norm, idempoten;
-- 1 nama baru yang belum pernah terdaftar ikut ditambahkan lewat upsert
-- yang sama). Akun lama yang TIDAK masuk roster ini otomatis jadi
-- nonaktif, bukan terhapus.
