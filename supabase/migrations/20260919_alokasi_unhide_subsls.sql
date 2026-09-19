-- Fitur "unhide per SUBSLS" pada kartu "Identifikasi Wilayah Sampel SLS"
-- (tab Perencanaan Lapangan): 1 Jorong/SLS yang punya >1 SUBSLS bisa
-- "dipecah" & dibagi checklist-nya ke BEBERAPA petugas (PPL) berbeda --
-- sebelumnya satu Jorong/SLS cuma bisa jadi 1 unit checklist utuh, jadi
-- kalau 2 PPL berbeda sama2 ingin jorong yg sama, salah satu WAJIB pilih
-- jorong lain walau sebenarnya cukup dibagi per SUBSLS.
--
-- Data SUBSLS yang dipecah ini BUKAN sintetis -- subsls_kode sudah ada
-- sbg kolom ASLI per-baris di penyisiran_usaha (satu baris = satu usaha,
-- lihat migrasi 20260917_ppl_akun_alokasi_idsls.sql soal idsubsls yg
-- serupa). Dicek sebelum membangun fitur ini: 244 dari 413 SLS (59%)
-- punya >1 SUBSLS, rata2 2.5 SUBSLS/SLS, maksimum 20 -- jadi fitur ini
-- memang punya data nyata utk dipecah, bukan cuma UI kosong.
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase; file ini
-- cuma catatan riwayat migrasi di repo.

-- 1) Kolom baru di penyisiran_alokasi_pilihan: NULL = pilih SELURUH SLS/
--    Jorong (perilaku lama, dipakai jg oleh hasil "Alokasi Otomatis" yg
--    TIDAK disentuh/tidak berubah oleh migrasi ini). Array terisi =
--    petugas ybs cuma memilih SEBAGIAN SUBSLS di SLS ini (hasil "unhide"
--    manual).
alter table penyisiran_alokasi_pilihan
  add column if not exists subsls_kode_list text[];

comment on column penyisiran_alokasi_pilihan.subsls_kode_list is
  'NULL = pilih SELURUH SLS/Jorong (perilaku lama). Array = petugas cuma memilih SEBAGIAN SUBSLS di SLS ini (fitur "unhide" per SUBSLS, 1 Jorong dipecah ke beberapa PPL berbeda).';

-- 2) penyisiran_alokasi_dasar_sls(): return type berubah (tambah kolom
--    jumlah_subsls = count distinct subsls_kode per SLS) -- Postgres tidak
--    bisa CREATE OR REPLACE kalau kolom return berubah, jadi function-nya
--    di-DROP dulu lalu dibuat ulang. Dipakai FE utk menentukan kapan
--    tombol "unhide" perlu ditampilkan (SLS dgn cuma 1 SUBSLS tidak ada
--    gunanya dipecah).
--
-- 3) RPC BARU penyisiran_alokasi_dasar_subsls(p_sls_key text): rincian per
--    SUBSLS DI DALAM satu SLS -- formula skor SAMA PERSIS dgn dasar_sls
--    (skor_dasar_rata), tapi dikelompokkan per subsls_kode. Dipakai
--    endpoint baru GET /api/penyisiran/alokasi/subsls?sls_key=... yg
--    dipanggil lazy (cuma sekali per baris) saat tombol "unhide" diklik.
--
-- 4) penyisiran_alokasi_export_subsls(): kalau petugas cuma memilih
--    SEBAGIAN subsls (subsls_kode_list terisi), export Excel Pengawas/
--    Pencacah HANYA memuat subsls yg dipilihnya itu -- bukan seluruh
--    subsls di SLS itu spt sebelumnya (baris LAMA subsls_kode_list-nya
--    selalu NULL, jadi perilaku existing utk data lama tidak berubah).
--
-- 5) penyisiran_alokasi_matrix(): return type berubah (tambah kolom
--    subsls_kode_list, jg WAJIB DROP dulu) -- diteruskan ke panel admin
--    "Matriks Alokasi" supaya bisa menampilkan SUBSLS spesifik yang
--    dipilih (bukan cuma nama Jorong/SLS-nya) kalau pilihannya sebagian.
--
-- Definisi lengkap ke-4 function di atas: lihat app/api/penyisiran/alokasi/
-- {rekomendasi,subsls,export-subsls,matrix}/route.ts (komentar di tiap
-- file merujuk balik ke migrasi ini) atau query pg_proc/pg_get_functiondef
-- langsung ke database kalau perlu salinan SQL persisnya.
