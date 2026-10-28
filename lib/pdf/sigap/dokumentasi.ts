// lib/pdf/sigap/dokumentasi.ts
//
// (5 Okt 2026) Lampiran Dokumentasi SPJ SIGAP Transport Lokal -- permintaan user.
// SALINAN lib/pdf/dokumentasi.ts (modul penyisiran: pita navy+oranye, blok identitas, grid kartu
// foto, foto dirotasi EXIF & diperkecil sharp) yg diparameterkan utk SIGAP. File penyisiran TIDAK
// diubah. Perbedaan: subjudul = nama kegiatan SIGAP (bukan "Sensus Ekonomi 2026 (SE2026)"),
// footer = kode kegiatan, label kartu = nomor slot, teks dibersihkan teksAman().
// Foto diambil dari bucket sigap-files oleh pemanggil (lib/sigapDokumen.ts) -- file ini murni PDF.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import sharp from "sharp";
import { tataFotoDokumentasi, type FotoUkur } from "@/lib/sigapTataFoto";
import { formatTanggalIndoDenganHari, teksAman } from "./format";
import { LABEL_FOTO_PENDATAAN, labelFoto } from "@/lib/sigapLabelFoto";

// pdf-lib mengabaikan tag EXIF "Orientation" -- sharp().rotate() memutar piksel sungguhan, lalu
// resize maks 1280 px supaya memori tetap kecil (pola sama dgn lib/pdf/dokumentasi.ts, 27 Sep 2026).
async function perbaikiOrientasiFoto(bytes: Uint8Array, contentType: string): Promise<Uint8Array> {
  try {
    const img = sharp(Buffer.from(bytes))
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true });
    const keluar =
      contentType === "image/png" ? await img.png({ quality: 80 }).toBuffer() : await img.jpeg({ quality: 78 }).toBuffer();
    return new Uint8Array(keluar);
  } catch {
    // Gagal diproses (mis. bukan file gambar valid) -- pakai bytes ASLI
    // apa adanya, biar tetap dicoba doc.embedJpg/embedPng di pemanggil
    // (yg py fallback tersendiri kalau itu jg gagal) drpd PDF gagal total.
    return bytes;
  }
}

/** (6 Okt 2026) Jenis foto per slot -- harus sama dgn SARAN_FOTO di app/sigap/translok/[token]/page.tsx. */
/** Keterangan bawaan (pendataan); keterangan per jenis kegiatan: labelFoto() di lib/sigapLabelFoto.ts. */
export const LABEL_FOTO_SIGAP = LABEL_FOTO_PENDATAAN;

export interface SigapFotoInput {
  slot: number;
  bytes: Uint8Array;
  contentType: string; // "image/jpeg" | "image/png" -- divalidasi di route sebelum sampai sini
}

export interface SigapDokumentasiData {
  /** Nama kegiatan (sigap_kegiatan.nama) -- subjudul, BUKAN "Sensus Ekonomi 2026". */
  kegiatanNama: string;
  /** Teks kiri footer, mis. kode kegiatan. */
  kegiatanKode: string;
  /** (8 Okt 2026) jenis kegiatan (sigap_kegiatan.jenis) -- menentukan keterangan foto; kosong = pendataan. */
  kegiatanJenis?: string | null;
  nomorSt: string;
  namaPetugas: string;
  peranLabel: string;
  tanggal: string;
  lokasi: string;
  foto: SigapFotoInput[];
}

// ---------- Ukuran halaman & warna (SAMA dgn lib/pdf/laporan.ts) ----------

const MM = 2.834645669;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 10 * MM; // 28.35 (28 Okt 2026: margin 1 cm, memperbesar foto)
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 538.58
const CONTENT_L = MARGIN_X;
const CONTENT_R = PAGE_W - MARGIN_X;
const CONTENT_MID = MARGIN_X + CONTENT_W / 2;

const BUDGET_TOP = 14 * MM; // 39.69 (sebelumnya 19 mm)
const BUDGET_BOTTOM = PAGE_H - 38.27 - 6; // 797.62: 6 pt di atas garis footer (sebelumnya 19 mm dari bawah)

