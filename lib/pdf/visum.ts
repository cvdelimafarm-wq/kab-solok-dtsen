// lib/pdf/visum.ts
//
// Generator PDF "Visum" -- MENIRU PERSIS desain/spasi/font/tata letak
// formulir visum kosong ASLI yang diupload user (Visum_Kosong.pdf, hasil
// export dari Word, font Times New Roman 12pt, tabel 3 baris + vertical
// divider di tengah, TANPA kop/header apa pun -- cuma tabel itu saja).
// Versi SEBELUMNYA (kop "BADAN PUSAT STATISTIK"/"KABUPATEN SOLOK" + blok
// metadata Nomor ST/Nama Petugas/dst + font Helvetica + kotak grid 2x2)
// SUDAH TIDAK DIPAKAI -- diganti total krn user minta "desain, spasi,
// font, tata letak semuanya dibikin persis seperti ini" (mengacu ke
// Visum_Kosong.pdf), bukan desain custom.
//
// Semua koordinat teks & garis di bawah diukur LANGSUNG dari
// Visum_Kosong.pdf (pdftotext -bbox-layout + pikepdf content stream, page
// 595.56 x 842.04pt / A4) supaya hasilnya semirip mungkin dgn aslinya --
// BUKAN dikira-kira.
//
// Pemetaan RUAS PERJALANAN ke label formulir (pulang-pergi 1 hari, sesuai
// konfirmasi user, "catatan tambahan" persis kata2nya):
//  - Berangkat dari : (kecamatan ALAMAT PETUGAS)   -- baris I (kanan atas)
//  - Pada Tanggal   : (tanggal tugas)                baris I
//  - Ke             : (kecamatan WILAYAH TUGAS)      baris I
//  - Tiba di        : (kecamatan wilayah tugas)     -- baris II kiri
//  - Pada Tanggal   : (tanggal tugas, 1 hari sama)   baris II kiri
//  - Berangkat dari : (kecamatan wilayah tugas)     -- baris II kanan
//  - Ke             : (kecamatan alamat petugas)     baris II kanan
//  - Pada Tanggal   : (tanggal tugas)                baris II kanan
//  - Tiba di        : (kecamatan alamat petugas)    -- baris III kiri
// Field `tempatKedudukan` = "kecamatan alamat petugas", `rencanaTujuan` =
// "kecamatan wilayah tugas" -- SUDAH dipetakan begini dari awal di kode
// ini (lihat git blame versi sebelumnya), TIDAK berubah, cuma tampilannya
// yg dirombak total. Ke-4 kolom tanggal (berangkat/tiba tujuan/berangkat
// kembali/tiba kembali) SUDAH diisi tanggal yg SAMA oleh
// app/api/penyisiran/spj/visum/route.ts (form cuma minta 1 "Tanggal
// Pelaksanaan") -- persis memenuhi "1 hari yang sama".
//
// Dipakai oleh app/api/penyisiran/spj/visum/[id]/pdf/route.ts. Nama
// pejabat/NIP diambil dari lib/spjPejabat.ts (TIDAK di-hardcode di sini).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalIndo } from "../spjFormat";
import { PEJABAT, TEMPAT_KEDUDUKAN_DEFAULT } from "../spjPejabat";

export interface VisumPdfData {
  nomorSt: string;
  namaPetugas: string;
  rencanaTujuan: string; // kecamatan WILAYAH TUGAS
  tempatKedudukan: string | null; // kecamatan ALAMAT PETUGAS
  tanggalBerangkat: string;
  tanggalTibaTujuan: string;
  tanggalBerangkatKembali: string | null;
  tanggalTibaKembali: string | null;
}

const HITAM = rgb(0, 0, 0);
const FONT_SIZE = 12;

// Ukuran halaman PERSIS Visum_Kosong.pdf (pdfinfo: 595.56 x 842.04pt / A4).
const PAGE_W = 595.56;
const PAGE_H = 842.04;

