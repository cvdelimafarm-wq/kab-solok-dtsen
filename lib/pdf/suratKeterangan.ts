// lib/pdf/suratKeterangan.ts
//
// Generator PDF "Surat Pernyataan Tidak Menggunakan Kendaraan Dinas" --
// mengikuti struktur Template Surat Pernyataan Kendaraan Dinas.docx yang
// diupload user, dgn penyesuaian:
//  - Label "Sobat ID" di daftar identitas ATAS (SESUAI TEMPLATE ASLI --
//    sempat diganti "NIP" di sesi sebelumnya, dikembalikan lagi ke "Sobat
//    ID" per permintaan user 22 Sep 2026). Nilainya TETAP dari kolom `nip`
//    yg sama (petugas_penyisiran_akun/tetangga_akun) -- cuma label
//    TAMPILAN-nya yg beda, bukan sumber datanya.
//  - (25 Sep 2026, GANTI lagi) Baris ini SEKARANG dinamis: kalau petugas
//    organik (PML/Kepala Kantor) labelnya "Nip." + NIP bersih (logic SAMA
//    dgn baris tandatangan bawah, lib/spjIdentitas.ts), krn organik memang
//    py NIP bukan Sobat ID. Mitra/PPL & tetangga/informan TETAP "Sobat ID"
//    apa adanya (bukan "NIK." spt baris bawah -- user cuma minta kasus
//    organik yg diubah).
//  - "Jabatan"/"Unit Kerja" disesuaikan ke konteks Petugas Penyisiran /
//    Tetangga-Informan SE2026 (BUKAN "PPL Mitra Statistik" spt template
//    asli yg memang contoh dari kegiatan Susenas) -- wording final blm
//    dikonfirmasi user, gampang diubah lewat PERAN_JABATAN di bawah kalau
//    user minta redaksi lain.
//  - (24 Sep 2026) Baris id DI BAWAH NAMA DI BAGIAN TANDATANGAN (bawah,
//    bukan daftar identitas atas) SEKARANG pakai label "Nip."/"NIK." sesuai
//    jabatan petugas (organik/PML -> Nip. + NIP 18 digit bersih tanpa
//    prefix Sobat ID; mitra/PPL & tetangga/informan -> NIK. + NIK 16
//    digit) -- logic SAMA dgn Kwitansi, satu sumber di lib/spjIdentitas.ts.
//  - (24 Sep 2026) Baris tanggal tandatangan SEKARANG pakai nama kecamatan
//    domisili petugas (bukan hardcode "Solok"), fallback ke
//    TEMPAT_KEDUDUKAN_DEFAULT kalau datanya tidak ada.
//  - (24 Sep 2026) Format/spasi disesuaikan lebih dekat ke referensi
//    (gambar ke-2 dari user): jarak label->titik dua lebih lebar, nilai
//    identitas atas TIDAK bold, paragraf rata kiri-kanan (justified) --
//    dgn data Jabatan/Unit Kerja tetap lengkap terisi (bukan kosong spt
//    contoh referensi).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalIndo, formatRentangTanggalIndo } from "../spjFormat";
import { SpjPetugasJenis } from "../spjAuth";
import { organik, labelIdentitas, bersihkanNip } from "../spjIdentitas";
import { TEMPAT_KEDUDUKAN_DEFAULT } from "../spjPejabat";

export const PERAN_JABATAN: Record<SpjPetugasJenis, string> = {
  penyisiran: "Petugas Penyisiran Undercoverage Usaha SE2026",
  tetangga: "Petugas Identifikasi Tetangga/Informan SE2026",
};

