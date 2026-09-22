// lib/pdf/laporan.ts
//
// Generator PDF "Laporan Perjalanan Dinas SE2026" -- meniru PERSIS desain
// contoh yang diberikan user (Laporan_Perjalanan_Dinas_SE2026_Saya_2.pdf,
// dihasilkan skrip Python reportlab): pita header navy+oranye, judul, blok
// identitas 2x2, 3 kartu angka, seksi "Uraian", tabel "Ringkasan", seksi
// "Data Hasil Penyisiran" (2 panel + tabel lokasi), catatan, footer.
// Semua koordinat/ukuran di bawah diukur LANGSUNG dari PDF contoh tsb
// (pdftotext -bbox-layout + parsing content-stream pikepdf utk posisi
// persegi/garis), BUKAN ditaksir -- supaya hasilnya sedekat mungkin dgn
// desain final yang disetujui user.
//
// Datanya ditarik dari rekap_snapshot yang dibekukan saat Laporan dibuat
// (lihat app/api/penyisiran/spj/laporan/route.ts) -- BUKAN dihitung ulang
// saat PDF diunduh, supaya laporan yang sudah jadi tidak berubah diam2
// kalau data di tab Penyisiran Usaha/Identifikasi diedit belakangan.
//
// JAMINAN 1 HALAMAN: karena panjang narasi & jumlah baris tabel (lokasi)
// tidak bisa diprediksi (tergantung berapa lokasi yang disisir & berapa
// panjang narasi bebas petugas), dipakai mekanisme "ukur dulu, gambar
// kemudian" (lihat hitungTinggiKonten/gambarKonten): keduanya memanggil
// helper PERSIS SAMA (bungkusTeks, baitStatusKunjungan, baitLokasi) utk
// menghitung baris terbungkus & jumlah baris tabel, supaya angka yg
// dipakai memilih konfigurasi SELALU sama dgn yg benar2 digambar -- tidak
// ada duplikasi logika yang bisa meleset (measure vs draw drift).
//
// Dua mode (field `mode` di tabel spj_laporan):
//  - "template": tampilkan identitas+kartu angka+uraian+ringkasan+data
//    hasil penyisiran OTOMATIS dari rekap_snapshot, + catatan tambahan
//    (opsional) dari petugas.
//  - "bebas": SELURUH isi "Uraian" adalah narasi bebas yang diketik
//    petugas sendiri -- kartu angka jadi placeholder ("-"/1/"-"), seksi
//    Ringkasan & Data Hasil Penyisiran TIDAK ditampilkan.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import { formatTanggalIndoDenganHari, judulKecamatan } from "../spjFormat";
import { KEGIATAN_NAMA } from "../spjPejabat";

// ---------- Tipe data ----------

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
  // Dua field BARU (opsional, blm tentu ada di snapshot lama sblm fitur
  // ini dibuat) -- lihat komentar RekapTemplate di
  // app/api/penyisiran/spj/laporan/route.ts.
  rekapStatusKunjungan?: Record<string, number>;
  lokasiPenyisiran?: LaporanLokasiRow[];
}

export type PetugasJenisLaporan = "penyisiran" | "tetangga";

export interface LaporanPdfData {
  nomorSt: string;
  namaPetugas: string;
  peranLabel: string;
  petugasJenis: PetugasJenisLaporan;
  tanggal: string;
  mode: "template" | "bebas";
  narasi: string | null;
  rekap: LaporanRekapSnapshot | null;
}

// ---------- Ukuran halaman & warna ----------

const MM = 2.834645669;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 20 * MM; // 56.69 -- sama persis dgn contoh
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 481.89
const CONTENT_L = MARGIN_X;
const CONTENT_R = PAGE_W - MARGIN_X;
const CONTENT_MID = MARGIN_X + CONTENT_W / 2;

// Budget vertikal isi (diukur dari contoh: konten mulai ~53.86 dari atas,
// berakhir maksimal ~788.03 dari atas -- footer & pita header ada DI DALAM
// margin, tidak memotong ruang isi).
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
const PUTIH = rgb(1, 1, 1);

// ---------- Label & konstanta domain ----------

// SAMA PERSIS dgn STATUS_VALID di app/api/penyisiran/update/route.ts.
const LABEL_STATUS_KUNJUNGAN: Record<string, string> = {
  belum: "Belum",
  ditemukan: "Ditemukan",
  tidak_ditemukan: "Tidak Ditemukan",
  tidak_bisa: "Tidak Bisa Ditemui/Pindah",
  sudah_didata_se2026: "Sudah Didata SE2026",
  jadwalkan_besok: "Dijadwalkan Besok",
};
const URUTAN_STATUS_KUNJUNGAN = [
  "belum",
  "ditemukan",
  "tidak_ditemukan",
  "tidak_bisa",
  "sudah_didata_se2026",
  "jadwalkan_besok",
];

const KEGIATAN_LABEL: Record<PetugasJenisLaporan, string> = {
  penyisiran: "Penyisiran Usaha / Identifikasi Jorong SE2026",
  tetangga: "Penyisiran Usaha / Identifikasi Tetangga SE2026",
};

// ---------- Helper murni (dipakai BERSAMA oleh pengukuran & penggambaran) ----------

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

