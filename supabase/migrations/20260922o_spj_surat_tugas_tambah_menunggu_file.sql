-- Menambah flag utk ST yg record-nya sudah dibuat (nomor, tanggal, petugas
-- tertaut) tapi FILE ASLI (hasil scan tanda tangan Kepala BPS) belum
-- diupload -- dipakai ketika Claude membuatkan draft massal 19 ST
-- (no. 1246-1264) atas permintaan user (22 Sep 2026) tapi tidak punya akses
-- Storage utk taruh file aslinya, jadi file_path diisi placeholder
-- "surat-tugas/PENDING-....pdf" yg TIDAK benar2 ada objeknya di Storage.
-- Kolom ini dipakai UI (administrasi-spj.tsx) utk menampilkan badge
-- "menunggu file" + tombol "Ganti File" khusus pengelola, yg PATCH ke
-- /api/penyisiran/spj/surat-tugas/[id]/file utk upload file penggantinya.
alter table public.spj_surat_tugas
  add column if not exists menunggu_file boolean not null default false;

update public.spj_surat_tugas
set menunggu_file = true
where file_path like 'surat-tugas/PENDING-%';
