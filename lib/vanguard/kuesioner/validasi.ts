// lib/vanguard/kuesioner/validasi.ts  (murni)
//
// (1 Nov 2026) VANGUARD V6d: membersihkan isian Blok IV.1 dari klien sebelum dinilai atau disimpan. Klien tidak dipercaya:
// rincian harus ada di daftar, ART 1–30, angka berhingga 0–1e12, teks dipangkas, jumlah entri dibatasi, satu entri per (rincian, ART).

import { RINCIAN_IV1 } from "./rincian";
import { perART } from "./engine";
import type { IsianK } from "./nilaiK";

export const MAKS_ENTRI = 400;
const SAH = new Set(RINCIAN_IV1.map((r) => r.no));
const angka = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e12 ? x : undefined);
const teks = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim().replace(/\s+/g, " ").slice(0, 60) : undefined);

export function bersihkanIsian(mentah: unknown): { isian: IsianK[]; galat: string | null } {
  if (!Array.isArray(mentah)) return { isian: [], galat: "Isian harus berupa daftar." };
  if (mentah.length > MAKS_ENTRI) return { isian: [], galat: `Isian terlalu banyak (maksimum ${MAKS_ENTRI}).` };
  const peta = new Map<string, IsianK>();
  for (const x of mentah) {
    if (!x || typeof x !== "object") return { isian: [], galat: "Isian tidak sah." };
    const o = x as Record<string, unknown>;
    const r = o.r;
    if (typeof r !== "number" || !Number.isInteger(r) || !SAH.has(r)) return { isian: [], galat: "Nomor rincian tidak sah." };
    const e: IsianK = { r };
    if (perART(r)) {
      const art = o.art === undefined ? 1 : o.art;
      if (typeof art !== "number" || !Number.isInteger(art) || art < 1 || art > 30) return { isian: [], galat: "Nomor ART tidak sah." };
      e.art = art;
      if (o.sumber !== undefined) { if (typeof o.sumber !== "number" || !Number.isInteger(o.sumber) || o.sumber < 0 || o.sumber > 3) return { isian: [], galat: "Kode sumber harus 0–3." }; e.sumber = o.sumber; }
    }
    for (const k of ["k1", "k2", "k3", "k4"] as const) {
      if (o[k] === undefined || o[k] === null) continue;
      const v = angka(o[k]);
      if (v === undefined) return { isian: [], galat: "Angka isian tidak sah." };
      e[k] = v;
    }
    const nama = teks(o.nama), satuan = teks(o.satuan);
    if (nama) e.nama = nama;
    if (satuan) e.satuan = satuan;
    peta.set(`${e.r}|${e.art ?? 0}`, e);
  }
  return { isian: [...peta.values()], galat: null };
}
