// lib/pdf/kwitansi.ts
//
// Generator PDF "Kwitansi" -- MENIRU PERSIS desain/spasi/font Template
// Kwitansi.pdf (contoh TERISI) yang diupload user: font Times New Roman
// (Times-Roman/Times-Bold, BUKAN Helvetica spt versi lama), ukuran 12pt
// (judul 18pt), garis bawah HANYA selebar teks "KWITANSI" & selebar nama
// penandatangan (BUKAN garis pemisah selebar halaman spt versi lama).
// Semua koordinat X/Y teks di bawah diukur LANGSUNG dari PDF contoh tsb
// (PyMuPDF page.get_text("dict"), origin=baseline tiap span, dikonversi ke
// koordinat pdf-lib lewat yPdfLib = PAGE_H - yMuPdf) -- BUKAN ditaksir. Jadi
// tiap konstanta Y_* di bawah SUDAH dlm bentuk yPdfLib (siap pakai LANGSUNG
// sbg argumen `y` pdf-lib, TANPA dikurangkan dari PAGE_H lagi -- lihat bug
// besar yg pernah kejadian krn ini, komentar panjang di teks()/garisH()).
// Pengecualian: kolom "Nama + Nip./Nik." (3 tanda tangan) DIBUAT 3 kolom
// SAMA LEBAR & DIPUSATKAN (bukan x hasil ukur PERSIS dari contoh) krn
// nama/nomor identitas panjangnya beda2 tiap petugas -- pendekatan ini
// TERBUKTI cocok dgn contoh: label "Pejabat Pembuat Komitmen" & nama
// "Novriady,S.Ak" di contoh PERSIS berpusat di x=297,64 = TEPAT tengah
// halaman (595,28/2), yaitu tengah kolom-2 dari 3 kolom sama lebar itu.
//
// PERBEDAAN dgn versi lama (koreksi permintaan user 22 Sep 2026):
//  - Font Times New Roman 12pt (bukan Helvetica 10,5/9,5pt).
//  - "Berdasarkan SPD" -> "Berdasarkan Surat Tugas" (nomor yg dicetak
//    memang SELALU nomor Surat Tugas, `data.nomorSt`, BUKAN nomor SPD
//    terpisah -- tidak ada kolom nomor SPD tersendiri di sistem).
//  - NIP Bendahara/PPK SELALU 1 baris (versi lama/contoh asli sempat
//    "kepotong" 2 baris krn kolom terlalu sempit -- lebar kolom skrg
//    dihitung dari 1/3 lebar isi, cukup lega utk NIP 18 digit).
//  - Baris "Yang menerima" pakai NIK utk PPL & NIP utk PML/lainnya, LABEL
//    ikut berubah ("Nik."/"Nip.") sesuai `data.jabatanPenerima` (kolom
//    petugas_penyisiran_akun.jabatan) -- lihat labelIdentitas().
//  - Baris "Lunas pada / tanggal," DIBIARKAN KOSONG (label saja, TANPA
//    nilai) sesuai contoh asli -- ini kolom utk Bendahara isi TANGAN saat
//    kwitansi benar2 dibayar, BUKAN field yg dikelola sistem (versi lama
//    keliru mengisinya otomatis dgn tanggalKwitansi).
//
// Dua kolom pertama tanda tangan (Bendahara Pengeluaran & PPK) SELALU sama
// (lib/spjPejabat.ts, dikonfirmasi user berlaku tetap utk semua ST); kolom
// "Yang menerima" dinamis sesuai petugas yg membuat kwitansi ini.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatRupiah, formatTanggalIndo } from "../spjFormat";
import { PEJABAT } from "../spjPejabat";
import { labelIdentitas, bersihkanNip } from "../spjIdentitas";

