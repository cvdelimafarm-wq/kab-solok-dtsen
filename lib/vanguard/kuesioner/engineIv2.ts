// lib/vanguard/kuesioner/engineIv2.ts  (murni)
//
// (1 Nov 2026) VANGUARD V6b: Blok IV.2 (R.226–R.347, pengeluaran bukan makanan) kuesioner VSEN26.KP. Struktur kolom per rincian berasal dari Metadata_KP.xlsx (aplikasi klien Susenas 2026 SM2 v3.0) dan
// diringkas di rincian-iv2.json: K5 = nilai sebulan, K6 = nilai setahun, K7 = banyaknya (kWh, m3, liter, kg) ATAU status/jenis/kode sumber perolehan (0–3), K9 = teks (nama "lainnya"), K10–K14 = biaya yang dibayar tunai (OOP).
// Baris judul (R.226, 268, 307, 316, 334, 341) = jumlah anak pada kolom yang sama (himpunan anak sama persis dengan aturan jumlah PANTAU; diperiksa di tes). Ringkasannya mengisi rekap IV.3.3 (rekapIv33).
// Aturan pemeriksaan meniru jenis aturan Konsistensi_KP: status R227K7 menentukan R228–R231, listrik K7 dan K5 berpasangan, sumber perolehan, rentang kolom, dan peringatan (non-fatal) nilai kecil.

import data from "./rincian-iv2.json";
import type { Iv2Ringkas } from "./engine";
import { namaVariabelKomoditas } from "../pantau/peta";

export type KolomIv2 = { t: "nilai_sebulan" | "nilai_setahun" | "banyaknya" | "sumber" | "status" | "jenis" | "teks" | "nilai_oop" | "lain"; r: [number, number] | null };
export type RincianIv2 = { no: number; nama: string; kolom: Record<string, KolomIv2>; judul?: boolean };
export const RINCIAN_IV2 = data as unknown as RincianIv2[];
export const cariRincianIv2 = (no: number): RincianIv2 | undefined => RINCIAN_IV2.find((r) => r.no === no);

/** Baris judul dan rentang anaknya. */
export const JUDUL_IV2: Record<number, [number, number]> = { 226: [227, 267], 268: [269, 306], 307: [308, 315], 316: [317, 333], 334: [335, 340], 341: [342, 347] };
/** Anak sebuah judul pada kolom K5 atau K6: rincian dalam rentangnya yang memiliki kolom itu. */
export const anakJudul = (judul: number, k: 5 | 6): number[] => {
  const [a, b] = JUDUL_IV2[judul] ?? [0, -1];
  return RINCIAN_IV2.filter((r) => r.no >= a && r.no <= b && !!r.kolom[String(k)]).map((r) => r.no);
};

export type EntriIv2 = { r: number; k5?: number; k6?: number; k7?: number; k9?: string; k10?: number; k11?: number; k12?: number; k13?: number; k14?: number };
const n = (x: number | undefined | null): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const nilai = (e: EntriIv2 | undefined, k: 5 | 6): number => n(k === 5 ? e?.k5 : e?.k6);

/** Jumlah judul (K5, K6) dari anak-anaknya. Isian judul yang diketik petugas diabaikan; yang dipakai hasil jumlah. */
export function hitungIv2(entri: EntriIv2[]): Record<string, number> {
  const peta = new Map(entri.map((e) => [e.r, e]));
  const hasil: Record<string, number> = {};
  for (const judul of Object.keys(JUDUL_IV2).map(Number)) {
    const r = cariRincianIv2(judul)!;
    for (const k of [5, 6] as const) if (r.kolom[String(k)]) hasil[namaVariabelKomoditas(judul, k)] = anakJudul(judul, k).reduce((a, x) => a + nilai(peta.get(x), k), 0);
  }
  return hasil;
}

/** Ringkasan untuk rekap IV.3.3 (R1A = R226K5, R1B = R226K6, R2A = R268K5, R2B = R268K6, R3 = R307K6, R4 = R316K6, R5 = R334K6, R6 = R341K6). */
export function ringkasIv2(entri: EntriIv2[]): Iv2Ringkas {
  const h = hitungIv2(entri);
  return { r226k5: h.R226K5, r226k6: h.R226K6, r268k5: h.R268K5, r268k6: h.R268K6, r307k6: h.R307K6, r316k6: h.R316K6, r334k6: h.R334K6, r341k6: h.R341K6 };
}