/** "Jorong X / Sub SLS 01 / Nagari Y / Kec. Z" -> "X / 01 / Y / Z" (urutan & kapital sesuai header tabel). */
function labelLokasi(row: LaporanLokasiRow): string {
  return [row.slsNama, row.subslsKode, row.nagariNama, row.kecNama]
    .map((v) => (v && v.trim() ? v.trim() : "-").toUpperCase())
    .join(" / ");
}

/** lokasiPenyisiran (Penyisiran Usaha, sumber UTAMA sejak jadi wajib) -- fallback ke `lokasi` (Identifikasi) kalau kosong. */
function lokasiUtama(rekap: LaporanRekapSnapshot): LaporanLokasiRow[] {
  if (rekap.lokasiPenyisiran && rekap.lokasiPenyisiran.length > 0) return rekap.lokasiPenyisiran;
  return rekap.lokasi;
}

// Dibatasi supaya teksnya tetap wajar dibaca dlm 1 baris/dua -- kalau
// nagari yg disisir dlm 1 hari lebih dari 3 (jarang, tapi bisa terjadi utk
// petugas yg berpindah2 nagari), diringkas jadi "N nagari" drpd
// mendaftar semuanya (yg bisa membengkak tak terbatas & merusak jaminan 1
// halaman).
function wilayahTugasTeks(lok: LaporanLokasiRow[]): string {
  // Nilai mentah dari DB tersimpan UPPERCASE -- di-title-case (judulKecamatan)
  // dulu sebelum dipakai di kalimat/narasi, supaya "SELAYO, Kecamatan KUBUNG"
  // tampil proper "Selayo, Kecamatan Kubung".
  const nagariUnik = [...new Set(lok.map((l) => (l.nagariNama ?? "").trim()).filter(Boolean))].map(judulKecamatan);
  const kecUnik = [...new Set(lok.map((l) => (l.kecNama ?? "").trim()).filter(Boolean))].map(judulKecamatan);
  const kec = kecUnik.length > 0 ? kecUnik.join(", ") : "-";
  if (nagariUnik.length === 0 && kec === "-") return "-";
  if (nagariUnik.length === 0) return `Kecamatan ${kec}`;
  const nagariTeks = nagariUnik.length <= 3 ? nagariUnik.join(", ") : `${nagariUnik.length} nagari`;
  return `${nagariTeks}, Kecamatan ${kec}`;
}

function jumlahWilayah(lok: LaporanLokasiRow[]): number {
  const nagariSet = new Set(lok.map((l) => l.nagariNama).filter((v): v is string => !!v && v.trim() !== ""));
  if (nagariSet.size > 0) return nagariSet.size;
  const kecSet = new Set(lok.map((l) => l.kecNama).filter((v): v is string => !!v && v.trim() !== ""));
  return kecSet.size;
}

/** Total "keluarga dikunjungi" -- dari jumlah perubahan status_kunjungan (Penyisiran Usaha) pd tanggal itu; fallback ke totalAktivitas (Identifikasi) kalau data Penyisiran Usaha belum ada (laporan lama). */
function keluargaDikunjungi(rekap: LaporanRekapSnapshot): number {
  const nilai = Object.values(rekap.rekapStatusKunjungan ?? {});
  if (nilai.length > 0) return nilai.reduce((a, b) => a + b, 0);
  return rekap.totalAktivitas;
}

/** Baris tabel "Kartu Keluarga per Status Kunjungan" -- hanya status yg jumlahnya > 0, urutan tetap (bukan urutan kemunculan). */
function baitStatusKunjungan(rekap: LaporanRekapSnapshot): { label: string; jumlah: number }[] {
  const peta = rekap.rekapStatusKunjungan ?? {};
  return URUTAN_STATUS_KUNJUNGAN.filter((k) => (peta[k] ?? 0) > 0).map((k) => ({
    label: LABEL_STATUS_KUNJUNGAN[k] ?? k,
    jumlah: peta[k],
  }));
}

/** Baris tabel lokasi lebar-penuh, dgn batas opsional (mekanisme susut, langkah 3: "N lokasi teratas + 1 baris ringkas"). */
function baitLokasi(
  lok: LaporanLokasiRow[],
  batas: number | null
): { label: string; jumlah: number }[] {
  if (batas === null || lok.length <= batas) {
    return lok.map((l) => ({ label: labelLokasi(l), jumlah: l.jumlah }));
  }
  const tampil = lok.slice(0, batas);
  const sisa = lok.slice(batas);
  const jumlahSisa = sisa.reduce((a, b) => a + b.jumlah, 0);
  const baris = tampil.map((l) => ({ label: labelLokasi(l), jumlah: l.jumlah }));
  baris.push({ label: `Lokasi lainnya (${sisa.length} lokasi)`, jumlah: jumlahSisa });
  return baris;
}

// ---------- Konfigurasi susut bertahap (font isi 10->9,5->9->8,5pt) ----------

