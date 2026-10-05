// lib/pdf/sigap/visum.ts
//
// (5 Okt 2026) Visum SPJ SIGAP Transport Lokal -- permintaan user.
// SALINAN tata letak lib/pdf/visum.ts (modul penyisiran, meniru Visum_Kosong.pdf, Times 12pt) yg
// dipakai SIGAP tanpa menyentuh file penyisiran. Pemetaan ruas perjalanan SAMA:
//  - Berangkat dari / Tiba kembali di = tempat kedudukan (sigap_akun.alamat_kecamatan, fallback "Solok")
//  - Ke / Tiba di / Berangkat dari (baris II) = rencana tujuan (ST.tujuan digabung koma)
// Utk 1 kelompok tanggal: berangkat & tiba di tujuan = tanggal awal kelompok, berangkat kembali &
// tiba kembali = tanggal akhir kelompok (1 hari -> semua tanggal sama).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { PEJABAT, TEMPAT_KEDUDUKAN_DEFAULT } from "../../spjPejabat";
import { formatTanggalIndo, teksAman } from "./format";

export interface SigapVisumData {
  nomorSt: string;
  namaPetugas: string;
  rencanaTujuan: string;
  tempatKedudukan: string | null;
  tanggalBerangkat: string;
  tanggalTibaTujuan: string;
  tanggalBerangkatKembali: string;
  tanggalTibaKembali: string;
}

const HITAM = rgb(0, 0, 0);
const FONT_SIZE = 12;
const PAGE_W = 595.56;
const PAGE_H = 842.04;
const MARGIN_L = 28.5;
const MARGIN_R = 567.5;
const VDIV_X = 297.8;
const HALF_L_CENTER = (MARGIN_L + VDIV_X) / 2;
const HALF_R_CENTER = (VDIV_X + MARGIN_R) / 2;
const KIRI_LABEL_X = MARGIN_L + 0.7;
const KIRI_COLON_X = 110.2;
const KIRI_VALUE_X = KIRI_COLON_X + 10;
const KANAN_LABEL_X = VDIV_X + 1.3;
const KANAN_COLON_X = 379.5;
const KANAN_VALUE_X = KANAN_COLON_X + 10;

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
  return baris;
}

