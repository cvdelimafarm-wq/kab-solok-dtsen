// lib/pdf/sigap/laporan.ts
//
// (5 Okt 2026) Laporan Perjalanan Dinas harian -- SPJ SIGAP Transport Lokal, permintaan user.
// Versi SIGAP yg DISEDERHANAKAN dari lib/pdf/laporan.ts (modul penyisiran, berbasis rekap penyisiran):
// gaya visual SAMA (pita navy+oranye, judul 20pt, blok identitas 2x2, 3 kartu angka, judul seksi
// berkotak oranye, tabel bergaris tipis, footer), tetapi isinya HANYA dari isian harian petugas:
//  - lokasi (kecamatan/nagari/jorong) dari sigap_realisasi.lokasi,
//  - jumlah {satuan_realisasi} dari sigap_realisasi.jumlah_realisasi,
//  - kendala dari sigap_realisasi.kendala,
//  - jumlah foto dari sigap_dokumentasi.
// TIDAK ADA angka/isi fabrikasi (tidak ada estimasi minimum, tidak ada klaim pola perjalanan) --
// kalimat uraian hanya merangkai data di atas. Satu laporan per hari yg punya realisasi.
// Bila lokasi sangat banyak, tabel berlanjut ke halaman berikutnya (bukan dipotong).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import { formatTanggalIndoDenganHari, judulKecamatan, teksAman } from "./format";

export interface SigapLokasi {
  kecamatan: string | null;
  nagari: string | null;
  jorong: string | null;
}

export interface SigapLaporanData {
  kegiatanNama: string;
  kegiatanKode: string;
  nomorSt: string;
  namaPetugas: string;
  labelJabatan: string;
  tanggal: string;
  satuan: string;
  lokasi: SigapLokasi[];
  jumlahRealisasi: number;
  kendala: string | null;
  jumlahFoto: number;
}

const MM = 2.834645669;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 20 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const CONTENT_L = MARGIN_X;
const CONTENT_R = PAGE_W - MARGIN_X;
const CONTENT_MID = MARGIN_X + CONTENT_W / 2;
const BUDGET_TOP = 19 * MM;
const BUDGET_BOTTOM = PAGE_H - 19 * MM;

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
const GRID_ROW_H = 39.5;
const GRID_PAD_X = 6.0;
const CARD_GAP = 5 * MM;
const CARD_W = (CONTENT_W - 2 * CARD_GAP) / 3;
const CARD_H = 49.0;
const SECTION_BOX_W = 3 * MM;
const SECTION_BOX_H = 16.0;
const TABEL_HEADER_H = 18.0;
const BARIS_MIN_H = 20.5;
const PAD_X = 6.0;
const FONT_ISI = 10;
const LEADING_ISI = 14;
const FONT_TABEL = 9.5;
const LEADING_TABEL = 12.5;
const FOOTER_LINE_DARI_BAWAH = 38.27;
const FOOTER_TEXT_DARI_BAWAH = 31.9;
const FOOTER_SIZE = 8.5;

// Lebar kolom tabel lokasi: No | Kecamatan | Nagari | Jorong
const KOL_NO_W = 26;
const KOL_SISA = (CONTENT_W - KOL_NO_W) / 3;
const KOL_X = [CONTENT_L, CONTENT_L + KOL_NO_W, CONTENT_L + KOL_NO_W + KOL_SISA, CONTENT_L + KOL_NO_W + KOL_SISA * 2];
const KOL_W = [KOL_NO_W, KOL_SISA, KOL_SISA, KOL_SISA];

function bungkusTeks(f: PDFFont, txt: string, size: number, maxWidth: number): string[] {
  const baris: string[] = [];
  let sekarang = "";
  for (const k of txt.split(/\s+/).filter(Boolean)) {
    const coba = sekarang ? `${sekarang} ${k}` : k;
    if (f.widthOfTextAtSize(coba, size) > maxWidth && sekarang) {
      baris.push(sekarang);
      sekarang = k;
    } else sekarang = coba;
  }
  if (sekarang) baris.push(sekarang);
  return baris.length > 0 ? baris : [""];
}