interface Konfig {
  fontIsi: number;
  leadingIsi: number;
  fontTabel: number;
  tinggiBarisMin: number; // baris 1-baris
  leadingTabel: number; // tambahan tinggi per baris terbungkus ekstra
}
const KONFIGURASI: Konfig[] = [
  { fontIsi: 10, leadingIsi: 14, fontTabel: 9.5, tinggiBarisMin: 20.5, leadingTabel: 12.5 },
  { fontIsi: 9.5, leadingIsi: 13, fontTabel: 9.2, tinggiBarisMin: 18.5, leadingTabel: 11.5 },
  { fontIsi: 9, leadingIsi: 12.2, fontTabel: 9, tinggiBarisMin: 17, leadingTabel: 11 },
  { fontIsi: 8.5, leadingIsi: 11.5, fontTabel: 8.5, tinggiBarisMin: 16, leadingTabel: 10.5 },
];

// ---------- Konteks penggambaran/pengukuran (dipakai keduanya) ----------

interface Konteks {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  fontItalic: PDFFont;
  gambar: boolean; // false = mode ukur saja (tidak menggambar apa pun)
}

function teks(
  c: Konteks,
  txt: string,
  x: number,
  yAtas: number, // offset topdown dari atas halaman (bukan baseline)
  size: number,
  opts: { bold?: boolean; italic?: boolean; color?: RGB; align?: "left" | "right" | "center"; width?: number } = {}
) {
  if (!c.gambar) return;
  const f = opts.italic ? c.fontItalic : opts.bold ? c.fontBold : c.font;
  const color = opts.color ?? TEXT;
  let xPos = x;
  if (opts.width && opts.align === "right") xPos = x + opts.width - f.widthOfTextAtSize(txt, size);
  else if (opts.width && opts.align === "center") xPos = x + (opts.width - f.widthOfTextAtSize(txt, size)) / 2;
  const yBaseline = PAGE_H - yAtas - size * 0.8;
  c.page.drawText(txt, { x: xPos, y: yBaseline, size, font: f, color });
}

function kotak(
  c: Konteks,
  x: number,
  yAtas: number,
  w: number,
  h: number,
  opts: { fill?: RGB; border?: RGB; borderWidth?: number } = {}
) {
  if (!c.gambar) return;
  c.page.drawRectangle({
    x,
    y: PAGE_H - yAtas - h,
    width: w,
    height: h,
    color: opts.fill,
    borderColor: opts.border,
    borderWidth: opts.borderWidth,
  });
}

function garisH(c: Konteks, x1: number, x2: number, yAtas: number, color: RGB, thickness: number) {
  if (!c.gambar) return;
  c.page.drawLine({ start: { x: x1, y: PAGE_H - yAtas }, end: { x: x2, y: PAGE_H - yAtas }, thickness, color });
}

function garisV(c: Konteks, x: number, yAtas1: number, yAtas2: number, color: RGB, thickness: number) {
  if (!c.gambar) return;
  c.page.drawLine({ start: { x, y: PAGE_H - yAtas1 }, end: { x, y: PAGE_H - yAtas2 }, thickness, color });
}

// ---------- Bagian layout tetap (ukurannya sama tiap laporan) ----------

const HEADER_BAR_H = 7 * MM;
const HEADER_STRIP_H = 1.2 * MM;

const GAP_SUBTITLE_TO_GRID = 10.25;
const GRID_ROW_H = 39.5;
const GRID_LABEL_OFFSET = 9.0;
const GRID_VALUE_OFFSET = 21.5;
const GAP_GRID_TO_CARDS = 9.0;
const CARD_GAP = 5 * MM;
const CARD_W = (CONTENT_W - 2 * CARD_GAP) / 3;
const CARD_H = 49.0;
const CARD_NUM_OFFSET = 12.0;
const CARD_CAPTION_OFFSET = 34.0;
const GAP_CARDS_TO_SECTION = 14.0;

const SECTION_BOX_W = 3 * MM;
const SECTION_BOX_H = 16.0;
const SECTION_TITLE_GAP_X = 7.0;
const SECTION_TITLE_TEXT_OFFSET = 4.0;
const GAP_SECTIONTITLE_TO_BODY = 9.5;
const GAP_ANTAR_PARAGRAF = 9.0;
const GAP_ANTAR_SEKSI = 14.0;

const RINGKASAN_KEY_W = 34 * MM;
const RINGKASAN_ROW_MIN_H = 22.5;
const RINGKASAN_VALUE_OFFSET = 7.4;
const RINGKASAN_VALUE_LEADING = 12.5;
const RINGKASAN_KEY_SIZE = 9.5;
const RINGKASAN_PAD_X = 6.0;
const GAP_SECTIONTITLE_TO_TABEL = 7.0;

const HASIL_SUBTITLE_H = 26.0; // 2 baris (judul + anotasi kecil) -- lihat gambarKonten
const HASIL_TABEL_HEADER_H = 18.0;
const HASIL_PANEL_GAP = 6 * MM;
const HASIL_PANEL_W = (CONTENT_W - HASIL_PANEL_GAP) / 2;
const HASIL_IDENT_BOX_H = 45.0;
const HASIL_IDENT_NUM_OFFSET = 11.5;
const HASIL_IDENT_LABEL_OFFSET = 28.9;
const GAP_PANEL_TO_TABEL = 10.0;
const HASIL_ROW_PAD_TOP = 6.4;
const HASIL_JUMLAH_COL_W = 27 * MM;
const HASIL_PAD_X = 6.0;

const GAP_BEFORE_CATATAN = 10.25;
const CATATAN_SIZE = 9;
const CATATAN_LEADING = 12.0;

