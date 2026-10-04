import { metaHalaman } from "@/lib/halaman";

export const metadata = metaHalaman(
  "Pendataan Bencana",
  "Identifikasi wilayah terdampak bencana, konfirmasi, dan penugasan petugas pendataan BPS Kabupaten Solok."
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
