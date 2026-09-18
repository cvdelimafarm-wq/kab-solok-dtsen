// lib/pdf/visum.ts
//
// Generator PDF "Visum Perjalanan Dinas Dalam Kota" -- meniru struktur
// formulir visum kosong resmi yang diupload user (2 etape: berangkat ->
// tiba tujuan -> berangkat kembali -> tiba kembali), memakai data RENCANA
// (bukan realisasi) yang diisi petugas di tab Administrasi.
//
// Dipakai oleh app/api/penyisiran/spj/visum/[id]/pdf/route.ts. Nama
// pejabat/NIP & nama kegiatan diambil dari lib/spjPejabat.ts (tetap,
// dikonfirmasi user berlaku utk semua ST) -- TIDAK di-hardcode di sini
// supaya kalau suatu saat pejabatnya ganti, cukup ubah satu file itu saja
// (dipakai juga oleh generator Kwitansi & Surat Keterangan nanti).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalIndo } from "../spjFormat";
import { KEGIATAN_NAMA, PEJABAT, TEMPAT_KEDUDUKAN_DEFAULT } from "../spjPejabat";

export interface VisumPdfData {
  nomorSt: string;
  namaPetugas: string;
  rencanaTujuan: string;
  tempatKedudukan: string | null;
  tanggalBerangkat: string;
  tanggalTibaTujuan: string;
  tanggalBerangkatKembali: string | null;
  tanggalTibaKembali: string | null;
}

const HITAM = rgb(0, 0, 0);

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

