// lib/keu/poinBeban.ts  (murni; tanpa React/DB)
//
// (13 Nov 2026, keputusan C) Master > tab "Poin beban kerja": matriks jenis pekerjaan × survei. Angka dihitung basis data (keu_poin_hitung,
// SQL 20261113c); berkas ini hanya menyusun matriks, label sumber, dan konversi per hari <-> poin untuk tampilan.

export type SumberPoin = "riwayat" | "gabungan" | "usul" | "manual" | "awal";
export type BarisSelPoin = {
  id: number; jenis_id: number; jenis_kode: string; jenis_nama: string; satuan: string; jenis_urut: number; jenis_aktif: boolean;
  survei_id: number; survei_kode: string; survei_nama: string; survei_urut: number;
  awal: number | string | null; awal_ket: string; manual: number | string | null; manual_timpa: boolean; manual_alasan: string; manual_oleh_nama: string | null; manual_at: string | null;
  poin_berlaku: number | string | null; sumber_berlaku: SumberPoin | null; berlaku_at: string | null; standar_per_hari: number | string | null;
  usul_poin: string | null; usul_n: number; usul_pencilan: number; riwayat_poin: string | null; riwayat_n: number; riwayat_orang: number;
  kandidat: string | null; sumber_kandidat: SumberPoin | null;
  menunggu_id: number | null; menunggu_poin: number | string | null; menunggu_sumber: SumberPoin | null; menunggu_oleh: number | null; menunggu_oleh_nama: string | null;
};
export type JenisPoin = { id: number; kode: string; nama: string; satuan: string; urut: number; aktif: boolean };
export type SurveiPoin = { id: number; kode: string; nama: string; pola: string; urut: number; aktif: boolean };
export type AturPoin = { kunci: string; nilai: number | string; ket: string; diubah_at: string | null; diubah_oleh_nama: string | null };
export type RiwayatPoin = {
  id: number; sel_id: number; poin_lama: number | string | null; poin_baru: number | string; sumber: string; alasan: string; status: "berlaku" | "menunggu" | "ditolak" | "usang";
  diajukan_at: string; diajukan_oleh_nama: string | null; diputus_at: string | null; diputus_oleh_nama: string | null; catatan_putus: string;
};

export const LABEL_SUMBER: Record<SumberPoin, string> = { riwayat: "Riwayat", gabungan: "Riwayat + usul", usul: "Usul pegawai", manual: "Input manual", awal: "Data awal" };
export const HURUF_SUMBER: Record<SumberPoin, string> = { riwayat: "R", gabungan: "G", usul: "U", manual: "M", awal: "A" };
export const LABEL_STATUS_RIWAYAT: Record<RiwayatPoin["status"], string> = { berlaku: "Berlaku", menunggu: "Menunggu persetujuan", ditolak: "Ditolak", usang: "Tergantikan" };

export const angkaAtauNull = (x: unknown): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
/** 12,5 / 8,33 / 100 (maks 2 desimal, koma). */
export const fmtPoin = (x: unknown): string => {
  const n = angkaAtauNull(x);
  return n === null ? "–" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);
};
/** Poin per satuan dari "sekian satuan per hari" (kapasitas 100 bawaan). */
export const poinDariPerHari = (perHari: number, kapasitas = 100): number | null => (perHari > 0 ? Math.round((kapasitas / perHari) * 100) / 100 : null);
export const perHariDariPoin = (poin: number, kapasitas = 100): number | null => (poin > 0 ? Math.round((kapasitas / poin) * 10) / 10 : null);

export type BarisMatriks = { jenis: JenisPoin; sel: Map<number, BarisSelPoin> };
/** Baris = jenis pekerjaan aktif (urut), kolom = survei aktif (urut). Saringan teks pada nama/kode jenis; `surveiPilih` null = semua survei. */
export function susunMatriks(jenis: readonly JenisPoin[], survei: readonly SurveiPoin[], sel: readonly BarisSelPoin[], saring = "", surveiPilih: number | null = null): { kolom: SurveiPoin[]; baris: BarisMatriks[] } {
  const q = saring.trim().toLowerCase();
  const kolom = survei.filter((s) => s.aktif && (surveiPilih === null || s.id === surveiPilih)).sort((a, b) => a.urut - b.urut || a.id - b.id);
  const per = new Map<number, Map<number, BarisSelPoin>>();
  for (const s of sel) {
    const m = per.get(s.jenis_id) ?? new Map<number, BarisSelPoin>();
    m.set(s.survei_id, s);
    per.set(s.jenis_id, m);
  }
  const baris = jenis
    .filter((j) => j.aktif && (!q || j.nama.toLowerCase().includes(q) || j.kode.includes(q)))
    .sort((a, b) => a.urut - b.urut || a.id - b.id)
    .map((j) => ({ jenis: j, sel: per.get(j.id) ?? new Map<number, BarisSelPoin>() }));
  return { kolom, baris };
}

/** Persen perubahan poin (untuk penanda > ambang). */
export const persenUbah = (lama: number | null, baru: number | null): number | null => (lama && baru !== null ? Math.round((Math.abs(baru - lama) / lama) * 1000) / 10 : null);
