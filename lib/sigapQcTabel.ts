// lib/sigapQcTabel.ts
//
// (29 Okt 2026) Tabel hasil QC Pemahaman per petugas (tab QC Kelola Pendataan): satu baris per orang (PML dan PPL), kolom
// Nama · Peran · Nama PML · Jumlah percobaan · Nilai P1..Pn. Murni (tanpa DB / tanpa React) supaya bisa diuji.
// Sumber: rekap per tim (QcRekapTim) + rincian per percobaan (RincianQc, boleh kosong pada API lama).

import type { QcRekapTim } from "@/lib/sigapQc";
import { bacaPmlSendiri, type RincianQc } from "@/lib/sigapQcMonitor";

export type BarisQc = {
  akun_id: number;
  nama: string;
  peran: "PML" | "PPL";
  /** Nama PML timnya; untuk baris PML = null. */
  pml: string | null;
  percobaan: number;
  /** Nilai per percobaan, indeks 0 = P1. null = percobaan itu belum ada. */
  nilai: (number | null)[];
  terbaik: number | null;
  lulus: boolean;
  terlambat: boolean;
};

export type StatusSaring = "semua" | "belum" | "tidak_lulus" | "lulus";

/** Jumlah kolom nilai: sebanyak maksimum percobaan pengaturan (minimal 1), melebar bila ada petugas yang percobaannya lebih banyak. Batas 10. */
export function jumlahKolomNilai(maks: number, rincian?: RincianQc): number {
  let k = Number.isFinite(maks) && maks >= 1 ? Math.floor(maks) : 4;
  if (rincian) {
    for (const daftar of Object.values(rincian.percobaan)) for (const x of daftar) if (x.ke > k) k = x.ke;
  }
  return Math.min(Math.max(k, 1), 10);
}

function nilaiPerPercobaan(akunId: number, rincian: RincianQc | undefined, kolom: number): { nilai: (number | null)[]; terlambat: boolean; jumlah: number } {
  const nilai: (number | null)[] = Array.from({ length: kolom }, () => null);
  const daftar = rincian?.percobaan[akunId] ?? [];
  let terlambat = false;
  for (const x of daftar) {
    if (x.ke >= 1 && x.ke <= kolom) nilai[x.ke - 1] = x.skor;
    if (x.terlambat) terlambat = true;
  }
  return { nilai, terlambat, jumlah: daftar.length };
}

/** Urutan baris mengikuti tim: PML dahulu, lalu PPL-nya (urutan dari server). */
export function susunBarisQc(rekap: QcRekapTim[], rincian: RincianQc | undefined, kolom: number): BarisQc[] {
  const out: BarisQc[] = [];
  for (const t of rekap) {
    if (t.pml_akun_id != null) {
      const ps = bacaPmlSendiri(t.pml_sendiri);
      const r = nilaiPerPercobaan(t.pml_akun_id, rincian, kolom);
      const percobaan = Math.max(ps?.percobaan ?? 0, r.jumlah);
      const nilai = r.nilai;
      if (r.jumlah === 0 && ps && ps.skor_terbaik != null && kolom > 0) nilai[0] = ps.skor_terbaik; // API lama: hanya nilai terbaik yang diketahui
      out.push({ akun_id: t.pml_akun_id, nama: t.pml_nama, peran: "PML", pml: null, percobaan, nilai, terbaik: ps?.skor_terbaik ?? null, lulus: !!ps?.lulus, terlambat: r.terlambat });
    }
    for (const x of t.ppl) {
      const r = nilaiPerPercobaan(x.akun_id, rincian, kolom);
      const nilai = r.nilai;
      if (r.jumlah === 0 && x.skor_awal != null && kolom > 0) nilai[0] = x.skor_awal; // API lama: hanya nilai awal
      out.push({ akun_id: x.akun_id, nama: x.nama, peran: "PPL", pml: t.pml_nama || null, percobaan: Math.max(x.percobaan, r.jumlah), nilai, terbaik: x.skor_terbaik, lulus: x.lulus, terlambat: x.terlambat || r.terlambat });
    }
  }
  return out;
}

/** Penyaring tabel: kata pencarian (nama petugas ATAU nama PML, tanpa huruf besar/kecil) dan status. */
export function saringBarisQc(baris: BarisQc[], cari: string, status: StatusSaring): BarisQc[] {
  const kata = cari.trim().toLowerCase();
  return baris.filter((b) => {
    if (kata && !b.nama.toLowerCase().includes(kata) && !(b.pml ?? "").toLowerCase().includes(kata)) return false;
    if (status === "belum") return b.percobaan === 0;
    if (status === "tidak_lulus") return b.percobaan > 0 && !b.lulus;
    if (status === "lulus") return b.lulus;
    return true;
  });
}

/** Ringkasan jumlah per status (untuk lencana penyaring). */
export function hitungStatusQc(baris: BarisQc[]): Record<StatusSaring, number> {
  return {
    semua: baris.length,
    belum: baris.filter((b) => b.percobaan === 0).length,
    tidak_lulus: baris.filter((b) => b.percobaan > 0 && !b.lulus).length,
    lulus: baris.filter((b) => b.lulus).length,
  };
}

/** Soal yang paling sering salah pada percobaan pertama, digabung dari semua tim (jumlah dijumlahkan per soal). */
export function gabungSoalSalah(rekap: QcRekapTim[]): { soal_id: string; pertanyaan: string; jumlah: number }[] {
  const peta = new Map<string, { soal_id: string; pertanyaan: string; jumlah: number }>();
  for (const t of rekap) {
    for (const s of t.salah) {
      const a = peta.get(s.soal_id);
      if (a) a.jumlah += s.jumlah;
      else peta.set(s.soal_id, { soal_id: s.soal_id, pertanyaan: s.pertanyaan, jumlah: s.jumlah });
    }
  }
  return Array.from(peta.values()).sort((a, b) => b.jumlah - a.jumlah);
}
