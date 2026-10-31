// lib/vanguard/kasus/index.ts  (murni)
//
// (1 Nov 2026) VANGUARD V1: pintu masuk data kasus. Kasus dipisah dari mesin dan dari tampilan: satu berkas JSON per level di folder ini.
// Urutan = urutan di layar (A, B, C, D, E, G, H). Kode kasus (mis. E07) stabil dan dipakai rekaman percobaan; jangan diubah atau dipakai ulang.
// Tambah kasus: tambahkan di BELAKANG berkas levelnya dengan kode berikutnya, lengkapi kunci, jebakan, pembahasan, dan rujukan, lalu jalankan tes.

import levelA from "./level-A.json";
import levelB from "./level-B.json";
import levelC from "./level-C.json";
import levelD from "./level-D.json";
import levelE from "./level-E.json";
import levelG from "./level-G.json";
import levelH from "./level-H.json";
import type { Kasus, Level } from "../tipe";

export const URUTAN_LEVEL: Level[] = ["A", "B", "C", "D", "E", "G", "H"];

export const NAMA_LEVEL: Record<Level, string> = {
  A: "Makanan (IV.1) ke Blok V",
  B: "Rumah dan sewa (IV.2) ke Blok V",
  C: "Layanan kesehatan ke Blok V.E",
  D: "Pendapatan Blok V.A–V.C",
  E: "Transfer dan aset Blok V.D–V.G",
  G: "Rumah tangga lengkap (neraca V–VII)",
  H: "Kalkulator bebas",
};

export const KASUS: Kasus[] = [levelA, levelB, levelC, levelD, levelE, levelG, levelH].flat() as unknown as Kasus[];

/** Kasus bernilai (berkunci, ikut bintang). Kalkulator bebas tidak termasuk. */
export const KASUS_BERNILAI: Kasus[] = KASUS.filter((k) => !k.bebas);

export const MAKS_BINTANG = KASUS_BERNILAI.length * 3;

export const cariKasus = (kode: string): Kasus | undefined => KASUS.find((k) => k.kode === kode);
export const kasusPerLevel = (level: Level): Kasus[] => KASUS.filter((k) => k.level === level);