// Batas kiri/kanan tabel & posisi garis vertikal tengah -- diukur dari
// rect sel tabel di content stream PDF asli (kolom kiri x=28.68..297.43,
// kolom kanan x=298.87..567.48).
const MARGIN_L = 28.5;
const MARGIN_R = 567.5;
const VDIV_X = 297.8; // garis vertikal pemisah kolom kiri/kanan
const HALF_L_CENTER = (MARGIN_L + VDIV_X) / 2;
const HALF_R_CENTER = (VDIV_X + MARGIN_R) / 2;
const HALF_L_W = VDIV_X - MARGIN_L;
const HALF_R_W = MARGIN_R - VDIV_X;

// Tab-stop kolom label/titik-dua -- diukur dari posisi ":" tiap baris di
// PDF asli (SELALU sejajar per kolom, walau panjang labelnya beda2 --
// persis gaya tab-stop Word).
const KIRI_LABEL_X = MARGIN_L + 0.7;
const KIRI_COLON_X = 110.2;
const KIRI_VALUE_X = KIRI_COLON_X + 10;
const KANAN_LABEL_X = VDIV_X + 1.3;
const KANAN_COLON_X = 379.5;
const KANAN_VALUE_X = KANAN_COLON_X + 10;

export async function buatPdfVisum(data: VisumPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const tempat = (data.tempatKedudukan || TEMPAT_KEDUDUKAN_DEFAULT).trim() || TEMPAT_KEDUDUKAN_DEFAULT;
  const tujuan = data.rencanaTujuan || "-";

  function teks(txt: string, x: number, y: number, opts: { bold?: boolean } = {}) {
    page.drawText(txt, { x, y, size: FONT_SIZE, font: opts.bold ? fontBold : font, color: HITAM });
  }

  // Teks rata tengah di dalam satu kolom (lebar half_w, pusat centerX) --
  // dipakai utk "Kepala BPS.../Pejabat Pembuat Komitmen"/nama & NIP
  // pejabat, PERSIS posisi tengah kolom spt di formulir asli.
  function teksTengah(txt: string, centerX: number, y: number, opts: { bold?: boolean; underline?: boolean } = {}) {
    const f = opts.bold ? fontBold : font;
    const w = f.widthOfTextAtSize(txt, FONT_SIZE);
    const x = centerX - w / 2;
    page.drawText(txt, { x, y, size: FONT_SIZE, font: f, color: HITAM });
    if (opts.underline) {
      page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w, y: y - 1.5 }, thickness: 0.6, color: HITAM });
    }
  }

  // Baris "Label : nilai" pada tab-stop kolom kiri/kanan -- SAMA PERSIS
  // pola label/titik-dua/nilai di formulir asli (lihat komentar tab-stop
  // di atas).
  function baris(kolom: "kiri" | "kanan", label: string, nilai: string, y: number) {
    const labelX = kolom === "kiri" ? KIRI_LABEL_X : KANAN_LABEL_X;
    const colonX = kolom === "kiri" ? KIRI_COLON_X : KANAN_COLON_X;
    const valueX = kolom === "kiri" ? KIRI_VALUE_X : KANAN_VALUE_X;
    teks(label, labelX, y);
    teks(":", colonX, y);
    teks(nilai, valueX, y);
  }

  function garisH(y: number) {
    page.drawLine({ start: { x: MARGIN_L, y }, end: { x: MARGIN_R, y }, thickness: 1, color: HITAM });
  }

  // ---------- Baris I: berangkat dari tempat kedudukan (blok kanan atas
  // saja -- kolom kiri SENGAJA kosong, PERSIS formulir asli). ----------
  baris("kanan", "Berangkat dari", tempat, 768.9);
  teks("(Tempat Kedudukan)", 406, 754.2);
  baris("kanan", "Pada Tanggal", formatTanggalIndo(data.tanggalBerangkat), 739.0);
  baris("kanan", "Ke", tujuan, 723.5);
  teksTengah("Kepala BPS Kabupaten Solok", HALF_R_CENTER, 707.3);
  teksTengah(PEJABAT.kepalaBps.nama, HALF_R_CENTER, 649.6, { bold: true, underline: true });
  teksTengah(`Nip. ${PEJABAT.kepalaBps.nip}`, HALF_R_CENTER, 633.0);

  garisH(631.3);

  // ---------- Baris II: tiba di tujuan (kiri) // berangkat kembali (kanan) ----------
  baris("kiri", "Tiba di", tujuan, 616.95);
  baris("kiri", "Pada Tanggal", formatTanggalIndo(data.tanggalTibaTujuan), 601.2);

  baris("kanan", "Berangkat dari", tujuan, 616.95);
  baris("kanan", "Ke", tempat, 601.2);
  baris(
    "kanan",
    "Pada Tanggal",
    data.tanggalBerangkatKembali ? formatTanggalIndo(data.tanggalBerangkatKembali) : "-",
    583.56
  );

  garisH(524.71);

  // ---------- Baris III: tiba kembali di tempat kedudukan (kiri) // diperiksa PPK (kanan) ----------
  baris("kiri", "Tiba di", tempat, 510.36);
  teks("(Tempat Kedudukan)", 137, 495.6);
  baris(
    "kiri",
    "Pada Tanggal",
    data.tanggalTibaKembali ? formatTanggalIndo(data.tanggalTibaKembali) : "-",
    479.88
  );
  teksTengah("Pejabat Pembuat Komitmen", HALF_L_CENTER, 449.52);
  teksTengah(PEJABAT.ppk.nama, HALF_L_CENTER, 391.54, { bold: true, underline: true });
  teksTengah(`Nip. ${PEJABAT.ppk.nip}`, HALF_L_CENTER, 375.22);

  // Paragraf "Telah diperiksa..." -- PERSIS 4 baris spt formulir asli
  // (bukan hasil word-wrap otomatis, supaya potongan barisnya sama).
  const paragrafDiperiksa = [
    "Telah diperiksa dengan keterangan bahwa perjalanan",
    "tersebut atas perintahnya dan semata-mata untuk",
    "kepentingan jabatan dalam waktu yang sesingkat",
    "singkatnya",
  ];
  let yParagraf = 510.36;
  for (const baris1 of paragrafDiperiksa) {
    teks(baris1, KANAN_LABEL_X, yParagraf);
    yParagraf -= 14.16;
  }
  teksTengah("Pejabat Pembuat Komitmen", HALF_R_CENTER, 450.12);
  teksTengah(PEJABAT.ppk.nama, HALF_R_CENTER, 392.14, { bold: true, underline: true });
  teksTengah(`Nip. ${PEJABAT.ppk.nip}`, HALF_R_CENTER, 375.82);

  garisH(373.61);

  // Garis vertikal pemisah kolom kiri/kanan -- SATU garis menyambung dari
  // atas baris I s/d bawah baris III (persis formulir asli: kolom kiri
  // baris I memang kosong, tapi garisnya tetap ada).
  page.drawLine({ start: { x: VDIV_X, y: 783.7 }, end: { x: VDIV_X, y: 373.61 }, thickness: 1, color: HITAM });

  // ---------- Catatan lain-lain (full width, tanpa kotak/border) ----------
  teks("CATATAN LAIN - LAIN", MARGIN_L, 358.78);
  teks("PERHATIAN", MARGIN_L, 343.06);
  teks(":", 109.6, 343.06);
  const PERHATIAN_VALUE_X = 125.5;
  const perhatianText =
    "Pejabat yang berwenang menerbitkan SPD pegawai yang melakukan perjalanan dinas para pejabat yang mengesahkan tanggal berangkat/tiba serta bendaharawan bertanggung jawab berdasarkan peraturan-peraturan keuangan Negara apabila Negara menderita rugi akibat kesalahan, kelalaian dan kealpaannya.";
  const lebarPerhatian = MARGIN_R - PERHATIAN_VALUE_X;
  let yPerhatian = 343.06;
  for (const baris2 of bungkusTeks(font, perhatianText, FONT_SIZE, lebarPerhatian)) {
    teks(baris2, PERHATIAN_VALUE_X, yPerhatian);
    yPerhatian -= 14.16;
  }

  return doc.save();
}

// Word-wrap sederhana (greedy) -- cuma dipakai utk paragraf PERHATIAN,
// yang panjangnya bisa berubah suatu saat (beda dari paragraf "Telah
// diperiksa" yang isinya baku 4 baris, jadi di-hardcode langsung di atas).
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
