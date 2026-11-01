// lib/vanguard/kuesioner/publik.ts  (murni; BOLEH dimuat klien)
//
// (1 Nov 2026) VANGUARD V6d/V7a: daftar kasus K (kode, level, judul). Cerita dan angka diminta dari server per benih (api/sigap/vanguard/kuesioner?soal=1). Dibangun oleh scripts/vanguard-bangun-publik.mjs dari kasus-k.json.
// Kunci, jebakan, petunjuk, dan pembahasan hanya ada di kasus-k.json / nilaiK.ts (server dan tes).

import data from "./kasus-k-publik.json";

export type KasusKPublik = { kode: string; level: "K"; judul: string };
export const KASUS_K_PUBLIK = data as unknown as KasusKPublik[];
export const cariKasusKPublik = (kode: string): KasusKPublik | undefined => KASUS_K_PUBLIK.find((k) => k.kode === kode);

/** Kode kasus K (Mode Kuesioner Penuh). Rekaman kasus K dipisah dari angka Mode Simulasi (bintang, kelulusan, dasbor utama). */
export const adalahKasusK = (kode: string): boolean => cariKasusKPublik(kode) !== undefined;
