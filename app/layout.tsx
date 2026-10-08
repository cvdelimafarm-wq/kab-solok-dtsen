import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ALAMAT_DASAR, DESKRIPSI_PORTAL, NAMA_PORTAL } from "@/lib/halaman";
import DaftarSW from "@/app/components/DaftarSW";
import GerbangAplikasi from "@/app/components/GerbangAplikasi";

// Eksplisit (bukan cuma andalkan default Next.js) supaya semua halaman
// SELALU otomatis menyesuaikan lebar layar HP (width=device-width) --
// tanpa ini, sebagian browser mobile bisa render pakai lebar "desktop"
// palsu (~980px) lalu di-zoom out, bikin tampilan terasa berantakan/perlu
// digeser ke samping.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // (8 Okt 2026) PWA: warna bilah status HP saat dibuka sebagai aplikasi -- permintaan user
  // (8 Okt 2026) identitas visual SIGAP: navy #0F2A52
  themeColor: "#0F2A52",
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
  applicationName: "SIGAP",
  openGraph: {
    type: "website",
    siteName: NAMA_PORTAL,
    locale: "id_ID",
    title: NAMA_PORTAL,
    description: DESKRIPSI_PORTAL,
  },
  // (8 Okt 2026) PWA: mode aplikasi di iPhone (manifest dari app/manifest.ts). Ikon tab/layar utama dari berkas app/favicon.ico, app/icon.png,
  // app/apple-icon.png (Next.js membuat tag-nya otomatis), jadi tidak diatur lagi di sini.
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
        {/* (8 Okt 2026) di HP, beranda portal & /sigap/* wajib dibuka lewat aplikasi terpasang (permintaan user) */}
        <GerbangAplikasi>{children}</GerbangAplikasi>
        <DaftarSW />
      </body>
    </html>
  );
}
