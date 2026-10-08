import type { MetadataRoute } from "next";

// (8 Okt 2026) PWA SIGAP -- identitas visual baru (keputusan user): "SIGAP - Sistem Integrasi Kegiatan BPS", tema navy #0F2A52,
// latar putih, ikon logo S biru-emas (paket sigap-pwa-ikon: public/icons/*). Web bisa dipasang di HP sebagai aplikasi
// (ikon di layar utama, layar penuh). Isi tetap diambil dari web, jadi setiap push langsung berlaku.
// Next.js otomatis menautkan berkas ini sebagai /manifest.webmanifest di semua halaman.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // id lama ("/sigap") sengaja dipertahankan: perangkat yang sudah memasang aplikasi tetap dianggap aplikasi yang sama (tidak jadi ganda)
    id: "/sigap",
    name: "SIGAP - Sistem Integrasi Kegiatan BPS",
    short_name: "SIGAP",
    description: "Sistem Integrasi Kegiatan BPS Kabupaten Solok: anggaran/SPJ, pelatihan, delegasi, arsip, dan pembinaan sistem.",
    lang: "id",
    start_url: "/",
    // scope "/" supaya tautan ke halaman portal lain tetap terbuka di dalam aplikasi
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#0F2A52",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
