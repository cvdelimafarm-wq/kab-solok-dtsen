// lib/vanguard/kuesioner/publik.ts  (murni; BOLEH dimuat klien)
//
// (1 Nov 2026) VANGUARD V6d: bahan soal kasus K tanpa kunci. Dibangun oleh scripts/vanguard-bangun-publik.mjs dari kasus-k.json.
// Kunci, jebakan, petunjuk, dan pembahasan hanya ada di kasus-k.json / nilaiK.ts (server dan tes).

import data from "./kasus-k-publik.json";

export type KasusKPublik = { kode: string; level: "K"; judul: string; cerita: string; catatan: string[]; info: string[] };
export const KASUS_K_PUBLIK = data as unknown as KasusKPublik[];
export const cariKasusKPublik = (kode: string): KasusKPublik | undefined => KASUS_K_PUBLIK.find((k) => k.kode === kode);
