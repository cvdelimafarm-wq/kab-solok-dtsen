import { ogImage } from "@/lib/ogImage";

export const runtime = "nodejs";
export const alt = "Usulan Update Data DTSEN";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ogImage("Usulan Update Data DTSEN", "Pengusulan, verifikasi Wali Nagari, dan pemeriksaan BPS");
}
