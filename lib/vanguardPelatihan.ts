// lib/vanguardPelatihan.ts  (murni; dipakai klien)
//
// (2 Nov 2026) Kelola Pelatihan > Vanguard: pilihan penyalaan dan teks keterangannya. Penentu menyala di server: lib/vanguardAkses.ts (centang manual menang atas Identifikasi survei).

import type { AturanVanguard, HasilRuntutan, KelayakanRuntutan, Petak } from "@/lib/runtutanVanguard";

export type KeadaanVanguardKelola = {
  kegiatan_id: number;
  menyala: boolean;
  sumber: "centang" | "identifikasi" | "mati";
  /** true / false = centang manual; null = tidak ada centang (mengikuti Identifikasi survei). */
  centang: boolean | null;
  percobaan: number;
  boleh_kelola: boolean;
  /** (2 Nov 2026) aturan "latihan N hari berturut-turut" */
  aturan: AturanVanguard;
  blokir_tahap: boolean;
  tanggal_pretest: string | null;
  batas_mulai: string | null;
  ringkas: RingkasRuntutan | null;
};

export type PilihanVanguard = "nyala" | "mati" | "ikut";
export const PILIHAN_VANGUARD: { kode: PilihanVanguard; nilai: boolean | null; label: string; ket: string }[] = [
  { kode: "nyala", nilai: true, label: "Nyalakan untuk pelatihan ini", ket: "Kartu Vanguard tampil bagi peserta dan percobaan dicatat." },
  { kode: "mati", nilai: false, label: "Matikan", ket: "Tidak tampil, apa pun isi Identifikasi survei." },
  { kode: "ikut", nilai: null, label: "Ikuti Identifikasi survei (bawaan)", ket: "Menyala hanya bila Identifikasi survei yang sudah sah menjawab Ya untuk Vanguard pada pelatihan ini." },
];

export const pilihanDari = (centang: boolean | null): PilihanVanguard => (centang === true ? "nyala" : centang === false ? "mati" : "ikut");

export function teksSumberVanguard(sumber: KeadaanVanguardKelola["sumber"]): string {
  if (sumber === "centang") return "Saat ini menyala atau mati menurut pilihan manual di bawah.";
  if (sumber === "identifikasi") return "Saat ini menyala karena Identifikasi survei yang sah meminta Vanguard.";
  return "Saat ini tidak menyala.";
}

// ---------- ringkasan runtutan untuk pengelola (2 Nov 2026) ----------

export type RingkasRuntutan = {
  total: number;
  /** Sudah memenuhi N hari berturut-turut. */
  tuntas: number;
  /** Sedang berjalan (belum tuntas, runtutan > 0 atau hari ini masih bisa). */
  berjalan: number;
  /** Belum pernah memulai. */
  belum_mulai: number;
  /** Pernah berlatih tetapi runtutan putus dan belum tuntas. */
  terputus: number;
  /** Tidak mungkin lagi tuntas sebelum Pretest dibuka (tanpa buka kunci / geser jadwal). */
  lewat_batas: number;
};

export function ringkasRuntutanPeserta(daftar: readonly (HasilRuntutan & { kelayakan: KelayakanRuntutan })[]): RingkasRuntutan {
  const r: RingkasRuntutan = { total: daftar.length, tuntas: 0, berjalan: 0, belum_mulai: 0, terputus: 0, lewat_batas: 0 };
  for (const x of daftar) {
    if (x.tuntas) {
      r.tuntas++;
      continue;
    }
    if (x.kelayakan.mungkin === false) r.lewat_batas++;
    if (x.terputus) r.terputus++;
    else if (x.berturut > 0) r.berjalan++;
    else r.belum_mulai++;
  }
  return r;
}

export const teksModeVanguard: Record<"tidak_ada" | "opsional" | "wajib", string> = {
  tidak_ada: "Petugas tidak diminta berlatih Vanguard; tidak ada kunci.",
  opsional: "Kartu runtutan tampil, tetapi Pretest tidak dikunci.",
  wajib: "Pretest terkunci sampai petugas berlatih Vanguard sejumlah hari berturut-turut (perlu Blokir antar tahapan menyala).",
};

// ---------- kartu Hari ini (petugas) ----------

export type RuntutanKartu = {
  mode: "tidak_ada" | "opsional" | "wajib";
  tuntas: boolean;
  berturut: number;
  hari_berturut: number;
  hari_ini_sudah: boolean;
  terputus: boolean;
  petak: Petak[];
  kelayakan: KelayakanRuntutan;
  tanggal_pretest: string | null;
};

const tglPendek = (t: string): string => new Date(`${t}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Judul dan keterangan kartu runtutan untuk petugas. `peringatan` = tampil menonjol (terputus / hampir terlambat / terlambat). */
export function teksRuntutan(r: RuntutanKartu): { judul: string; ket: string; peringatan: boolean } {
  const N = r.hari_berturut;
  const wajib = r.mode === "wajib";
  const k = r.kelayakan;
  if (r.tuntas) return { judul: `Latihan ${N} dari ${N} hari berturut-turut`, ket: wajib ? "Selesai. Pretest tidak terkunci oleh Vanguard." : "Selesai. Terima kasih sudah berlatih.", peringatan: false };
  const judul = `Latihan ${Math.min(r.berturut, N)} dari ${N} hari berturut-turut`;
  if (wajib && k.mungkin === false) return { judul, ket: `Batas mulai (${k.batas_mulai ? tglPendek(k.batas_mulai) : "-"}) sudah lewat, runtutan tidak sempat tuntas sebelum Pretest. Hubungi panitia/instruktur.`, peringatan: true };
  if (r.terputus) return { judul, ket: `Runtutan terputus. Mulai lagi dari hari 1${r.hari_ini_sudah ? "" : " hari ini"}.`, peringatan: true };
  const tujuan = wajib ? " Pretest terkunci sampai selesai." : "";
  if (r.hari_ini_sudah) return { judul, ket: `Hari ini sudah ada latihan. Lanjutkan besok agar tidak terputus.${tujuan}`, peringatan: false };
  if (wajib && k.hari_terakhir_mulai) return { judul, ket: `Hari ini hari terakhir untuk mulai. Latihan sekarang.${tujuan}`, peringatan: true };
  const batas = wajib && k.batas_mulai && r.berturut === 0 ? ` Batas mulai: ${tglPendek(k.batas_mulai)}.` : "";
  return { judul, ket: `Belum ada latihan hari ini.${batas}${tujuan}`, peringatan: false };
}
