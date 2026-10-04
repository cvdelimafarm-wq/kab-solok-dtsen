import { metaHalaman } from "@/lib/halaman";

export const metadata = metaHalaman(
  "Penyisiran Usaha SE2026",
  "Checklist petugas lapangan dan identifikasi penyisiran usaha Sensus Ekonomi 2026, BPS Kabupaten Solok."
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
