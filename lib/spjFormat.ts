// lib/spjFormat.ts
//
// Helper format tanggal & angka yang dipakai BERSAMA oleh seluruh
// generator PDF SPJ Translok (lib/pdf/*.ts) -- dipisah di sini (bukan
// diduplikasi per file spt namaTampilRow di tab-tab lain) krn helper ini
// murni fungsi tanpa state/komponen, aman & lebih ringkas dipakai bersama.

import type { SpjPetugasJenis } from "./spjAuth";

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "2026-09-08" -> "Selasa, 8 September 2026" (dgn nama hari) */
export function formatTanggalIndoDenganHari(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${NAMA_HARI[d.getDay()]}, ${d.getDate()} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2026-09-08" -> "8 September 2026" (tanpa nama hari, dipakai di kolom sempit) */
export function formatTanggalIndo(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Rentang tanggal utk dokumen SPJ per-SET (Visum & Surat Pernyataan yg
 * sekarang bisa mencakup BEBERAPA hari sekaligus, lihat
 * lib/spjSetHariTugas.ts) -- kalau SET cuma 1 hari, sama persis
 * formatTanggalIndo; kalau beda hari tp SAMA bulan & tahun, dipersingkat
 * "23 s.d. 25 September 2026" (bulan/tahun tidak diulang); kalau beda
 * bulan/tahun, ditulis penuh "23 September s.d. 5 Oktober 2026".
 */
export function formatRentangTanggalIndo(mulaiIso: string | null | undefined, selesaiIso: string | null | undefined): string {
  if (!mulaiIso && !selesaiIso) return "-";
  if (!selesaiIso || mulaiIso === selesaiIso) return formatTanggalIndo(mulaiIso ?? selesaiIso);
  if (!mulaiIso) return formatTanggalIndo(selesaiIso);
  const dMulai = new Date(mulaiIso + "T00:00:00");
  const dSelesai = new Date(selesaiIso + "T00:00:00");
  if (Number.isNaN(dMulai.getTime()) || Number.isNaN(dSelesai.getTime())) return `${mulaiIso} s.d. ${selesaiIso}`;
  const sameTahun = dMulai.getFullYear() === dSelesai.getFullYear();
  const sameBulan = sameTahun && dMulai.getMonth() === dSelesai.getMonth();
  if (sameBulan) {
    return `${dMulai.getDate()} s.d. ${dSelesai.getDate()} ${NAMA_BULAN[dSelesai.getMonth()]} ${dSelesai.getFullYear()}`;
  }
  if (sameTahun) {
    return `${dMulai.getDate()} ${NAMA_BULAN[dMulai.getMonth()]} s.d. ${dSelesai.getDate()} ${NAMA_BULAN[dSelesai.getMonth()]} ${dSelesai.getFullYear()}`;
  }
  return `${formatTanggalIndo(mulaiIso)} s.d. ${formatTanggalIndo(selesaiIso)}`;
}

/**
 * Timestamptz ISO (disimpan UTC oleh Postgres) -> "07.30" (format jam
 * Indonesia, pemisah titik) -- dipakai kolom "Waktu (WIB)" di PDF Laporan,
 * dikonversi manual +7 jam (BUKAN pakai timezone server Node, krn
 * Railway/hosting bisa saja berjalan di UTC, bukan WIB).
 */
export function formatJamIndo(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const jam = String(wib.getUTCHours()).padStart(2, "0");
  const menit = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${jam}.${menit}`;
}

/** Kumpulan nilai (boleh ada duplikat/null) -> "A, B, C" (unik, tanpa null/kosong). */
export function ringkasUnik(nilai: (string | null | undefined)[]): string {
  const unik = [...new Set(nilai.map((v) => (v ?? "").trim()).filter(Boolean))];
  return unik.length > 0 ? unik.join(", ") : "-";
}

// "GUNUNG TALANG"/"gunung talang" -> "Gunung Talang", TAPI angka Romawi
// (kecamatan "IX Koto Sungai Lasi", "X Koto Diatas", "X Koto Singkarak")
// TETAP huruf besar semua, bukan ikut jadi "Ix"/"X" -> "X" (kebetulan sudah
// benar) tapi "Ix" kalau tidak ditangani khusus. Dipakai semua tempat yang
// menampilkan nama kecamatan/nagari/jorong dari data master (yang disimpan
// UPPERCASE di DB) supaya tampil proper-case di dokumen PDF -- SATU sumber
// dipakai bersama (bukan diduplikasi per file) spy konsisten di
// Visum/Laporan/Dokumentasi/Kwitansi.
const ROMAWI = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);
export function judulKecamatan(nama: string): string {
  return nama
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const besar = w.toUpperCase();
      if (ROMAWI.has(besar)) return besar;
      return besar.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ");
}

// Label baku jabatan dari kolom petugas_penyisiran_akun.jabatan -- SAMA
// PERSIS konvensi JABATAN_LABEL di app/penyisiran/master-petugas.tsx.
const LABEL_JABATAN_AKUN: Record<string, string> = {
  ppl: "PPL",
  pml: "PML",
  kepala_kantor: "Kepala Kantor",
};

/**
 * Label field "JABATAN" pd dokumen SPJ (Laporan, Dokumentasi, Cetak) --
 * dulu label GENERIK per jenis (mis. "Petugas Penyisiran (Identifikasi
 * Jorong)"), sekarang utk jenis "penyisiran" pakai jabatan SEBENARNYA
 * (PPL/PML/Kepala Kantor) dari petugas_penyisiran_akun.jabatan sesuai
 * permintaan user 22 Sep 2026 -- fallback ke label generik lama kalau
 * kolom jabatan kosong/nilai tak dikenal (mis. akun lama yg blm diisi).
 * Jenis "tetangga" TETAP pakai label generik (tabel tetangga_akun tidak
 * py kolom jabatan, tidak ada distingsi PPL/PML utk jenis ini).
 */
export function labelJabatanDokumenSpj(jenis: SpjPetugasJenis, jabatan: string | null | undefined): string {
  if (jenis === "tetangga") return "Petugas Tetangga/Informan (Identifikasi Tetangga/Lainnya)";
  if (jabatan && LABEL_JABATAN_AKUN[jabatan]) return LABEL_JABATAN_AKUN[jabatan];
  return "Petugas Penyisiran (Identifikasi Jorong)";
}

/** 170000 -> "170.000" (pemisah ribuan titik, gaya Indonesia) -- dipakai baris "Uang sebesar" di Kwitansi. */
export function formatRupiah(nominal: number): string {
  return Math.round(nominal).toLocaleString("id-ID");
}

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
const BELASAN = [
  "sepuluh",
  "sebelas",
  "dua belas",
  "tiga belas",
  "empat belas",
  "lima belas",
  "enam belas",
  "tujuh belas",
  "delapan belas",
  "sembilan belas",
];
const PULUHAN = ["", "", "dua puluh", "tiga puluh", "empat puluh", "lima puluh", "enam puluh", "tujuh puluh", "delapan puluh", "sembilan puluh"];

// Konversi angka bulat (rupiah, tanpa desimal) jadi terbilang Bahasa
// Indonesia -- dipakai form Kwitansi supaya "Terbilang" tidak perlu
// diketik manual (boleh tetap diedit user, ini cuma nilai awal/saran).
function terbilangRatusan(n: number): string {
  if (n === 0) return "";
  if (n < 10) return SATUAN[n];
  if (n < 20) return BELASAN[n - 10];
  if (n < 100) {
    const p = Math.floor(n / 10);
    const s = n % 10;
    return `${PULUHAN[p]}${s ? " " + SATUAN[s] : ""}`;
  }
  const r = Math.floor(n / 100);
  const sisa = n % 100;
  const depan = r === 1 ? "seratus" : `${SATUAN[r]} ratus`;
  return `${depan}${sisa ? " " + terbilangRatusan(sisa) : ""}`;
}

export function terbilangRupiah(nominal: number): string {
  const n = Math.round(Math.abs(nominal));
  if (n === 0) return "nol rupiah";

  const kelompok: [number, string][] = [
    [1_000_000_000_000, "triliun"],
    [1_000_000_000, "miliar"],
    [1_000_000, "juta"],
    [1_000, "ribu"],
  ];

  let sisa = n;
  const bagian: string[] = [];
  for (const [nilai, label] of kelompok) {
    const jumlah = Math.floor(sisa / nilai);
    if (jumlah > 0) {
      // "seribu" (bukan "satu ribu") -- pengecualian umum dlm terbilang
      // Bahasa Indonesia.
      const teks = nilai === 1_000 && jumlah === 1 ? "seribu" : `${terbilangRatusan(jumlah)} ${label}`;
      bagian.push(teks);
      sisa %= nilai;
    }
  }
  if (sisa > 0) bagian.push(terbilangRatusan(sisa));

  const gabungan = bagian.join(" ").trim();
  const kapital = gabungan.charAt(0).toUpperCase() + gabungan.slice(1);
  return `${kapital} rupiah`;
}
