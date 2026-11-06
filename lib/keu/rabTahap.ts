// lib/keu/rabTahap.ts
//
// (7 Nov 2026) Pengelompokan rincian RAB per survei menurut TAHAPAN KEGIATAN (bukan jenis belanja), atas permintaan pengguna:
//  - Pelatihan: perlengkapan/paket kelas, perjalanan pelatihan, pulsa zoom peserta, honor instruktur, rapat persiapan;
//  - Pendataan: translok pendataan dan supervisi, penginapan, honor petugas lapangan, konsumsi rapat pelaksanaan dan evaluasi pendataan;
//  - Lain-lain: rincian yang tidak jelas masuk tahap mana.
// Setiap tahap menampilkan "pekerjaan selesai" (hari terakhir semua rincian tahap itu, dari jadwal identifikasi) dan saran pencairan
// = minggu selesai + 1 minggu (aturan yang sama dengan jadwal cair per baris: GESER_CAIR_HARI). Semua murni, tanpa akses basis data.

import { NAMA_BULAN } from "./rab";
import { bulanDari, GESER_CAIR_HARI, mingguDari, saranCair } from "./usulanRab";
import type { Libur } from "./hariKerja";

export type Tahap = "Pelatihan" | "Pendataan" | "Lain-lain";
export const TAHAP_URUT: readonly Tahap[] = ["Pelatihan", "Pendataan", "Lain-lain"];

export const NAMA_TAHAP: Record<Tahap, string> = {
  Pelatihan: "Persiapan dan pelatihan petugas",
  Pendataan: "Pelaksanaan pendataan",
  "Lain-lain": "Lain-lain",
};
export const KET_TAHAP: Record<Tahap, string> = {
  Pelatihan: "Perlengkapan atau paket kelas, perjalanan pelatihan, pulsa peserta, honor instruktur, dan rapat persiapan.",
  Pendataan: "Translok dan penginapan pendataan atau supervisi, honor petugas lapangan, serta konsumsi rapat pelaksanaan dan evaluasi pendataan.",
  "Lain-lain": "Rincian dari identifikasi yang belum jelas masuk tahap pelatihan atau pendataan.",
};

type Ciri = { kelompok: string; uraian: string };

/**
 * Tahap kegiatan satu rincian. `namaKelas` = nama kelas pelatihan pada identifikasi lanjutan: uraian yang diawali "Kelas A:" selalu tahap Pelatihan
 * (paket, konsumsi, pulsa, honor instruktur per kelas).
 */
export function tahapRincian(r: Ciri, namaKelas: readonly string[] = []): Tahap {
  const u = r.uraian.toLowerCase();
  if (namaKelas.some((n) => n.trim() !== "" && r.uraian.startsWith(`${n}:`))) return "Pelatihan";
  switch (r.kelompok) {
    case "Pelatihan": return "Pelatihan";
    case "Translok dan penginapan": return "Pendataan";
    case "Honor": return /honor (instruktur|pengajar)/.test(u) ? "Pelatihan" : "Pendataan";
    case "Rapat": return u.includes("persiapan") ? "Pelatihan" : "Pendataan";
    case "Lain-lain": return /pulsa peserta|pelatihan|briefing/.test(u) ? "Pelatihan" : "Lain-lain";
    default: return "Lain-lain";
  }
}

/** Kelompokkan daftar menurut tahap, urut TAHAP_URUT, tahap kosong tidak ikut; urutan di dalam tahap tetap. */
export function kelompokkanTahap<T>(daftar: readonly T[], tahapDari: (x: T) => Tahap): { tahap: Tahap; isi: T[] }[] {
  return TAHAP_URUT.map((tahap) => ({ tahap, isi: daftar.filter((x) => tahapDari(x) === tahap) })).filter((g) => g.isi.length > 0);
}

export type InfoTahap = {
  jumlahRincian: number;
  /** Hari terakhir semua rincian tahap (YYYY-MM-DD) bila ada; null bila belum ada tanggal. */
  selesai: string | null;
  /** Rincian tahap yang belum punya tanggal selesai. */
  tanpaTanggal: number;
  /** Saran pencairan: bulan dan minggu yang memuat (selesai + 1 minggu); null bila belum ada tanggal. */
  cair: { bulan: number; minggu: number; lambat: string | null } | null;
};

/** Ringkasan satu tahap dari tanggal selesai tiap rincian. Pencairan disarankan satu minggu sesudah pekerjaan tahap itu selesai. */
export function infoTahap(selesaiPerRincian: readonly (string | null)[], bulanCadangan: number, hariCair: number | null, libur: Libur): InfoTahap {
  const ada = selesaiPerRincian.filter((t): t is string => t !== null && /^\d{4}-\d{2}-\d{2}$/.test(t)).sort();
  const selesai = ada.length > 0 ? ada[ada.length - 1] : null;
  return {
    jumlahRincian: selesaiPerRincian.length,
    selesai,
    tanpaTanggal: selesaiPerRincian.length - ada.length,
    cair: selesai === null ? null : saranCair(selesai, { bulan: bulanCadangan }, hariCair, libur, GESER_CAIR_HARI),
  };
}

/** "2026-03-14" -> "14 Mar 2026 (minggu 2 Mar)"; kosong -> "belum ada tanggal". */
export function teksSelesai(tgl: string | null): string {
  if (!tgl) return "belum ada tanggal";
  const b = bulanDari(tgl); const m = mingguDari(tgl);
  if (b === null || m === null) return "belum ada tanggal";
  return `${Number(tgl.slice(8, 10))} ${NAMA_BULAN[b - 1]} ${tgl.slice(0, 4)} (minggu ${m} ${NAMA_BULAN[b - 1]})`;
}

/** "bulan 3, minggu 3" -> "Minggu 3 Mar". */
export function teksMingguCair(c: { bulan: number; minggu: number } | null): string {
  return c ? `Minggu ${c.minggu} ${NAMA_BULAN[c.bulan - 1] ?? ""}`.trim() : "belum bisa disarankan";
}

/** Item POK yang belum tercakup survei mana pun: tidak punya satu pun baris RAB bertanda identifikasi. */
export function itemBelumTerkaitSurvei<T extends { baris: { ident_id?: number | null }[] }>(peta: readonly T[]): T[] {
  return peta.filter((p) => !p.baris.some((b) => b.ident_id !== null && b.ident_id !== undefined));
}

/** Ringkasan per survei untuk kartu pilihan: jumlah baris RAB bertanda identifikasi itu dan jumlah rupiahnya. */
export function ringkasBarisSurvei(identId: number, baris: readonly { ident_id?: number | null; jumlah: number | string }[]): { n: number; jumlah: number } {
  let n = 0; let jumlah = 0;
  for (const b of baris) if (b.ident_id === identId) { n += 1; jumlah += Number(b.jumlah) || 0; }
  return { n, jumlah };
}
