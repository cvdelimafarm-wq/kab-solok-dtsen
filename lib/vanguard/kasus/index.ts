// lib/vanguard/kasus/index.ts  (murni)
//
// (1 Nov 2026) VANGUARD V1: pintu masuk data kasus. Kasus dipisah dari mesin dan dari tampilan: satu berkas JSON per level di folder ini.
// Urutan = urutan di layar (A, B, C, D, E, G, H). Kode kasus (mis. E07) stabil dan dipakai rekaman percobaan; jangan diubah atau dipakai ulang.
// (V5b) HANYA SERVER dan tes yang boleh mengimpor berkas ini: ia memuat kunci. Perangkat petugas memakai ./daftar (publik.json). Setelah mengubah level-*.json jalankan `node scripts/vanguard-bangun-publik.mjs`.
// Tambah kasus: tambahkan di BELAKANG berkas levelnya dengan kode berikutnya, lengkapi kunci, jebakan, pembahasan, dan rujukan, lalu jalankan tes.

import levelA from "./level-A.json";
import levelB from "./level-B.json";
import levelC from "./level-C.json";
import levelD from "./level-D.json";
import levelE from "./level-E.json";
import levelG from "./level-G.json";
import levelH from "./level-H.json";
import type { Kasus, KasusRahasia, Level } from "../tipe";

export { URUTAN_LEVEL, NAMA_LEVEL, MAKS_BINTANG } from "./daftar";

export const KASUS: Kasus[] = [levelA, levelB, levelC, levelD, levelE, levelG, levelH].flat() as unknown as Kasus[];

/** Kasus bernilai (berkunci, ikut bintang). Kalkulator bebas tidak termasuk. */
export const KASUS_BERNILAI: Kasus[] = KASUS.filter((k) => !k.bebas);


export const cariKasus = (kode: string): Kasus | undefined => KASUS.find((k) => k.kode === kode);
export const kasusPerLevel = (level: Level): Kasus[] => KASUS.filter((k) => k.level === level);

/** Bagian rahasia sebuah kasus (dikirim ke petugas hanya pada latihan, lewat /api/sigap/vanguard/kasus). */
export const rahasiaKasus = (k: Kasus): KasusRahasia => ({ kunci: k.kunci, jebakan: k.jebakan, alternatif: k.alternatif, ...(k.nol !== undefined ? { nol: k.nol } : {}), petunjuk: k.petunjuk, langkah: k.langkah, pembahasan: k.pembahasan, rujukan: k.rujukan });