const FOOTER_LINE_DARI_BAWAH = 38.27;
const FOOTER_TEXT_DARI_BAWAH = 31.9;
const FOOTER_SIZE = 8.5;

// ---------- Header pita (navy+oranye, di tepi atas, di luar alur isi) ----------

function gambarHeaderPitaDanFooter(c: Konteks) {
  kotak(c, 0, 0, PAGE_W, HEADER_BAR_H, { fill: NAVY });
  kotak(c, 0, HEADER_BAR_H, PAGE_W, HEADER_STRIP_H, { fill: ORANGE });

  garisH(c, CONTENT_L, CONTENT_R, PAGE_H - FOOTER_LINE_DARI_BAWAH, LINE, 0.6);
  teks(c, "SE2026 • Laporan Perjalanan Dinas", CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, {
    color: TEXT_SEC,
  });
  teks(c, "Halaman 1", CONTENT_L, PAGE_H - FOOTER_TEXT_DARI_BAWAH, FOOTER_SIZE, {
    color: TEXT_SEC,
    align: "right",
    width: CONTENT_W,
  });
}

function judulSeksi(c: Konteks, y: number, judul: string): number {
  kotak(c, CONTENT_L, y, SECTION_BOX_W, SECTION_BOX_H, { fill: ORANGE });
  teks(c, judul, CONTENT_L + SECTION_BOX_W + SECTION_TITLE_GAP_X, y + SECTION_TITLE_TEXT_OFFSET, 10.5, {
    bold: true,
    color: NAVY,
  });
  return y + SECTION_BOX_H;
}

// ---------- Bagian INTI: menghasilkan konten, dipakai utk ukur & gambar ----------
//
// Mengembalikan y (offset topdown) SETELAH elemen terakhir digambar/diukur --
// fungsi ini SAMA PERSIS dipanggil dua kali (draw=false utk ukur & pilih
// konfigurasi, draw=true utk menggambar final) supaya angka yg dipakai
// memilih konfigurasi konsisten dgn apa yg benar2 tergambar.

