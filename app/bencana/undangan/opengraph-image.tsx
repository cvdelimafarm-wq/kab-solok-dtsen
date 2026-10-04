import { ogImage } from "@/lib/ogImage";

export const runtime = "nodejs";
export const alt = "Pendaftaran Petugas Pendataan Bencana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return ogImage("Pendaftaran Petugas Pendataan Bencana", "Lengkapi data dan bergabung ke grup WhatsApp petugas");
}
