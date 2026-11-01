// lib/vanguard/kuesioner/engine.ts  (murni)
//
// (1 Nov 2026) VANGUARD V6a: mesin hitung Blok IV.1 dan rekap IV.3 kuesioner VSEN26.KP (Mode Kuesioner Penuh). Aturan dan nama mengikuti PANTAU (aturan konsistensi KP 2026):
//   - variabel komoditas R{no}K{n}: IV.1 K1 banyaknya beli, K2 nilai beli, K3 banyaknya produksi/pemberian, K4 nilai produksi/pemberian, K5 = K1+K3, K6 = K2+K4 (cetak (5)..(10));
//     makanan jadi/rokok per ART (R187–R225): K7 = kode sumber perolehan (0 = non-pembelian, 1 online, 2 offline, 3 online dan offline).
//   - baris judul kelompok memuat jumlah anak-anaknya (K2, K4, K6); M (R187) dan N (R220) dijumlah per ART.
//   - IV.3.1 per ART: MB431K3 = R187K2, K4 = R187K4, K5 = R220K2, K6 = R220K4; jumlah B431JK3..K6.
//   - IV.3.2: B432R{1..12}K3/K4/K5 = judul kelompok K2/K4/K6; R13 = B431JK3, JK4 (K5 = K3+K4); R14 = JK5, JK6; R15 = jumlah R1..R14; R16K5 = ROUNDINT(R15K5 × 30/7).
//   - IV.3.3: R1A = R226K5, R1B = R226K6, R2A = R268K5, R2B = R268K6, R3 = R307K6, R4 = R316K6, R5 = R334K6, R6 = R341K6; R7A = R1A+R2A, R7B = R1B+…+R6; R8K3 = R7A + ROUNDINT(R7B/12); R9K3 = B432R16K5 + R8K3; Blok VI R1 K4 = R9K3 × 12.
// Tidak ada akses basis data; angka acuan hanya relasi agregat (bukan data responden).

import { KELOMPOK_IV1, RINCIAN_IV1 } from "./rincian";
import { namaVariabelKomoditas } from "../pantau/peta";

/** Satu isian komoditas. Rincian R.1–R.186 per rumah tangga; R.188–R.225 per anggota rumah tangga (art = nomor urut ART, sumber = kode K7). */
export type EntriIv1 = { r: number; art?: number; k1?: number; k2?: number; k3?: number; k4?: number; sumber?: number };
export type BarisIv1 = { r: number; art: number | null; k1: number; k2: number; k3: number; k4: number; k5: number; k6: number; sumber: number | null };
export type Subtotal = { kel: string; r: number; art: number | null; k2: number; k4: number; k6: number };
export type RekapArt = { art: number; k3: number; k4: number; k5: number; k6: number };
export type BarisRekap32 = { r: number; k3: number; k4: number; k5: number };
export type Iv2Ringkas = { r226k5?: number; r226k6?: number; r268k5?: number; r268k6?: number; r307k6?: number; r316k6?: number; r334k6?: number; r341k6?: number };
export type Rekap33 = { r1a: number; r1b: number; r2a: number; r2b: number; r3: number; r4: number; r5: number; r6: number; r7a: number; r7b: number; r8: number; r9: number };

const n = (x: number | undefined | null): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
/** ROUNDINT ala SQL Server untuk nilai tak negatif (setengah dibulatkan ke atas). */
export const bulatkan = (x: number): number => Math.round(x + Number.EPSILON);
const MULAI_ART = 187;

export const perART = (r: number): boolean => r >= MULAI_ART && r <= 225;

export function hitungBaris(e: EntriIv1): BarisIv1 {
  const k1 = n(e.k1), k2 = n(e.k2), k3 = n(e.k3), k4 = n(e.k4);
  return { r: e.r, art: perART(e.r) ? e.art ?? 1 : null, k1, k2, k3, k4, k5: Math.round((k1 + k3) * 10000) / 10000, k6: k2 + k4, sumber: e.sumber ?? null };
}

