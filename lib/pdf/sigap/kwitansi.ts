// lib/pdf/sigap/kwitansi.ts
//
// (5 Okt 2026) Kwitansi SPJ SIGAP Transport Lokal -- permintaan user.
// SALINAN tata letak lib/pdf/kwitansi.ts (modul penyisiran: Times 12pt, koordinat hasil ukur
// Template Kwitansi.pdf) yg diparameterkan utk SIGAP. File penyisiran TIDAK diubah sama sekali.
// Perbedaan dgn versi penyisiran:
//  - Label & nilai identitas penerima diberikan langsung ("NIK." utk mitra, "Nip." utk organik)
//    -- tidak lewat jabatan PPL/PML penyisiran (lib/spjIdentitas.ts).
//  - Nominal = jumlah hari dibayar dalam 1 kelompok tanggal x tarif peran (dihitung pemanggil).
//  - Teks dibersihkan dgn teksAman() supaya karakter non-WinAnsi tidak menggagalkan PDF.
// Nama & NIP pejabat (Bendahara, PPK) tetap satu sumber: lib/spjPejabat.ts (tanpa dependensi).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { PEJABAT } from "../../spjPejabat";
import { formatRupiah, formatTanggalIndo, teksAman, terbilangRupiah } from "./format";

export interface SigapKwitansiData {
  nomorSt: string;
  /** Tanggal Surat Tugas (sigap_surat_tugas.tanggal_st); null -> "-" (tidak dikarang). */
  tanggalSt: string | null;
  nominal: number;
  /** Tujuan perjalanan (ST.tujuan digabung koma, fallback kecamatan lokasi realisasi). */
  untukPerjalananDinasPada: string;
  /** Tanggal tanda tangan penerima (akhir kelompok tanggal). */
  tanggalKwitansi: string;
  namaPenerima: string;
  labelId: "NIK." | "Nip.";
  idPenerima: string | null;
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 57.44;
const MARGIN_R = 537.84;
const USABLE_W = MARGIN_R - MARGIN_X;
const COLON_X = 202.01;
const VALUE_X = 216.47;
const SUBCOLON_X = 264.66;
const SUBVALUE_X = 279.11;
const Y_KOP1 = 771.54;
const Y_KOP2 = 754.29;
const Y_JUDUL = 717.14;
const Y_GARIS_JUDUL = 713.27;
const Y_TERIMA_DARI = 641.5;
const Y_UANG_SEBESAR = 625.74;
const Y_UNTUK_PEMBAYARAN = 609.99;
const Y_BERDASARKAN = 594.23;
const Y_TANGGAL_ST = 578.47;
const Y_TUJUAN_1 = 562.72;
const Y_TUJUAN_2 = 548.46;
const Y_TERBILANG = 532.71;
const Y_SIG_1 = 474.93;
const Y_SIG_2 = 460.68;
const Y_SIG_3 = 446.42;
const Y_SIG_4 = 432.16;
const Y_SIG_5 = 417.91;
const Y_NAMA = 361.49;
const Y_GARIS_NAMA = Y_NAMA - 2.58;
const Y_NIP = 346.63;

/** Pecah teks panjang jadi beberapa baris selebar maxWidth (greedy per kata). */
function bungkus(f: PDFFont, txt: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const k of txt.split(/\s+/).filter(Boolean)) {
    const coba = cur ? `${cur} ${k}` : k;
    if (f.widthOfTextAtSize(coba, size) > maxWidth && cur) {
      out.push(cur);
      cur = k;
    } else cur = coba;
  }
  if (cur) out.push(cur);
  return out.length ? out : ["-"];
}

