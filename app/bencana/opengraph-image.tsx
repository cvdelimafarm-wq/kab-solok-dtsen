import { ogImage } from "@/lib/ogImage";

export const runtime = "nodejs";
export const alt = "Pendataan Bencana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ogImage("Pendataan Bencana", "Identifikasi wilayah terdampak dan penugasan petugas");
}