export async function buatPdfVisumSigap(data: SigapVisumData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const tempat = teksAman((data.tempatKedudukan || TEMPAT_KEDUDUKAN_DEFAULT).trim() || TEMPAT_KEDUDUKAN_DEFAULT);
  const tujuan = teksAman(data.rencanaTujuan || "-");

  function teks(txt: string, x: number, y: number, opts: { bold?: boolean; size?: number } = {}) {
    page.drawText(teksAman(txt), { x, y, size: opts.size ?? FONT_SIZE, font: opts.bold ? fontBold : font, color: HITAM });
  }
  function teksTengah(txt: string, centerX: number, y: number, opts: { bold?: boolean; underline?: boolean } = {}) {
    const f = opts.bold ? fontBold : font;
    const t = teksAman(txt);
    const w = f.widthOfTextAtSize(t, FONT_SIZE);
    const x = centerX - w / 2;
    page.drawText(t, { x, y, size: FONT_SIZE, font: f, color: HITAM });
    if (opts.underline) page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w, y: y - 1.5 }, thickness: 0.6, color: HITAM });
  }
  // Nilai panjang (mis. tujuan beberapa kecamatan) dikecilkan supaya tetap di dalam kolomnya.
  function baris(kolom: "kiri" | "kanan", label: string, nilai: string, y: number) {
    const labelX = kolom === "kiri" ? KIRI_LABEL_X : KANAN_LABEL_X;
    const colonX = kolom === "kiri" ? KIRI_COLON_X : KANAN_COLON_X;
    const valueX = kolom === "kiri" ? KIRI_VALUE_X : KANAN_VALUE_X;
    const batas = (kolom === "kiri" ? VDIV_X : MARGIN_R) - valueX - 3;
    teks(label, labelX, y);
    teks(":", colonX, y);
    let size = FONT_SIZE;
    while (size > 7 && font.widthOfTextAtSize(teksAman(nilai), size) > batas) size -= 0.5;
    teks(nilai, valueX, y, { size });
  }
  function garisH(y: number) {
    page.drawLine({ start: { x: MARGIN_L, y }, end: { x: MARGIN_R, y }, thickness: 1, color: HITAM });
  }

  // Baris I
  baris("kanan", "Berangkat dari", tempat, 768.9);
  teks("(Tempat Kedudukan)", 406, 754.2);
  baris("kanan", "Pada Tanggal", formatTanggalIndo(data.tanggalBerangkat), 739.0);
  baris("kanan", "Ke", tujuan, 723.5);
  teksTengah("Kepala BPS Kabupaten Solok", HALF_R_CENTER, 707.3);
  teksTengah(PEJABAT.kepalaBps.nama, HALF_R_CENTER, 649.6, { bold: true, underline: true });
  teksTengah(`Nip. ${PEJABAT.kepalaBps.nip}`, HALF_R_CENTER, 633.0);
  garisH(631.3);

  // Baris II
  baris("kiri", "Tiba di", tujuan, 616.95);
  baris("kiri", "Pada Tanggal", formatTanggalIndo(data.tanggalTibaTujuan), 601.2);
  baris("kanan", "Berangkat dari", tujuan, 616.95);
  baris("kanan", "Ke", tempat, 601.2);
  baris("kanan", "Pada Tanggal", formatTanggalIndo(data.tanggalBerangkatKembali), 583.56);
  garisH(524.71);

  // Baris III
  baris("kiri", "Tiba di", tempat, 510.36);
  teks("(Tempat Kedudukan)", 137, 495.6);
  baris("kiri", "Pada Tanggal", formatTanggalIndo(data.tanggalTibaKembali), 479.88);
  teksTengah("Pejabat Pembuat Komitmen", HALF_L_CENTER, 449.52);
  teksTengah(PEJABAT.ppk.nama, HALF_L_CENTER, 391.54, { bold: true, underline: true });
  teksTengah(`Nip. ${PEJABAT.ppk.nip}`, HALF_L_CENTER, 375.22);

  const paragrafDiperiksa = [
    "Telah diperiksa dengan keterangan bahwa perjalanan",
    "tersebut atas perintahnya dan semata-mata untuk",
    "kepentingan jabatan dalam waktu yang sesingkat",
    "singkatnya",
  ];
  let yParagraf = 510.36;
  for (const b of paragrafDiperiksa) {
    teks(b, KANAN_LABEL_X, yParagraf);
    yParagraf -= 14.16;
  }
  teksTengah("Pejabat Pembuat Komitmen", HALF_R_CENTER, 450.12);
  teksTengah(PEJABAT.ppk.nama, HALF_R_CENTER, 392.14, { bold: true, underline: true });
  teksTengah(`Nip. ${PEJABAT.ppk.nip}`, HALF_R_CENTER, 375.82);
  garisH(373.61);
  page.drawLine({ start: { x: VDIV_X, y: 783.7 }, end: { x: VDIV_X, y: 373.61 }, thickness: 1, color: HITAM });

  teks("CATATAN LAIN - LAIN", MARGIN_L, 358.78);
  teks("PERHATIAN", MARGIN_L, 343.06);
  teks(":", 109.6, 343.06);
  const PERHATIAN_VALUE_X = 125.5;
  const perhatian =
    "Pejabat yang berwenang menerbitkan SPD pegawai yang melakukan perjalanan dinas para pejabat yang mengesahkan tanggal berangkat/tiba serta bendaharawan bertanggung jawab berdasarkan peraturan-peraturan keuangan Negara apabila Negara menderita rugi akibat kesalahan, kelalaian dan kealpaannya.";
  let yP = 343.06;
  for (const b of bungkusTeks(font, perhatian, FONT_SIZE, MARGIN_R - PERHATIAN_VALUE_X)) {
    teks(b, PERHATIAN_VALUE_X, yP);
    yP -= 14.16;
  }
  // Nomor ST sbg rujukan kecil di bawah catatan (visum penyisiran tidak mencetaknya; di SIGAP nomor
  // visum = nomor ST sesuai keputusan user).
  teks(`Nomor Surat Tugas: ${data.nomorSt || "-"}   ·   Pelaksana: ${data.namaPetugas || "-"}`, MARGIN_L, yP - 10, { size: 9 });

  return doc.save();
}
