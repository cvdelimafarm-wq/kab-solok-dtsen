// lib/sigapCacheFoto.ts  (murni, tanpa React/DB/jaringan)
//
// (28 Okt 2026) Pembantu simpanan foto di HP/server untuk layar foto SIGAP (Foto Saya, Nomor foto, Periksa).
// Permintaan user: cek cache dan prefetch foto. Temuan: kotak kecil di kisi memuat foto ASLI ber-cap (besar), dan foto yang sama
// diunduh/didekode ulang tiap dibuka. Perbaikan: (1) server melayani versi 'mini' (kisi) dan 'kecil' (pratinjau) selain 'penuh';
// (2) klien menyimpan berkas yang sudah diunduh di memori (batas jumlah byte) dan membagikannya antar komponen.

export type UkuranBerkas = "mini" | "kecil" | "penuh";

/** Lebar sisi panjang (piksel) dan mutu JPEG tiap ukuran selain 'penuh'. */
export const UKURAN_BERKAS = {
  mini: { lebar: 360, kualitas: 70 }, // kotak kisi (±15-30 KB)
  kecil: { lebar: 900, kualitas: 75 }, // pratinjau cepat di modal sebelum foto penuh tiba (±80-130 KB)
} as const;

/** Nilai ?u= dari klien. Kosong / tak dikenal -> 'penuh' (perilaku lama; klien lama tetap menerima foto asli). */
export function ukuranBerkasDariParam(v: string | null | undefined): UkuranBerkas {
  return v === "mini" || v === "kecil" ? v : "penuh";
}

/** Kunci simpanan klien untuk satu foto dan ukuran. */
export const kunciFoto = (id: number, ukuran: UkuranBerkas): string => `${id}|${ukuran}`;

/** Alamat unduhan berkas foto (klien memasang header Authorization sendiri). */
export const jalurBerkasFoto = (id: number, ukuran: UkuranBerkas): string => `/api/sigap/foto/berkas?id=${id}${ukuran === "penuh" ? "" : `&u=${ukuran}`}`;

/**
 * Simpanan terbatas BERAT (byte): yang paling lama TIDAK dipakai dilepas lebih dulu. Satu entri yang lebih besar dari batas tidak disimpan.
 * Generik supaya bisa dipakai untuk Blob di HP maupun Buffer di server.
 */
export class SimpananBerat<V> {
  private peta = new Map<string, { v: V; berat: number }>();
  private total = 0;
  constructor(private maksBerat: number) {}

  ambil(kunci: string): V | undefined {
    const e = this.peta.get(kunci);
    if (!e) return undefined;
    this.peta.delete(kunci); // segarkan urutan: terakhir dipakai di belakang
    this.peta.set(kunci, e);
    return e.v;
  }

  ada(kunci: string): boolean {
    return this.peta.has(kunci);
  }

  simpan(kunci: string, v: V, berat: number): boolean {
    const b = Math.max(0, Math.floor(berat));
    this.buang(kunci);
    if (b > this.maksBerat) return false;
    this.peta.set(kunci, { v, berat: b });
    this.total += b;
    while (this.total > this.maksBerat) {
      const pertama = this.peta.keys().next().value;
      if (pertama === undefined) break;
      this.buang(pertama);
    }
    return true;
  }

  buang(kunci: string): void {
    const e = this.peta.get(kunci);
    if (!e) return;
    this.total -= e.berat;
    this.peta.delete(kunci);
  }

  kosongkan(): void {
    this.peta.clear();
    this.total = 0;
  }

  get jumlah(): number {
    return this.peta.size;
  }

  get berat(): number {
    return this.total;
  }
}

/** Pilih id yang perlu dimuat lebih dulu: belum ada di simpanan, tanpa duplikat, urutan asli, paling banyak `maks`. */
export function pilihPrefetch(ids: readonly number[], sudahAda: (id: number) => boolean, maks: number): number[] {
  const lihat = new Set<number>();
  const hasil: number[] = [];
  for (const id of ids) {
    if (hasil.length >= maks) break;
    if (!Number.isInteger(id) || id <= 0 || lihat.has(id)) continue;
    lihat.add(id);
    if (!sudahAda(id)) hasil.push(id);
  }
  return hasil;
}

/** Tetangga sebuah foto di daftar (untuk prefetch saat modal terbuka): sebelum dan sesudah, tanpa melewati ujung. */
export function tetanggaFoto<T>(daftar: readonly T[], indeks: number): T[] {
  const a: T[] = [];
  if (indeks - 1 >= 0 && indeks - 1 < daftar.length) a.push(daftar[indeks - 1]);
  if (indeks + 1 >= 0 && indeks + 1 < daftar.length) a.push(daftar[indeks + 1]);
  return a;
}
