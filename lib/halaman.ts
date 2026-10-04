import type { Metadata } from "next";

// Nama portal & alamat dasar. Alamat dasar dipakai Next.js untuk membuat URL
// absolut gambar pratinjau link (WhatsApp, Telegram, dll).
export const NAMA_PORTAL = "Portal Layanan BPS Kabupaten Solok";
export const DESKRIPSI_PORTAL =
  "Satu pintu aplikasi pendataan dan pemantauan BPS Kabupaten Solok: usulan data DTSEN, pendataan bencana, Seruti, dan penyisiran usaha.";
export const ALAMAT_DASAR =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://bps-solokkab.up.railway.app";

/**
 * Metadata per halaman supaya pratinjau link (judul + deskripsi) sesuai isi
 * halaman, bukan judul portal untuk semua link. Gambar pratinjau diambil dari
 * file opengraph-image.tsx di folder halaman yang bersangkutan.
 */
export function metaHalaman(judul: string, deskripsi: string): Metadata {
  const judulLengkap = `${judul} · BPS Kabupaten Solok`;
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
