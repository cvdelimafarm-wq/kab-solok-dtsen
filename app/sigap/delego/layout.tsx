import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import DelegoShell from "./DelegoShell";

// (26 Okt 2026) Semua halaman /sigap/delego/* dibingkai DelegoShell (hijau, merek Delego).
export const metadata: Metadata = { title: "Delego · BPS Kabupaten Solok", description: "Delegasi pekerjaan, laporan harian, dan manajemen tim BPS Kabupaten Solok." };
export const viewport: Viewport = { themeColor: "#0B3B38" };

export default function DelegoLayout({ children }: { children: ReactNode }) {
  return <DelegoShell>{children}</DelegoShell>;
}