export interface KwitansiPdfData {
  nomorSt: string;
  tanggalSpd: string;
  nominal: number;
  terbilang: string;
  untukPerjalananDinasPada: string;
  tanggalKwitansi: string;
  namaPenerima: string;
  /** NIK (kalau PPL) atau NIP (kalau PML/lainnya) -- lihat `jabatanPenerima`. */
  idPenerima: string | null;
  /** 'ppl' | 'pml' | 'kepala_kantor' | null -- dari petugas_penyisiran_akun.jabatan; null utk jenis "tetangga" (tabel itu tidak py kolom jabatan, tetap label "NIK."). Logic label/pembersihan Sobat ID-NIP SEKARANG di lib/spjIdentitas.ts (dipakai bareng dgn Surat Pernyataan). */
  jabatanPenerima: string | null;
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const PAGE_H = A4[1];
const MARGIN_X = 57.44;
const MARGIN_R = 537.84;
const USABLE_W = MARGIN_R - MARGIN_X;

// ---------- Kolom label/colon/value (blok isi kwitansi) -- diukur dari contoh ----------
const COLON_X = 202.01;
const VALUE_X = 216.47;
const SUBLABEL_X = VALUE_X; // "Nomor"/"Tanggal" di bawah "Berdasarkan Surat Tugas" numpang di kolom value
const SUBCOLON_X = 264.66;
const SUBVALUE_X = 279.11;

// ---------- Y tiap baris (dikonversi dari origin baseline PyMuPDF: PAGE_H - yMuPdf) ----------
const Y_KOP1 = 771.54; // "BADAN PUSAT STATISTIK"
const Y_KOP2 = 754.29; // "BPS KAB. SOLOK"
const Y_JUDUL = 717.14; // "KWITANSI"
const Y_GARIS_JUDUL = 713.27;
const Y_TERIMA_DARI = 641.5;
const Y_UANG_SEBESAR = 625.74;
const Y_UNTUK_PEMBAYARAN = 609.99;
const Y_BERDASARKAN = 594.23; // + sub-baris "Nomor"
const Y_TANGGAL_SPD = 578.47; // sub-baris "Tanggal"
const Y_TUJUAN_1 = 562.72; // "Untuk perjalanan dinas" (baris 1 label 2-baris)
const Y_TUJUAN_2 = 548.46; // "dalam kota pada" (baris 2, tanpa colon/value sendiri)
const Y_TERBILANG = 532.71;

const Y_SIG_1 = 474.93; // "Bendahara Pengeluaran" | "Setuju dibayar" | "Yang menerima,"
const Y_SIG_2 = 460.68; // "BPS" (lanjutan kol-1 saja)
const Y_SIG_3 = 446.42; // "Solok, {tanggal}" (kol-3 saja)
const Y_SIG_4 = 432.16; // "Lunas pada" | "Pejabat Pembuat Komitmen"
const Y_SIG_5 = 417.91; // "tanggal," (lanjutan kol-1 saja, TANPA nilai -- lihat komentar header)
const Y_NAMA = 361.49; // nama bold (Alex Kandria / Novriady / [penerima])
// Garis bawah nama = 2,58pt DI BAWAH baseline (dicocokkan PERSIS ke Template
// Kwitansi.pdf: baseline nama yPdfLib 480,40 vs garis 482,98 dlm satuan
// yMuPdf mentah -- 482,98 LEBIH BESAR = lebih ke BAWAH scr visual, tapi
// setelah dikonversi ke yPdfLib (PAGE_H - yMuPdf) urutannya kebalik jadi
// LEBIH KECIL drpd baseline, krn yPdfLib naik ke ATAS). Makanya DI SINI
// (satuan yPdfLib) rumusnya MINUS, bukan plus -- lihat juga komentar
// panjang di teks()/garisH() soal bug besar yg sempat kejadian gara2 ini.
const Y_GARIS_NAMA = Y_NAMA - 2.58;
const Y_NIP = 346.63;

export async function buatPdfKwitansi(data: KwitansiPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  // BUG BESAR (lapor user 24 Sep 2026, screenshot "hasil output" terbalik
  // atas-bawah -- header "BADAN PUSAT STATISTIK"/"KWITANSI" nyasar ke bawah
  // halaman, blok tanda tangan nyasar ke tengah-atas): konstanta Y_* di atas
  // SUDAH dlm bentuk yPdfLib jadi (yaitu SUDAH = PAGE_H - yMuPdf, lihat
  // komentar header file) -- tapi dua fungsi ini dulu MENGURANGKAN LAGI dari
  // PAGE_H (`y: PAGE_H - yAtas`), jadi dobel konversi & baliknya balik lagi
  // ke yMuPdf (ukuran dari ATAS halaman) TAPI dipakai LANGSUNG sbg
  // koordinat pdf-lib (yang dari BAWAH halaman) -- efeknya SELURUH isi
  // kwitansi tercermin terbalik scr vertikal. Dibuktikan dgn ukur PERSIS:
  // "BADAN PUSAT STATISTIK" di Template Kwitansi.pdf ada di yMuPdf=70,35
  // (dkt atas) -- Y_KOP1 di sini = 771,54 = PAGE_H(841,89) - 70,35, PERSIS
  // yPdfLib-nya. Jadi yAtas di bawah TIDAK PERLU (& TIDAK BOLEH) dikurangkan
  // dari PAGE_H lagi -- pakai APA ADANYA sbg argumen `y` pdf-lib.
  function teks(
    txt: string,
    x: number,
    yAtas: number,
    opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxWidth?: number } = {}
  ) {
    const size = opts.size ?? 12;
    const f: PDFFont = opts.bold ? fontBold : font;
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") xPos = x + (opts.maxWidth - f.widthOfTextAtSize(txt, size)) / 2;
    else if (opts.maxWidth && opts.align === "right") xPos = x + opts.maxWidth - f.widthOfTextAtSize(txt, size);
    page.drawText(txt, { x: xPos, y: yAtas, size, font: f, color: HITAM });
    return f.widthOfTextAtSize(txt, size);
  }
  function garisH(x1: number, x2: number, yAtas: number) {
    page.drawLine({ start: { x: x1, y: yAtas }, end: { x: x2, y: yAtas }, thickness: 0.75, color: HITAM });
  }

