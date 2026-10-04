import { metaHalaman } from "@/lib/halaman";

export const metadata = metaHalaman(
  "Masuk",
  "Masuk dengan nomor HP dan PIN untuk mengakses aplikasi BPS Kabupaten Solok."
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
