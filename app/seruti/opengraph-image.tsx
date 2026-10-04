import { ogImage } from "@/lib/ogImage";

export const runtime = "nodejs";
export const alt = "Seruti";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ogImage("Seruti", "Pemantauan progres dan kualitas data lapangan");
}
