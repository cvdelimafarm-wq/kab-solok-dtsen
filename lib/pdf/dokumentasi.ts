// lib/pdf/dokumentasi.ts
//
// Generator PDF "Lampiran Dokumentasi Kegiatan SE2026" -- meniru PERSIS
// desain contoh yang diberikan user
// (Lampiran_Dokumentasi_SE2026_Mega_Nana_Yulianti.pdf, dihasilkan skrip
// Python reportlab): pita header navy+oranye, judul, blok identitas
// (3 baris, baris "Lokasi" selebar penuh), seksi "DOKUMENTASI FOTO" dgn
// grid kartu foto (2/3/4 kolom otomatis sesuai jumlah foto), footer.
// Ukuran/posisi diukur LANGSUNG dari PDF contoh tsb (pdftotext
// -bbox-layout + parsing content-stream pikepdf), sama metodologi dgn
// lib/pdf/laporan.ts & lib/pdf/visum.ts -- banyak konstanta (pita header,
// blok identitas, kotak judul seksi) SAMA PERSIS dgn desain Laporan krn
// satu sistem desain.
//
// PERBEDAAN UTAMA dgn versi lama: field "Lokasi" TIDAK LAGI dibaca dari
// rekap_snapshot milik Laporan (yg bisa kosong kalau petugas belum
// membuat Laporan utk tanggal itu -- inilah sebab PDF contoh user sendiri
// menunjukkan "-"), melainkan dihitung LANGSUNG lewat
// lib/spjLokasiTugas.ts (dipanggil oleh route pemanggil, BUKAN di sini --
// generator ini cuma menerima teks `lokasi` yg sudah jadi, supaya file
// ini tetap murni presentasi/PDF, tanpa bergantung Supabase).

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import sharp from "sharp";
import { formatTanggalIndoDenganHari } from "../spjFormat";
import { KEGIATAN_NAMA } from "../spjPejabat";
import { SLOT_LABELS } from "../spjDokumentasi";

// pdf-lib (embedJpg/embedPng di bawah) MENGABAIKAN tag EXIF "Orientation"
// -- selalu menaruh piksel APA ADANYA. Kamera HP (terutama Android) sering
// menyimpan foto dgn piksel dlm orientasi "mentah" sensor lalu menandai
// tag EXIF spy galeri/browser memutar-balikkannya saat ditampilkan; hasilnya
// foto tampil BENAR di galeri HP/preview browser tapi TERBALIK/miring di
// PDF ini kalau tag itu tidak ditangani manual. sharp(...).rotate() TANPA
// argumen membaca tag itu, MEMUTAR PIKSEL SUNGGUHAN sesuai arah yg benar,
// lalu me-reset tag orientasinya -- setelah ini pdf-lib akan menyisipkan
// piksel yg SUDAH tegak, tanpa perlu tahu apa-apa soal EXIF.
async function perbaikiOrientasiFoto(bytes: Uint8Array, contentType: string): Promise<Uint8Array> {
  try {
    const img = sharp(Buffer.from(bytes)).rotate();
    const keluar = contentType === "image/png" ? await img.png().toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
    return new Uint8Array(keluar);
  } catch {
    // Gagal diproses (mis. bukan file gambar valid) -- pakai bytes ASLI
    // apa adanya, biar tetap dicoba doc.embedJpg/embedPng di pemanggil
    // (yg py fallback tersendiri kalau itu jg gagal) drpd PDF gagal total.
    return bytes;
  }
}

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

// ---------- Ukuran halaman & warna (SAMA dgn lib/pdf/laporan.ts) ----------

const MM = 2.834645669;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 20 * MM; // 56.69
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 481.89
const CONTENT_L = MARGIN_X;
const CONTENT_R = PAGE_W - MARGIN_X;
const CONTENT_MID = MARGIN_X + CONTENT_W / 2;

const BUDGET_TOP = 19 * MM; // 53.86
const BUDGET_BOTTOM = PAGE_H - 19 * MM; // 788.03

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
const GAP_SUBTITLE_TO_GRID = 10.25;
const GRID_ROW_H = 39.5;
const GRID_LABEL_OFFSET = 9.0;
const GRID_VALUE_OFFSET = 21.5;
const GRID_VALUE_LEADING = 13.0;
const GRID_PAD_X = 12.0; // padding kiri-kanan sel identitas (sesuai spesifikasi user: 12pt)
const GAP_GRID_TO_SECTION = 14.0;
const SECTION_BOX_W = 3 * MM;
const SECTION_BOX_H = 16.0;
const SECTION_TITLE_GAP_X = 7.0;
const SECTION_TITLE_TEXT_OFFSET = 4.0;
const GAP_SECTIONTITLE_TO_GRIDFOTO = 8.0;

