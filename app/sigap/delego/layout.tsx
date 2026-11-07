import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import DelegoShell from "./DelegoShell";
import { ModalTanggapanRevisi } from "../revisi/tanggapan/TanggapanRevisi";

// (26 Okt 2026) Semua halaman /sigap/delego/* dibingkai DelegoShell (hijau, merek Delego).
export const metadata: Metadata = { title: "Delego · BPS Kabupaten Solok", description: "Delegasi pekerjaan, laporan harian, dan manajemen tim BPS Kabupaten Solok." };
export const viewport: Viewport = { themeColor: "#0B3B38" };

export default function DelegoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DelegoShell>{children}</DelegoShell>
      {/* (7 Nov 2026) modal siklus revisi: tampil hanya bila ada RO milik ketua tim/wakil yang wajib ditanggapi */}
      <ModalTanggapanRevisi />
    </>
  );
}