function gambarKonten(
  c: Konteks,
  data: LaporanPdfData,
  konfig: Konfig,
  batasLokasi: number | null
): number {
  let y = BUDGET_TOP;

  // ---------- Judul ----------
  teks(c, "LAPORAN PERJALANAN DINAS", CONTENT_L, y, 20, { bold: true, color: NAVY });
  y += 24.0;
  teks(c, KEGIATAN_NAMA, CONTENT_L, y, 11, { color: TEXT_SEC });
  y += 11.0 + GAP_SUBTITLE_TO_GRID;

  // ---------- Blok identitas 2x2 ----------
  // Tinggi tiap baris DINAMIS (bukan tetap) -- label "Peran" (dari
  // LABEL_PERAN, lib/spjAuth.ts) cukup panjang & bisa membungkus 2 baris
  // pada kolom selebar setengah konten, jadi tiap sel dihitung dulu jumlah
  // baris terbungkusnya (fungsi SAMA dipakai ukur & gambar).
  const gridValW = CONTENT_W / 2 - RINGKASAN_PAD_X * 2;
  const selIdentitas: [string, string][][] = [
    [
      ["NAMA PETUGAS", data.namaPetugas || "-"],
      ["JABATAN", data.peranLabel],
    ],
    [
      ["NOMOR SURAT TUGAS", data.nomorSt || "-"],
      ["TANGGAL", formatTanggalIndoDenganHari(data.tanggal)],
    ],
  ];
  const gridBaris = selIdentitas.map((baris) =>
    baris.map(([label, nilai]) => ({ label, baris: bungkusTeks(c.fontBold, nilai, 10.5, gridValW) }))
  );
  const gridTop = y;
  const tinggiBarisGrid = gridBaris.map((baris) => {
    const maxBaris = Math.max(...baris.map((s) => s.baris.length), 1);
    return GRID_ROW_H + (maxBaris - 1) * 13.0;
  });
  const gridTotalH = tinggiBarisGrid[0] + tinggiBarisGrid[1];
  kotak(c, CONTENT_L, gridTop, CONTENT_W, gridTotalH, { fill: SOFT_BG, border: LINE, borderWidth: 0.6 });
  garisH(c, CONTENT_L, CONTENT_R, gridTop + tinggiBarisGrid[0], LINE, 0.6);
  garisV(c, CONTENT_MID, gridTop, gridTop + gridTotalH, LINE, 0.6);

  let rowTop = gridTop;
  gridBaris.forEach((baris, i) => {
    baris.forEach((sel, j) => {
      const x = CONTENT_L + j * (CONTENT_W / 2) + RINGKASAN_PAD_X;
      teks(c, sel.label, x, rowTop + GRID_LABEL_OFFSET, 8, { bold: true, color: TEXT_SEC });
      sel.baris.forEach((b, k) => teks(c, b, x, rowTop + GRID_VALUE_OFFSET + k * 13.0, 10.5, { bold: true, color: TEXT }));
    });
    rowTop += tinggiBarisGrid[i];
  });
  y = gridTop + gridTotalH + GAP_GRID_TO_CARDS;

  // ---------- 3 kartu angka ----------
  const modeTemplate = data.mode === "template" && !!data.rekap;
  const lok = modeTemplate ? lokasiUtama(data.rekap as LaporanRekapSnapshot) : [];
  const kartu: [string, string][] = modeTemplate
    ? [
        [String(keluargaDikunjungi(data.rekap as LaporanRekapSnapshot)), "KELUARGA DIKUNJUNGI"],
        ["1", "HARI PELAKSANAAN"],
        [String(jumlahWilayah(lok)), "WILAYAH PENYISIRAN"],
      ]
    : [
        ["-", "KELUARGA DIKUNJUNGI"],
        ["1", "HARI PELAKSANAAN"],
        ["-", "WILAYAH PENYISIRAN"],
      ];
  const cardTop = y;
  kartu.forEach(([angka, label], i) => {
    const x = CONTENT_L + i * (CARD_W + CARD_GAP);
    garisH(c, x, x + CARD_W, cardTop, NAVY, 2);
    teks(c, angka, x, cardTop + CARD_NUM_OFFSET, 20, { bold: true, color: NAVY, align: "center", width: CARD_W });
    teks(c, label, x, cardTop + CARD_CAPTION_OFFSET, 8, { bold: true, color: TEXT_SEC, align: "center", width: CARD_W });
  });
  y = cardTop + CARD_H + GAP_CARDS_TO_SECTION;

  // ---------- Uraian ----------
  y = judulSeksi(c, y, "URAIAN PERJALANAN DAN PELAKSANAAN TUGAS");
  y += GAP_SECTIONTITLE_TO_BODY;

  let paragraf: string[];
  if (modeTemplate) {
    const rekap = data.rekap as LaporanRekapSnapshot;
    const wilayah = wilayahTugasTeks(lok);
    const kegiatan = KEGIATAN_LABEL[data.petugasJenis];
    const jumlahKeluarga = keluargaDikunjungi(rekap);
    paragraf = [
      `Pada hari ${formatTanggalIndoDenganHari(data.tanggal)}, ${data.namaPetugas} melaksanakan tugas ${kegiatan} ` +
        `di wilayah ${wilayah === "-" ? "tugas yang telah ditetapkan" : wilayah}. Kegiatan ini dilaksanakan dalam rangka ` +
        `menjalankan tugas sebagai ${data.peranLabel}.`,
      `Selama pelaksanaan kegiatan, ${data.namaPetugas} mengunjungi ${jumlahKeluarga} keluarga yang usahanya telah ` +
        `terdata pada pendataan SE2026. Kunjungan tersebut merupakan bagian dari pelaksanaan penyisiran di wilayah ` +
        `tugas untuk mendukung proses ${data.petugasJenis === "tetangga" ? "identifikasi tetangga/informan" : "identifikasi jorong"}.`,
      `Kegiatan dilaksanakan dengan pola pulang-pergi dari kedudukan dan diselesaikan pada hari yang sama. Dengan ` +
        `demikian, seluruh rangkaian perjalanan dinas pada tanggal tersebut dilaksanakan dalam satu hari.`,
    ];
  } else {
    paragraf = [data.narasi && data.narasi.trim() ? data.narasi.trim() : "(Belum ada narasi.)"];
  }
  paragraf.forEach((p, i) => {
    for (const baris of bungkusTeks(c.font, p, konfig.fontIsi, CONTENT_W)) {
      teks(c, baris, CONTENT_L, y, konfig.fontIsi, { color: TEXT });
      y += konfig.leadingIsi;
    }
    if (i < paragraf.length - 1) y += GAP_ANTAR_PARAGRAF;
  });

  if (modeTemplate && data.narasi && data.narasi.trim()) {
    y += GAP_ANTAR_PARAGRAF;
    const catatanTambahan = `Catatan tambahan dari petugas: ${data.narasi.trim()}`;
    for (const baris of bungkusTeks(c.fontItalic, catatanTambahan, konfig.fontIsi, CONTENT_W)) {
      teks(c, baris, CONTENT_L, y, konfig.fontIsi, { italic: true, color: TEXT_SEC });
      y += konfig.leadingIsi;
    }
  }

  if (!modeTemplate) return y; // mode bebas: berhenti di sini (tanpa ringkasan/hasil).

  const rekap = data.rekap as LaporanRekapSnapshot;
  y += GAP_ANTAR_SEKSI;

  // ---------- Ringkasan Pelaksanaan ----------
  y = judulSeksi(c, y, "RINGKASAN PELAKSANAAN");
  y += GAP_SECTIONTITLE_TO_TABEL;

  const kegiatanLabel = KEGIATAN_LABEL[data.petugasJenis];
  const pasangan: [string, string][] = [
    ["Wilayah tugas", wilayahTugasTeks(lok)],
    ["Kegiatan", kegiatanLabel],
    ["Objek kunjungan", "Keluarga yang usahanya telah terdata pada SE2026"],
    ["Jumlah kunjungan", `${keluargaDikunjungi(rekap)} keluarga`],
    ["Pola perjalanan", "Pulang-pergi dari kedudukan"],
    ["Pelaksanaan", "Selesai pada hari yang sama"],
  ];
  const ringkasanTop = y;
  const valColW = CONTENT_W / 2 - RINGKASAN_KEY_W;
  for (let r = 0; r < 3; r++) {
    const kiri = pasangan[r * 2];
    const kanan = pasangan[r * 2 + 1];
    const barisKiri = bungkusTeks(c.font, kiri[1], RINGKASAN_KEY_SIZE, valColW - RINGKASAN_PAD_X * 2);
    const barisKanan = bungkusTeks(c.font, kanan[1], RINGKASAN_KEY_SIZE, valColW - RINGKASAN_PAD_X * 2);
    const maxBaris = Math.max(barisKiri.length, barisKanan.length, 1);
    const tinggiBaris = RINGKASAN_ROW_MIN_H + (maxBaris - 1) * RINGKASAN_VALUE_LEADING;
    const rowTop = y;

    kotak(c, CONTENT_L, rowTop, RINGKASAN_KEY_W, tinggiBaris, { fill: SOFT_BG });
    kotak(c, CONTENT_MID, rowTop, RINGKASAN_KEY_W, tinggiBaris, { fill: SOFT_BG });
    teks(c, kiri[0], CONTENT_L + RINGKASAN_PAD_X, rowTop + tinggiBaris / 2 - RINGKASAN_KEY_SIZE / 2, RINGKASAN_KEY_SIZE, {
      bold: true,
      color: TEXT,
    });
    teks(
      c,
      kanan[0],
      CONTENT_MID + RINGKASAN_PAD_X,
      rowTop + tinggiBaris / 2 - RINGKASAN_KEY_SIZE / 2,
      RINGKASAN_KEY_SIZE,
      { bold: true, color: TEXT }
    );
    barisKiri.forEach((b, i) =>
      teks(c, b, CONTENT_L + RINGKASAN_KEY_W + RINGKASAN_PAD_X, rowTop + RINGKASAN_VALUE_OFFSET + i * RINGKASAN_VALUE_LEADING, RINGKASAN_KEY_SIZE, {
        color: TEXT,
      })
    );
    barisKanan.forEach((b, i) =>
      teks(
        c,
        b,
        CONTENT_MID + RINGKASAN_KEY_W + RINGKASAN_PAD_X,
        rowTop + RINGKASAN_VALUE_OFFSET + i * RINGKASAN_VALUE_LEADING,
        RINGKASAN_KEY_SIZE,
        { color: TEXT }
      )
    );
    y += tinggiBaris;
    if (r < 2) garisH(c, CONTENT_L, CONTENT_R, y, LINE, 0.6);
  }
  garisH(c, CONTENT_L, CONTENT_R, ringkasanTop, LINE, 0.6);
  garisH(c, CONTENT_L, CONTENT_R, y, LINE, 0.6);
  garisV(c, CONTENT_L, ringkasanTop, y, LINE, 0.6);
  garisV(c, CONTENT_R, ringkasanTop, y, LINE, 0.6);
  garisV(c, CONTENT_MID, ringkasanTop, y, LINE, 0.6);

  // ---------- Data Hasil Penyisiran (opsional -- disembunyikan kalau kosong) ----------
  const baitStatus = baitStatusKunjungan(rekap);
  const lokBaris = baitLokasi(lok, batasLokasi);
  const adaDataHasil = baitStatus.length > 0 || rekap.totalAktivitas > 0 || lokBaris.length > 0 || rekap.jumlahDokumentasi > 0;

  if (adaDataHasil) {
    y += GAP_ANTAR_SEKSI;
    y = judulSeksi(c, y, `DATA HASIL PENYISIRAN TANGGAL ${formatTanggalIndoDenganHari(data.tanggal).toUpperCase()}`);
    y += GAP_SECTIONTITLE_TO_TABEL;

    // -- Subjudul 2 panel (2 baris: judul bold + anotasi kecil di bawahnya --
    // DUA BARIS, bukan disatukan di 1 baris spt contoh asli, krn font
    // fallback Helvetica lebih lebar drpd Carlito asli & bisa tumpang
    // tindih ke panel sebelah kalau dipaksa 1 baris) --
    const panelKiriX = CONTENT_L;
    const xKanan = CONTENT_L + HASIL_PANEL_W + HASIL_PANEL_GAP;
    const subtitleTop = y;
    teks(c, "Kartu Keluarga per Status Kunjungan", panelKiriX, subtitleTop, 9.5, { bold: true, color: TEXT });
    teks(c, "(Penyisiran Usaha)", panelKiriX, subtitleTop + 12.0, 8, { color: TEXT_SEC });

    const totalIdent = rekap.totalAktivitas;
    teks(c, "Identifikasi Jorong/Tetangga", xKanan, subtitleTop, 9.5, { bold: true, color: TEXT });
    teks(c, `— ${totalIdent} keluarga`, xKanan, subtitleTop + 12.0, 8, { color: TEXT_SEC });
    y += HASIL_SUBTITLE_H;

    // -- Panel kiri: tabel status kunjungan --
    const panelTop = y;

    const tinggiBarisStatus = baitStatus.map(() => konfig.tinggiBarisMin);
    const tinggiPanelKiri = HASIL_TABEL_HEADER_H + tinggiBarisStatus.reduce((a, b) => a + b, 0);

    kotak(c, panelKiriX, panelTop, HASIL_PANEL_W, HASIL_TABEL_HEADER_H, { fill: SOFT_BG });
    teks(c, "STATUS KUNJUNGAN", panelKiriX + HASIL_PAD_X, panelTop + 6.0, 7.5, { bold: true, color: TEXT_SEC });
    teks(c, "JML KELUARGA", panelKiriX + HASIL_PAD_X, panelTop + 6.0, 7.5, {
      bold: true,
      color: TEXT_SEC,
      align: "right",
      width: HASIL_PANEL_W - HASIL_PAD_X * 2,
    });
    let rowY = panelTop + HASIL_TABEL_HEADER_H;
    if (baitStatus.length === 0) {
      teks(c, "(Belum ada perubahan status kunjungan tercatat.)", panelKiriX + HASIL_PAD_X, rowY + HASIL_ROW_PAD_TOP, 8.5, {
        color: TEXT_SEC,
        italic: true,
      });
      rowY += konfig.tinggiBarisMin;
    } else {
      baitStatus.forEach((s) => {
        teks(c, s.label, panelKiriX + HASIL_PAD_X, rowY + HASIL_ROW_PAD_TOP, konfig.fontTabel, { color: TEXT });
        teks(c, String(s.jumlah), panelKiriX + HASIL_PAD_X, rowY + HASIL_ROW_PAD_TOP, konfig.fontTabel, {
          bold: true,
          color: TEXT,
          align: "right",
          width: HASIL_PANEL_W - HASIL_PAD_X * 2,
        });
        rowY += konfig.tinggiBarisMin;
        garisH(c, panelKiriX, panelKiriX + HASIL_PANEL_W, rowY, LINE, 0.6);
      });
    }
    garisH(c, panelKiriX, panelKiriX + HASIL_PANEL_W, panelTop, LINE, 0.6);
    garisH(c, panelKiriX, panelKiriX + HASIL_PANEL_W, panelTop + HASIL_TABEL_HEADER_H, LINE, 0.6);
    garisV(c, panelKiriX, panelTop, rowY, LINE, 0.6);
    garisV(c, panelKiriX + HASIL_PANEL_W, panelTop, rowY, LINE, 0.6);

    // -- Panel kanan: 4 angka Identifikasi --
    kotak(c, xKanan, panelTop, HASIL_PANEL_W, HASIL_IDENT_BOX_H, { fill: PUTIH, border: LINE, borderWidth: 0.6 });
    const identCols: [string, string][] = [
      [String(rekap.rekapIdentifikasi.ada), "ADA"],
      [String(rekap.rekapIdentifikasi.tidak_ada), "TIDAK ADA"],
      [String(rekap.rekapIdentifikasi.ragu), "RAGU"],
      [String(rekap.rekapIdentifikasi.belum), "BELUM"],
    ];
    const colW = HASIL_PANEL_W / 4;
    identCols.forEach(([angka, label], i) => {
      const x = xKanan + i * colW;
      if (i > 0) garisV(c, x, panelTop, panelTop + HASIL_IDENT_BOX_H, LINE, 0.6);
      teks(c, angka, x, panelTop + HASIL_IDENT_NUM_OFFSET, 14, { bold: true, color: NAVY, align: "center", width: colW });
      teks(c, label, x, panelTop + HASIL_IDENT_LABEL_OFFSET, 7.5, {
        bold: true,
        color: TEXT_SEC,
        align: "center",
        width: colW,
      });
    });

    y = panelTop + Math.max(tinggiPanelKiri, HASIL_IDENT_BOX_H) + GAP_PANEL_TO_TABEL;

    // -- Tabel lengkap: lokasi --
    const tabelTop = y;
    kotak(c, CONTENT_L, tabelTop, CONTENT_W, HASIL_TABEL_HEADER_H, { fill: SOFT_BG });
    teks(c, "LOKASI (JORONG / SUB SLS / NAGARI / KEC.)", CONTENT_L + HASIL_PAD_X, tabelTop + 6.0, 7.5, {
      bold: true,
      color: TEXT_SEC,
    });
    teks(c, "JML KELUARGA", CONTENT_L + HASIL_PAD_X, tabelTop + 6.0, 7.5, {
      bold: true,
      color: TEXT_SEC,
      align: "right",
      width: CONTENT_W - HASIL_PAD_X * 2,
    });
    let ry = tabelTop + HASIL_TABEL_HEADER_H;
    if (lokBaris.length === 0) {
      teks(c, "(Tidak ada aktivitas yang tercatat pada tanggal ini.)", CONTENT_L + HASIL_PAD_X, ry + HASIL_ROW_PAD_TOP, 8.5, {
        color: TEXT_SEC,
        italic: true,
      });
      ry += konfig.tinggiBarisMin;
      garisH(c, CONTENT_L, CONTENT_R, ry, LINE, 0.6);
    } else {
      lokBaris.forEach((l) => {
        const barisLabel = bungkusTeks(c.font, l.label, konfig.fontTabel, CONTENT_W - HASIL_PAD_X * 2 - HASIL_JUMLAH_COL_W);
        const tinggi = konfig.tinggiBarisMin + (barisLabel.length - 1) * konfig.leadingTabel;
        barisLabel.forEach((bl, i) =>
          teks(c, bl, CONTENT_L + HASIL_PAD_X, ry + HASIL_ROW_PAD_TOP + i * konfig.leadingTabel, konfig.fontTabel, { color: TEXT })
        );
        teks(c, String(l.jumlah), CONTENT_L + HASIL_PAD_X, ry + HASIL_ROW_PAD_TOP, konfig.fontTabel, {
          bold: true,
          color: TEXT,
          align: "right",
          width: CONTENT_W - HASIL_PAD_X * 2,
        });
        ry += tinggi;
        garisH(c, CONTENT_L, CONTENT_R, ry, LINE, 0.6);
      });
    }
    // -- Baris penutup: dokumentasi --
    kotak(c, CONTENT_L, ry, CONTENT_W, konfig.tinggiBarisMin, { fill: SOFT_BG });
    garisH(c, CONTENT_L, CONTENT_R, ry, NAVY, 1);
    teks(c, "Dokumentasi tanggal ini", CONTENT_L + HASIL_PAD_X, ry + HASIL_ROW_PAD_TOP, konfig.fontTabel, { color: TEXT });
    teks(c, `${rekap.jumlahDokumentasi} foto`, CONTENT_L + HASIL_PAD_X, ry + HASIL_ROW_PAD_TOP, konfig.fontTabel, {
      bold: true,
      color: TEXT,
      align: "right",
      width: CONTENT_W - HASIL_PAD_X * 2,
    });
    ry += konfig.tinggiBarisMin;
    garisH(c, CONTENT_L, CONTENT_R, tabelTop, LINE, 0.6);
    garisV(c, CONTENT_L, tabelTop, ry, LINE, 0.6);
    garisV(c, CONTENT_R, tabelTop, ry, LINE, 0.6);
    garisH(c, CONTENT_L, CONTENT_R, tabelTop + HASIL_TABEL_HEADER_H, LINE, 0.6);

    y = ry;
  }

  // ---------- Catatan ----------
  y += GAP_BEFORE_CATATAN;
  const catatanTeks =
    `Laporan ini disusun sebagai laporan pelaksanaan perjalanan dinas pada ${formatTanggalIndoDenganHari(data.tanggal)}.`;
  const prefiks = "Catatan: ";
  const lebarPrefiks = c.fontBold.widthOfTextAtSize(prefiks, CATATAN_SIZE);
  teks(c, prefiks, CONTENT_L, y, CATATAN_SIZE, { bold: true, color: TEXT_SEC });
  const barisCatatan = bungkusTeks(c.fontItalic, catatanTeks, CATATAN_SIZE, CONTENT_W - lebarPrefiks);
  barisCatatan.forEach((b, i) => {
    teks(c, b, CONTENT_L + (i === 0 ? lebarPrefiks : 0), y + i * CATATAN_LEADING, CATATAN_SIZE, {
      italic: true,
      color: TEXT_SEC,
    });
  });
  y += barisCatatan.length * CATATAN_LEADING;

  return y;
}

