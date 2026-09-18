-- Kolom baru: nama gabungan Kepala Keluarga + anggota lain (mis. pasangan)
-- persis apa adanya dari data sumber Prelist Keluarga (contoh: "ZULKARNAINI /
-- NANGTI MAROZA"), BEDA dari `nama_kk` yg cuma nama Kepala Keluarga sendirian
-- ("ZULKARNAINI"). Dipakai sbg nama utama yg ditampilkan di kartu tab
-- Penyisiran Usaha (fallback ke nama_kk kalau kolom ini kosong, mis. data
-- lama yg diunggah sebelum kolom ini ada). NULLABLE krn data lama tidak
-- punya nilai ini sampai diunggah ulang dari script Python yg sudah
-- diperbarui.
alter table penyisiran_usaha add column if not exists nama_anggota_keluarga text;

comment on column penyisiran_usaha.nama_anggota_keluarga is
  'Nama gabungan Kepala Keluarga + anggota lain (mis. "NAMA_KK / NAMA_PASANGAN") dari data_checklist_penyisiran.json -- nama utama yg ditampilkan di kartu, fallback ke nama_kk kalau kosong.';
