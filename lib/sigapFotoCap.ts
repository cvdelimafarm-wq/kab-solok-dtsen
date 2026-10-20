// lib/sigapFotoCap.ts  (hanya server)
//
// (19 Okt 2026) Cap foto Kamera SIGAP -- dicetak DI SERVER ke piksel gambar (bukan overlay HTML), jadi tidak bisa
// diubah di HP. Memakai sharp (sudah ada di dependensi) + QR (paket `qrcode`, perlu `npm i qrcode @types/qrcode`).
// Teks memakai berkas font yang DISERTAKAN (public/fonts) lewat opsi `fontfile` sharp, jadi tidak bergantung pada font
// sistem Railway. Logo: public/sigap-logo-cap.png (bila tak ada, bagian logo dilewati).
// Memori: sharp.cache(false) + concurrency(1) -- lihat catatan kebocoran memori Railway.

import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import QRCode from "qrcode";

sharp.cache(false);
sharp.concurrency(1);

const FONT_TEBAL = () => path.join(process.cwd(), "public", "fonts", "PlusJakartaSans-Bold.ttf");
const FONT_BIASA = () => path.join(process.cwd(), "public", "fonts", "PlusJakartaSans-Regular.ttf");
const LOGO = () => path.join(process.cwd(), "public", "sigap-logo-cap.png");

export type DataCap = {
  waktu: string; // "Senin, 19 Okt 2026 · 14.32.07 WIB"
  koordinat: string; // "-0.78930, 100.65120 (±12 m)"
  lokasi: string | null; // "Nagari X, Kec. Y" bila dikenali
  pemotret: string; // nama
  peran: string; // "PPL"
  kegiatan: string;
  kode: string; // SGP-XXXX-XXXX-XXXX
  urlVerifikasi: string; // isi QR
};

