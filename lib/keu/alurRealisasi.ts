// lib/keu/alurRealisasi.ts
//
// (25 Okt 2026) Alur impor realisasi (Excel Laporan Ketersediaan Dana Detail, GLP039) dalam lima langkah yang jelas: siapa, apa, dan apa hasilnya.
// Murni: menerima keadaan halaman, mengembalikan status tiap langkah, jadi dapat diuji. Yang menegakkan aturan tetap fungsi basis data
// (keu_realisasi_masuk: kewenangan `realisasi`, satu tanggal satu unggahan, identitas angka); langkah di sini hanya penunjuk bagi pengguna.
//
// Alur:
//  1 Siapkan dan pilih berkas   Bendahara mengunduh laporan dari SAKTI/SPAN (format Excel) lalu memilihnya; dibaca di perangkat.
//  2 Periksa berkas             Identitas angka (s.d. = lalu + ini; sisa), jumlah total, dan tanggal data.
//  3 Cocokkan pagu dengan POK   Pagu tiap akun pada tiap RO dibandingkan dengan POK; beda = PERINGATAN, bukan penghalang.
//  4 Kirim                      Sekali per tanggal data; salah kirim -> batalkan dengan alasan lalu unggah ulang.
//  5 Pantau dampak              Tab Anggaran RO, peringatan SPAN, skor RAB, dan batas R-06 pada kertas kerja memakai angka terbaru.

export type StatusLangkah = "selesai" | "sekarang" | "menunggu" | "perhatian";
export type HasilCekPaguRingkas = "belum" | "memuat" | "sama" | "beda" | "tak_ada";

export type KeadaanRealisasi = {
  /** Berwenang mengunggah (kewenangan realisasi). null = belum diketahui. */
  boleh: boolean | null;
  adaBerkas: boolean;
  membaca: boolean;
  galatBaca: string | null;
  /** Hasil pemeriksaan identitas berkas (hasil.ok); null bila belum ada berkas. */
  berkasLolos: boolean | null;
  tanggalSah: boolean;
  sudahAdaTanggal: boolean;
  cek: HasilCekPaguRingkas;
  mengirim: boolean;
  /** Pesan keberhasilan pengiriman terakhir ada. */
  diterima: boolean;
};

export type LangkahRealisasi = { no: number; kunci: string; judul: string; siapa: string; uraian: string; status: StatusLangkah; ket: string };

export const LABEL_STATUS_LANGKAH: Record<StatusLangkah, string> = { selesai: "Selesai", sekarang: "Sekarang", menunggu: "Menunggu", perhatian: "Perlu perhatian" };

