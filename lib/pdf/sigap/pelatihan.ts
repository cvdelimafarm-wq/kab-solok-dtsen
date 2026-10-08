// lib/pdf/sigap/pelatihan.ts
//
// (8 Okt 2026) SIGAP > Kelola Pelatihan > Administrasi -- 4 dokumen kelengkapan pelatihan (permintaan user):
//  1. Daftar Hadir (otomatis dari presensi pelatihan),
//  2. Form Daftar Hadir kosong untuk tanda tangan basah,
//  3. Laporan Pelatihan (angka otomatis + narasi panitia),
//  4. Laporan Pelatihan Instruktur (angka otomatis + catatan instruktur).
// Gaya visual SAMA dengan generator SPJ SIGAP lain (pita navy + oranye, judul 20pt, footer). Semua angka berasal
// dari data (peserta, presensi, tes); tidak ada isi karangan -- bagian narasi yang kosong dicetak sebagai
// garis titik supaya bisa ditulis tangan.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import { formatTanggalIndoDenganHari, teksAman } from "./format";

const MM = 2.834645669;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 20 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const CONTENT_L = MARGIN_X;
const CONTENT_R = PAGE_W - MARGIN_X;
const BUDGET_TOP = 19 * MM;
const BUDGET_BOTTOM = PAGE_H - 19 * MM;

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

function bungkus(f: PDFFont, txt: string, size: number, maxWidth: number): string[] {
  const hasil: string[] = [];
  for (const para of String(txt ?? "").split(/\r?\n/)) {
    let sekarang = "";
    for (const k of para.split(/\s+/).filter(Boolean)) {
      const coba = sekarang ? `${sekarang} ${k}` : k;
      if (f.widthOfTextAtSize(teksAman(coba), size) > maxWidth && sekarang) {
        hasil.push(sekarang);
        sekarang = k;
      } else sekarang = coba;
    }
    hasil.push(sekarang);
  }
  while (hasil.length > 1 && hasil[hasil.length - 1] === "") hasil.pop();
  return hasil.length > 0 ? hasil : [""];
}

/** Kanvas A4 sederhana (koordinat dari atas) dengan pagination otomatis. */
class Kanvas {
  doc!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  italic!: PDFFont;
  page!: PDFPage;
  y = BUDGET_TOP;
  constructor(private footer: string) {}

  static async buat(footer: string): Promise<Kanvas> {
    const k = new Kanvas(footer);
    k.doc = await PDFDocument.create();
    k.font = await k.doc.embedFont(StandardFonts.Helvetica);
    k.bold = await k.doc.embedFont(StandardFonts.HelveticaBold);
    k.italic = await k.doc.embedFont(StandardFonts.HelveticaOblique);
    k.baru();
    return k;
  }

