// lib/sigapFotoKecil.ts  (hanya server)
//
// (27 Okt 2026) Membuat foto kecil (sisi terpanjang LEBAR_FOTO_KECIL px, JPEG) dari berkas ber-cap untuk halaman publik /verifikasi.
// Tidak disimpan ke penyimpanan: dibuat saat diminta (jarang dibuka) dan ditahan sebentar di memori (lihat SimpananKecil), supaya tidak ada
// berkas kecil yatim ketika akun super menghapus berkas aslinya.
// Memori: sharp.cache(false) + concurrency(1), sama seperti lib/sigapFotoCap.ts (catatan kebocoran memori Railway).

import sharp from "sharp";
import { KUALITAS_FOTO_KECIL, LEBAR_FOTO_KECIL } from "@/lib/sigapVerifikasi";

sharp.cache(false);
sharp.concurrency(1);

export async function buatFotoKecil(asli: Buffer): Promise<Buffer> {
  return sharp(asli, { failOn: "none" })
    .rotate()
    .resize({ width: LEBAR_FOTO_KECIL, height: LEBAR_FOTO_KECIL, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: KUALITAS_FOTO_KECIL, mozjpeg: true })
    .toBuffer();
}
