import { metaHalaman } from "@/lib/halaman";

export const metadata = metaHalaman(
  "Pendaftaran Petugas Pendataan Bencana",
  "Lengkapi data dan bergabung ke grup WhatsApp petugas pendataan bencana BPS Kabupaten Solok."
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
