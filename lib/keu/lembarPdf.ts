// lib/keu/lembarPdf.ts
//
// (24 Okt 2026, tahap 4n) Penulis PDF lembar perubahan POK (pdf-lib, huruf standar Helvetica; tanpa berkas font). Kertas A4 mendatar, kolom ringkas:
// RO, Kode, Uraian semula, Jumlah semula, Uraian menjadi, Jumlah menjadi, Selisih, Pemicu; uraian dipotong dengan baris lanjutan, berpindah halaman otomatis,
// ditutup jumlah total dan blok tanda tangan. Karakter di luar WinAnsi diganti "?" agar tidak melempar galat.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { IsiLembar } from "./lembarPerubahan";

const A4 = { w: 841.89, h: 595.28 };
const M = 28;
const UKURAN = 7.5;
const LH = 9.5;

const bersih = (s: string): string => s.replace(/[^\x20-\x7E -ÿ]/g, "?");
const angka = (v: number | string): string => (typeof v === "number" ? v.toLocaleString("id-ID") : v);

/** Memecah teks menjadi baris selebar `lebar` (satuan poin) menurut lebar huruf. */
export function bungkus(teks: string, font: Pick<PDFFont, "widthOfTextAtSize">, ukuran: number, lebar: number): string[] {
  const kata = bersih(teks).split(/\s+/).filter(Boolean);
  const hasil: string[] = [];
  let baris = "";
  const muat = (s: string) => font.widthOfTextAtSize(s, ukuran) <= lebar;
  for (let k of kata) {
    while (!muat(k) && k.length > 1) { // kata terlalu panjang: potong
      let i = k.length - 1;
      while (i > 1 && !muat(k.slice(0, i))) i--;
      if (baris) { hasil.push(baris); baris = ""; }
      hasil.push(k.slice(0, i)); k = k.slice(i);
    }
    const coba = baris ? `${baris} ${k}` : k;
    if (muat(coba)) baris = coba; else { if (baris) hasil.push(baris); baris = k; }
  }
  if (baris) hasil.push(baris);
  return hasil.length ? hasil : [""];
}

// kolom: indeks pada IsiLembar.baris, lebar (poin), rata kanan
const KOLOM: { nama: string; idx: number; w: number; kanan: boolean }[] = [
  { nama: "RO", idx: 0, w: 62, kanan: false }, { nama: "Kode", idx: 1, w: 62, kanan: false }, { nama: "Uraian semula", idx: 3, w: 190, kanan: false },
  { nama: "Jumlah semula", idx: 6, w: 62, kanan: true }, { nama: "Uraian menjadi", idx: 7, w: 190, kanan: false }, { nama: "Jumlah menjadi", idx: 10, w: 62, kanan: true },
  { nama: "Selisih", idx: 11, w: 56, kanan: true }, { nama: "Pemicu", idx: 14, w: 48, kanan: false },
];

export async function buatPdfLembar(l: IsiLembar): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), tebal = await doc.embedFont(StandardFonts.HelveticaBold);
  let hal = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const teks = (s: string, x: number, yy: number, f: PDFFont = font, u = UKURAN, kanan = false, w = 0) => {
    const t = bersih(s); const lebar = f.widthOfTextAtSize(t, u);
    hal.drawText(t, { x: kanan ? x + w - lebar : x, y: yy, size: u, font: f, color: rgb(0.06, 0.16, 0.32) });
  };
  const kepalaTabel = () => {
    hal.drawRectangle({ x: M, y: y - 3, width: A4.w - 2 * M, height: LH + 4, color: rgb(0.93, 0.95, 0.98) });
    let x = M + 2; for (const k of KOLOM) { teks(k.nama, x, y, tebal, UKURAN, k.kanan, k.w - 4); x += k.w; }
    y -= LH + 4;
  };
  teks(l.judul, M, y, tebal, 13); y -= 16;
  teks(`KRO ${l.kro}`, M, y, tebal, 9); y -= 12;
  teks(`Jenis revisi: ${l.jenis}`, M, y, font, 9); y -= 16;
  kepalaTabel();
  for (const r of l.baris) {
    const sel = KOLOM.map((k) => (k.kanan ? [angka(r[k.idx])] : bungkus(String(r[k.idx]), font, UKURAN, k.w - 4)));
    const tinggi = Math.max(...sel.map((s) => s.length)) * LH;
    if (y - tinggi < M + 70) { hal = doc.addPage([A4.w, A4.h]); y = A4.h - M; kepalaTabel(); }
    let x = M + 2;
    KOLOM.forEach((k, i) => { sel[i].forEach((t, j) => teks(t, x, y - j * LH, font, UKURAN, k.kanan, k.w - 4)); x += k.w; });
    y -= tinggi + 1;
    hal.drawLine({ start: { x: M, y: y + 1 }, end: { x: A4.w - M, y: y + 1 }, thickness: 0.3, color: rgb(0.86, 0.89, 0.93) });
  }
  if (y < M + 80) { hal = doc.addPage([A4.w, A4.h]); y = A4.h - M; }
  const x6 = M + 2 + KOLOM.slice(0, 3).reduce((s, k) => s + k.w, 0);
  teks(l.total[0] as string, M + 2, y - 4, tebal);
  teks(angka(l.semula), x6, y - 4, tebal, UKURAN, true, KOLOM[3].w - 4);
  teks(angka(l.menjadi), M + 2 + KOLOM.slice(0, 5).reduce((s, k) => s + k.w, 0), y - 4, tebal, UKURAN, true, KOLOM[5].w - 4);
  teks(angka(l.menjadi - l.semula), M + 2 + KOLOM.slice(0, 6).reduce((s, k) => s + k.w, 0), y - 4, tebal, UKURAN, true, KOLOM[6].w - 4);
  y -= 34;
  const kol = [{ j: "Jenis revisi", v: l.jenis, k: "" }, { j: "Disusun", v: l.disusun, k: l.catatanTanggal }, { j: "Penetap", v: l.penetap, k: l.catatanPenetap }];
  const lebarKol = (A4.w - 2 * M) / 3;
  kol.forEach((c, i) => {
    const x = M + i * lebarKol;
    teks(c.j, x, y, font, 8);
    bungkus(c.v, tebal, 9, lebarKol - 12).forEach((t, j) => teks(t, x, y - 12 - j * 11, tebal, 9));
    if (c.k) teks(c.k, x, y - 12 - 11 * Math.max(1, bungkus(c.v, tebal, 9, lebarKol - 12).length) - 2, font, 8);
  });
  return doc.save();
}
