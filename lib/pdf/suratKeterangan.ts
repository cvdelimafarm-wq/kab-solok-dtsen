// lib/pdf/suratKeterangan.ts
//
// Generator PDF "Surat Pernyataan Tidak Menggunakan Kendaraan Dinas" --
// mengikuti struktur Template Surat Pernyataan Kendaraan Dinas.docx yang
// diupload user, dgn penyesuaian:
//  - Label "Sobat ID" (SESUAI TEMPLATE ASLI -- sempat diganti "NIP" di sesi
//    sebelumnya, dikembalikan lagi ke "Sobat ID" per permintaan user 22 Sep
//    2026). Nilainya TETAP dari kolom `nip` yg sama (petugas_penyisiran_akun/
//    tetangga_akun) -- cuma label TAMPILAN-nya yg beda, bukan sumber datanya.
//  - "Jabatan"/"Unit Kerja" disesuaikan ke konteks Petugas Penyisiran /
//    Tetangga-Informan SE2026 (BUKAN "PPL Mitra Statistik" spt template
//    asli yg memang contoh dari kegiatan Susenas) -- wording final blm
//    dikonfirmasi user, gampang diubah lewat PERAN_JABATAN di bawah kalau
//    user minta redaksi lain.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalIndo } from "../spjFormat";
import { SpjPetugasJenis } from "../spjAuth";

export const PERAN_JABATAN: Record<SpjPetugasJenis, string> = {
  penyisiran: "Petugas Penyisiran Undercoverage Usaha SE2026",
  tetangga: "Petugas Identifikasi Tetangga/Informan SE2026",
};

export interface SuratKeteranganPdfData {
  nomorSt: string;
  namaPetugas: string;
  nip: string | null;
  jenis: SpjPetugasJenis;
  tanggalPelaksanaan: string;
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 55;

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
  return baris;
}

export async function buatPdfSuratKeterangan(data: SuratKeteranganPdfData): Promise<Uint8Array> {
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
  function paragraf(txt: string, size = 10.5, lineHeight = 15) {
    for (const l of bungkusTeks(font, txt, size, usableWidth)) {
      teks(l, MARGIN_X, { size });
      y -= lineHeight;
    }
  }

  teks("SURAT PERNYATAAN", MARGIN_X, { bold: true, size: 14, align: "center", maxWidth: usableWidth });
  y -= 30;

  paragraf("Yang bertanda tangan dibawah ini:");
  y -= 6;

  const labelWidth = 110;
  const barisIdentitas = (label: string, value: string) => {
    teks(label, MARGIN_X + 20, { size: 10.5 });
    teks(":", MARGIN_X + 20 + labelWidth, { size: 10.5 });
    teks(value, MARGIN_X + 20 + labelWidth + 12, { size: 10.5, bold: true });
    y -= 18;
  };
  barisIdentitas("Nama", data.namaPetugas || "-");
  barisIdentitas("Sobat ID", data.nip || "-");
  barisIdentitas("Jabatan", PERAN_JABATAN[data.jenis]);
  barisIdentitas("Unit Kerja", "BPS Kabupaten Solok");

  y -= 12;
  paragraf(
    `Menerangkan bahwa dalam rangka melaksanakan perjalanan dinas dalam kota untuk melaksanakan tugas kedinasan ` +
      `sesuai surat tugas nomor: ${data.nomorSt}, pelaksanaan tanggal ${formatTanggalIndo(data.tanggalPelaksanaan)}, ` +
      `saya benar-benar tidak menggunakan kendaraan dinas.`
  );
  y -= 8;
  paragraf(
    `Demikian pernyataan ini kami buat dengan sebenar-benarnya untuk dipergunakan sebagaimana mestinya. Apabila ` +
      `terdapat kekeliruan dalam pertanggungjawaban SPD dan mengakibatkan kerugian negara, saya bersedia dituntut ` +
      `sesuai aturan yang berlaku dan mengembalikan biaya transport lokal yang sudah saya terima ke kas negara.`
  );

  y -= 40;
  const kananX = MARGIN_X + usableWidth * 0.55;
  const kananWidth = usableWidth * 0.45;
  teks(`Solok, ${formatTanggalIndo(data.tanggalPelaksanaan)}`, kananX, { size: 10.5, align: "center", maxWidth: kananWidth });
  y -= 15;
  teks("Pelaksana Perjalanan Dinas Dalam Kota,", kananX, { size: 10.5, align: "center", maxWidth: kananWidth });
  y -= 55; // ruang tanda tangan basah
  teks(data.namaPetugas || "-", kananX, { size: 10.5, bold: true, align: "center", maxWidth: kananWidth });
  y -= 13;
  teks(data.nip ? `Sobat ID. ${data.nip}` : "-", kananX, { size: 10.5, align: "center", maxWidth: kananWidth });

  return doc.save();
}
