-- Kolom catatan opsional utk tag_pml "🚩 Perlu Segera" (permintaan user:
-- "pada flag buka juga tambah catatan") -- supaya PML bisa menjelaskan
-- KENAPA ditandai (mis. "usaha terlihat masih berjalan, tolong cek ulang"),
-- bukan cuma boolean tanpa konteks. Ditulis PML lewat endpoint yg sama dgn
-- tag_pml (/api/penyisiran/update, isPml only), & diisi default otomatis
-- saat "+ Tambah Target KK Baru" (/api/penyisiran/tambah-manual) auto-
-- menandai tag_pml=true (permintaan user: "otomatis akan di flag merah").
alter table public.penyisiran_usaha
  add column if not exists tag_pml_catatan text;
