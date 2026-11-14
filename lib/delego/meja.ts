// lib/delego/meja.ts
//
// (14 Nov 2026, Fase 7) Meja kerja (keu_meja_kerja) dan Ruang keputusan baca-saja (keu_ruang_keputusan). Berkas MURNI: bentuk data dan
// pengelompokan. Yang menghitung tetap basis data; halaman hanya menampilkan dan menautkan ke layar asal.

type Nada = "hijau" | "abu" | "biru" | "amber" | "merah";

export type ButirMeja = { kode: string; modul: string; judul: string; jumlah: number; isi: string; tautan: string; nada: Nada; urut: number };
export type BahanMeja = { hari_ini: string; butir: ButirMeja[]; total: number };

export type IsiSinyal = { teks: string; sub: string; tautan?: string };
export type Sinyal = { kode: string; judul: string; nada: Nada; tautan: string; jumlah: number; isi: IsiSinyal[] };
export type BahanKeputusan = { hari_ini: string; pemutus: boolean; sinyal: Sinyal[] };

/** Butir yang menuntut tindakan (tanpa pemberitahuan) dipisah dari pemberitahuan. */
export function pisahMeja(d: BahanMeja): { tindakan: ButirMeja[]; kabar: ButirMeja[] } {
  return { tindakan: d.butir.filter((b) => b.kode !== "notif"), kabar: d.butir.filter((b) => b.kode === "notif") };
}

/** Sinyal aktif (jumlah > 0) lebih dulu, merah sebelum amber sebelum abu; sinyal kosong di akhir. */
export function urutSinyal(s: Sinyal[]): Sinyal[] {
  const bobot: Record<Nada, number> = { merah: 0, amber: 1, biru: 2, abu: 3, hijau: 4 };
  return [...s].sort((a, b) => Number(b.jumlah > 0) - Number(a.jumlah > 0) || bobot[a.nada] - bobot[b.nada]);
}

export const BATAS_ISI = 5;
