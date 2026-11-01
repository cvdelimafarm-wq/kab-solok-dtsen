// lib/vanguard/kasus/daftar.ts  (murni)
//
// (1 Nov 2026) VANGUARD V5b: daftar kasus PUBLIK untuk perangkat petugas dan layar admin: hanya bahan soal (publik.json, tanpa kunci/jebakan/petunjuk/pembahasan).
// Kunci dan kawan-kawannya ada di kasus/index.ts (KASUS penuh) yang HANYA boleh diimpor server dan tes; tes vanguardPublik menjaga agar kode klien tidak mengimpornya.

import publik from "./publik.json";
import tangguh from "./ditangguhkan.json";
import type { KasusPublik, Level } from "../tipe";

export const URUTAN_LEVEL: Level[] = ["A", "B", "C", "D", "E", "G", "H"];

export const NAMA_LEVEL: Record<Level, string> = {
  A: "Makanan (IV.1) ke Blok V dan VII",
  B: "Rumah dan sewa (IV.2) ke Blok V",
  C: "Layanan kesehatan ke Blok V dan VII",
  D: "Pendapatan Blok V.A–V.C",
  E: "Transfer dan aset Blok V.D–V.G",
  G: "Rumah tangga lengkap (neraca V–VII)",
  H: "Kalkulator bebas",
};

export const KASUS_PUBLIK: KasusPublik[] = publik as unknown as KasusPublik[];
export const KASUS_PUBLIK_BERNILAI: KasusPublik[] = KASUS_PUBLIK.filter((k) => !k.bebas);
export const MAKS_BINTANG = KASUS_PUBLIK_BERNILAI.length * 3;
export const cariKasusPublik = (kode: string): KasusPublik | undefined => KASUS_PUBLIK.find((k) => k.kode === kode);

/** Kode kasus yang DITANGGUHKAN (tidak tampil, tidak dihitung). Rekaman lama atas kode ini diabaikan oleh dasbor. */
export const KODE_DITANGGUHKAN: ReadonlySet<string> = new Set(tangguh as string[]);
