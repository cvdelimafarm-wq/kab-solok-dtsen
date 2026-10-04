import { metaHalaman } from "@/lib/halaman";

export const metadata = metaHalaman(
  "Seruti",
  "Pemantauan progres dan kualitas data lapangan Seruti BPS Kabupaten Solok."
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