export type HasilIv1 = { baris: BarisIv1[]; subtotal: Subtotal[]; komoditasRt: number; komoditasPerArt: Record<number, number> };

/** Hitung K5, K6, judul kelompok (jumlah anak), dan banyaknya komoditas terisi. Entri ber-rincian tak dikenal diabaikan. */
export function hitungIv1(entri: EntriIv1[]): HasilIv1 {
  const sah = new Set(RINCIAN_IV1.map((x) => x.no));
  const baris = entri.filter((e) => sah.has(e.r)).map(hitungBaris);
  const subtotal: Subtotal[] = [];
  for (const k of KELOMPOK_IV1) {
    const anak = baris.filter((b) => b.r > k.no && b.r <= k.sampai);
    const arts = k.kel === "M" || k.kel === "N" ? [...new Set(anak.map((b) => b.art ?? 1))].sort((a, b) => a - b) : [null];
    for (const art of arts) {
      const s = anak.filter((b) => (art === null ? true : (b.art ?? 1) === art));
      if (s.length === 0 && art === null) continue;
      subtotal.push({ kel: k.kel, r: k.no, art, k2: s.reduce((a, b) => a + b.k2, 0), k4: s.reduce((a, b) => a + b.k4, 0), k6: s.reduce((a, b) => a + b.k6, 0) });
    }
  }
  const terisi = (b: BarisIv1) => b.k6 > 0 || b.k5 > 0;
  const komoditasPerArt: Record<number, number> = {};
  for (const b of baris) if (b.art !== null && terisi(b)) komoditasPerArt[b.art] = (komoditasPerArt[b.art] ?? 0) + 1;
  return { baris, subtotal, komoditasRt: baris.filter((b) => b.art === null && terisi(b)).length, komoditasPerArt };
}

/** Blok IV.3.1: satu baris per ART (R187 dan R220 per ART) + jumlah (B431JK3..K6). */
export function rekapIv31(h: HasilIv1): { baris: RekapArt[]; jumlah: { k3: number; k4: number; k5: number; k6: number } } {
  const arts = [...new Set(h.subtotal.filter((s) => s.art !== null).map((s) => s.art as number))].sort((a, b) => a - b);
  const baris = arts.map((art) => {
    const m = h.subtotal.find((s) => s.r === 187 && s.art === art), r = h.subtotal.find((s) => s.r === 220 && s.art === art);
    return { art, k3: m?.k2 ?? 0, k4: m?.k4 ?? 0, k5: r?.k2 ?? 0, k6: r?.k4 ?? 0 };
  });
  const j = (f: (x: RekapArt) => number) => baris.reduce((a, x) => a + f(x), 0);
  return { baris, jumlah: { k3: j((x) => x.k3), k4: j((x) => x.k4), k5: j((x) => x.k5), k6: j((x) => x.k6) } };
}

/** Blok IV.3.2 R.1–R.16 (kolom 3, 4, 5). R.16 hanya kolom 5. */
export function rekapIv32(h: HasilIv1): BarisRekap32[] {
  const awal = KELOMPOK_IV1.slice(0, 12);
  const rows: BarisRekap32[] = awal.map((k, i) => {
    const s = h.subtotal.find((x) => x.r === k.no && x.art === null);
    return { r: i + 1, k3: s?.k2 ?? 0, k4: s?.k4 ?? 0, k5: s?.k6 ?? 0 };
  });
  const jml = rekapIv31(h).jumlah;
  rows.push({ r: 13, k3: jml.k3, k4: jml.k4, k5: jml.k3 + jml.k4 });
  rows.push({ r: 14, k3: jml.k5, k4: jml.k6, k5: jml.k5 + jml.k6 });
  const tot = (f: (x: BarisRekap32) => number) => rows.reduce((a, x) => a + f(x), 0);
  const r15: BarisRekap32 = { r: 15, k3: tot((x) => x.k3), k4: tot((x) => x.k4), k5: tot((x) => x.k5) };
  rows.push(r15);
  rows.push({ r: 16, k3: 0, k4: 0, k5: bulatkan((r15.k5 * 30) / 7) });
  return rows;
}

