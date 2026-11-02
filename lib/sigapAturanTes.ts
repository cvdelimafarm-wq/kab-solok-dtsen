// lib/sigapAturanTes.ts  (murni; dipakai server dan klien)
//
// (2 Nov 2026) ATURAN NILAI & KELULUSAN PELATIHAN, VERSI 1 dan 2 (rancangan-pelatihan-5-tab-hierarki, keputusan 8-10).
//   Versi 1 (lama, kegiatan PSP Pascabencana): nilai resmi = skor TERTINGGI dari semua percobaan; lulus bila nilai >= ambang.
//   Versi 2 (kegiatan baru, mis. Seruti TW IV): nilai resmi = skor PERCOBAAN PERTAMA; lulus hanya bila nilai akhir LEBIH DARI ambang (tepat 70 = tidak lulus).
//   Kelulusan hanya FLAG untuk laporan ke pimpinan; tidak memblokir pendataan.
// Aturan tiap kegiatan disimpan di sigap_pelatihan_aturan (SQL 20261102zl). Tanpa baris: PSP Pascabencana = versi 1, kegiatan lain = versi 2.

export type VersiAturan = 1 | 2;

export type AturanPelatihan = {
  versi: VersiAturan;
  /** Tahapan yang belum selesai memblokir tahapan berikutnya (F2). */
  blokir_tahap: boolean;
  /** Petugas boleh mengajukan buka kunci (F2). */
  izin_ajukan: boolean;
  /** true = tersimpan di tabel; false = turunan dari bawaan. */
  eksplisit: boolean;
};

export const KODE_PSP = "pelatihan_psp_pascabencana_2026";
export const AMBANG_LULUS_BAWAAN = 70;

/** Bawaan menurut kode kegiatan: hanya PSP Pascabencana yang tetap memakai aturan lama. */
export const versiBawaan = (kodeKegiatan: string | null | undefined): VersiAturan => (kodeKegiatan === KODE_PSP ? 1 : 2);

export function rapikanAturan(baris: { aturan_versi?: unknown; blokir_tahap?: unknown; izin_ajukan?: unknown } | null | undefined, kodeKegiatan: string | null | undefined): AturanPelatihan {
  if (!baris) return { versi: versiBawaan(kodeKegiatan), blokir_tahap: false, izin_ajukan: false, eksplisit: false };
  const v = Number(baris.aturan_versi);
  return { versi: v === 1 ? 1 : v === 2 ? 2 : versiBawaan(kodeKegiatan), blokir_tahap: baris.blokir_tahap === true, izin_ajukan: baris.izin_ajukan === true, eksplisit: true };
}

export function periksaAturan(x: unknown): { ok: true; aturan: Pick<AturanPelatihan, "versi" | "blokir_tahap" | "izin_ajukan"> } | { ok: false; pesan: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  if (o.versi !== 1 && o.versi !== 2) return { ok: false, pesan: "Versi aturan harus 1 atau 2." };
  if (typeof o.blokir_tahap !== "boolean" || typeof o.izin_ajukan !== "boolean") return { ok: false, pesan: "Setelan blokir tahapan dan pengajuan buka kunci tidak sah." };
  return { ok: true, aturan: { versi: o.versi, blokir_tahap: o.blokir_tahap, izin_ajukan: o.izin_ajukan } };
}

export const LABEL_VERSI: Record<VersiAturan, string> = {
  1: "Aturan lama: nilai tertinggi dari semua percobaan; lulus bila nilai ≥ ambang",
  2: "Aturan baru: nilai percobaan pertama; lulus bila nilai akhir > ambang",
};

type SesiNilai = { percobaan?: number | null; selesai_at?: string | null; skor?: number | string | null; skor_terbaik?: number | string | null; skor_awal?: number | string | null };
const angka = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Nilai PERTAMA: skor_awal bila ada; selain itu skor sesi bila masih percobaan pertama dan sudah selesai. Percobaan >1 tanpa skor_awal = tidak diketahui (null). */
export function nilaiPertama(s: SesiNilai | null | undefined): number | null {
  if (!s) return null;
  const awal = angka(s.skor_awal);
  if (awal !== null) return awal;
  if ((s.percobaan ?? 1) <= 1 && s.selesai_at) return angka(s.skor);
  return null;
}

/** Nilai tertinggi (aturan lama). */
export function nilaiTertinggi(s: SesiNilai | null | undefined): number | null {
  if (!s) return null;
  const a = s.selesai_at ? angka(s.skor) : null;
  const b = angka(s.skor_terbaik);
  return a === null ? b : b === null ? a : Math.max(a, b);
}

/** Nilai resmi satu tes menurut versi aturan. `awalArsip` = skor percobaan pertama dari arsip, dipakai bila sesi sudah >1 percobaan dan skor_awal kosong (data lama). */
export function nilaiResmiTes(versi: VersiAturan, s: SesiNilai | null | undefined, awalArsip?: number | null): number | null {
  if (versi === 1) return nilaiTertinggi(s);
  return nilaiPertama(s) ?? (awalArsip ?? null);
}

/** Lulus menurut versi: v1 nilai >= ambang; v2 nilai > ambang. */
export function lulusMenurut(versi: VersiAturan, nilai: number, ambang: number): boolean {
  return versi === 2 ? nilai > ambang : nilai >= ambang;
}

export type StatusKelulusan = "lulus" | "tidak_lulus" | "belum_lengkap" | "belum_dinilai";
export const LABEL_KELULUSAN: Record<StatusKelulusan, string> = { lulus: "Lulus", tidak_lulus: "Tidak lulus", belum_lengkap: "Belum lengkap", belum_dinilai: "Belum dinilai" };

/**
 * Status kelulusan peserta dari nilai akhir (hasil `hitungAkhir`). belum_dinilai = belum ada komponen bernilai; belum_lengkap = ada komponen terpilih yang masih kosong
 * (statusnya belum final). Hanya flag.
 */
export function statusKelulusan(versi: VersiAturan, hasil: { akhir: number | null; lengkap: boolean }, ambang: number = AMBANG_LULUS_BAWAAN): StatusKelulusan {
  if (hasil.akhir === null) return "belum_dinilai";
  if (!hasil.lengkap) return "belum_lengkap";
  return lulusMenurut(versi, hasil.akhir, ambang) ? "lulus" : "tidak_lulus";
}

/** Ringkasan jumlah per status (untuk laporan ke pimpinan). */
export function hitungKelulusan(daftar: readonly StatusKelulusan[]): Record<StatusKelulusan, number> {
  const r: Record<StatusKelulusan, number> = { lulus: 0, tidak_lulus: 0, belum_lengkap: 0, belum_dinilai: 0 };
  for (const s of daftar) r[s]++;
  return r;
}
