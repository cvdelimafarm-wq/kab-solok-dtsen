// lib/sigapPendataanSaring.ts  (murni)
//
// (31 Okt 2026) Kartu "Lembar Pendataan KK" di Beranda/tahap menyebut "12 dari 40 KK tim sudah punya hasil". Angka itu kini membuka daftar yang cocok:
// Sub SLS prioritas (?utama=1) dengan saringan "Belum" (?saring=belum) -- bukan lembar polos. Saringan sama dengan chip di halaman pendataan.

export type SaringPendataan = "belum" | "terdampak" | "tidak_terdampak" | "tidak_ditemukan";

const SAH: readonly SaringPendataan[] = ["belum", "terdampak", "tidak_terdampak", "tidak_ditemukan"];

/** Nilai ?saring= -> saringan yang sah, atau null (kosong / di luar daftar -> tanpa saringan). */
export function saringDariAlamat(nilai: string | null | undefined): SaringPendataan | null {
  if (!nilai) return null;
  return (SAH as readonly string[]).includes(nilai) ? (nilai as SaringPendataan) : null;
}

/** Alamat Lembar Pendataan untuk kartu: masih ada KK tanpa hasil -> Sub SLS prioritas + saringan "Belum"; sudah semua -> lembar biasa. */
export function alamatLembarPendataan(f: { total: number; didata: number }, dari: string): string {
  const d = `dari=${encodeURIComponent(dari)}`;
  return f.didata < f.total ? `/sigap/pendataan?utama=1&saring=belum&${d}` : `/sigap/pendataan?${d}`;
}