/** Blok IV.3.3 dari ringkasan Blok IV.2 (belum dimodelkan di V6a) dan R.16 K.5. */
export function rekapIv33(iv2: Iv2Ringkas, r16k5: number): Rekap33 {
  const r1a = n(iv2.r226k5), r1b = n(iv2.r226k6), r2a = n(iv2.r268k5), r2b = n(iv2.r268k6), r3 = n(iv2.r307k6), r4 = n(iv2.r316k6), r5 = n(iv2.r334k6), r6 = n(iv2.r341k6);
  const r7a = r1a + r2a, r7b = r1b + r2b + r3 + r4 + r5 + r6;
  const r8 = r7a + bulatkan(r7b / 12);
  return { r1a, r1b, r2a, r2b, r3, r4, r5, r6, r7a, r7b, r8, r9: r16k5 + r8 };
}
/** Blok VI R.1 K.4 (konsumsi setahun) = IV.3.3 R.9 K.3 × 12. */
export const konsumsiSetahun = (r9: number): number => r9 * 12;

// ---------------------------------------------------------------- pemeriksaan isian (meniru jenis aturan PANTAU)
export type TemuanIv1 = { r: number; art: number | null; variabel: string; pesan: string; fatal: boolean };

/**
 * Pemeriksaan bentuk isian per baris (aturan kolom bergantung PANTAU): "K1 terisi 0 tetapi K2 ada isinya", "K1 terisi >0 tetapi K2 kosong", pasangan K3/K4, dan kode sumber K7 pada baris per ART.
 * Hanya memeriksa entri yang diberikan (isian kosong = rincian tidak diisi, bukan salah).
 */
export function periksaIv1(entri: EntriIv1[]): TemuanIv1[] {
  const hasil: TemuanIv1[] = [];
  const t = (r: number, art: number | null, variabel: string, pesan: string) => hasil.push({ r, art, variabel, pesan, fatal: true });
  for (const e of entri) {
    const art = perART(e.r) ? e.art ?? 1 : null;
    const V = (k: number) => namaVariabelKomoditas(e.r, k);
    const pasang = (a: number | undefined, b: number | undefined, ka: number, kb: number) => {
      if (a === undefined && b === undefined) return;
      if (a !== undefined && a === 0 && b !== undefined && b !== 0) t(e.r, art, V(kb), `Rincian ${V(ka)} terisi 0 tetapi isian ${V(kb)} ada isiannya`);
      else if (a !== undefined && a > 0 && (b === undefined || b === 0)) t(e.r, art, V(kb), `Rincian ${V(ka)} terisi lebih dari 0 tetapi isian ${V(kb)} tidak ada isian`);
      else if (a === undefined && b !== undefined && b !== 0) t(e.r, art, V(kb), `Rincian ${V(ka)} tidak ada isian tetapi isian ${V(kb)} ada isiannya`);
    };
    pasang(e.k1, e.k2, 1, 2);
    pasang(e.k3, e.k4, 3, 4);
    if (art !== null) {
      const beli = n(e.k2) > 0 || n(e.k1) > 0;
      if (e.sumber !== undefined && (e.sumber < 0 || e.sumber > 3)) t(e.r, art, V(7), `Isian ${V(7)} harus 0, 1, 2, atau 3`);
      else if (e.sumber === 0 && beli) t(e.r, art, V(2), `Isian ${V(7)} berkode 0 tetapi isian ${V(2)} ada isiannya`);
      else if (e.sumber === undefined && beli) t(e.r, art, V(7), `Isian ${V(7)} tidak ada isian tetapi ${V(2)} ada isiannya`);
      else if (e.sumber !== undefined && e.sumber > 0 && !beli) t(e.r, art, V(7), `Isian ${V(7)} berkode ${e.sumber} tetapi isian pembelian ${V(2)} tidak ada isiannya`);
    }
  }
  return hasil;
}
