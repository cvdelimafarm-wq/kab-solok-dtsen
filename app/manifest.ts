import type { MetadataRoute } from "next";

// (8 Okt 2026) PWA SIGAP -- permintaan user ("lanjut PWA dulu"): web bisa dipasang di HP sebagai aplikasi
// (ikon di layar utama, layar penuh). Isi tetap diambil dari web, jadi setiap push langsung berlaku.
// Next.js otomatis menautkan berkas ini sebagai /manifest.webmanifest di semua halaman.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/sigap",
    name: "SIGAP BPS Kabupaten Solok",
    short_name: "SIGAP",
    description: "Sistem Informasi Gerak Anggaran & Pertanggungjawaban — BPS Kabupaten Solok",
    lang: "id",
    start_url: "/sigap",
    // scope "/" supaya tautan ke halaman portal lain tetap terbuka di dalam aplikasi
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#EEF2F8",
    theme_color: "#0F3D7A",
    icons: [
      { src: "/ikon/ikon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ikon/ikon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ikon/ikon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