// tanggalMulaiSet/tanggalSelesaiSet -- SEKARANG rentang SET (bisa >1 hari,
// lihat lib/spjSetHariTugas.ts), BUKAN lagi satu tanggal tunggal. Utk SET 1
// hari, mulai===selesai & kalimatnya tetap sama spt sebelumnya
// (formatRentangTanggalIndo otomatis tidak mengulang tanggal yg sama).
export interface SuratKeteranganPdfData {
  nomorSt: string;
  namaPetugas: string;
  nip: string | null;
  jenis: SpjPetugasJenis;
  tanggalMulaiSet: string;
  tanggalSelesaiSet: string;
  /** 'ppl' | 'pml' | 'kepala_kantor' | null -- dari petugas_penyisiran_akun.jabatan (null utk jenis "tetangga", tabelnya tidak py kolom itu -> tetap dianggap non-organik/NIK). Dipakai HANYA utk label/nilai id di bagian tandatangan (bawah), BUKAN baris "Sobat ID" di daftar identitas atas. */
  jabatan: string | null;
  /** Nama kecamatan domisili petugas, utk baris tanggal di bagian tandatangan ("<kecamatan>, <tanggal>"). null/"" -> fallback TEMPAT_KEDUDUKAN_DEFAULT ("Solok"). */
  tempatKedudukan: string | null;
}

const HITAM = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 55;

/** Pecah teks jadi baris² kata (array kata per baris, BELUM di-join) --
 * dipisah per-kata (bukan string siap-pakai) supaya baris non-terakhir bisa
 * digambar rata kiri-kanan (justified) di gambarBarisJustify(). */
function bungkusTeks(f: PDFFont, txt: string, size: number, maxWidth: number): string[][] {
  const kata = txt.split(/\s+/).filter(Boolean);
  const baris: string[][] = [];
  let sekarang: string[] = [];
  for (const k of kata) {
    const coba = sekarang.length ? [...sekarang, k].join(" ") : k;
    if (f.widthOfTextAtSize(coba, size) > maxWidth && sekarang.length) {
      baris.push(sekarang);
      sekarang = [k];
    } else {
      sekarang.push(k);
    }
  }
  if (sekarang.length) baris.push(sekarang);
  return baris;
}