export async function buatPdfVisum(data: VisumPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([595.28, 841.89]); // A4 potret
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const marginX = 50;
  const usableWidth = width - marginX * 2;
  const tempat = (data.tempatKedudukan || TEMPAT_KEDUDUKAN_DEFAULT).trim() || TEMPAT_KEDUDUKAN_DEFAULT;

  function teks(
    txt: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxWidth?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : font;
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") {
      xPos = x + (opts.maxWidth - f.widthOfTextAtSize(txt, size)) / 2;
    } else if (opts.maxWidth && opts.align === "right") {
      xPos = x + opts.maxWidth - f.widthOfTextAtSize(txt, size);
    }
    page.drawText(txt, { x: xPos, y, size, font: f, color: HITAM });
  }

  function garisH(x1: number, y: number, x2: number) {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color: HITAM });
  }
  function garisV(x: number, y1: number, y2: number) {
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.75, color: HITAM });
  }

  let y = height - 60;

  // ---------- Kop ----------
  teks("BADAN PUSAT STATISTIK", marginX, y, { bold: true, size: 12, align: "center", maxWidth: usableWidth });
  y -= 15;
  teks("KABUPATEN SOLOK", marginX, y, { bold: true, size: 11, align: "center", maxWidth: usableWidth });
  y -= 20;
  teks("VISUM PERJALANAN DINAS DALAM KOTA", marginX, y, {
    bold: true,
    size: 12,
    align: "center",
    maxWidth: usableWidth,
  });
  y -= 8;
  garisH(marginX, y, width - marginX);
  y -= 22;

  // ---------- Metadata ----------
  const labelWidth = 130;
  function baris(label: string, value: string) {
    teks(label, marginX, y, { size: 10 });
    teks(":", marginX + labelWidth, y, { size: 10 });
    teks(value, marginX + labelWidth + 12, y, { size: 10, bold: true });
    y -= 16;
  }
  baris("Nomor Surat Tugas", data.nomorSt || "-");
  baris("Nama Petugas", data.namaPetugas || "-");
  baris("Kegiatan", KEGIATAN_NAMA);
  baris("Rencana Tujuan", data.rencanaTujuan || "-");
  baris("Tempat Kedudukan", tempat);

  y -= 8;
  garisH(marginX, y, width - marginX);
  y -= 32;

  // ---------- Etape 1: keberangkatan (blok kanan, spt formulir asli) ----------
  const kananX = marginX + usableWidth * 0.5;
  const kananWidth = usableWidth * 0.5;
  teks(`Berangkat dari : ${tempat}`, kananX, y, { size: 10 });
  y -= 15;
  teks(`Pada Tanggal : ${formatTanggalIndo(data.tanggalBerangkat)}`, kananX, y, { size: 10 });
  y -= 15;
  teks(`Ke : ${data.rencanaTujuan || "-"}`, kananX, y, { size: 10 });
  y -= 26;
  teks("Kepala BPS Kabupaten Solok", kananX, y, { size: 10, align: "center", maxWidth: kananWidth });
  y -= 42; // ruang tanda tangan
  teks(PEJABAT.kepalaBps.nama, kananX, y, { size: 10, bold: true, align: "center", maxWidth: kananWidth });
  y -= 13;
  teks(`Nip. ${PEJABAT.kepalaBps.nip}`, kananX, y, { size: 10, align: "center", maxWidth: kananWidth });

  y -= 22;
  garisH(marginX, y, width - marginX);

  // ---------- Grid 2x2: tiba tujuan | berangkat kembali // tiba kembali | diperiksa ----------
  const yGridTop = y;
  const tinggiBaris1 = 60;
  const tinggiBaris2 = 130;
  const yTengah = yGridTop - tinggiBaris1;
  const yGridBawah = yTengah - tinggiBaris2;
  const tengahX = marginX + usableWidth / 2;
  const setengahLebar = usableWidth / 2 - 16;

  page.drawRectangle({
    x: marginX,
    y: yGridBawah,
    width: usableWidth,
    height: yGridTop - yGridBawah,
    borderColor: HITAM,
    borderWidth: 0.75,
  });
  garisH(marginX, yTengah, width - marginX);
  garisV(tengahX, yGridTop, yGridBawah);

  // Kiri-atas: tiba di tujuan
  let cy = yGridTop - 18;
  teks(`Tiba di : ${data.rencanaTujuan || "-"}`, marginX + 8, cy, { size: 10 });
  cy -= 15;
  teks(`Pada Tanggal : ${formatTanggalIndo(data.tanggalTibaTujuan)}`, marginX + 8, cy, { size: 10 });

  // Kanan-atas: berangkat kembali
  let cy2 = yGridTop - 18;
  teks(`Berangkat dari : ${data.rencanaTujuan || "-"}`, tengahX + 8, cy2, { size: 10 });
  cy2 -= 15;
  teks(`Ke : ${tempat}`, tengahX + 8, cy2, { size: 10 });
  cy2 -= 15;
  teks(`Pada Tanggal : ${data.tanggalBerangkatKembali ? formatTanggalIndo(data.tanggalBerangkatKembali) : "-"}`, tengahX + 8, cy2, {
    size: 10,
  });

  // Kiri-bawah: tiba kembali di tempat kedudukan + ttd PPK
  let cy3 = yTengah - 18;
  teks(`Tiba di : ${tempat}`, marginX + 8, cy3, { size: 10 });
  cy3 -= 15;
  teks(`Pada Tanggal : ${data.tanggalTibaKembali ? formatTanggalIndo(data.tanggalTibaKembali) : "-"}`, marginX + 8, cy3, {
    size: 10,
  });
  cy3 -= 18;
  teks("Pejabat Pembuat Komitmen", marginX + 8, cy3, { size: 9, align: "center", maxWidth: setengahLebar });
  cy3 -= 38;
  teks(PEJABAT.ppk.nama, marginX + 8, cy3, { size: 9, bold: true, align: "center", maxWidth: setengahLebar });
  cy3 -= 12;
  teks(`Nip. ${PEJABAT.ppk.nip}`, marginX + 8, cy3, { size: 9, align: "center", maxWidth: setengahLebar });

  // Kanan-bawah: paragraf "telah diperiksa" + ttd PPK
  let cy4 = yTengah - 14;
  const paragraf1 =
    "Telah diperiksa dengan keterangan bahwa perjalanan tersebut atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya";
  for (const l of bungkusTeks(font, paragraf1, 8.5, setengahLebar)) {
    teks(l, tengahX + 8, cy4, { size: 8.5 });
    cy4 -= 11;
  }
  cy4 -= 8;
  teks("Pejabat Pembuat Komitmen", tengahX + 8, cy4, { size: 9, align: "center", maxWidth: setengahLebar });
  cy4 -= 38;
  teks(PEJABAT.ppk.nama, tengahX + 8, cy4, { size: 9, bold: true, align: "center", maxWidth: setengahLebar });
  cy4 -= 12;
  teks(`Nip. ${PEJABAT.ppk.nip}`, tengahX + 8, cy4, { size: 9, align: "center", maxWidth: setengahLebar });

  // ---------- Catatan lain-lain ----------
  y = yGridBawah - 26;
  teks("CATATAN LAIN - LAIN", marginX, y, { bold: true, size: 10 });
  y -= 16;
  const perhatian =
    "PERHATIAN : Pejabat yang berwenang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendaharawan bertanggung jawab berdasarkan peraturan-peraturan keuangan Negara apabila Negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.";
  for (const l of bungkusTeks(font, perhatian, 9, usableWidth)) {
    teks(l, marginX, y, { size: 9 });
    y -= 13;
  }

  return doc.save();
}