export async function buatPdfKwitansiSigap(data: SigapKwitansiData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  // Koordinat Y_* sudah dlm bentuk pdf-lib (dari bawah halaman) -- dipakai apa adanya.
  function teks(txt: string, x: number, y: number, opts: { size?: number; bold?: boolean; align?: "center"; maxWidth?: number } = {}) {
    const size = opts.size ?? 12;
    const f = opts.bold ? fontBold : font;
    const t = teksAman(txt);
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") xPos = x + (opts.maxWidth - f.widthOfTextAtSize(t, size)) / 2;
    page.drawText(t, { x: xPos, y, size, font: f, color: HITAM });
    return f.widthOfTextAtSize(t, size);
  }
  function garisH(x1: number, x2: number, y: number) {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color: HITAM });
  }

  teks("BADAN PUSAT STATISTIK", MARGIN_X, Y_KOP1);
  teks("BPS KAB. SOLOK", MARGIN_X + 25.82, Y_KOP2);
  const lebarJudul = teks("KWITANSI", MARGIN_X, Y_JUDUL, { bold: true, size: 18, align: "center", maxWidth: USABLE_W });
  const judulX = MARGIN_X + (USABLE_W - lebarJudul) / 2;
  garisH(judulX, judulX + lebarJudul, Y_GARIS_JUDUL);

  const baris = (label: string, y: number, value: string, bold = false) => {
    teks(label, MARGIN_X, y);
    teks(":", COLON_X, y);
    teks(value, VALUE_X, y, { bold });
  };
  baris("Sudah terima dari", Y_TERIMA_DARI, "Kuasa Pengguna Anggaran BPS KAB. SOLOK");
  baris("Uang sebesar", Y_UANG_SEBESAR, `Rp. ${formatRupiah(data.nominal)},-`, true);
  baris("Untuk pembayaran", Y_UNTUK_PEMBAYARAN, "Perjalanan Dinas Dalam Kota");

  teks("Berdasarkan Surat Tugas", MARGIN_X, Y_BERDASARKAN);
  teks(":", COLON_X, Y_BERDASARKAN);
  teks("Nomor", VALUE_X, Y_BERDASARKAN);
  teks(":", SUBCOLON_X, Y_BERDASARKAN);
  // Nomor ST panjang dikecilkan supaya tidak melewati margin kanan.
  let ukNomor = 12;
  while (ukNomor > 8 && font.widthOfTextAtSize(teksAman(data.nomorSt || "-"), ukNomor) > MARGIN_R - SUBVALUE_X) ukNomor -= 0.5;
  teks(data.nomorSt || "-", SUBVALUE_X, Y_BERDASARKAN, { size: ukNomor });
  teks("Tanggal", VALUE_X, Y_TANGGAL_ST);
  teks(":", SUBCOLON_X, Y_TANGGAL_ST);
  teks(formatTanggalIndo(data.tanggalSt), SUBVALUE_X, Y_TANGGAL_ST);

  teks("Untuk perjalanan dinas", MARGIN_X, Y_TUJUAN_1);
  teks("dalam kota pada", MARGIN_X, Y_TUJUAN_2);
  teks(":", COLON_X, Y_TUJUAN_1);
  // Tujuan bisa beberapa kecamatan -- maks 2 baris (baris ke-2 sejajar label "dalam kota pada").
  const barisTujuan = bungkus(font, teksAman(data.untukPerjalananDinasPada || "-"), 12, MARGIN_R - VALUE_X);
  teks(barisTujuan[0], VALUE_X, Y_TUJUAN_1);
  if (barisTujuan.length > 1) teks(barisTujuan.slice(1).join(" "), VALUE_X, Y_TUJUAN_2, { size: barisTujuan.length > 2 ? 10 : 12 });

  // Terbilang bisa panjang (mis. jutaan) -- kecilkan bila melewati margin.
  const terbilang = `${terbilangRupiah(data.nominal)} #`;
  let ukTerbilang = 12;
  while (ukTerbilang > 8 && fontBold.widthOfTextAtSize(terbilang, ukTerbilang) > MARGIN_R - VALUE_X) ukTerbilang -= 0.5;
  teks("Terbilang", MARGIN_X, Y_TERBILANG);
  teks(":", COLON_X, Y_TERBILANG);
  teks(terbilang, VALUE_X, Y_TERBILANG, { bold: true, size: ukTerbilang });

  const kolW = USABLE_W / 3;
  const xKol = [MARGIN_X, MARGIN_X + kolW, MARGIN_X + kolW * 2];
  const tengah = (i: number, txt: string, y: number, opts: { bold?: boolean; size?: number } = {}) => teks(txt, xKol[i], y, { ...opts, align: "center", maxWidth: kolW });

  tengah(0, "Bendahara Pengeluaran", Y_SIG_1);
  tengah(1, "Setuju dibayar", Y_SIG_1);
  tengah(2, "Yang menerima,", Y_SIG_1);
  tengah(0, "BPS", Y_SIG_2);
  tengah(2, `Solok, ${formatTanggalIndo(data.tanggalKwitansi)}`, Y_SIG_3);
  tengah(0, "Lunas pada", Y_SIG_4);
  tengah(1, "Pejabat Pembuat Komitmen", Y_SIG_4);
  tengah(0, "tanggal,", Y_SIG_5); // sengaja tanpa nilai -- diisi tangan oleh Bendahara

  const namaKol = [PEJABAT.bendaharaPengeluaran.nama, PEJABAT.ppk.nama, data.namaPenerima || "-"];
  const idKol = [`Nip. ${PEJABAT.bendaharaPengeluaran.nip}`, `Nip. ${PEJABAT.ppk.nip}`, data.idPenerima ? `${data.labelId} ${data.idPenerima}` : "-"];
  namaKol.forEach((nama, i) => {
    let size = 12;
    while (size > 8 && fontBold.widthOfTextAtSize(teksAman(nama), size) > kolW - 6) size -= 0.5;
    const lebar = tengah(i, nama, Y_NAMA, { bold: true, size });
    const xMulai = xKol[i] + (kolW - lebar) / 2;
    garisH(xMulai, xMulai + lebar, Y_GARIS_NAMA);
  });
  idKol.forEach((idTxt, i) => {
    let size = 12;
    while (size > 7 && font.widthOfTextAtSize(teksAman(idTxt), size) > kolW - 6) size -= 0.5;
    tengah(i, idTxt, Y_NIP, { size });
  });

  return doc.save();
}
