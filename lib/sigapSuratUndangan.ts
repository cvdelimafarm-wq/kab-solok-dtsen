// lib/sigapSuratUndangan.ts
//
// (9 Nov 2026) Surat undangan pelatihan per kelas (jalur unggah). Fungsi MURNI (tanpa database): pemeriksaan isian & berkas, kelas yang belum punya surat.
// Pemuat data: lib/sigapSuratUndanganDb.ts. Skema: claude/skema-matang-pembaruan1-kelola-pelatihan-8nov.md bagian 1.

export const MAKS_BYTE_SURAT = 10 * 1024 * 1024;
export const MAKS_NOMOR = 80;
export const MAKS_PERIHAL = 200;
export const MAKS_ALASAN = 200;

export type IsianSurat = { nomor: unknown; tanggal: unknown; perihal: unknown };
export type IsianBersih = { nomor: string; tanggal: string; perihal: string };

const bersih = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Tanggal kalender sah (YYYY-MM-DD, bukan 31 Februari). */
export function tanggalSah(t: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

/** Nomor, tanggal, perihal wajib. Mengembalikan isian rapi atau pesan galat. */
export function periksaIsian(x: IsianSurat): { ok: true; isian: IsianBersih } | { ok: false; galat: string } {
  const nomor = bersih(x.nomor);
  const tanggal = bersih(x.tanggal);
  const perihal = bersih(x.perihal);
  if (!nomor) return { ok: false, galat: "Nomor surat wajib diisi." };
  if (nomor.length > MAKS_NOMOR) return { ok: false, galat: `Nomor surat maksimal ${MAKS_NOMOR} karakter.` };
  if (!tanggal) return { ok: false, galat: "Tanggal surat wajib diisi." };
  if (!tanggalSah(tanggal)) return { ok: false, galat: "Tanggal surat tidak valid." };
  if (!perihal) return { ok: false, galat: "Perihal surat wajib diisi." };
  if (perihal.length > MAKS_PERIHAL) return { ok: false, galat: `Perihal maksimal ${MAKS_PERIHAL} karakter.` };
  return { ok: true, isian: { nomor, tanggal, perihal } };
}

/** Isi berkas berawalan "%PDF-" (tipe MIME dari peramban tidak cukup dipercaya). */
export function adalahPdf(awal: Uint8Array): boolean {
  return awal.length >= 5 && awal[0] === 0x25 && awal[1] === 0x50 && awal[2] === 0x44 && awal[3] === 0x46 && awal[4] === 0x2d;
}

export function periksaBerkas(ukuran: number, awal: Uint8Array): string | null {
  if (ukuran <= 0) return "Berkas kosong.";
  if (ukuran > MAKS_BYTE_SURAT) return "Ukuran PDF maksimal 10 MB.";
  if (!adalahPdf(awal)) return "Berkas harus berupa PDF.";
  return null;
}

export function alasanBersih(v: unknown): string | null {
  const a = bersih(v).slice(0, MAKS_ALASAN);
  return a || null;
}

/** Kelas (dari daftar kelas pelatihan) yang belum punya surat aktif. */
export function kelasTanpaSurat(kelas: readonly number[], kelasBerSurat: readonly number[]): number[] {
  const ada = new Set(kelasBerSurat);
  return kelas.filter((k) => !ada.has(k));
}

/** Nama berkas unduhan yang aman. */
export function namaBerkasSurat(nomor: string, kelas: number): string {
  const inti = nomor.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "undangan";
  return `Undangan_Kelas${kelas}_${inti}.pdf`;
}

/** Bagian InfoUndangan yang diganti oleh surat unggahan (pelatihan selain PSP). */
export type UndanganDasar = { nomor: string; tanggal_surat: string; hal: string; pdf: string; turunan?: boolean };

/**
 * Pelatihan selain PSP: undangan disusun otomatis dari data kegiatan (turunan = true) dan belum punya surat resmi. Bila kelas peserta sudah punya surat
 * undangan aktif, nomor, tanggal, perihal diambil dari surat itu dan PDF tersedia. PSP (surat resmi bawaan) tidak diubah.
 */
export function gabungUndangan<T extends UndanganDasar>(info: T, surat: { nomor: string; tanggal: string; perihal: string } | null, formatTanggal: (iso: string) => string): T {
  if (!surat || info.turunan !== true) return info;
  return { ...info, nomor: surat.nomor, tanggal_surat: formatTanggal(surat.tanggal), hal: surat.perihal, pdf: "surat-unggahan" };
}
