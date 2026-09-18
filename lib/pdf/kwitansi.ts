// lib/pdf/kwitansi.ts
//
// Generator PDF "Kwitansi" -- meniru PERSIS layout Template Kwitansi.pdf
// yang diupload user (1 halaman, 3 kolom tanda tangan: Bendahara
// Pengeluaran | Setuju dibayar/PPK | Yang menerima). Dua kolom pertama
// SELALU sama (lib/spjPejabat.ts, dikonfirmasi user berlaku tetap utk
// semua ST); kolom "Yang menerima" dinamis sesuai petugas yg membuat
// kwitansi ini (nama & NIP-nya, lihat kolom `nip` baru di
// petugas_penyisiran_akun/tetangga_akun).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatRupiah, formatTanggalIndo } from "../spjFormat";
import { PEJABAT } from "../spjPejabat";

export interface KwitansiPdfData {
  nomorSt: string;
  tanggalSpd: string;
  nominal: number;
  terbilang: string;
  untukPerjalananDinasPada: string;
  tanggalKwitansi: string;
  namaPenerima: string;
  nipPenerima: string | null;
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 55;

export async function buatPdfKwitansi(data: KwitansiPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const usableWidth = width - MARGIN_X * 2;
  let y = height - 70;

  function teks(
    txt: string,
    x: number,
    opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxWidth?: number } = {}
  ) {
    const size = opts.size ?? 10.5;
    const f: PDFFont = opts.bold ? fontBold : font;
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") xPos = x + (opts.maxWidth - f.widthOfTextAtSize(txt, size)) / 2;
    else if (opts.maxWidth && opts.align === "right") xPos = x + opts.maxWidth - f.widthOfTextAtSize(txt, size);
    page.drawText(txt, { x: xPos, y, size, font: f, color: HITAM });
  }
  function garisH(yy: number) {
    page.drawLine({ start: { x: MARGIN_X, y: yy }, end: { x: width - MARGIN_X, y: yy }, thickness: 0.75, color: HITAM });
  }

  // ---------- Kop ----------
  teks("BADAN PUSAT STATISTIK", MARGIN_X, { bold: true, size: 13, align: "center", maxWidth: usableWidth });
  y -= 16;
  teks("BPS KAB. SOLOK", MARGIN_X, { bold: true, size: 12, align: "center", maxWidth: usableWidth });
  y -= 24;
  teks("KWITANSI", MARGIN_X, { bold: true, size: 15, align: "center", maxWidth: usableWidth });
  y -= 6;
  garisH(y);
  y -= 30;

  // ---------- Isi ----------
  const labelWidth = 165;
  const baris = (label: string, value: string, opts: { bold?: boolean } = {}) => {
    teks(label, MARGIN_X, { size: 10.5 });
    teks(":", MARGIN_X + labelWidth, { size: 10.5 });
    teks(value, MARGIN_X + labelWidth + 12, { size: 10.5, bold: opts.bold });
    y -= 20;
  };
  baris("Sudah terima dari", "Kuasa Pengguna Anggaran BPS KAB. SOLOK");
  baris("Uang sebesar", `Rp. ${formatRupiah(data.nominal)},-`, { bold: true });
  baris("Untuk pembayaran", "Perjalanan Dinas Dalam Kota");
  baris("Berdasarkan SPD", `Nomor : ${data.nomorSt}`);
  teks("Tanggal :", MARGIN_X + labelWidth + 12, { size: 10.5 });
  teks(formatTanggalIndo(data.tanggalSpd), MARGIN_X + labelWidth + 12 + 55, { size: 10.5 });
  y -= 20;
  baris("Untuk perjalanan dinas dalam kota pada", data.untukPerjalananDinasPada || "-");
  baris("Terbilang", `${data.terbilang} #`, { bold: true });

  y -= 20;
  garisH(y);
  y -= 40;

  // ---------- 3 kolom tanda tangan ----------
  const kolomWidth = usableWidth / 3;
  const x1 = MARGIN_X;
  const x2 = MARGIN_X + kolomWidth;
  const x3 = MARGIN_X + kolomWidth * 2;
  const yAwal = y;

  teks("Bendahara Pengeluaran BPS", x1, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });
  teks("Setuju dibayar,", x2, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });
  teks("Yang menerima,", x3, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });
  y -= 12;
  teks("Pejabat Pembuat Komitmen", x2, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });
  y -= 12;
  teks(`Solok, ${formatTanggalIndo(data.tanggalKwitansi)}`, x3, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });

  y = yAwal - 60; // ruang tanda tangan basah
  teks(PEJABAT.bendaharaPengeluaran.nama, x1, { size: 9.5, bold: true, align: "center", maxWidth: kolomWidth - 8 });
  teks(PEJABAT.ppk.nama, x2, { size: 9.5, bold: true, align: "center", maxWidth: kolomWidth - 8 });
  teks(data.namaPenerima, x3, { size: 9.5, bold: true, align: "center", maxWidth: kolomWidth - 8 });
  y -= 13;
  teks(`Nip. ${PEJABAT.bendaharaPengeluaran.nip}`, x1, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });
  teks(`Nip. ${PEJABAT.ppk.nip}`, x2, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });
  teks(data.nipPenerima ? `Nip. ${data.nipPenerima}` : "-", x3, { size: 9.5, align: "center", maxWidth: kolomWidth - 8 });

  y -= 40;
  teks("Lunas dibayar pada tanggal " + formatTanggalIndo(data.tanggalKwitansi), MARGIN_X, { size: 9 });

  return doc.save();
}
