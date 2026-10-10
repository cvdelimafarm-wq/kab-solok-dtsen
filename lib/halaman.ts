import type { Metadata } from "next";

// Nama portal & alamat dasar. Alamat dasar dipakai Next.js untuk membuat URL
// absolut gambar pratinjau link (WhatsApp, Telegram, dll).
// (11 Okt 2026) Nama diseragamkan "SIGAP · Sistem Integrasi Kegiatan BPS" -- keputusan user (temuan audit: header, judul tab Beranda, dan judul
// halaman dalam memakai tiga nama berbeda, "BPS Kabupaten Solok" juga tertulis dobel di judul tab).
export const NAMA_PORTAL = "SIGAP · Sistem Integrasi Kegiatan BPS";
/** Akhiran judul tab tiap halaman: "<judul> · SIGAP" */
export const AKHIRAN_JUDUL = "SIGAP";
export const DESKRIPSI_PORTAL =
  "SIGAP BPS Kabupaten Solok: satu pintu kegiatan pendataan, pelatihan, transport lokal & SPJ, usulan DTSEN, penyisiran usaha, dan Seruti.";
export const ALAMAT_DASAR =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://bps-solokkab.up.railway.app";

/**
 * Metadata per halaman supaya pratinjau link (judul + deskripsi) sesuai isi
 * halaman, bukan judul portal untuk semua link. Gambar pratinjau diambil dari
 * file opengraph-image.tsx di folder halaman yang bersangkutan.
 */
export function metaHalaman(judul: string, deskripsi: string): Metadata {
  const judulLengkap = `${judul} · ${AKHIRAN_JUDUL}`;
  return {
    title: judul,
    description: deskripsi,
    openGraph: {
      type: "website",
      siteName: NAMA_PORTAL,
      locale: "id_ID",
      title: judulLengkap,
      description: deskripsi,
    },
    twitter: { card: "summary_large_image", title: judulLengkap, description: deskripsi },
  };
}