function hitungTinggi(data: LaporanPdfData, konfig: Konfig, batasLokasi: number | null, font: PDFFont, fontBold: PDFFont, fontItalic: PDFFont): number {
  const konteksUkur: Konteks = {
    doc: undefined as unknown as PDFDocument,
    page: undefined as unknown as PDFPage,
    font,
    fontBold,
    fontItalic,
    gambar: false,
  };
  return gambarKonten(konteksUkur, data, konfig, batasLokasi);
}

export async function buatPdfLaporan(data: LaporanPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const lok = data.mode === "template" && data.rekap ? lokasiUtama(data.rekap) : [];

  // ---------- Pilih konfigurasi (font isi) yang muat 1 halaman ----------
  let konfigTerpilih: Konfig = KONFIGURASI[KONFIGURASI.length - 1];
  let batasTerpilih: number | null = null;
  let cocok = false;
  for (const k of KONFIGURASI) {
    const tinggi = hitungTinggi(data, k, null, font, fontBold, fontItalic);
    if (tinggi <= BUDGET_BOTTOM) {
      konfigTerpilih = k;
      batasTerpilih = null;
      cocok = true;
      break;
    }
  }
  if (!cocok) {
    // Langkah 3: konfigurasi terkecil sudah dipakai, tapi masih kelebihan --
    // batasi jumlah baris tabel lokasi (N teratas + 1 baris "lainnya").
    konfigTerpilih = KONFIGURASI[KONFIGURASI.length - 1];
    const totalLokasi = lok.length;
    let batas = 0;
    for (let coba = totalLokasi; coba >= 0; coba--) {
      batas = coba;
      const tinggi = hitungTinggi(data, konfigTerpilih, coba, font, fontBold, fontItalic);
      if (tinggi <= BUDGET_BOTTOM) break;
      // coba=0 (batas paling ringkas, tabel lokasi jadi 1 baris "lainnya")
      // tetap tidak muat -- sudah upaya maksimal, lanjut apa adanya (best
      // effort) drpd terjebak loop; kelebihan tipis pd kasus ekstrim spt
      // ini lebih baik drpd gagal total.
    }
    batasTerpilih = batas < totalLokasi ? batas : null;
  }

  const konteksGambar: Konteks = { doc, page, font, fontBold, fontItalic, gambar: true };
  gambarHeaderPitaDanFooter(konteksGambar);
  gambarKonten(konteksGambar, data, konfigTerpilih, batasTerpilih);

  return doc.save();
}