export type TemuanIv2 = { r: number; variabel: string; pesan: string; fatal: boolean };

const DENGAN_SUMBER = (r: RincianIv2) => r.kolom["7"]?.t === "sumber";

export function periksaIv2(entri: EntriIv2[]): TemuanIv2[] {
  const hasil: TemuanIv2[] = [];
  const t = (r: number, variabel: string, pesan: string, fatal = true) => hasil.push({ r, variabel, pesan, fatal });
  const V = (r: number, k: number) => namaVariabelKomoditas(r, k);
  const peta = new Map(entri.map((e) => [e.r, e]));
  const ada = (x: number | undefined) => x !== undefined && x !== 0;

  for (const e of entri) {
    const def = cariRincianIv2(e.r);
    if (!def) { t(e.r, `R${e.r}`, `Rincian R${e.r} tidak dikenal pada Blok IV.2`); continue; }
    const nilaiKolom: [number, number | undefined][] = [[5, e.k5], [6, e.k6], [7, e.k7], [10, e.k10], [11, e.k11], [12, e.k12], [13, e.k13], [14, e.k14]];
    for (const [k, v] of nilaiKolom) {
      if (v === undefined) continue;
      const kd = def.kolom[String(k)];
      if (!kd) { t(e.r, V(e.r, k), `Isian ${V(e.r, k)} tidak tersedia pada rincian ini`); continue; }
      if (def.judul) continue; // judul dihitung otomatis
      if (kd.r && (v < kd.r[0] || v > kd.r[1])) t(e.r, V(e.r, k), `Isian ${V(e.r, k)} berada di luar rentang ${kd.r[0]}–${kd.r[1]}`);
      if ((kd.t === "nilai_sebulan" || kd.t === "nilai_setahun") && v < 500) t(e.r, V(e.r, k), `${V(e.r, k)} terisi tetapi terisinya kurang dari 500`, false);
      if (kd.t === "nilai_oop" && v > 0 && v < 1000) t(e.r, V(e.r, k), `${V(e.r, k)} terisi tetapi terisinya kurang dari 1000`, false);
    }
    // kode sumber perolehan (K7 0–3) berpasangan dengan nilai setahun (K6)
    if (DENGAN_SUMBER(def)) {
      if (e.k7 !== undefined && ada(e.k6) === false) t(e.r, V(e.r, 6), `Isian ${V(e.r, 7)} berkode 0 sampai 3 tetapi ${V(e.r, 6)} tidak ada isian`);
      if (e.k7 === undefined && e.k6 !== undefined) t(e.r, V(e.r, 7), `Isian ${V(e.r, 7)} tidak ada isian tetapi isian ${V(e.r, 6)} ada isiannya`);
    }
    // listrik: banyaknya (K7 di R233) dan nilai sebulan (K5 di R234) harus berpasangan
    if (e.r === 234) {
      const kwh = peta.get(233)?.k7;
      if (!ada(kwh) && ada(e.k5)) t(234, V(234, 5), `Isian ${V(233, 7)} tidak ada isian tetapi isian ${V(234, 5)} terisi`);
      if (ada(kwh) && !ada(e.k5)) t(234, V(234, 5), `Isian ${V(233, 7)} ada isian tetapi isian ${V(234, 5)} tidak terisi`);
    }
  }
  // R233 diisi tanpa R234 sama sekali
  const e233 = peta.get(233), e234 = peta.get(234);
  if (ada(e233?.k7) && !e234) t(234, V(234, 5), `Isian ${V(233, 7)} ada isian tetapi isian ${V(234, 5)} tidak terisi`);

  // status penguasaan (R227K7): menentukan baris sewa yang wajib terisi
  const status = peta.get(227)?.k7;
  if (status !== undefined) {
    const wajib = status === 1 || status === 4 ? 228 : status === 2 ? 229 : status === 3 ? 230 : status === 5 || status === 6 ? 231 : null;
    if (wajib !== null && !ada(peta.get(wajib)?.k5)) t(wajib, V(wajib, 5), `Rincian ${V(227, 7)} terisi ${status} tetapi isian ${V(wajib, 5)} tidak ada isian`);
    const sewa = [228, 229, 230, 231].reduce((a, x) => a + n(peta.get(x)?.k5), 0);
    if (sewa === 0 && wajib === null) t(231, V(231, 5), "Rincian R228K5;R229K5;R230K5;R231K5 tidak ada isian");
  }
  return hasil;
}

