-- Penonaktifan (BUKAN penghapusan) target Penyisiran Usaha hasil sisir
-- silang dgn daftar "Match HGBB" (Sep 2026): user punya daftar HGBB berisi
-- 1.880 Kode_Identitas yg jadi target pasti, dan minta baris DI LUAR
-- daftar itu yg BELUM PERNAH dikerjakan (status_kunjungan masih 'belum')
-- untuk tidak lagi ditampilkan sbg target penyisiran -- TAPI reversibel
-- (bisa "diperluas"/diaktifkan lagi kapan-kapan), jadi dipilih flag boolean
-- + alasan/tanggal, BUKAN DELETE baris.
--
-- Baris yg SUDAH terlanjur dikerjakan (status_kunjungan <> 'belum') SENGAJA
-- tetap aktif = true meskipun tidak match daftar HGBB, sesuai permintaan
-- user ("yg sudah terlanjur diidentifikasi ... biarkan saja").
--
-- Klasifikasi awal (1.880 vs 20.132 baris) dilakukan lewat UPDATE satu kali
-- di sesi kerja terkait (pakai tabel staging sementara berisi daftar HGBB,
-- sudah dibuang stlh dipakai) -- tidak direplikasi di sini sbg migrasi
-- krn sumber datanya (file Excel upload user) bukan bagian dari repo.
alter table public.penyisiran_usaha
  add column if not exists aktif boolean not null default true,
  add column if not exists nonaktif_alasan text,
  add column if not exists nonaktif_at timestamptz;

create index if not exists idx_penyisiran_usaha_aktif on public.penyisiran_usaha (aktif);
