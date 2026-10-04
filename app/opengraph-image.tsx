import { ogImage } from "@/lib/ogImage";

export const runtime = "nodejs";
export const alt = "Portal Layanan BPS Kabupaten Solok";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ogImage("Portal Layanan BPS Kabupaten Solok", "Satu pintu aplikasi pendataan dan pemantauan");
}