export const LEBAR_MAKS_PX = 1600;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function teks(isi: string, lebar: number, opsi: { tebal: boolean; ukuran: number; warna: string; rata?: "left" | "centre" }) {
  const markup = `<span foreground="${opsi.warna}">${esc(isi)}</span>`;
  const buf = await sharp({
    text: {
      text: markup,
      font: `Plus Jakarta Sans ${opsi.tebal ? "Bold" : ""} ${opsi.ukuran}`.replace(/\s+/g, " ").trim(),
      fontfile: opsi.tebal ? FONT_TEBAL() : FONT_BIASA(),
      width: lebar,
      dpi: 72,
      rgba: true,
      wrap: "word-char",
      align: opsi.rata ?? "left",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: buf.data, w: buf.info.width, h: buf.info.height };
}

async function petakRounded(w: number, h: number, r: number, warna: string, opasitas = 1): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${warna}" fill-opacity="${opasitas}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * dHash 64-bit (hex 16 karakter) -- sidik gambar tahan kompresi ulang (WhatsApp).
 * Dihitung dari 55% bagian ATAS gambar saja, supaya foto mentah dan foto ber-cap (panel cap maks 45% bawah) menghasilkan sidik yang sama.
 */
export async function sidikGambar(buf: Buffer): Promise<string> {
  const kecil = await sharp(buf, { failOn: "none" }).rotate().resize({ width: 640, withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const tinggi = Math.max(8, Math.floor(kecil.info.height * 0.55));
  const { data } = await sharp(kecil.data)
    .extract({ left: 0, top: 0, width: kecil.info.width, height: tinggi })
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Foto mentah -> JPEG ber-cap (sudah diputar sesuai EXIF, lebar maks 1600 px). */
export async function bubuhiCap(mentah: Buffer, d: DataCap): Promise<{ buf: Buffer; lebar: number; tinggi: number }> {
  const dasar = await sharp(mentah, { failOn: "none" })
    .rotate()
    .resize({ width: LEBAR_MAKS_PX, height: LEBAR_MAKS_PX, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const W = dasar.info.width;
  const H = dasar.info.height;
  if (W < 200 || H < 200) throw new Error("Gambar terlalu kecil.");

  const u = Math.min(W, H) / 1080; // satuan skala (sisi pendek: foto landscape tidak mendapat cap yang membesar; foto tegak tidak berubah)
  const pad = Math.round(22 * u);
  const logoUbin = Math.round(86 * u);
  const qrUkuran = Math.round(150 * u);
  const qrUbin = qrUkuran + Math.round(16 * u);
  const jarak = Math.round(16 * u);
  const lebarTeks = Math.max(120, W - 2 * pad - logoUbin - qrUbin - 2 * jarak);

  const baris = [
    await teks(d.waktu, lebarTeks, { tebal: true, ukuran: Math.round(27 * u), warna: "#FFFFFF" }),
    await teks(d.koordinat, lebarTeks, { tebal: false, ukuran: Math.round(23 * u), warna: "#F2B632" }),
    ...(d.lokasi ? [await teks(d.lokasi, lebarTeks, { tebal: false, ukuran: Math.round(22 * u), warna: "#E8EEF8" })] : []),
    await teks(`${d.pemotret} · ${d.peran}`, lebarTeks, { tebal: true, ukuran: Math.round(22 * u), warna: "#FFFFFF" }),
    await teks(d.kegiatan, lebarTeks, { tebal: false, ukuran: Math.round(20 * u), warna: "#C5D0E4" }),
  ];
  const jedaBaris = Math.round(4 * u);
  const tinggiTeks = baris.reduce((a, b) => a + b.h, 0) + jedaBaris * (baris.length - 1);

  const kodeTeks = await teks(d.kode, qrUbin, { tebal: true, ukuran: Math.round(14 * u), warna: "#FFFFFF", rata: "centre" });
  const kolomKanan = qrUbin + Math.round(6 * u) + kodeTeks.h;
  const tinggiPanel = Math.min(Math.round(H * 0.45), Math.max(tinggiTeks, kolomKanan, logoUbin) + 2 * pad);
  const atasPanel = H - tinggiPanel;

  const komposit: sharp.OverlayOptions[] = [{ input: await petakRounded(W, tinggiPanel, 0, "#0A1A33", 0.74), left: 0, top: atasPanel }];

  // Logo selalu di ubin putih (kontras terjaga di atas foto gelap maupun terang)
  const kiriLogo = pad;
  const atasLogo = atasPanel + pad;
  try {
    const logoBuf = await fs.readFile(LOGO());
    const dalam = logoUbin - Math.round(14 * u);
    const logoKecil = await sharp(logoBuf).resize(dalam, dalam, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    komposit.push({ input: await petakRounded(logoUbin, logoUbin, Math.round(16 * u), "#FFFFFF"), left: kiriLogo, top: atasLogo });
    komposit.push({ input: logoKecil, left: kiriLogo + Math.round(7 * u), top: atasLogo + Math.round(7 * u) });
  } catch {
    // logo tidak ada: dilewati
  }

  let y = atasPanel + pad;
  const kiriTeks = pad + logoUbin + jarak;
  for (const b of baris) {
    komposit.push({ input: b.input, left: kiriTeks, top: y });
    y += b.h + jedaBaris;
  }

  const qr = await QRCode.toBuffer(d.urlVerifikasi, { type: "png", errorCorrectionLevel: "M", margin: 0, width: qrUkuran, color: { dark: "#0A1A33", light: "#FFFFFF" } });
  const kiriQr = W - pad - qrUbin;
  const atasQr = atasPanel + pad;
  komposit.push({ input: await petakRounded(qrUbin, qrUbin, Math.round(10 * u), "#FFFFFF"), left: kiriQr, top: atasQr });
  komposit.push({ input: qr, left: kiriQr + Math.round(8 * u), top: atasQr + Math.round(8 * u) });
  komposit.push({ input: kodeTeks.input, left: kiriQr, top: atasQr + qrUbin + Math.round(6 * u) });

  const keluar = await sharp(dasar.data).composite(komposit).jpeg({ quality: 82 }).toBuffer();
  return { buf: keluar, lebar: W, tinggi: H };
}
