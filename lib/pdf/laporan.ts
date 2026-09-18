// lib/pdf/laporan.ts
//
// Generator PDF "Laporan Perjalanan Dinas" -- meniru struktur Template
// Laporan.pdf yang diupload user (judul kegiatan, identitas petugas,
// tabel "A. Rincian Pelaksanaan Kegiatan", "B. Uraian Perjalanan...",
// "C. Rekapitulasi Dokumentasi"), TAPI datanya ditarik OTOMATIS dari
// rekap_snapshot yang disimpan saat Laporan dibuat (lihat
// app/api/penyisiran/spj/laporan/route.ts) -- BUKAN dihitung ulang saat
// PDF diunduh, supaya laporan yang sudah dibuat tidak berubah diam2 kalau
// data di tab Identifikasi Jorong/Tetangga diedit belakangan.
//
// Dua mode (field `mode` di tabel spj_laporan):
//  - "template": tampilkan tabel rincian lokasi + rekap otomatis (dari
//    rekap.lokasi & rekap.rekapIdentifikasi) + narasi tambahan (opsional)
//    dari petugas.
//  - "bebas": SELURUH isi laporan (bagian "Uraian") adalah narasi bebas
//    yang diketik petugas sendiri -- tabel rincian & rekap otomatis TIDAK
//    ditampilkan (krn datanya belum tentu representatif kalau petugas
//    sengaja memilih menulis sendiri).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatJamIndo, formatTanggalIndoDenganHari, ringkasUnik } from "../spjFormat";
import { KEGIATAN_NAMA } from "../spjPejabat";

export interface LaporanLokasiRow {
  kecNama: string | null;
  nagariNama: string | null;
  slsNama: string | null;
  subslsKode: string | null;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  jumlah: number;
}

export interface LaporanRekapSnapshot {
  lokasi: LaporanLokasiRow[];
  rekapIdentifikasi: { ada: number; tidak_ada: number; ragu: number; belum: number };
  totalAktivitas: number;
  jumlahDokumentasi: number;
}

export interface LaporanPdfData {
  nomorSt: string;
  namaPetugas: string;
  peranLabel: string;
  tanggal: string;
  mode: "template" | "bebas";
  narasi: string | null;
  rekap: LaporanRekapSnapshot | null;
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 50;
const MARGIN_BAWAH = 55;

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

// Kelas kecil pembantu penulisan multi-halaman -- dipisah dari visum.ts
// (yang selalu muat 1 halaman) krn Laporan bisa punya jumlah baris tabel
// & narasi yang panjangnya tidak terduga (tergantung berapa lokasi yang
// disisir hari itu / berapa panjang narasi bebas petugas).
class Penulis {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  fontBold!: PDFFont;
  y = 0;
  width = 0;
  height = 0;
  usableWidth = 0;

  static async buat(): Promise<Penulis> {
    const p = new Penulis();
    p.doc = await PDFDocument.create();
    p.font = await p.doc.embedFont(StandardFonts.Helvetica);
    p.fontBold = await p.doc.embedFont(StandardFonts.HelveticaBold);
    p.halamanBaru();
    return p;
  }

  halamanBaru() {
    this.page = this.doc.addPage(A4);
    const { width, height } = this.page.getSize();
    this.width = width;
    this.height = height;
    this.usableWidth = width - MARGIN_X * 2;
    this.y = height - 55;
  }

  pastikanRuang(butuh: number) {
    if (this.y - butuh < MARGIN_BAWAH) this.halamanBaru();
  }

  teks(
    txt: string,
    x: number,
    opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxWidth?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const f = opts.bold ? this.fontBold : this.font;
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") {
      xPos = x + (opts.maxWidth - f.widthOfTextAtSize(txt, size)) / 2;
    } else if (opts.maxWidth && opts.align === "right") {
      xPos = x + opts.maxWidth - f.widthOfTextAtSize(txt, size);
    }
    this.page.drawText(txt, { x: xPos, y: this.y, size, font: f, color: HITAM });
  }

