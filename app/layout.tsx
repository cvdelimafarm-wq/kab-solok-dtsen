import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Eksplisit (bukan cuma andalkan default Next.js) supaya semua halaman
// SELALU otomatis menyesuaikan lebar layar HP (width=device-width) --
// tanpa ini, sebagian browser mobile bisa render pakai lebar "desktop"
// palsu (~980px) lalu di-zoom out, bikin tampilan terasa berantakan/perlu
// digeser ke samping.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Usulan Update Data DTSEN - Kabupaten Solok",
  description:
    "Aplikasi pengusulan update data DTSEN oleh Wali Jorong, verifikasi Wali Nagari, dan pemeriksaan BPS Kabupaten Solok.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