  // ---------- Kop ----------
  teks("BADAN PUSAT STATISTIK", MARGIN_X, Y_KOP1);
  teks("BPS KAB. SOLOK", MARGIN_X + 25.82, Y_KOP2);
  const lebarJudul = teks("KWITANSI", MARGIN_X, Y_JUDUL, { bold: true, size: 18, align: "center", maxWidth: USABLE_W });
  const judulX = MARGIN_X + (USABLE_W - lebarJudul) / 2;
  garisH(judulX, judulX + lebarJudul, Y_GARIS_JUDUL);

  // ---------- Isi ----------
  const baris = (label: string, yAtas: number, value: string, opts: { bold?: boolean } = {}) => {
    teks(label, MARGIN_X, yAtas);
    teks(":", COLON_X, yAtas);
    teks(value, VALUE_X, yAtas, { bold: opts.bold });
  };
  baris("Sudah terima dari", Y_TERIMA_DARI, "Kuasa Pengguna Anggaran BPS KAB. SOLOK");
  baris("Uang sebesar", Y_UANG_SEBESAR, `Rp. ${formatRupiah(data.nominal)},-`, { bold: true });
  baris("Untuk pembayaran", Y_UNTUK_PEMBAYARAN, "Perjalanan Dinas Dalam Kota");