export async function buatPdfSuratKeterangan(data: SuratKeteranganPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const usableWidth = width - MARGIN_X * 2;
  let y = height - 70;

  function teks(
    txt: string,
    x: number,
    opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxWidth?: number } = {}
  ) {
    const size = opts.size ?? 10.5;
    const f: PDFFont = opts.bold ? fontBold : font;
    let xPos = x;
    if (opts.maxWidth && opts.align === "center") xPos = x + (opts.maxWidth - f.widthOfTextAtSize(txt, size)) / 2;
    else if (opts.maxWidth && opts.align === "right") xPos = x + opts.maxWidth - f.widthOfTextAtSize(txt, size);
    page.drawText(txt, { x: xPos, y, size, font: f, color: HITAM });
  }
  /** Gambar 1 baris kata rata kiri-kanan (justified) dgn menyebar sisa
   * lebar ke tiap spasi antar-kata; baris terakhir paragraf (atau baris
   * 1 kata) tetap rata kiri biasa -- pola umum utk teks justified. */
  function gambarBarisJustify(kataArr: string[], size: number, rataKiriSaja: boolean) {
    if (rataKiriSaja || kataArr.length === 1) {
      teks(kataArr.join(" "), MARGIN_X, { size });
      return;
    }
    const totalLebarKata = kataArr.reduce((sum, k) => sum + font.widthOfTextAtSize(k, size), 0);
    const spasiPerGap = (usableWidth - totalLebarKata) / (kataArr.length - 1);
    let x = MARGIN_X;
    for (const k of kataArr) {
      page.drawText(k, { x, y, size, font, color: HITAM });
      x += font.widthOfTextAtSize(k, size) + spasiPerGap;
    }
  }
  function paragraf(txt: string, size = 10.5, lineHeight = 15) {
    const baris = bungkusTeks(font, txt, size, usableWidth);
    baris.forEach((kataArr, idx) => {
      gambarBarisJustify(kataArr, size, idx === baris.length - 1);
      y -= lineHeight;
    });
  }

  teks("SURAT PERNYATAAN", MARGIN_X, { bold: true, size: 14, align: "center", maxWidth: usableWidth });
  y -= 30;

  paragraf("Yang bertanda tangan dibawah ini:");
  y -= 6;

  const labelWidth = 130; // dilebarkan (referensi gambar ke-2) dari 110
  const barisIdentitas = (label: string, value: string) => {
    teks(label, MARGIN_X + 20, { size: 10.5 });
    teks(":", MARGIN_X + 20 + labelWidth, { size: 10.5 });
    teks(value, MARGIN_X + 20 + labelWidth + 12, { size: 10.5 }); // tidak bold lagi (referensi gambar ke-2)
    y -= 18;
  };
  barisIdentitas("Nama", data.namaPetugas || "-");
  // (25 Sep 2026) Utk organik (PML/Kepala Kantor) label baris ini SEKARANG
  // "Nip." + NIP bersih (sama logic dgn baris tandatangan bawah) -- bukan
  // lagi selalu "Sobat ID" spt keputusan 22 Sep, krn pegawai organik memang
  // py NIP, bukan Sobat ID. Mitra/PPL & tetangga/informan TETAP "Sobat ID"
  // apa adanya spt sebelumnya (TIDAK diubah jadi "NIK." spt baris bawah --
  // permintaan user cuma utk kasus organik).
  barisIdentitas(organik(data.jabatan) ? "Nip." : "Sobat ID", (organik(data.jabatan) ? bersihkanNip(data.nip, data.jabatan) : data.nip) || "-");
  barisIdentitas("Jabatan", PERAN_JABATAN[data.jenis]);
  barisIdentitas("Unit Kerja", "BPS Kabupaten Solok");

  const rentang = formatRentangTanggalIndo(data.tanggalMulaiSet, data.tanggalSelesaiSet);
  y -= 12;
  paragraf(
    `Menerangkan bahwa dalam rangka melaksanakan perjalanan dinas dalam kota untuk melaksanakan tugas kedinasan ` +
      `sesuai surat tugas nomor: ${data.nomorSt}, pelaksanaan tanggal ${rentang}, ` +
      `saya benar-benar tidak menggunakan kendaraan dinas.`
  );
  y -= 8;
  paragraf(
    `Demikian pernyataan ini kami buat dengan sebenar-benarnya untuk dipergunakan sebagaimana mestinya. Apabila ` +
      `terdapat kekeliruan dalam pertanggungjawaban SPD dan mengakibatkan kerugian negara, saya bersedia dituntut ` +
      `sesuai aturan yang berlaku dan mengembalikan biaya transport lokal yang sudah saya terima ke kas negara.`
  );

  y -= 40;
  const kananX = MARGIN_X + usableWidth * 0.55;
  const kananWidth = usableWidth * 0.45;
  // Tanggal tanda tangan = akhir SET (hari terakhir pelaksanaan, konsisten dgn migrasi data lama).
  // Lokasi = kecamatan domisili petugas (bukan hardcode "Solok" lagi, 24 Sep 2026).
  const tempatTandaTangan = data.tempatKedudukan || TEMPAT_KEDUDUKAN_DEFAULT;
  teks(`${tempatTandaTangan}, ${formatTanggalIndo(data.tanggalSelesaiSet)}`, kananX, {
    size: 10.5,
    align: "center",
    maxWidth: kananWidth,
  });
  y -= 15;
  teks("Pelaksana Perjalanan Dinas Dalam Kota,", kananX, { size: 10.5, align: "center", maxWidth: kananWidth });
  y -= 55; // ruang tanda tangan basah
  teks(data.namaPetugas || "-", kananX, { size: 10.5, bold: true, align: "center", maxWidth: kananWidth });
  y -= 13;
  // Id di bawah nama (bagian tandatangan): Nip. utk organik/PML, NIK. utk
  // mitra/PPL & tetangga -- logic SAMA dgn Kwitansi, lib/spjIdentitas.ts
  // (24 Sep 2026; sebelumnya selalu "Sobat ID." spt baris identitas atas).
  const labelIdTtd = labelIdentitas(data.jabatan);
  const idTtdBersih = bersihkanNip(data.nip, data.jabatan);
  teks(idTtdBersih ? `${labelIdTtd} ${idTtdBersih}` : "-", kananX, { size: 10.5, align: "center", maxWidth: kananWidth });

  return doc.save();
}
