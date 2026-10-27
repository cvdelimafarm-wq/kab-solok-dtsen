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

// (28 Okt 2026) `lebar`/`kualitas` opsional: layar foto petugas memakai ukuran 'mini' (kisi) dan 'kecil' (pratinjau), lihat lib/sigapCacheFoto.ts.
// Tanpa argumen hasilnya sama dengan sebelumnya (halaman /verifikasi).
export async function buatFotoKecil(asli: Buffer, lebar: number = LEBAR_FOTO_KECIL, kualitas: number = KUALITAS_FOTO_KECIL): Promise<Buffer> {
  return sharp(asli, { failOn: "none" })
    .rotate()
    .resize({ width: lebar, height: lebar, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: kualitas, mozjpeg: true })
    .toBuffer();
}
