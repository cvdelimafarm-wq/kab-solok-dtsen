// lib/sigapPanduan.ts
//
// (27 Okt 2026) Halaman kerja petugas (/sigap/translok/[token]):
//  1. panduanSelesai: kapan panduan Langkah 1-5 tidak perlu ditampilkan lagi. Dulu hanya bila tombol "Selesai, mulai bekerja" tersimpan
//     (onboarding_selesai_at), sehingga 660 dari 788 akun aktif terlempar ke Langkah 1 setiap halaman dimuat ulang (mis. Back dari Kamera SIGAP).
//     Kini akun yang sudah punya hari kerja juga dianggap selesai: hari kerja baru bisa dipilih di Langkah 2, jadi petugas itu sudah menjalani panduan.
//  2. tampilan tersimpan: tab dan langkah yang sedang dibuka disimpan di sessionStorage HP, dipulihkan saat halaman dimuat ulang
//     (Back dari halaman Kamera memuat halaman kerja dari awal). Murni (tanpa akses penyimpanan) supaya bisa diuji.

export function panduanSelesai(selesaiAt: string | null | undefined, jumlahHariKerja: number): boolean {
  return !!selesaiAt || (Number.isFinite(jumlahHariKerja) && jumlahHariKerja > 0);
}

export type TabKerja = "hari_ini" | "hari_kerja" | "arsip";
export type TampilanKerja = { tab: TabKerja; langkah: number | null; pen: number | null };

const TAB: readonly string[] = ["hari_ini", "hari_kerja", "arsip"];
/** Tampilan lebih tua dari ini dianggap kedaluwarsa (kunjungan baru, bukan kembali dari Kamera). */
export const UMUR_TAMPILAN_MS = 60 * 60_000;
export const JUMLAH_LANGKAH = 5;

export const kunciTampilanKerja = (token: string) => `sigap-kerja-tampilan:${token}`;

export function kemasTampilan(t: TampilanKerja, sekarang: number): string {
  return JSON.stringify({ ...t, t: sekarang });
}

/** Baca isi sessionStorage; null bila kosong, rusak, tidak valid, atau kedaluwarsa. Nilai asing tidak pernah dipercaya. */
export function bacaTampilanKerja(mentah: string | null | undefined, sekarang: number): TampilanKerja | null {
  if (!mentah) return null;
  let o: unknown;
  try {
    o = JSON.parse(mentah);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.t !== "number" || !Number.isFinite(r.t) || sekarang - r.t > UMUR_TAMPILAN_MS || r.t - sekarang > 60_000) return null;
  if (typeof r.tab !== "string" || !TAB.includes(r.tab)) return null;
  const langkah = r.langkah === null || r.langkah === undefined ? null : r.langkah;
  if (langkah !== null && (typeof langkah !== "number" || !Number.isInteger(langkah) || langkah < 1 || langkah > JUMLAH_LANGKAH)) return null;
  const pen = r.pen === null || r.pen === undefined ? null : r.pen;
  if (pen !== null && (typeof pen !== "number" || !Number.isInteger(pen) || pen <= 0)) return null;
  return { tab: r.tab as TabKerja, langkah, pen };
}