const CARD_GAP = 5 * MM;
const CARD_HEADER_H = 23.0;
const PAD_FOTO = 3 * MM;

const FOOTER_LINE_DARI_BAWAH = 38.27;
const FOOTER_TEXT_DARI_BAWAH = 31.9;
const FOOTER_SIZE = 8.5;

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
  return baris.length > 0 ? baris : [""];
}

/** 1-2 foto -> 2 kolom, 3-6 -> 3 kolom, >6 -> 4 kolom (sesuai spesifikasi user). */
function jumlahKolom(n: number): number {
  if (n <= 2) return 2;
  if (n <= 6) return 3;
  return 4;
}

export async function buatPdfDokumentasi(data: DokumentasiPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  function teks(
    txt: string,
    x: number,
    yAtas: number,
    size: number,
    opts: { bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; width?: number } = {}
  ) {
    const f = opts.bold ? fontBold : font;
    const color = opts.color ?? TEXT;
    let xPos = x;
    if (opts.width && opts.align === "right") xPos = x + opts.width - f.widthOfTextAtSize(txt, size);
    else if (opts.width && opts.align === "center") xPos = x + (opts.width - f.widthOfTextAtSize(txt, size)) / 2;
    const yBaseline = PAGE_H - yAtas - size * 0.8;
    page.drawText(txt, { x: xPos, y: yBaseline, size, font: f, color });
  }
  function kotak(x: number, yAtas: number, w: number, h: number, opts: { fill?: RGB; border?: RGB; borderWidth?: number } = {}) {
    page.drawRectangle({
      x,
      y: PAGE_H - yAtas - h,
      width: w,
      height: h,
      color: opts.fill,
      borderColor: opts.border,
      borderWidth: opts.borderWidth,
    });
  }
  function garisH(x1: number, x2: number, yAtas: number, color: RGB, thickness: number) {
    page.drawLine({ start: { x: x1, y: PAGE_H - yAtas }, end: { x: x2, y: PAGE_H - yAtas }, thickness, color });
  }
  function garisV(x: number, yAtas1: number, yAtas2: number, color: RGB, thickness: number) {
    page.drawLine({ start: { x, y: PAGE_H - yAtas1 }, end: { x, y: PAGE_H - yAtas2 }, thickness, color });
  }

  // ---------- Pita header & footer ----------
  kotak(0, 0, PAGE_W, HEADER_BAR_H, { fill: NAVY });
  kotak(0, HEADER_BAR_H, PAGE_W, HEADER_STRIP_H, { fill: ORANGE });
  garisH(CONTENT_L, CONTENT_R, PAGE_H - FOOTER_LINE_DARI_BAWAH, LINE, 0.6);
  teks("SE2026 • Lampiran Dokumentasi Kegiatan", CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, {
    color: TEXT_SEC,
  });
  teks("Halaman 1", CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, {
    color: TEXT_SEC,
    align: "right",
    width: CONTENT_W,
  });

  // ---------- Judul ----------
  let y = BUDGET_TOP;
  teks("LAMPIRAN DOKUMENTASI KEGIATAN", CONTENT_L, y, 20, { bold: true, color: NAVY });
  y += 24.0;
  teks(KEGIATAN_NAMA, CONTENT_L, y, 11, { color: TEXT_SEC });
  y += 11.0 + GAP_SUBTITLE_TO_GRID;

  // ---------- Blok identitas: 3 baris (baris 3 = Lokasi, selebar penuh) ----------
  const barisGrid: { label: string; nilai: string }[][] = [
    [
      { label: "NAMA PETUGAS", nilai: data.namaPetugas || "-" },
      { label: "PERAN", nilai: data.peranLabel },
    ],
    [
      { label: "NOMOR SURAT TUGAS", nilai: data.nomorSt || "-" },
      { label: "TANGGAL", nilai: formatTanggalIndoDenganHari(data.tanggal) },
    ],
    [{ label: "LOKASI", nilai: data.lokasi || "-" }],
  ];
  const gridBaris = barisGrid.map((sel) => {
    const numKolom = sel.length;
    const colW = CONTENT_W / numKolom;
    const valW = colW - GRID_PAD_X * 2;
    return sel.map((s) => ({ ...s, baris: bungkusTeks(fontBold, s.nilai, 10.5, valW), numKolom, colW }));
  });
  const tinggiBarisGrid = gridBaris.map((sel) => {
    const maxBaris = Math.max(...sel.map((s) => s.baris.length), 1);
    return GRID_ROW_H + (maxBaris - 1) * GRID_VALUE_LEADING;
  });
  const gridTop = y;
  const gridTotalH = tinggiBarisGrid.reduce((a, b) => a + b, 0);
  kotak(CONTENT_L, gridTop, CONTENT_W, gridTotalH, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });

  let rowTop = gridTop;
  gridBaris.forEach((sel, i) => {
    if (i > 0) garisH(CONTENT_L, CONTENT_R, rowTop, LINE, 0.6);
    const tinggi = tinggiBarisGrid[i];
    if (sel.length === 2) garisV(CONTENT_MID, rowTop, rowTop + tinggi, LINE, 0.6);
    sel.forEach((s, j) => {
      const x = CONTENT_L + j * s.colW + GRID_PAD_X;
      teks(s.label, x, rowTop + GRID_LABEL_OFFSET, 8, { bold: true, color: TEXT_SEC });
      s.baris.forEach((b, k) => teks(b, x, rowTop + GRID_VALUE_OFFSET + k * GRID_VALUE_LEADING, 10.5, { bold: true, color: TEXT }));
    });
    rowTop += tinggi;
  });
  y = gridTop + gridTotalH + GAP_GRID_TO_SECTION;

  // ---------- Judul seksi ----------
  kotak(CONTENT_L, y, SECTION_BOX_W, SECTION_BOX_H, { fill: ORANGE });
  teks("DOKUMENTASI FOTO", CONTENT_L + SECTION_BOX_W + SECTION_TITLE_GAP_X, y + SECTION_TITLE_TEXT_OFFSET, 10.5, {
    bold: true,
    color: NAVY,
  });
  y += SECTION_BOX_H + GAP_SECTIONTITLE_TO_GRIDFOTO;

  // ---------- Grid kartu foto ----------
  const urut = [...data.foto].sort((a, b) => a.slot - b.slot);

  if (urut.length === 0) {
    teks("(Belum ada foto yang diupload untuk tanggal ini.)", CONTENT_L, y, 10, { color: TEXT_SEC });
    return doc.save();
  }

  const numKolom = jumlahKolom(urut.length);
  const numBaris = Math.ceil(urut.length / numKolom);
  const cardW = (CONTENT_W - (numKolom - 1) * CARD_GAP) / numKolom;
  const availableH = BUDGET_BOTTOM - y;
  // rowHMaks = ANGGARAN MAKSIMUM per baris (dipakai sbg batas atas skala
  // foto sesuai spesifikasi user), BUKAN tinggi kartu final. Tinggi kartu
  // sebenarnya menyesuaikan tinggi foto (setelah discaling) TERTINGGI pd
  // baris itu -- kalau kartu diregangkan penuh ke rowHMaks, kasus baris
  // tunggal (mis. 1-2 foto) menghasilkan kartu raksasa nyaris kosong krn
  // skala foto biasanya dibatasi LEBAR (potret), bukan tinggi. Pendekatan
  // ini jg cocok dgn PDF acuan: tinggi kartu terukur di sana (232,42pt)
  // LEBIH KECIL drpd anggaran penuh, dgn sisa ruang dibiarkan kosong sblm
  // footer (grid rata-atas, tidak diregangkan/dipusatkan vertikal).
  const rowHMaks = (availableH - (numBaris - 1) * CARD_GAP) / numBaris;
  const photoAreaW = cardW - PAD_FOTO * 2;
  const photoAreaHNetMaks = rowHMaks - CARD_HEADER_H - PAD_FOTO * 2;

  interface KartuSiap {
    item: DokumentasiFotoInput;
    img: PDFImage | null;
    w: number;
    h: number;
  }

  // Tahap 1: embed semua gambar dulu (perlu dimensi asli utk menghitung
  // skala & tinggi AKTUAL tiap baris) sebelum menggambar apa pun.
  const semuaBaris: KartuSiap[][] = [];
  for (let b = 0; b < numBaris; b++) {
    const dariIdx = b * numKolom;
    const kartuBaris = urut.slice(dariIdx, dariIdx + numKolom);
    const siap: KartuSiap[] = [];
    for (const item of kartuBaris) {
      let img: PDFImage | null;
      try {
        const bytesTegak = await perbaikiOrientasiFoto(item.bytes, item.contentType);
        img = item.contentType === "image/png" ? await doc.embedPng(bytesTegak) : await doc.embedJpg(bytesTegak);
      } catch {
        // Gagal embed (file korup/format tak terduga) -- lewati fotonya,
        // biarkan kartu & keterangannya tetap tampil kosong drpd seluruh
        // PDF gagal dibuat.
        img = null;
      }
      if (img) {
        // Rasio asli DIPERTAHANKAN (tidak dipotong/di-stretch) -- ambil
        // skala terkecil dari batas lebar & batas tinggi maksimum (spek user).
        const skala = Math.min(photoAreaW / img.width, photoAreaHNetMaks / img.height);
        siap.push({ item, img, w: img.width * skala, h: img.height * skala });
      } else {
        siap.push({ item, img: null, w: 0, h: 0 });
      }
    }
    semuaBaris.push(siap);
  }

  // Tahap 2: gambar tiap baris dgn tinggi kartu = tinggi konten (foto
  // tertinggi pd baris itu), bukan anggaran maksimum.
  let cardTop = y;
  semuaBaris.forEach((baris, b) => {
    const tinggiFotoBaris = Math.max(...baris.map((k) => k.h), 0);
    const rowH = CARD_HEADER_H + PAD_FOTO * 2 + tinggiFotoBaris;
    const kIni = baris.length;
    // baris terakhir yg tak penuh dirata-tengah sbg satu kelompok, LEBAR
    // kartu tetap sama dgn baris lain (bukan diregangkan mengisi lebar).
    const lebarKelompok = kIni * cardW + (kIni - 1) * CARD_GAP;
    const offsetX = CONTENT_L + (CONTENT_W - lebarKelompok) / 2;
    const dariIdx = b * numKolom;

    baris.forEach((k, idx) => {
      const x = offsetX + idx * (cardW + CARD_GAP);
      const nomorTampil = dariIdx + idx + 1;
      const labelTxt = SLOT_LABELS[k.item.slot] ?? `Foto ${k.item.slot}`;

      // Outline kartu penuh + header berlatar lembut.
      kotak(x, cardTop, cardW, rowH, { border: LINE, borderWidth: 0.6 });
      kotak(x, cardTop, cardW, CARD_HEADER_H, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });
      garisH(x, x + cardW, cardTop, NAVY, 2); // aksen garis atas navy 2pt

      // Ukuran font keterangan MENGECIL OTOMATIS kalau "N  Label" tidak
      // muat dlm 1 baris pd lebar kartu (jaga-jaga utk keterangan yg lebih
      // panjang drpd 5 label baku saat ini, spy tak pernah tumpah ke
      // kartu sebelah) -- label baku saat ini selalu muat pd 9,5pt.
      const nomorTxt = `${nomorTampil}`;
      const lebarMaksHeader = cardW - 10;
      let ukuranHeader = 9.5;
      while (
        ukuranHeader > 6.5 &&
        fontBold.widthOfTextAtSize(`${nomorTxt}  ${labelTxt}`, ukuranHeader) > lebarMaksHeader
      ) {
        ukuranHeader -= 0.5;
      }
      // Kalau pd batas bawah 6,5pt teks MASIH tidak muat (keterangan sangat
      // panjang, jauh melebihi 5 label baku saat ini), potong dgn elipsis
      // supaya tidak PERNAH tumpah ke kartu sebelah -- pengaman terakhir
      // stlh pengecilan font gagal mencukupi.
      let labelTampil = labelTxt;
      const spasiW0 = fontBold.widthOfTextAtSize("  ", ukuranHeader);
      const nomorW0 = fontBold.widthOfTextAtSize(nomorTxt, ukuranHeader);
      const lebarLabelMaks = lebarMaksHeader - nomorW0 - spasiW0;
      if (fontBold.widthOfTextAtSize(labelTampil, ukuranHeader) > lebarLabelMaks) {
        while (labelTampil.length > 1 && fontBold.widthOfTextAtSize(`${labelTampil}...`, ukuranHeader) > lebarLabelMaks) {
          labelTampil = labelTampil.slice(0, -1);
        }
        labelTampil = `${labelTampil.trimEnd()}...`;
      }
      const spasiW = fontBold.widthOfTextAtSize("  ", ukuranHeader);
      const nomorW = fontBold.widthOfTextAtSize(nomorTxt, ukuranHeader);
      const labelW = fontBold.widthOfTextAtSize(labelTampil, ukuranHeader);
      const totalW = nomorW + spasiW + labelW;
      const startX = x + (cardW - totalW) / 2;
      const headerTextYAtas = cardTop + (CARD_HEADER_H - ukuranHeader) / 2 + 1.5;
      teks(nomorTxt, startX, headerTextYAtas, ukuranHeader, { bold: true, color: ORANGE });
      teks(labelTampil, startX + nomorW + spasiW, headerTextYAtas, ukuranHeader, { bold: true, color: NAVY });

      if (k.img) {
        const areaTopAtas = cardTop + CARD_HEADER_H + PAD_FOTO;
        const ix = x + (cardW - k.w) / 2;
        const iy = PAGE_H - (areaTopAtas + (tinggiFotoBaris - k.h) / 2) - k.h;
        page.drawImage(k.img, { x: ix, y: iy, width: k.w, height: k.h });
      }
    });

    cardTop += rowH + CARD_GAP;
  });

  return doc.save();
}
