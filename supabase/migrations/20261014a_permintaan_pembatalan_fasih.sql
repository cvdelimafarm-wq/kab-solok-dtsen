-- 14 Okt 2026 -- PML dapat mengajukan pembatalan assignment yang sudah "sudah keluar di FASIH" (salah PPL, PPL berhalangan, dst). Pembatalan LANGSUNG
-- berlaku tanpa persetujuan: status jadi 'dibatalkan' sehingga kuota harian PML dan Sub SLS-nya bebas dan PML bisa memilih ulang PPL. Admin hanya perlu
-- menghapus assignment lama di FASIH; penandaan "sudah dihapus di FASIH" dicatat di dua kolom baru ini (hanya relevan untuk baris dibatalkan yang
-- sebelumnya sudah keluar, yaitu selesai_at terisi). Aditif dan aman diulang.

alter table public.bencana_pendataan_permintaan
  add column if not exists batal_diproses_oleh bigint references public.sigap_akun(id),
  add column if not exists batal_diproses_at timestamptz;

create index if not exists bencana_pendataan_permintaan_batal_belum on public.bencana_pendataan_permintaan (dibatalkan_at)
  where status = 'dibatalkan' and selesai_at is not null and batal_diproses_at is null;
