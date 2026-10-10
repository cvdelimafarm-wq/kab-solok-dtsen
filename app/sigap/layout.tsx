import type { Metadata } from "next";
import { DESKRIPSI_PORTAL, NAMA_PORTAL } from "@/lib/halaman";

// (5 Okt 2026) SIGAP -- awalnya "Gerak Anggaran & Pertanggungjawaban".
// (11 Okt 2026) Judul diseragamkan "SIGAP · Sistem Integrasi Kegiatan BPS" (sama dengan header Beranda) -- keputusan user.
// Catatan: helper metaHalaman()/opengraph-image (lib/halaman.ts, lib/ogImage.tsx) akan
// disambungkan menyusul (berkas helper belum terbaca saat modul ini dibuat).
export const metadata: Metadata = {
  title: { absolute: NAMA_PORTAL },
  description: DESKRIPSI_PORTAL,
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