  baru() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.kotak(0, 0, PAGE_W, 7 * MM, { fill: NAVY });
    this.kotak(0, 7 * MM, PAGE_W, 1.2 * MM, { fill: ORANGE });
    this.garisH(CONTENT_L, CONTENT_R, PAGE_H - 38.27);
    this.teks(this.footer, CONTENT_L, PAGE_H - 31.9, 8.5, { color: TEXT_SEC });
    this.y = BUDGET_TOP;
  }

  teks(txt: string, x: number, yAtas: number, size: number, o: { bold?: boolean; italic?: boolean; color?: RGB; align?: "right" | "center"; width?: number } = {}) {
    const f = o.italic ? this.italic : o.bold ? this.bold : this.font;
    const t = teksAman(txt);
    let xp = x;
    if (o.width && o.align === "right") xp = x + o.width - f.widthOfTextAtSize(t, size);
    else if (o.width && o.align === "center") xp = x + (o.width - f.widthOfTextAtSize(t, size)) / 2;
    this.page.drawText(t, { x: xp, y: PAGE_H - yAtas - size * 0.8, size, font: f, color: o.color ?? TEXT });
  }
  kotak(x: number, yAtas: number, w: number, h: number, o: { fill?: RGB; border?: RGB; borderWidth?: number }) {
    this.page.drawRectangle({ x, y: PAGE_H - yAtas - h, width: w, height: h, color: o.fill, borderColor: o.border, borderWidth: o.borderWidth });
  }
  garisH(x1: number, x2: number, yAtas: number, color: RGB = LINE, t = 0.6) {
    this.page.drawLine({ start: { x: x1, y: PAGE_H - yAtas }, end: { x: x2, y: PAGE_H - yAtas }, thickness: t, color });
  }
  garisV(x: number, y1: number, y2: number) {
    this.page.drawLine({ start: { x, y: PAGE_H - y1 }, end: { x, y: PAGE_H - y2 }, thickness: 0.6, color: LINE });
  }
  /** Pindah halaman bila elemen setinggi h tidak muat. */
  ruang(h: number): boolean {
    if (this.y + h <= BUDGET_BOTTOM) return false;
    this.baru();
    return true;
  }

  judul(utama: string, sub?: string) {
    this.teks(utama, CONTENT_L, this.y, 20, { bold: true, color: NAVY });
    this.y += 24;
    if (sub) {
      for (const b of bungkus(this.font, sub, 11, CONTENT_W)) {
        this.teks(b, CONTENT_L, this.y, 11, { color: TEXT_SEC });
        this.y += 13;
      }
    }
    this.y += 8;
  }

  /** Blok identitas 2 kolom: pasangan [label, nilai]. */
  identitas(pasangan: [string, string][]) {
    const kol = 2;
    const valW = CONTENT_W / kol - 12;
    const baris: { l: string; v: string[] }[][] = [];
    for (let i = 0; i < pasangan.length; i += kol) {
      baris.push(pasangan.slice(i, i + kol).map(([l, v]) => ({ l, v: bungkus(this.bold, teksAman(v || "-"), 10.5, valW) })));
    }
    const tinggi = baris.map((r) => 39.5 + (Math.max(...r.map((s) => s.v.length)) - 1) * 13);
    const total = tinggi.reduce((a, b) => a + b, 0);
    this.ruang(total + 10);
    const atas = this.y;
    this.kotak(CONTENT_L, atas, CONTENT_W, total, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });
    this.garisV(CONTENT_L + CONTENT_W / 2, atas, atas + total);
    let top = atas;
    baris.forEach((r, i) => {
      if (i > 0) this.garisH(CONTENT_L, CONTENT_R, top);
      r.forEach((s, j) => {
        const x = CONTENT_L + j * (CONTENT_W / kol) + 6;
        this.teks(s.l, x, top + 9, 8, { bold: true, color: TEXT_SEC });
        s.v.forEach((b, k) => this.teks(b, x, top + 21.5 + k * 13, 10.5, { bold: true }));
      });
      top += tinggi[i];
    });
    this.y = atas + total + 10;
  }

  kartuAngka(item: [string, string][]) {
    const gap = 5 * MM;
    const w = (CONTENT_W - (item.length - 1) * gap) / item.length;
    this.ruang(60);
    item.forEach(([angka, label], i) => {
      const x = CONTENT_L + i * (w + gap);
      this.garisH(x, x + w, this.y, NAVY, 2);
      this.teks(angka, x, this.y + 12, 20, { bold: true, color: NAVY, align: "center", width: w });
      this.teks(label, x, this.y + 34, 8, { bold: true, color: TEXT_SEC, align: "center", width: w });
    });
    this.y += 63;
  }

  seksi(judul: string) {
    this.ruang(16 + 30);
    this.kotak(CONTENT_L, this.y, 3 * MM, 16, { fill: ORANGE });
    this.teks(judul, CONTENT_L + 3 * MM + 7, this.y + 4, 10.5, { bold: true, color: NAVY });
    this.y += 24;
  }

  paragraf(txt: string, size = 10, leading = 14) {
    for (const b of bungkus(this.font, txt, size, CONTENT_W)) {
      this.ruang(leading);
      this.teks(b, CONTENT_L, this.y, size);
      this.y += leading;
    }
    this.y += 6;
  }

  /** Narasi isian: bila kosong, cetak `garis` baris titik untuk ditulis tangan. */
  narasi(txt: string | null | undefined, garis = 5) {
    const isi = (txt ?? "").trim();
    if (isi) return this.paragraf(isi);
    for (let i = 0; i < garis; i++) {
      this.ruang(20);
      this.garisH(CONTENT_L, CONTENT_R, this.y + 14, TEXT_SEC, 0.4);
      this.y += 20;
    }
    this.y += 4;
  }

  /**
   * Tabel bergaris tipis. `lebar` = bobot relatif kolom; `rataTengah` = indeks kolom yang rata tengah.
   * `tinggiMin` memberi ruang tanda tangan pada form daftar hadir.
   */
  tabel(kepala: string[], lebar: number[], baris: string[][], o: { tinggiMin?: number; rataTengah?: number[]; ukuran?: number } = {}) {
    const jml = lebar.reduce((a, b) => a + b, 0);
    const w = lebar.map((x) => (x / jml) * CONTENT_W);
    const xs = w.map((_, i) => CONTENT_L + w.slice(0, i).reduce((a, b) => a + b, 0));
    const ukuran = o.ukuran ?? 9.5;
    const leading = ukuran + 3;
    const tengah = new Set(o.rataTengah ?? []);
    const PAD = 5;
    const kepalaTabel = () => {
      this.kotak(CONTENT_L, this.y, CONTENT_W, 18, { fill: SOFT_BG });
      kepala.forEach((h, i) => this.teks(h, xs[i] + PAD, this.y + 6, 7.5, { bold: true, color: TEXT_SEC, ...(tengah.has(i) ? { align: "center" as const, width: w[i] - PAD * 2 } : {}) }));
      this.garisH(CONTENT_L, CONTENT_R, this.y);
      this.garisH(CONTENT_L, CONTENT_R, this.y + 18);
      this.y += 18;
    };
    const tutup = (dari: number, sampai: number) => {
      this.garisV(CONTENT_L, dari, sampai);
      this.garisV(CONTENT_R, dari, sampai);
      for (let i = 1; i < xs.length; i++) this.garisV(xs[i], dari, sampai);
    };
    this.ruang(18 + (o.tinggiMin ?? 20) * 2);
    let awal = this.y;
    kepalaTabel();
    for (const r of baris) {
      const pecah = r.map((v, i) => bungkus(this.font, teksAman(v), ukuran, w[i] - PAD * 2));
      const tinggi = Math.max(o.tinggiMin ?? 20, Math.max(...pecah.map((p) => p.length)) * leading + 8);
      if (this.y + tinggi > BUDGET_BOTTOM) {
        tutup(awal, this.y);
        this.baru();
        awal = this.y;
        kepalaTabel();
      }
      pecah.forEach((p, i) =>
        p.forEach((b, k) => this.teks(b, xs[i] + PAD, this.y + 5 + k * leading, ukuran, tengah.has(i) ? { align: "center", width: w[i] - PAD * 2 } : {}))
      );
      this.y += tinggi;
      this.garisH(CONTENT_L, CONTENT_R, this.y);
    }
    tutup(awal, this.y);
    this.y += 12;
  }

  /** Blok tanda tangan sejajar: tiap blok = judul jabatan, ruang tanda tangan, nama (garis bawah). */
  tandaTangan(blok: { judul: string; nama: string; keterangan?: string }[], tanggalTempat?: string) {
    const tinggi = 118;
    this.ruang(tinggi);
    if (tanggalTempat) {
      this.teks(tanggalTempat, CONTENT_L, this.y, 10, { align: "right", width: CONTENT_W });
      this.y += 16;
    }
    const lebar = CONTENT_W / blok.length;
    blok.forEach((b, i) => {
      const x = CONTENT_L + i * lebar;
      const lbr = lebar - 12;
      let yy = this.y;
      for (const t of bungkus(this.font, b.judul, 10, lbr)) {
        this.teks(t, x, yy, 10, { align: "center", width: lebar });
        yy += 13;
      }
      const yNama = this.y + 70;
      const nama = bungkus(this.bold, teksAman(b.nama || ""), 10, lbr);
      nama.forEach((t, k) => this.teks(t, x, yNama + k * 13, 10, { bold: true, align: "center", width: lebar }));
      const wTeks = Math.min(lbr, Math.max(...nama.map((t) => this.bold.widthOfTextAtSize(teksAman(t), 10)), 90));
      const garisY = yNama + nama.length * 13 + 1;
      this.garisH(x + (lebar - wTeks) / 2, x + (lebar + wTeks) / 2, garisY, TEXT, 0.6);
      if (b.keterangan) this.teks(b.keterangan, x, garisY + 3, 9, { align: "center", width: lebar, color: TEXT_SEC });
    });
    this.y += tinggi;
  }

  /**
   * Lampiran foto kegiatan: halaman baru, grid 2 kolom x 3 baris per halaman (foto "muat di kotak", tidak dipotong),
   * tiap foto diberi nomor + keterangan. Foto yang tidak bisa dibaca dilewati.
   */
  async lampiranFoto(foto: FotoLampiran[]) {
    if (foto.length === 0) return;
    this.baru();
    this.seksi("LAMPIRAN FOTO KEGIATAN");
    const gap = 12;
    const w = (CONTENT_W - gap) / 2;
    const hFoto = 170;
    const hBaris = hFoto + 34;
    let i = 0;
    for (const f of foto) {
      let img;
      try {
        img = (f.contentType === "image/png") ? await this.doc.embedPng(f.bytes) : await this.doc.embedJpg(f.bytes);
      } catch {
        continue;
      }
      const kol = i % 2;
      if (kol === 0 && this.y + hBaris > BUDGET_BOTTOM) {
        this.baru();
        this.y = BUDGET_TOP;
      }
      const x = CONTENT_L + kol * (w + gap);
      this.kotak(x, this.y, w, hFoto, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });
      const s = Math.min((w - 8) / img.width, (hFoto - 8) / img.height);
      const iw = img.width * s;
      const ih = img.height * s;
      this.page.drawImage(img, { x: x + (w - iw) / 2, y: PAGE_H - this.y - hFoto + (hFoto - ih) / 2, width: iw, height: ih });
      const cap = bungkus(this.font, `${i + 1}. ${f.keterangan?.trim() || "Dokumentasi kegiatan"}`, 8.5, w).slice(0, 2);
      cap.forEach((c, k) => this.teks(c, x, this.y + hFoto + 5 + k * 11, 8.5, { color: TEXT_SEC }));
      if (kol === 1) this.y += hBaris;
      i++;
    }
    if (i % 2 === 1) this.y += hBaris;
  }

  async simpan(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

// ----------------------------------------------------------------------------------------------
export type PesertaHadir = {
  nama: string;
  peran: string; // ppl | pml | korwil
  jenis: string; // mitra | organik
  /** true = hadir, false = belum/tidak tercatat. */
  hadir: boolean;
  /** Jam presensi WIB "HH:mm" bila hadir. */
  jam: string | null;
  /** Presensi dicatat manual oleh panitia. */
  manual: boolean;
};

export type InfoKelas = {
  kegiatanNama: string;
  kegiatanKode: string;
  kelas: number;
  tanggal: string; // YYYY-MM-DD
  tempat: string;
  instruktur: string[];
};

const labelPeran = (p: string) => p.toUpperCase();
const labelJenis = (j: string) => (j === "organik" ? "Organik" : "Mitra");
const titelKelas = (i: InfoKelas) => `Kelas ${i.kelas}`;

function identitasKelas(i: InfoKelas): [string, string][] {
  return [
    ["KEGIATAN", i.kegiatanNama],
    ["KELAS", titelKelas(i)],
    ["HARI / TANGGAL", formatTanggalIndoDenganHari(i.tanggal)],
    ["TEMPAT", i.tempat || "-"],
  ];
}

// 1. Daftar Hadir otomatis -----------------------------------------------------------------------
export async function buatPdfDaftarHadir(info: InfoKelas, peserta: PesertaHadir[]): Promise<Uint8Array> {
  const k = await Kanvas.buat(`${info.kegiatanKode || "SIGAP"} • Daftar Hadir • ${titelKelas(info)}`);
  k.judul("DAFTAR HADIR", "Berdasarkan presensi di lokasi pelatihan (SIGAP)");
  k.identitas(identitasKelas(info));
  const hadir = peserta.filter((p) => p.hadir).length;
  k.kartuAngka([
    [String(peserta.length), "PESERTA TERDAFTAR"],
    [String(hadir), "HADIR"],
    [String(peserta.length - hadir), "BELUM TERCATAT"],
  ]);
  k.seksi("DAFTAR PESERTA");
  k.tabel(
    ["NO", "NAMA", "PERAN", "JENIS", "STATUS", "JAM (WIB)"],
    [5, 38, 9, 11, 17, 12],
    peserta.map((p, i) => [String(i + 1), p.nama, labelPeran(p.peran), labelJenis(p.jenis), p.hadir ? (p.manual ? "Hadir (dicatat panitia)" : "Hadir") : "Belum tercatat", p.jam ?? "-"]),
    { rataTengah: [0, 2, 5] }
  );
  k.tandaTangan([{ judul: `Instruktur ${titelKelas(info)}`, nama: info.instruktur.join(", ") || "" }, { judul: "Panitia Pelatihan", nama: "" }]);
  return k.simpan();
}

// 2. Form Daftar Hadir tanda tangan basah ---------------------------------------------------------
export async function buatPdfFormDaftarHadir(info: InfoKelas, peserta: { nama: string; peran: string; jenis: string }[]): Promise<Uint8Array> {
  const k = await Kanvas.buat(`${info.kegiatanKode || "SIGAP"} • Form Daftar Hadir • ${titelKelas(info)}`);
  k.judul("DAFTAR HADIR", "Form tanda tangan langsung (tanda tangan basah)");
  k.identitas(identitasKelas(info));
  k.seksi("DAFTAR PESERTA");
  k.tabel(
    ["NO", "NAMA", "PERAN", "JENIS", "TANDA TANGAN"],
    [5, 33, 9, 11, 30],
    peserta.map((p, i) => [String(i + 1), p.nama, labelPeran(p.peran), labelJenis(p.jenis), ""]),
    { tinggiMin: 30, rataTengah: [0, 2] }
  );
  k.tandaTangan([{ judul: `Instruktur ${titelKelas(info)}`, nama: info.instruktur.join(", ") || "" }, { judul: "Panitia Pelatihan", nama: "" }]);
  return k.simpan();
}

// 3 & 4. Laporan ---------------------------------------------------------------------------------
export type RingkasTes = {
  judul: string;
  buka: string; // teks WIB
  tutup: string;
  peserta: number;
  selesai: number;
  rata: number | null;
  tertinggi: number | null;
  terendah: number | null;
};

export type FotoLampiran = { bytes: Uint8Array; contentType: string; keterangan: string | null };

export type DataLaporan = {
  info: InfoKelas;
  /** Lampiran foto kegiatan (opsional; tanpa foto = tidak ada halaman lampiran). */
  foto?: FotoLampiran[];
  jumlahPeserta: number;
  hadir: number;
  tes: RingkasTes[];
  /** Selisih rata-rata posttest - pretest (peserta yang selesai keduanya) bila tersedia. */
  kenaikanRata: number | null;
  ringkasan: string | null;
  kendala: string | null;
  catatan: string | null;
  tanggalCetak: string; // teks "Solok, 8 Oktober 2026"
};

const fmt = (n: number | null | undefined) => (n == null ? "-" : String(Math.round(n * 100) / 100).replace(".", ","));

function bagianHasil(k: Kanvas, d: DataLaporan) {
  k.seksi("HASIL PRETEST & POSTTEST");
  if (d.tes.length === 0) return k.paragraf("(Belum ada data tes.)");
  k.tabel(
    ["TES", "DIBUKA", "DITUTUP", "SELESAI", "RATA-RATA", "TERTINGGI", "TERENDAH"],
    [14, 21, 21, 11, 11, 11, 11],
    d.tes.map((t) => [t.judul, t.buka, t.tutup, `${t.selesai}/${t.peserta}`, fmt(t.rata), fmt(t.tertinggi), fmt(t.terendah)]),
    { rataTengah: [3, 4, 5, 6], ukuran: 8.5 }
  );
  if (d.kenaikanRata != null) k.paragraf(`Kenaikan rata-rata nilai (posttest dikurangi pretest) pada peserta yang menyelesaikan kedua tes: ${d.kenaikanRata > 0 ? "+" : ""}${fmt(d.kenaikanRata)}.`);
}

export async function buatPdfLaporanPelatihan(d: DataLaporan): Promise<Uint8Array> {
  const k = await Kanvas.buat(`${d.info.kegiatanKode || "SIGAP"} • Laporan Pelatihan • ${titelKelas(d.info)}`);
  k.judul("LAPORAN PELATIHAN", d.info.kegiatanNama);
  k.identitas([...identitasKelas(d.info).slice(1), ["INSTRUKTUR", d.info.instruktur.join(", ") || "-"]]);
  const persen = d.jumlahPeserta > 0 ? Math.round((d.hadir / d.jumlahPeserta) * 100) : 0;
  k.kartuAngka([
    [String(d.jumlahPeserta), "PESERTA TERDAFTAR"],
    [String(d.hadir), "HADIR (PRESENSI)"],
    [`${persen}%`, "TINGKAT KEHADIRAN"],
  ]);
  k.seksi("PELAKSANAAN");
  k.paragraf(
    `${d.info.kegiatanNama} ${titelKelas(d.info)} dilaksanakan pada ${formatTanggalIndoDenganHari(d.info.tanggal)} di ${d.info.tempat || "-"}. ` +
      `Peserta terdaftar sebanyak ${d.jumlahPeserta} orang, dan ${d.hadir} orang tercatat hadir melalui presensi di lokasi.`
  );
  k.narasi(d.ringkasan, 4);
  bagianHasil(k, d);
  k.seksi("KENDALA DAN TINDAK LANJUT");
  k.narasi(d.kendala, 4);
  k.tandaTangan([{ judul: "Panitia Pelatihan", nama: "" }, { judul: `Instruktur ${titelKelas(d.info)}`, nama: d.info.instruktur.join(", ") }], d.tanggalCetak);
  await k.lampiranFoto(d.foto ?? []);
  return k.simpan();
}

export async function buatPdfLaporanInstruktur(d: DataLaporan): Promise<Uint8Array> {
  const k = await Kanvas.buat(`${d.info.kegiatanKode || "SIGAP"} • Laporan Instruktur • ${titelKelas(d.info)}`);
  k.judul("LAPORAN PELATIHAN INSTRUKTUR", d.info.kegiatanNama);
  k.identitas([["INSTRUKTUR", d.info.instruktur.join(", ") || "-"], ...identitasKelas(d.info).slice(1)]);
  k.kartuAngka([
    [String(d.jumlahPeserta), "PESERTA DIAMPU"],
    [String(d.hadir), "HADIR (PRESENSI)"],
    [d.kenaikanRata == null ? "-" : `${d.kenaikanRata > 0 ? "+" : ""}${fmt(d.kenaikanRata)}`, "KENAIKAN RATA-RATA NILAI"],
  ]);
  k.seksi("MATERI DAN METODE PENYAMPAIAN");
  k.narasi(d.ringkasan, 5);
  bagianHasil(k, d);
  k.seksi("CATATAN / EVALUASI INSTRUKTUR");
  k.narasi(d.catatan, 5);
  k.seksi("KENDALA DAN SARAN");
  k.narasi(d.kendala, 4);
  k.tandaTangan([{ judul: "Mengetahui,\nPanitia Pelatihan", nama: "" }, { judul: `Instruktur ${titelKelas(d.info)}`, nama: d.info.instruktur.join(", ") }], d.tanggalCetak);
  await k.lampiranFoto(d.foto ?? []);
  return k.simpan();
}
