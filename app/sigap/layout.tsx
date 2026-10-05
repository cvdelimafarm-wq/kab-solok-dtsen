import type { Metadata } from "next";

// (5 Okt 2026) SIGAP -- Sistem Informasi Gerak Anggaran & Pertanggungjawaban.
// Catatan: helper metaHalaman()/opengraph-image (lib/halaman.ts, lib/ogImage.tsx) akan
// disambungkan menyusul (berkas helper belum terbaca saat modul ini dibuat).
export const metadata: Metadata = {
  title: "SIGAP — Gerak Anggaran & Pertanggungjawaban · BPS Kabupaten Solok",
  description: "Portal anggaran BPS Kabupaten Solok: RAB, revisi, pelaksanaan (transport lokal, perjalanan dinas, honor, pengadaan) dan SPJ.",
};

export default function SigapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {children}
    </div>
  );
}
