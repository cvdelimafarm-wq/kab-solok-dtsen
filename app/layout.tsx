import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ALAMAT_DASAR, DESKRIPSI_PORTAL, NAMA_PORTAL } from "@/lib/halaman";
import DaftarSW from "@/app/components/DaftarSW";

// Eksplisit (bukan cuma andalkan default Next.js) supaya semua halaman
// SELALU otomatis menyesuaikan lebar layar HP (width=device-width) --
// tanpa ini, sebagian browser mobile bisa render pakai lebar "desktop"
// palsu (~980px) lalu di-zoom out, bikin tampilan terasa berantakan/perlu
// digeser ke samping.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // (8 Okt 2026) PWA: warna bilah status HP saat dibuka sebagai aplikasi -- permintaan user
  themeColor: "#0F3D7A",
};

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(ALAMAT_DASAR),
  title: { default: NAMA_PORTAL, template: "%s · BPS Kabupaten Solok" },
  description: DESKRIPSI_PORTAL,
  applicationName: NAMA_PORTAL,
  openGraph: {
    type: "website",
    siteName: NAMA_PORTAL,
    locale: "id_ID",
    title: NAMA_PORTAL,
    description: DESKRIPSI_PORTAL,
  },
  // (8 Okt 2026) PWA: ikon & mode aplikasi di iPhone (manifest Android dari app/manifest.ts) -- permintaan user
  icons: { icon: "/ikon/ikon-192.png", apple: "/ikon/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "SIGAP", statusBarStyle: "default" },
  twitter: { card: "summary_large_image", title: NAMA_PORTAL, description: DESKRIPSI_PORTAL },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="font-sans antialiased">
        {children}
        <DaftarSW />
      </body>
    </html>
  );
}
