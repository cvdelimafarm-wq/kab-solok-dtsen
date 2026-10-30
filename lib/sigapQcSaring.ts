// lib/sigapQcSaring.ts  (murni)
//
// (31 Okt 2026) Kartu ringkasan tab QC (Pasca Bencana dan SPDT NTP) menjadi saringan: ketuk "Sudah mengisi" -> tampilkan yang BELUM mengisi;
// ketuk "Lulus" (Pasca Bencana: "Benar") -> tampilkan yang BELUM lulus (Pasca Bencana: yang masih ada jawaban salah); ketuk "Belum mengisi" -> yang belum mengisi.
// Ketuk lagi = lepas saringan. Satu sumber aturan supaya kedua halaman berperilaku sama.

export type KartuQc = "belum_mengisi" | "belum_lulus";

/** Ketuk kartu yang sedang aktif = lepas. */
export function ketukKartu(sekarang: KartuQc | null, k: KartuQc): KartuQc | null {
  return sekarang === k ? null : k;
}

/** Pasca Bencana: tidak ada ambang lulus, jadi "belum lulus" = sudah mengisi tetapi masih ada jawaban salah. */
export function lolosKartuHasil(k: KartuQc | null, p: { terjawab: number; salah: number }): boolean {
  if (k === null) return true;
  return k === "belum_mengisi" ? p.terjawab === 0 : p.terjawab > 0 && p.salah > 0;
}

/** SPDT NTP: lulus mengikuti nilai ambang pengaturan (sudah dihitung server pada `lulus`). */
export function lolosKartuPetugas(k: KartuQc | null, p: { percobaan: number; lulus: boolean }): boolean {
  if (k === null) return true;
  return k === "belum_mengisi" ? p.percobaan === 0 : !p.lulus;
}

export const LABEL_KARTU: Record<KartuQc, string> = { belum_mengisi: "belum mengisi", belum_lulus: "belum lulus" };
export const LABEL_KARTU_HASIL: Record<KartuQc, string> = { belum_mengisi: "belum mengisi", belum_lulus: "masih ada salah" };

/** Saringan "status" di tampilan Petugas SPDT <-> kartu. Status lain (modal/push) tidak punya kartu. */
export function kartuDariStatus(status: string): KartuQc | null {
  return status === "belum_mengisi" ? "belum_mengisi" : status === "belum_lulus" ? "belum_lulus" : null;
}
