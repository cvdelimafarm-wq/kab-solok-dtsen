-- Kolom baru utk fitur "🚩 Tandai Perlu Segera" (khusus akun PML) di tab
-- Penyisiran Usaha -- PML tidak boleh ubah status_kunjungan/catatan_petugas
-- (lihat komentar panjang di app/api/penyisiran/update/route.ts), tapi
-- ingin cara memberi tahu PPL bahwa satu keluarga perlu segera didata.
-- tag_pml: true/false (default false). tag_pml_oleh/tag_pml_at: audit
-- ringan (siapa & kapan MENANDAI terakhir kali) -- diisi ulang tiap kali
-- ditandai true, dikosongkan lagi begitu dibatalkan (pola sama dgn
-- ditemukan_at).
alter table public.penyisiran_usaha
  add column if not exists tag_pml boolean not null default false,
  add column if not exists tag_pml_oleh text,
  add column if not exists tag_pml_at timestamptz;