export function langkahRealisasi(k: KeadaanRealisasi): LangkahRealisasi[] {
  // 1
  const s1: StatusLangkah = k.galatBaca ? "perhatian" : k.adaBerkas || k.membaca ? "selesai" : "sekarang";
  const ket1 = k.galatBaca ?? (k.membaca ? "Membaca berkas..." : k.adaBerkas ? "Berkas terbaca di perangkat." : "Pilih berkas .xlsx dari SAKTI/SPAN.");

  // 2
  let s2: StatusLangkah = "menunggu";
  let ket2 = "Menunggu berkas.";
  if (k.membaca) { s2 = "sekarang"; ket2 = "Sedang membaca."; }
  else if (k.adaBerkas) {
    if (k.berkasLolos === false) { s2 = "perhatian"; ket2 = "Berkas belum lolos pemeriksaan; perbaiki berkas dan pilih ulang."; }
    else if (!k.tanggalSah) { s2 = "perhatian"; ket2 = "Isi tanggal data dengan benar."; }
    else { s2 = "selesai"; ket2 = "Identitas angka dan tanggal data benar."; }
  }

  // 3
  let s3: StatusLangkah = "menunggu";
  let ket3 = "Menunggu pemeriksaan berkas.";
  if (s2 === "selesai") {
    if (k.cek === "memuat" || k.cek === "belum") { s3 = "sekarang"; ket3 = "Membandingkan dengan POK..."; }
    else if (k.cek === "sama") { s3 = "selesai"; ket3 = "Pagu semua akun sama dengan POK."; }
    else if (k.cek === "beda") { s3 = "perhatian"; ket3 = "Ada pagu akun yang berbeda dari POK. Peringatan saja: buka kertas kerja RO yang disebut bila POK resmi harus diikuti."; }
    else { s3 = "selesai"; ket3 = "POK belum dapat dibandingkan (tidak ada data pembanding)."; }
  }

  // 4
  let s4: StatusLangkah = "menunggu";
  let ket4 = "Menunggu langkah sebelumnya.";
  if (k.diterima) { s4 = "selesai"; ket4 = "Realisasi diterima."; }
  else if (k.boleh === false) { s4 = "perhatian"; ket4 = "Hanya bendahara yang dapat mengirim realisasi."; }
  else if (s2 === "selesai") {
    if (k.sudahAdaTanggal) { s4 = "perhatian"; ket4 = "Tanggal data ini sudah diterima. Batalkan unggahan lama (dengan alasan) bila ingin menggantinya."; }
    else if (k.mengirim) { s4 = "sekarang"; ket4 = "Mengirim..."; }
    else if (s3 === "sekarang") { s4 = "menunggu"; ket4 = "Menunggu pencocokan pagu."; }
    else { s4 = "sekarang"; ket4 = "Tekan Kirim realisasi."; }
  }

  // 5
  const s5: StatusLangkah = k.diterima ? "sekarang" : "menunggu";
  const ket5 = k.diterima ? "Angka terbaru sudah dipakai halaman lain; periksa peringatannya." : "Berlaku setelah realisasi diterima.";

  return [
    { no: 1, kunci: "siapkan", judul: "Siapkan dan pilih berkas", siapa: "Bendahara", uraian: "Unduh Laporan Ketersediaan Dana Detail (GLP039) format Excel dari SAKTI/SPAN, lalu pilih berkasnya di sini. Berkas dibaca di perangkat; tidak dikirim utuh.", status: s1, ket: ket1 },
    { no: 2, kunci: "periksa", judul: "Periksa berkas", siapa: "Sistem", uraian: "Memeriksa identitas angka (realisasi s.d. = lalu + ini; sisa = pagu - lock - s.d.), jumlah total, dan tanggal data.", status: s2, ket: ket2 },
    { no: 3, kunci: "cocokkan", judul: "Cocokkan pagu dengan POK", siapa: "Sistem", uraian: "Membandingkan pagu tiap akun pada tiap RO dengan POK. Hanya jumlah per akun, tidak sampai item. Bila beda: peringatan dan tautan ke kertas kerja.", status: s3, ket: ket3 },
    { no: 4, kunci: "kirim", judul: "Kirim realisasi", siapa: "Bendahara", uraian: "Satu tanggal data hanya dapat diterima satu kali. Salah kirim: batalkan unggahan itu dengan alasan, lalu unggah ulang.", status: s4, ket: ket4 },
    { no: 5, kunci: "dampak", judul: "Pantau dampak", siapa: "PPK, ketua tim, admin RO", uraian: "Tab Anggaran per RO, peringatan SPAN, skor kualitas RAB, dan batas R-06 pada kertas kerja memakai angka terbaru.", status: s5, ket: ket5 },
  ];
}

/** Nomor langkah yang sedang berjalan (1..5); 0 bila semua selesai atau tak ada yang berjalan. */
export function langkahBerjalan(l: LangkahRealisasi[]): number {
  return (l.find((x) => x.status === "perhatian") ?? l.find((x) => x.status === "sekarang"))?.no ?? 0;
}

/** Kunci simpul alur pada halaman /sigap/revisi/alur bagian realisasi; teks rujukan singkat. */
export const RINGKAS_ATURAN_REALISASI = [
  "Impor POK hanya dilakukan di awal tahun anggaran. Sepanjang tahun, yang diimpor hanya realisasi.",
  "Revisi disahkan di SPAN dengan acuan kertas kerja; di SIGAP PPK menekan Sahkan dan melampirkan PDF POK resmi dari SPAN.",
  "Pemeriksaan POK terhadap kertas kerja cukup kesamaan pagu per akun per RO. Bila beda, kertas kerja diubah mengikuti POK resmi.",
] as const;