  turun(px: number) {
    this.y -= px;
  }

  garisH() {
    this.page.drawLine({ start: { x: MARGIN_X, y: this.y }, end: { x: this.width - MARGIN_X, y: this.y }, thickness: 0.75, color: HITAM });
  }

  paragraf(txt: string, size = 9.5, lineHeight = 13) {
    for (const l of bungkusTeks(this.font, txt, size, this.usableWidth)) {
      this.pastikanRuang(lineHeight);
      this.teks(l, MARGIN_X, { size });
      this.turun(lineHeight);
    }
  }

  tabel(header: string[], rows: string[][], colWidths: number[]) {
    const tinggiBaris = 16;
    const xKolom: number[] = [];
    let acc = MARGIN_X;
    for (const w of colWidths) {
      xKolom.push(acc);
      acc += w;
    }
    const lebarTotal = colWidths.reduce((a, b) => a + b, 0);

    const gambarHeader = () => {
      this.pastikanRuang(tinggiBaris + 4);
      const yAtas = this.y;
      this.page.drawRectangle({ x: MARGIN_X, y: yAtas - tinggiBaris, width: lebarTotal, height: tinggiBaris, color: rgb(0.92, 0.92, 0.92) });
      header.forEach((h, i) => this.teks(h, xKolom[i] + 4, { size: 8.5, bold: true }));
      this.turun(tinggiBaris);
      this.garisH();
    };

    gambarHeader();
    for (const row of rows) {
      this.pastikanRuang(tinggiBaris + 2);
      // Kalau baru pindah halaman (pastikanRuang bikin halaman baru), tabel
      // butuh header lagi supaya tetap terbaca -- dicek lewat y hampir di
      // puncak halaman baru.
      if (this.y > this.height - 60 - tinggiBaris && this.y < this.height - 55) {
        // masih di halaman yang sama, tidak perlu apa2
      }
      row.forEach((cell, i) => this.teks(cell, xKolom[i] + 4, { size: 8.5 }));
      this.turun(tinggiBaris);
      this.garisH();
    }
  }
}

function labelIdentifikasi(row: LaporanLokasiRow): string {
  const subsls = row.subslsKode ? ` Sub SLS ${row.subslsKode}` : "";
  return `Jorong ${row.slsNama ?? "-"}${subsls}, Nagari ${row.nagariNama ?? "-"}, Kec. ${row.kecNama ?? "-"}`;
}

