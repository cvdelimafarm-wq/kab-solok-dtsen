import { ogImage } from "@/lib/ogImage";

export const runtime = "nodejs";
export const alt = "Penyisiran Usaha SE2026";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ogImage("Penyisiran Usaha SE2026", "Checklist petugas lapangan dan identifikasi");
}
