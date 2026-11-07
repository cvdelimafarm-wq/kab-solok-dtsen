// lib/arsip/pbj.ts  (logika murni)
//
// (7 Nov 2026) Penomoran dokumen pengadaan barang/jasa (PBJ). Satu urutan per tahun untuk seluruh dokumen pengadaan, siapa pun penerbitnya
// (PPK, Pejabat Pengadaan, penyedia), dengan pola NNN/PPK-BPSKAB/SOLOK/K/tahun (jenis arsip "pbj", register "pbj"). Pola ini bukan KKA.
// Daftar di bawah mengikuti "Jadwal Pekerjaan" paket pengadaan langsung BPS Kab. Solok.

export type ButirPbj = { kode: string; nama: string; pelaksana: "PPK" | "PBJ" | "Penyedia"; bernomorBawaan: boolean };

export const DAFTAR_PBJ: readonly ButirPbj[] = [
  { kode: "formulir_permintaan", nama: "Formulir Permintaan", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "spek_teknis_kak", nama: "Penetapan Spek Teknis/KAK", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "kertas_kerja_hps", nama: "Kertas Kerja Penyusunan HPS", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "ba_hps_spesifikasi", nama: "BA Penyusunan HPS dan Spesifikasi", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "ba_rancangan_kontrak", nama: "BA Penetapan Rancangan Kontrak", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "permintaan_pemilihan", nama: "Permintaan Pemilihan Penyedia Barang/Jasa", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "ba_reviu_dokumen", nama: "BA Reviu Dokumen Persiapan Pengadaan Langsung", pelaksana: "PBJ", bernomorBawaan: true },
  { kode: "permintaan_penawaran", nama: "Surat Permintaan Penawaran", pelaksana: "PBJ", bernomorBawaan: true },
  { kode: "penawaran_harga", nama: "Surat Penawaran Harga", pelaksana: "Penyedia", bernomorBawaan: true },
  { kode: "ba_pembukaan_penawaran", nama: "BA Pembukaan Dokumen Penawaran", pelaksana: "PBJ", bernomorBawaan: true },
  { kode: "ba_evaluasi", nama: "BA Evaluasi Administrasi, Kualifikasi, Teknis, dan Harga", pelaksana: "PBJ", bernomorBawaan: true },
  { kode: "penawaran", nama: "Penawaran", pelaksana: "PBJ", bernomorBawaan: false },
  { kode: "ba_hasil_pengadaan", nama: "BA Hasil Pengadaan Langsung", pelaksana: "PBJ", bernomorBawaan: true },
  { kode: "laporan_hasil_pengadaan", nama: "Laporan Hasil Pengadaan Langsung", pelaksana: "PBJ", bernomorBawaan: true },
  { kode: "surat_penunjukan", nama: "Surat Penunjukan Penyedia Barang/Jasa", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "spk", nama: "Surat Perintah Kerja", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "spmk", nama: "Surat Perintah Mulai Kerja", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "ba_pemeriksaan", nama: "BA Pemeriksaan Pekerjaan", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "ba_serah_terima", nama: "BA Serah Terima Pekerjaan", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "permohonan_pembayaran", nama: "Surat Permohonan Pembayaran", pelaksana: "Penyedia", bernomorBawaan: true },
  { kode: "invoice", nama: "Invoice", pelaksana: "Penyedia", bernomorBawaan: true },
  { kode: "ba_pemeriksaan_kpa", nama: "BA Pemeriksaan Pekerjaan PPK ke KPA", pelaksana: "PPK", bernomorBawaan: true },
  { kode: "ba_pembayaran", nama: "Berita Acara Pembayaran", pelaksana: "PPK", bernomorBawaan: true },
];

export const KODE_JENIS_PBJ = "pbj";
export const KODE_PBJ_SAH = new Set(DAFTAR_PBJ.map((b) => b.kode));

/** Penanda paket yang stabil dari nama paket (huruf kecil, tanpa tanda baca), dipakai pada kunci rujukan agar pengambilan ulang tidak mengambil nomor baru. */
export function slugPaket(nama: string): string {
  return nama.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** Kunci rujukan satu dokumen pengadaan: paket + butir. Nama paket yang sama dan butir yang sama selalu mendapat nomor yang sama. */
export function rujukanPbj(namaPaket: string, kodeButir: string): string {
  return `pbj:${slugPaket(namaPaket)}:${kodeButir}`;
}
