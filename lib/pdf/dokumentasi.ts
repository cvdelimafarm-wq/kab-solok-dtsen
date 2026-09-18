// lib/pdf/dokumentasi.ts
//
// Generator PDF "Lampiran Dokumentasi Kegiatan" -- meniru struktur
// Template Dokumentasi.docx yang diupload user (kop kegiatan + tabel
// identitas + grid foto), TAPI slotnya diganti dari 3 slot generik jadi 5
// slot BERLABEL sesuai permintaan user (sebelum berangkat, sampai lokasi,
// saat mendata, akan pulang, sampai rumah -- lihat lib/spjDokumentasi.ts).
// Foto disusun 2 kolom x hingga 3 baris, otomatis pindah halaman kalau
// tidak muat (jarang terjadi krn maks 5 foto/hari, tapi tetap dijaga).

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalIndoDenganHari } from "../spjFormat";
import { KEGIATAN_NAMA } from "../spjPejabat";
import { SLOT_LABELS } from "../spjDokumentasi";

export interface DokumentasiFotoInput {
  slot: number;
  bytes: Uint8Array;
  contentType: string; // "image/jpeg" | "image/png" -- divalidasi di route sebelum sampai sini
}

export interface DokumentasiPdfData {
  nomorSt: string;
  namaPetugas: string;
  peranLabel: string;
  tanggal: string;
  lokasi: string;
  foto: DokumentasiFotoInput[];
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 50;

export async function buatPdfDokumentasi(data: DokumentasiPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage(A4);
  const { width, height } = page.getSize();
  const usableWidth = width - MARGIN_X * 2;
  let y = height - 55;

  function halamanBaru() {
    page = doc.addPage(A4);
    y = height - 55;
  }

  function teks(
    txt: string,
    x: number,
    opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxWidth?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const f: PDFFont = opts.bold ? fontBold : font;
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") {
      xPos = x + (opts.maxWidth - f.widthOfTextAtSize(txt, size)) / 2;
    } else if (opts.maxWidth && opts.align === "right") {
      xPos = x + opts.maxWidth - f.widthOfTextAtSize(txt, size);
    }
    page.drawText(txt, { x: xPos, y, size, font: f, color: HITAM });
  }
  function garisH() {
    page.drawLine({ start: { x: MARGIN_X, y }, end: { x: width - MARGIN_X, y }, thickness: 0.75, color: HITAM });
  }

  // ---------- Kop ----------
  teks("LAMPIRAN DOKUMENTASI KEGIATAN", MARGIN_X, { bold: true, size: 13, align: "center", maxWidth: usableWidth });
  y -= 17;
  teks(KEGIATAN_NAMA.toUpperCase(), MARGIN_X, { bold: true, size: 11, align: "center", maxWidth: usableWidth });
  y -= 10;
  garisH();
  y -= 20;

  // ---------- Metadata ----------
  const labelWidth = 130;
  const baris = (label: string, value: string) => {
    teks(label, MARGIN_X, { size: 10 });
    teks(":", MARGIN_X + labelWidth, { size: 10 });
    teks(value, MARGIN_X + labelWidth + 12, { size: 10, bold: true });
    y -= 16;
  };
  baris("Nomor Surat Tugas", data.nomorSt || "-");
  baris("Nama Petugas", data.namaPetugas || "-");
  baris("Peran", data.peranLabel);
  baris("Tanggal", formatTanggalIndoDenganHari(data.tanggal));
  baris("Lokasi", data.lokasi || "-");

  y -= 6;
  garisH();
  y -= 24;

  // ---------- Grid foto: 2 kolom ----------
  const gap = 14;
  const boxWidth = (usableWidth - gap) / 2;
  const boxHeight = 190;
  const labelHeight = 18;

  const urut = [...data.foto].sort((a, b) => a.slot - b.slot);

  for (let baris2 = 0; baris2 * 2 < urut.length; baris2++) {
    if (y - boxHeight < 55) halamanBaru();
    const yAtas = y;

    for (let k = 0; k < 2; k++) {
      const idx = baris2 * 2 + k;
      if (idx >= urut.length) break;
      const item = urut[idx];
      const x = MARGIN_X + k * (boxWidth + gap);

      page.drawRectangle({
        x,
        y: yAtas - boxHeight,
        width: boxWidth,
        height: boxHeight,
        borderColor: HITAM,
        borderWidth: 0.75,
      });

      const labelTxt = SLOT_LABELS[item.slot] ?? `Foto ${item.slot}`;
      const lw = fontBold.widthOfTextAtSize(labelTxt, 9);
      page.drawText(labelTxt, { x: x + (boxWidth - lw) / 2, y: yAtas - 14, size: 9, font: fontBold, color: HITAM });

      let img: PDFImage;
      try {
        img = item.contentType === "image/png" ? await doc.embedPng(item.bytes) : await doc.embedJpg(item.bytes);
      } catch {
        // Gagal embed (file korup/format tak terduga) -- lewati fotonya,
        // biarkan kotak & labelnya tetap tampil kosong drpd seluruh PDF
        // gagal dibuat.
        continue;
      }

      const areaTop = yAtas - labelHeight - 4;
      const areaBottom = yAtas - boxHeight + 6;
      const areaW = boxWidth - 16;
      const areaH = areaTop - areaBottom;
      const skala = Math.min(areaW / img.width, areaH / img.height);
      const w = img.width * skala;
      const h = img.height * skala;
      const ix = x + (boxWidth - w) / 2;
      const iy = areaBottom + (areaH - h) / 2;
      page.drawImage(img, { x: ix, y: iy, width: w, height: h });
    }

    y = yAtas - boxHeight - gap;
  }

  if (urut.length === 0) {
    teks("(Belum ada foto yang diupload utk tanggal ini.)", MARGIN_X, { size: 10 });
  }

  return doc.save();
}