/** Ringkasan wilayah utk kalimat uraian: "Nagari A, Nagari B, Kecamatan X" (maks 3 nagari disebut). */
function wilayahTeks(lok: SigapLokasi[]): string {
  const nagari = Array.from(new Set(lok.map((l) => judulKecamatan(l.nagari)).filter(Boolean)));
  const kec = Array.from(new Set(lok.map((l) => judulKecamatan(l.kecamatan)).filter(Boolean)));
  if (nagari.length === 0 && kec.length === 0) return "";
  const kecTeks = kec.length ? `Kecamatan ${kec.join(", ")}` : "";
  if (nagari.length === 0) return kecTeks;
  const nagTeks = nagari.length <= 3 ? `Nagari ${nagari.join(", ")}` : `${nagari.length} nagari`;
  return kecTeks ? `${nagTeks}, ${kecTeks}` : nagTeks;
}

export async function buatPdfLaporanSigap(data: SigapLaporanData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const halaman: PDFPage[] = [];
  let page!: PDFPage;
  let y = BUDGET_TOP;

  function teks(txt: string, x: number, yAtas: number, size: number, opts: { bold?: boolean; italic?: boolean; color?: RGB; align?: "right" | "center"; width?: number } = {}) {
    const f = opts.italic ? fontItalic : opts.bold ? fontBold : font;
    const t = teksAman(txt);
    let xPos = x;
    if (opts.width && opts.align === "right") xPos = x + opts.width - f.widthOfTextAtSize(t, size);
    else if (opts.width && opts.align === "center") xPos = x + (opts.width - f.widthOfTextAtSize(t, size)) / 2;
    page.drawText(t, { x: xPos, y: PAGE_H - yAtas - size * 0.8, size, font: f, color: opts.color ?? TEXT });
  }
  function kotak(x: number, yAtas: number, w: number, h: number, opts: { fill?: RGB; border?: RGB; borderWidth?: number }) {
    page.drawRectangle({ x, y: PAGE_H - yAtas - h, width: w, height: h, color: opts.fill, borderColor: opts.border, borderWidth: opts.borderWidth });
  }
  function garisH(x1: number, x2: number, yAtas: number, color: RGB = LINE, t = 0.6) {
    page.drawLine({ start: { x: x1, y: PAGE_H - yAtas }, end: { x: x2, y: PAGE_H - yAtas }, thickness: t, color });
  }
  function garisV(x: number, y1: number, y2: number) {
    page.drawLine({ start: { x, y: PAGE_H - y1 }, end: { x, y: PAGE_H - y2 }, thickness: 0.6, color: LINE });
  }
  function halamanBaru() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    halaman.push(page);
    kotak(0, 0, PAGE_W, HEADER_BAR_H, { fill: NAVY });
    kotak(0, HEADER_BAR_H, PAGE_W, HEADER_STRIP_H, { fill: ORANGE });
    garisH(CONTENT_L, CONTENT_R, PAGE_H - FOOTER_LINE_DARI_BAWAH);
    teks(`${data.kegiatanKode || "SIGAP"} • Laporan Perjalanan Dinas`, CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, { color: TEXT_SEC });
    y = BUDGET_TOP;
  }
  /** Pindah halaman bila elemen setinggi h tidak muat lagi. */
  function ruang(h: number): boolean {
    if (y + h <= BUDGET_BOTTOM) return false;
    halamanBaru();
    return true;
  }
  function judulSeksi(judul: string) {
    ruang(SECTION_BOX_H + 30);
    kotak(CONTENT_L, y, SECTION_BOX_W, SECTION_BOX_H, { fill: ORANGE });
    teks(judul, CONTENT_L + SECTION_BOX_W + 7, y + 4, 10.5, { bold: true, color: NAVY });
    y += SECTION_BOX_H + 8;
  }

  halamanBaru();

  // ---------- Judul ----------
  teks("LAPORAN PERJALANAN DINAS", CONTENT_L, y, 20, { bold: true, color: NAVY });
  y += 24;
  for (const b of bungkusTeks(font, teksAman(data.kegiatanNama || "-"), 11, CONTENT_W)) {
    teks(b, CONTENT_L, y, 11, { color: TEXT_SEC });
    y += 13;
  }
  y += 8;

  // ---------- Identitas 2x2 ----------
  const sel: [string, string][][] = [
    [
      ["NAMA PETUGAS", data.namaPetugas || "-"],
      ["JABATAN", data.labelJabatan || "-"],
    ],
    [
      ["NOMOR SURAT TUGAS", data.nomorSt || "-"],
      ["TANGGAL", formatTanggalIndoDenganHari(data.tanggal)],
    ],
  ];
  const valW = CONTENT_W / 2 - GRID_PAD_X * 2;
  const grid = sel.map((r) => r.map(([l, v]) => ({ l, baris: bungkusTeks(fontBold, teksAman(v), 10.5, valW) })));
  const tinggi = grid.map((r) => GRID_ROW_H + (Math.max(...r.map((s) => s.baris.length)) - 1) * 13);
  const gridTop = y;
  const gridH = tinggi[0] + tinggi[1];
  kotak(CONTENT_L, gridTop, CONTENT_W, gridH, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });
  garisH(CONTENT_L, CONTENT_R, gridTop + tinggi[0]);
  garisV(CONTENT_MID, gridTop, gridTop + gridH);
  let rowTop = gridTop;
  grid.forEach((r, i) => {
    r.forEach((s, j) => {
      const x = CONTENT_L + j * (CONTENT_W / 2) + GRID_PAD_X;
      teks(s.l, x, rowTop + 9, 8, { bold: true, color: TEXT_SEC });
      s.baris.forEach((b, k) => teks(b, x, rowTop + 21.5 + k * 13, 10.5, { bold: true }));
    });
    rowTop += tinggi[i];
  });
  y = gridTop + gridH + 9;

  // ---------- 3 kartu angka (semuanya data isian, bukan estimasi) ----------
  const satuan = (data.satuan || "unit").trim();
  const kartu: [string, string][] = [
    [String(data.jumlahRealisasi), `JUMLAH ${satuan.toUpperCase()}`],
    [String(data.lokasi.length), "LOKASI DICATAT"],
    [String(data.jumlahFoto), "FOTO DOKUMENTASI"],
  ];
  kartu.forEach(([angka, label], i) => {
    const x = CONTENT_L + i * (CARD_W + CARD_GAP);
    garisH(x, x + CARD_W, y, NAVY, 2);
    teks(angka, x, y + 12, 20, { bold: true, color: NAVY, align: "center", width: CARD_W });
    teks(label, x, y + 34, 8, { bold: true, color: TEXT_SEC, align: "center", width: CARD_W });
  });
  y += CARD_H + 14;

  // ---------- Uraian ----------
  judulSeksi("URAIAN PELAKSANAAN TUGAS");
  const wilayah = wilayahTeks(data.lokasi);
  const paragraf = [
    `Pada hari ${formatTanggalIndoDenganHari(data.tanggal)}, ${data.namaPetugas || "-"} melaksanakan tugas ${data.kegiatanNama || "-"} ` +
      `sebagai ${data.labelJabatan || "-"}${wilayah ? ` di ${wilayah}` : ""}.`,
    `Jumlah ${satuan} yang dicatat petugas pada tanggal ini sebanyak ${data.jumlahRealisasi} ${satuan}` +
      `${data.lokasi.length ? `, pada ${data.lokasi.length} lokasi sebagaimana tercantum di bawah` : ""}.`,
  ];
  paragraf.forEach((p, i) => {
    for (const b of bungkusTeks(font, teksAman(p), FONT_ISI, CONTENT_W)) {
      ruang(LEADING_ISI);
      teks(b, CONTENT_L, y, FONT_ISI);
      y += LEADING_ISI;
    }
    if (i < paragraf.length - 1) y += 6;
  });
  y += 14;

  // ---------- Tabel lokasi ----------
  judulSeksi("LOKASI PELAKSANAAN");
  const kepalaTabel = () => {
    kotak(CONTENT_L, y, CONTENT_W, TABEL_HEADER_H, { fill: SOFT_BG });
    ["NO", "KECAMATAN", "NAGARI", "JORONG"].forEach((h, i) => teks(h, KOL_X[i] + PAD_X, y + 6, 7.5, { bold: true, color: TEXT_SEC }));
    garisH(CONTENT_L, CONTENT_R, y);
    garisH(CONTENT_L, CONTENT_R, y + TABEL_HEADER_H);
    y += TABEL_HEADER_H;
  };
  let tabelTop = y;
  kepalaTabel();
  const tutupSisi = (dari: number, sampai: number) => {
    garisV(CONTENT_L, dari, sampai);
    garisV(CONTENT_R, dari, sampai);
    for (let i = 1; i < KOL_X.length; i++) garisV(KOL_X[i], dari, sampai);
  };
  if (data.lokasi.length === 0) {
    teks("(Lokasi tidak dicatat pada isian tanggal ini.)", CONTENT_L + PAD_X, y + 6.4, 8.5, { italic: true, color: TEXT_SEC });
    y += BARIS_MIN_H;
    garisH(CONTENT_L, CONTENT_R, y);
    garisV(CONTENT_L, tabelTop, y);
    garisV(CONTENT_R, tabelTop, y);
  } else {
    data.lokasi.forEach((l, idx) => {
      const isi = [String(idx + 1), judulKecamatan(l.kecamatan) || "-", judulKecamatan(l.nagari) || "-", judulKecamatan(l.jorong) || "-"];
      const bar = isi.map((v, i) => bungkusTeks(font, teksAman(v), FONT_TABEL, KOL_W[i] - PAD_X * 2));
      const h = BARIS_MIN_H + (Math.max(...bar.map((b) => b.length)) - 1) * LEADING_TABEL;
      if (y + h > BUDGET_BOTTOM) {
        tutupSisi(tabelTop, y);
        halamanBaru();
        tabelTop = y;
        kepalaTabel();
      }
      bar.forEach((b, i) => b.forEach((t, k) => teks(t, KOL_X[i] + PAD_X, y + 6.4 + k * LEADING_TABEL, FONT_TABEL, { bold: i === 0 })));
      y += h;
      garisH(CONTENT_L, CONTENT_R, y);
    });
    tutupSisi(tabelTop, y);
  }
  // Baris penutup: jumlah realisasi & foto (selebar tabel).
  for (const [label, nilai] of [
    [`Jumlah ${satuan} (isian petugas)`, `${data.jumlahRealisasi} ${satuan}`],
    ["Dokumentasi tanggal ini", `${data.jumlahFoto} foto`],
  ] as [string, string][]) {
    ruang(BARIS_MIN_H);
    kotak(CONTENT_L, y, CONTENT_W, BARIS_MIN_H, { fill: SOFT_BG });
    garisH(CONTENT_L, CONTENT_R, y, NAVY, 1);
    teks(label, CONTENT_L + PAD_X, y + 6.4, FONT_TABEL);
    teks(nilai, CONTENT_L + PAD_X, y + 6.4, FONT_TABEL, { bold: true, align: "right", width: CONTENT_W - PAD_X * 2 });
    garisV(CONTENT_L, y, y + BARIS_MIN_H);
    garisV(CONTENT_R, y, y + BARIS_MIN_H);
    y += BARIS_MIN_H;
  }
  garisH(CONTENT_L, CONTENT_R, y);
  y += 14;

  // ---------- Kendala ----------
  judulSeksi("KENDALA DI LAPANGAN");
  const kendala = (data.kendala ?? "").trim();
  for (const b of bungkusTeks(kendala ? font : fontItalic, teksAman(kendala || "Tidak ada kendala yang dicatat petugas pada isian tanggal ini."), FONT_ISI, CONTENT_W)) {
    ruang(LEADING_ISI);
    teks(b, CONTENT_L, y, FONT_ISI, kendala ? {} : { italic: true, color: TEXT_SEC });
    y += LEADING_ISI;
  }
  y += 10;

  // ---------- Catatan ----------
  const prefiks = "Catatan: ";
  const lebarPrefiks = fontBold.widthOfTextAtSize(prefiks, 9);
  const catatan =
    `Laporan ini dirakit otomatis dari isian harian petugas pada aplikasi SIGAP (lokasi, jumlah ${satuan}, kendala, dan foto ` +
    `dokumentasi) untuk tanggal ${formatTanggalIndoDenganHari(data.tanggal)}, tanpa tambahan data lain.`;
  const barisCat = bungkusTeks(fontItalic, teksAman(catatan), 9, CONTENT_W - lebarPrefiks);
  ruang(barisCat.length * 12);
  teks(prefiks, CONTENT_L, y, 9, { bold: true, color: TEXT_SEC });
  barisCat.forEach((b, i) => teks(b, CONTENT_L + (i === 0 ? lebarPrefiks : 0), y + i * 12, 9, { italic: true, color: TEXT_SEC }));

  // Nomor halaman ("Halaman i dari n") ditulis setelah jumlah halaman diketahui.
  halaman.forEach((pg, i) => {
    page = pg;
    teks(halaman.length > 1 ? `Halaman ${i + 1} dari ${halaman.length}` : "Halaman 1", CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, {
      color: TEXT_SEC,
      align: "right",
      width: CONTENT_W,
    });
  });

  return doc.save();
}