export async function buatPdfLaporan(data: LaporanPdfData): Promise<Uint8Array> {
  const p = await Penulis.buat();

  // ---------- Kop ----------
  p.teks("LAPORAN PERJALANAN DINAS", MARGIN_X, { bold: true, size: 13, align: "center", maxWidth: p.usableWidth });
  p.turun(17);
  p.teks(KEGIATAN_NAMA.toUpperCase(), MARGIN_X, { bold: true, size: 11, align: "center", maxWidth: p.usableWidth });
  p.turun(10);
  p.garisH();
  p.turun(20);

  // ---------- Metadata ----------
  const labelWidth = 130;
  const baris = (label: string, value: string) => {
    p.teks(label, MARGIN_X, { size: 10 });
    p.teks(":", MARGIN_X + labelWidth, { size: 10 });
    p.teks(value, MARGIN_X + labelWidth + 12, { size: 10, bold: true });
    p.turun(16);
  };
  baris("Nomor Surat Tugas", data.nomorSt || "-");
  baris("Nama Petugas", data.namaPetugas || "-");
  baris("Peran", data.peranLabel);
  if (data.mode === "template" && data.rekap && data.rekap.lokasi.length > 0) {
    baris("Kecamatan", ringkasUnik(data.rekap.lokasi.map((l) => l.kecNama)));
    baris("Nagari", ringkasUnik(data.rekap.lokasi.map((l) => l.nagariNama)));
  }
  baris("Tanggal", formatTanggalIndoDenganHari(data.tanggal));

  p.turun(6);
  p.garisH();
  p.turun(22);

  if (data.mode === "template" && data.rekap) {
    const { rekap } = data;

    // ---------- A. Rincian Pelaksanaan Kegiatan ----------
    p.teks("A. RINCIAN PELAKSANAAN KEGIATAN", MARGIN_X, { bold: true, size: 10.5 });
    p.turun(18);
    if (rekap.lokasi.length > 0) {
      p.tabel(
        ["No", "Waktu (WIB)", "Jml", "Lokasi (Jorong/Nagari/Kec.)"],
        rekap.lokasi.map((l, i) => [
          String(i + 1),
          `${formatJamIndo(l.waktuMulai)} - ${formatJamIndo(l.waktuSelesai)}`,
          String(l.jumlah),
          labelIdentifikasi(l),
        ]),
        [28, 90, 32, p.usableWidth - 28 - 90 - 32]
      );
    } else {
      p.paragraf("(Tidak ada aktivitas identifikasi yang tercatat pada tanggal ini.)");
    }
    p.turun(14);

    // ---------- B. Uraian ----------
    p.pastikanRuang(30);
    p.teks("B. URAIAN PERJALANAN DAN PELAKSANAAN TUGAS", MARGIN_X, { bold: true, size: 10.5 });
    p.turun(18);
    const jumlahLokasi = rekap.lokasi.length;
    const uraian =
      `Pada hari ${formatTanggalIndoDenganHari(data.tanggal)}, ${data.namaPetugas} melaksanakan tugas ${KEGIATAN_NAMA} ` +
      `di wilayah ${ringkasUnik(rekap.lokasi.map((l) => l.nagariNama))}, Kecamatan ${ringkasUnik(
        rekap.lokasi.map((l) => l.kecNama)
      )}. Selama kegiatan berlangsung, petugas melakukan identifikasi/verifikasi usaha di ${jumlahLokasi} lokasi ` +
      `Jorong/Sub SLS, dengan rincian ${rekap.rekapIdentifikasi.ada} usaha/keluarga ditemukan, ${rekap.rekapIdentifikasi.tidak_ada} ` +
      `tidak ditemukan, dan ${rekap.rekapIdentifikasi.ragu} memerlukan verifikasi ulang (ragu), dari total ${rekap.totalAktivitas} ` +
      `data yang diperbarui pada tanggal tersebut. Kegiatan dilaksanakan pulang-pergi dari tempat kedudukan pada hari yang sama.`;
    p.paragraf(uraian);
    if (data.narasi && data.narasi.trim()) {
      p.turun(6);
      p.paragraf(`Catatan tambahan dari petugas: ${data.narasi.trim()}`);
    }
    p.turun(14);

    // ---------- C. Rekapitulasi Dokumentasi ----------
    p.pastikanRuang(30);
    p.teks("C. REKAPITULASI DOKUMENTASI", MARGIN_X, { bold: true, size: 10.5 });
    p.turun(18);
    const dokParagraf =
      rekap.jumlahDokumentasi > 0
        ? `Dokumentasi kegiatan pada tanggal tersebut sebanyak ${rekap.jumlahDokumentasi} foto terlampir (lihat Lampiran Dokumentasi Kegiatan).`
        : "Dokumentasi kegiatan utk tanggal ini belum/tidak dilampirkan.";
    p.paragraf(dokParagraf);
  } else {
    // ---------- Mode bebas: seluruhnya narasi petugas ----------
    p.teks("URAIAN PERJALANAN DAN PELAKSANAAN TUGAS", MARGIN_X, { bold: true, size: 10.5 });
    p.turun(18);
    p.paragraf(data.narasi && data.narasi.trim() ? data.narasi.trim() : "(Belum ada narasi.)");
  }

  return p.doc.save();
}