  teks("Berdasarkan Surat Tugas", MARGIN_X, Y_BERDASARKAN);
  teks(":", COLON_X, Y_BERDASARKAN);
  teks("Nomor", SUBLABEL_X, Y_BERDASARKAN);
  teks(":", SUBCOLON_X, Y_BERDASARKAN);
  teks(data.nomorSt, SUBVALUE_X, Y_BERDASARKAN);
  teks("Tanggal", SUBLABEL_X, Y_TANGGAL_SPD);
  teks(":", SUBCOLON_X, Y_TANGGAL_SPD);
  teks(formatTanggalIndo(data.tanggalSpd), SUBVALUE_X, Y_TANGGAL_SPD);

  teks("Untuk perjalanan dinas", MARGIN_X, Y_TUJUAN_1);
  teks("dalam kota pada", MARGIN_X, Y_TUJUAN_2);
  teks(":", COLON_X, Y_TUJUAN_1);
  teks(data.untukPerjalananDinasPada || "-", VALUE_X, Y_TUJUAN_1);

  baris("Terbilang", Y_TERBILANG, `${data.terbilang} #`, { bold: true });

  // ---------- 3 kolom tanda tangan (sama lebar, dipusatkan) ----------
  const kolW = USABLE_W / 3;
  const xKol = [MARGIN_X, MARGIN_X + kolW, MARGIN_X + kolW * 2];
  const tengah = (i: number, txt: string, yAtas: number, opts: { bold?: boolean; size?: number } = {}) =>
    teks(txt, xKol[i], yAtas, { ...opts, align: "center", maxWidth: kolW });

  tengah(0, "Bendahara Pengeluaran", Y_SIG_1);
  tengah(1, "Setuju dibayar", Y_SIG_1);
  tengah(2, "Yang menerima,", Y_SIG_1);
  tengah(0, "BPS", Y_SIG_2);
  tengah(2, `Solok, ${formatTanggalIndo(data.tanggalKwitansi)}`, Y_SIG_3);
  tengah(0, "Lunas pada", Y_SIG_4);
  tengah(1, "Pejabat Pembuat Komitmen", Y_SIG_4);
  tengah(0, "tanggal,", Y_SIG_5); // sengaja TANPA nilai -- lihat komentar header (diisi tangan oleh Bendahara)

  const labelPenerima = labelIdentitas(data.jabatanPenerima);
  const idPenerimaBersih = bersihkanNip(data.idPenerima, data.jabatanPenerima);
  const namaKol = [PEJABAT.bendaharaPengeluaran.nama, PEJABAT.ppk.nama, data.namaPenerima];
  const idKol = [
    `Nip. ${PEJABAT.bendaharaPengeluaran.nip}`,
    `Nip. ${PEJABAT.ppk.nip}`,
    idPenerimaBersih ? `${labelPenerima} ${idPenerimaBersih}` : "-",
  ];
  namaKol.forEach((nama, i) => {
    const lebar = tengah(i, nama, Y_NAMA, { bold: true });
    const xMulai = xKol[i] + (kolW - lebar) / 2;
    garisH(xMulai, xMulai + lebar, Y_GARIS_NAMA);
  });
  // BUG lain yg ketemu sekalian (contoh 01_Adriyanto.pdf: ID kolom "Yang
  // menerima" 34 karakter -- lebih panjang dari NIP 18 digit biasa yg jadi
  // asumsi lebar kolom, lihat komentar header -- nempel ke kolom sebelah
  // krn "tengah()" cuma pusatkan teks TANPA batasi lebarnya) -- kecilkan
  // ukuran font kalau ID lebih lebar dari kolomnya (dikurangi sedikit
  // padding) supaya SELALU muat 1 baris di kolomnya sendiri, tidak pernah
  // nyerempet ke kolom tetangga.
  const PADDING_KOL_ID = 6;
  idKol.forEach((idTxt, i) => {
    let size = 12;
    const lebarMaksimal = kolW - PADDING_KOL_ID;
    while (size > 7 && font.widthOfTextAtSize(idTxt, size) > lebarMaksimal) size -= 0.5;
    tengah(i, idTxt, Y_NIP, { size });
  });

  return doc.save();
}
