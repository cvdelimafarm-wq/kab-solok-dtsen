import { metaHalaman } from "@/lib/halaman";

export const metadata = metaHalaman(
  "Atur Nomor HP dan PIN",
  "Aktivasi akun dengan kode dari BPS Kabupaten Solok."
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
