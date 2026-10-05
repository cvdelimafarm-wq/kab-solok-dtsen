// lib/pdf/sigap/suratPernyataan.ts
//
// (5 Okt 2026) Surat Pernyataan Tidak Menggunakan Kendaraan Dinas -- SPJ SIGAP Transport Lokal,
// permintaan user. SALINAN tata letak lib/pdf/suratKeterangan.ts (modul penyisiran: Helvetica 10pt,
// paragraf justified) yg diparameterkan utk SIGAP; file penyisiran TIDAK diubah.
// Perbedaan dgn versi penyisiran:
//  - Baris "Jabatan" = sigap_kegiatan_tarif.label_jabatan (bukan label PPL/PML Penyisiran SE2026).
//  - Identitas: "NIK" utk mitra, "NIP" utk organik (bukan "Sobat ID").
//  - Dibuat per KELOMPOK tanggal (rentang hari dibayar yg berurutan).
//  - Tempat tanda tangan = sigap_akun.alamat_kecamatan (fallback "Solok").

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { TEMPAT_KEDUDUKAN_DEFAULT } from "../../spjPejabat";
import { formatRentangTanggalIndo, formatTanggalIndo, teksAman } from "./format";

export interface SigapSuratPernyataanData {
  nomorSt: string;
  namaPetugas: string;
  labelId: "NIK" | "NIP";
  idPetugas: string | null;
  labelJabatan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  tempatKedudukan: string | null;
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 55;

function bungkusTeks(f: PDFFont, txt: string, size: number, maxWidth: number): string[][] {
  const baris: string[][] = [];
  let sekarang: string[] = [];
  for (const k of txt.split(/\s+/).filter(Boolean)) {
    const coba = sekarang.length ? [...sekarang, k].join(" ") : k;
    if (f.widthOfTextAtSize(coba, size) > maxWidth && sekarang.length) {
      baris.push(sekarang);
      sekarang = [k];
    } else sekarang.push(k);
  }
  if (sekarang.length) baris.push(sekarang);
  return baris;
}

export async function buatPdfSuratPernyataanSigap(data: SigapSuratPernyataanData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const usableWidth = width - MARGIN_X * 2;
  let y = height - 70;

  function teks(txt: string, x: number, opts: { size?: number; bold?: boolean; align?: "center"; maxWidth?: number } = {}) {
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : font;
    const t = teksAman(txt);
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") xPos = x + (opts.maxWidth - f.widthOfTextAtSize(t, size)) / 2;
    page.drawText(t, { x: xPos, y, size, font: f, color: HITAM });
  }
  function paragraf(txt: string, size = 10, lineHeight = 15) {
    const baris = bungkusTeks(font, teksAman(txt), size, usableWidth);
    baris.forEach((kataArr, idx) => {
      if (idx === baris.length - 1 || kataArr.length === 1) {
        teks(kataArr.join(" "), MARGIN_X, { size });
      } else {
        const total = kataArr.reduce((s, k) => s + font.widthOfTextAtSize(k, size), 0);
        const spasi = (usableWidth - total) / (kataArr.length - 1);
        let x = MARGIN_X;
        for (const k of kataArr) {
          page.drawText(k, { x, y, size, font, color: HITAM });
          x += font.widthOfTextAtSize(k, size) + spasi;
        }
      }
      y -= lineHeight;
    });
  }

  teks("SURAT PERNYATAAN", MARGIN_X, { bold: true, size: 14, align: "center", maxWidth: usableWidth });
  y -= 30;
  paragraf("Yang bertanda tangan dibawah ini:");
  y -= 6;

  const labelWidth = 130;
  const nilaiX = MARGIN_X + 20 + labelWidth + 12;
  const barisIdentitas = (label: string, value: string) => {
    teks(label, MARGIN_X + 20);
    teks(":", MARGIN_X + 20 + labelWidth);
    // Nilai panjang (mis. label jabatan) dibungkus di kolom nilai.
    const baris = bungkusTeks(font, teksAman(value), 10, MARGIN_X + usableWidth - nilaiX);
    baris.forEach((b, i) => {
      teks(b.join(" "), nilaiX);
      if (i < baris.length - 1) y -= 13;
    });
    y -= 18;
  };
  barisIdentitas("Nama", data.namaPetugas || "-");
  barisIdentitas(data.labelId, data.idPetugas || "-");
  barisIdentitas("Jabatan", data.labelJabatan || "-");
  barisIdentitas("Unit Kerja", "BPS Kabupaten Solok");

  const rentang = formatRentangTanggalIndo(data.tanggalMulai, data.tanggalSelesai);
  y -= 12;
  paragraf(
    `Menerangkan bahwa dalam rangka melaksanakan perjalanan dinas dalam kota untuk melaksanakan tugas kedinasan ` +
      `sesuai surat tugas nomor: ${data.nomorSt || "-"}, pelaksanaan tanggal ${rentang}, ` +
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
  const tempat = (data.tempatKedudukan || "").trim() || TEMPAT_KEDUDUKAN_DEFAULT;
  teks(`${tempat}, ${formatTanggalIndo(data.tanggalSelesai)}`, kananX, { align: "center", maxWidth: kananWidth });
  y -= 15;
  teks("Pelaksana Perjalanan Dinas Dalam Kota,", kananX, { align: "center", maxWidth: kananWidth });
  y -= 55;
  teks(data.namaPetugas || "-", kananX, { bold: true, align: "center", maxWidth: kananWidth });
  y -= 13;
  const labelTtd = data.labelId === "NIP" ? "Nip." : "NIK.";
  teks(data.idPetugas ? `${labelTtd} ${data.idPetugas}` : "-", kananX, { align: "center", maxWidth: kananWidth });

  return doc.save();
}