function warna(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const NAVY = warna("#1B365D");
const ORANGE = warna("#E08A1E");
const TEXT = warna("#1F2933");
const TEXT_SEC = warna("#6B7785");
const LINE = warna("#D5DCE4");
const SOFT_BG = warna("#F4F7FA");

const HEADER_BAR_H = 7 * MM;
const HEADER_STRIP_H = 1.2 * MM;
const GAP_SUBTITLE_TO_GRID = 10.25;
const GRID_ROW_H = 35.0;
const GRID_LABEL_OFFSET = 8.0;
const GRID_VALUE_OFFSET = 20.0;
const GRID_VALUE_LEADING = 13.0;
const GRID_PAD_X = 12.0; // padding kiri-kanan sel identitas (sesuai spesifikasi user: 12pt)
const GAP_GRID_TO_SECTION = 10.0;
const SECTION_BOX_W = 3 * MM;
const SECTION_BOX_H = 16.0;
const SECTION_TITLE_GAP_X = 7.0;
const SECTION_TITLE_TEXT_OFFSET = 4.0;
const GAP_SECTIONTITLE_TO_GRIDFOTO = 6.0;

const CARD_GAP = 3.0; // jarak antarkartu (sebelumnya 5 mm)
const LEBAR_FOTO_MIN = 70; // lebar foto minimum (pt) supaya keterangan kartu masih terbaca
const CARD_HEADER_H = 18.0;
const PAD_FOTO = 3.0;

const FOOTER_LINE_DARI_BAWAH = 38.27;
const FOOTER_TEXT_DARI_BAWAH = 31.9;
const FOOTER_SIZE = 8.5;

function bungkusTeks(f: PDFFont, txt: string, size: number, maxWidth: number): string[] {
  const kata = txt.split(/\s+/).filter(Boolean);
  const baris: string[] = [];
  let sekarang = "";
  for (const k of kata) {
    const coba = sekarang ? `${sekarang} ${k}` : k;
    if (f.widthOfTextAtSize(coba, size) > maxWidth && sekarang) {
      baris.push(sekarang);
      sekarang = k;
    } else {
      sekarang = coba;
    }
  }
  if (sekarang) baris.push(sekarang);
  return baris.length > 0 ? baris : [""];
}

export async function buatPdfDokumentasiSigap(data: SigapDokumentasiData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  function teks(
    txt: string,
    x: number,
    yAtas: number,
    size: number,
    opts: { bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; width?: number } = {}
  ) {
    const f = opts.bold ? fontBold : font;
    const color = opts.color ?? TEXT;
    txt = teksAman(txt);
    let xPos = x;
    if (opts.width && opts.align === "right") xPos = x + opts.width - f.widthOfTextAtSize(txt, size);
    else if (opts.width && opts.align === "center") xPos = x + (opts.width - f.widthOfTextAtSize(txt, size)) / 2;
    const yBaseline = PAGE_H - yAtas - size * 0.8;
    page.drawText(txt, { x: xPos, y: yBaseline, size, font: f, color });
  }
  function kotak(x: number, yAtas: number, w: number, h: number, opts: { fill?: RGB; border?: RGB; borderWidth?: number } = {}) {
    page.drawRectangle({
      x,
      y: PAGE_H - yAtas - h,
      width: w,
      height: h,
      color: opts.fill,
      borderColor: opts.border,
      borderWidth: opts.borderWidth,
    });
  }
  function garisH(x1: number, x2: number, yAtas: number, color: RGB, thickness: number) {
    page.drawLine({ start: { x: x1, y: PAGE_H - yAtas }, end: { x: x2, y: PAGE_H - yAtas }, thickness, color });
  }
  function garisV(x: number, yAtas1: number, yAtas2: number, color: RGB, thickness: number) {
    page.drawLine({ start: { x, y: PAGE_H - yAtas1 }, end: { x, y: PAGE_H - yAtas2 }, thickness, color });
  }

  // ---------- Pita header & footer ----------
  kotak(0, 0, PAGE_W, HEADER_BAR_H, { fill: NAVY });
  kotak(0, HEADER_BAR_H, PAGE_W, HEADER_STRIP_H, { fill: ORANGE });
  garisH(CONTENT_L, CONTENT_R, PAGE_H - FOOTER_LINE_DARI_BAWAH, LINE, 0.6);
  teks(`${data.kegiatanKode || "SIGAP"} • Lampiran Dokumentasi Kegiatan`, CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, {
    color: TEXT_SEC,
  });
  teks("Halaman 1", CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, {
    color: TEXT_SEC,
    align: "right",
    width: CONTENT_W,
  });

  // ---------- Judul ----------
  let y = BUDGET_TOP;
  teks("LAMPIRAN DOKUMENTASI KEGIATAN", CONTENT_L, y, 20, { bold: true, color: NAVY });
  y += 24.0;
  teks(data.kegiatanNama || "-", CONTENT_L, y, 11, { color: TEXT_SEC });
  y += 11.0 + GAP_SUBTITLE_TO_GRID;

  // ---------- Blok identitas: 3 baris (baris 3 = Lokasi, selebar penuh) ----------
  const barisGrid: { label: string; nilai: string }[][] = [
    [
      { label: "NAMA PETUGAS", nilai: data.namaPetugas || "-" },
      { label: "JABATAN", nilai: data.peranLabel },
    ],
    [
      { label: "NOMOR SURAT TUGAS", nilai: data.nomorSt || "-" },
      { label: "TANGGAL", nilai: formatTanggalIndoDenganHari(data.tanggal) },
    ],
    [{ label: "LOKASI", nilai: data.lokasi || "-" }],
  ];
  const gridBaris = barisGrid.map((sel) => {
    const numKolom = sel.length;
    const colW = CONTENT_W / numKolom;
    const valW = colW - GRID_PAD_X * 2;
    return sel.map((s) => ({ ...s, baris: bungkusTeks(fontBold, teksAman(s.nilai), 10.5, valW), numKolom, colW }));
  });
  const tinggiBarisGrid = gridBaris.map((sel) => {
    const maxBaris = Math.max(...sel.map((s) => s.baris.length), 1);
    return GRID_ROW_H + (maxBaris - 1) * GRID_VALUE_LEADING;
  });
  const gridTop = y;
  const gridTotalH = tinggiBarisGrid.reduce((a, b) => a + b, 0);
  kotak(CONTENT_L, gridTop, CONTENT_W, gridTotalH, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });

  let rowTop = gridTop;
  gridBaris.forEach((sel, i) => {
    if (i > 0) garisH(CONTENT_L, CONTENT_R, rowTop, LINE, 0.6);
    const tinggi = tinggiBarisGrid[i];
    if (sel.length === 2) garisV(CONTENT_MID, rowTop, rowTop + tinggi, LINE, 0.6);
    sel.forEach((s, j) => {
      const x = CONTENT_L + j * s.colW + GRID_PAD_X;
      teks(s.label, x, rowTop + GRID_LABEL_OFFSET, 8, { bold: true, color: TEXT_SEC });
      s.baris.forEach((b, k) => teks(b, x, rowTop + GRID_VALUE_OFFSET + k * GRID_VALUE_LEADING, 10.5, { bold: true, color: TEXT }));
    });
    rowTop += tinggi;
  });
  y = gridTop + gridTotalH + GAP_GRID_TO_SECTION;

  // ---------- Judul seksi ----------
  kotak(CONTENT_L, y, SECTION_BOX_W, SECTION_BOX_H, { fill: ORANGE });
  teks("DOKUMENTASI FOTO", CONTENT_L + SECTION_BOX_W + SECTION_TITLE_GAP_X, y + SECTION_TITLE_TEXT_OFFSET, 10.5, {
    bold: true,
    color: NAVY,
  });
  y += SECTION_BOX_H + GAP_SECTIONTITLE_TO_GRIDFOTO;

  // ---------- Grid kartu foto ----------
  const urut = [...data.foto].sort((a, b) => a.slot - b.slot);

  if (urut.length === 0) {
    teks("(Tidak ada foto untuk tanggal ini.)", CONTENT_L, y, 10, { color: TEXT_SEC });
    return doc.save();
  }

  // (28 Okt 2026) Susunan foto 2-1-2 (lib/sigapTataFoto.ts): baris 1 = foto 1|2, baris 2 = foto 3 (pusat perhatian),
  // baris 3 = foto 4|5. Foto 3 terbesar, foto 2 dan 4 tidak dikecilkan di bawah ambang, rasio asli dipertahankan
  // (tidak dipotong -- cap tanggal dan QR di tepi bawah foto tetap utuh). Margin 1 cm, jarak antarkartu 3 pt.
  // Nomor di kartu = nomor slot. Satu foto per slot (unik di DB); slot di luar 1..5 diabaikan.
  const siap = new Map<number, { item: SigapFotoInput; img: PDFImage | null }>();
  for (const item of urut) {
    if (siap.has(item.slot) || item.slot < 1 || item.slot > 5) continue;
    let img: PDFImage | null;
    try {
      const bytesTegak = await perbaikiOrientasiFoto(item.bytes, item.contentType);
      img = item.contentType === "image/png" ? await doc.embedPng(bytesTegak) : await doc.embedJpg(bytesTegak);
    } catch {
      // Gagal embed (file korup/format tak terduga) -- kartu & keterangannya tetap tampil kosong drpd seluruh PDF gagal.
      img = null;
    }
    siap.set(item.slot, { item, img });
  }
  const ukur: FotoUkur[] = [];
  const lebarMin: Record<number, number> = {};
  siap.forEach((v, slot) => {
    ukur.push({ slot, aspek: v.img ? v.img.width / v.img.height : 16 / 9 });
    lebarMin[slot] = LEBAR_FOTO_MIN;
  });
  const { penempatan } = tataFotoDokumentasi(ukur, {
    lebar: CONTENT_W - PAD_FOTO * 2,
    tinggi: BUDGET_BOTTOM - y,
    gap: CARD_GAP + PAD_FOTO * 2,
    gapV: CARD_GAP,
    cap: CARD_HEADER_H + PAD_FOTO,
    capBawah: PAD_FOTO,
    lebarMin,
  });
  const areaTop = y;

  for (const p of penempatan) {
    const k = siap.get(p.slot)!;
    const labelTxt = labelFoto(data.kegiatanJenis)[p.slot - 1] ?? "Dokumentasi";
    const cardX = CONTENT_L + p.x;
    const cardW = p.w + PAD_FOTO * 2;
    const cardTop = areaTop + p.yKet;

    // Outline kartu penuh + header berlatar lembut.
    kotak(cardX, cardTop, cardW, p.tinggiKartu, { border: LINE, borderWidth: 0.6 });
    kotak(cardX, cardTop, cardW, CARD_HEADER_H, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });
    garisH(cardX, cardX + cardW, cardTop, NAVY, 2); // aksen garis atas navy 2pt

    // Keterangan: satu baris (font mengecil sampai 7pt) bila muat; bila kartu sempit, label dibungkus 2 baris
    // (baris pertama berbagi dengan nomor), baris terakhir dipotong "..." bila masih terlalu panjang.
    const nomorTxt = `${p.slot}`;
    const lebarMaksHeader = cardW - 8;
    const lebarTeks = (t: string, u: number) => fontBold.widthOfTextAtSize(teksAman(t), u);
    let ukuranHeader = 9.5;
    while (ukuranHeader > 7 && lebarTeks(`${nomorTxt}  ${labelTxt}`, ukuranHeader) > lebarMaksHeader) ukuranHeader -= 0.5;
    const spasiW = lebarTeks("  ", ukuranHeader);
    const nomorW = lebarTeks(nomorTxt, ukuranHeader);
    if (lebarTeks(`${nomorTxt}  ${labelTxt}`, ukuranHeader) <= lebarMaksHeader) {
      const totalW = nomorW + spasiW + lebarTeks(labelTxt, ukuranHeader);
      const startX = cardX + (cardW - totalW) / 2;
      const yAtas = cardTop + (CARD_HEADER_H - ukuranHeader) / 2 + 1.5;
      teks(nomorTxt, startX, yAtas, ukuranHeader, { bold: true, color: ORANGE });
      teks(labelTxt, startX + nomorW + spasiW, yAtas, ukuranHeader, { bold: true, color: NAVY });
    } else {
      const kata = labelTxt.split(/\s+/).filter(Boolean);
      let l1 = "";
      let i = 0;
      const lim1 = lebarMaksHeader - nomorW - spasiW;
      while (i < kata.length && lebarTeks(l1 ? `${l1} ${kata[i]}` : kata[i], ukuranHeader) <= lim1) {
        l1 = l1 ? `${l1} ${kata[i]}` : kata[i];
        i++;
      }
      let l2 = kata.slice(i).join(" ");
      if (lebarTeks(l2, ukuranHeader) > lebarMaksHeader) {
        while (l2.length > 1 && lebarTeks(`${l2}...`, ukuranHeader) > lebarMaksHeader) l2 = l2.slice(0, -1);
        l2 = `${l2.trimEnd()}...`;
      }
      const tot1 = nomorW + (l1 ? spasiW + lebarTeks(l1, ukuranHeader) : 0);
      const x1 = cardX + (cardW - tot1) / 2;
      const y1 = cardTop + 2.5;
      teks(nomorTxt, x1, y1, ukuranHeader, { bold: true, color: ORANGE });
      if (l1) teks(l1, x1 + nomorW + spasiW, y1, ukuranHeader, { bold: true, color: NAVY });
      if (l2) teks(l2, cardX + (cardW - lebarTeks(l2, ukuranHeader)) / 2, y1 + ukuranHeader + 1.2, ukuranHeader, { bold: true, color: NAVY });
    }

    if (k.img) {
      page.drawImage(k.img, { x: cardX + PAD_FOTO, y: PAGE_H - (areaTop + p.y) - p.h, width: p.w, height: p.h });
    }
  }

  return doc.save();
}
