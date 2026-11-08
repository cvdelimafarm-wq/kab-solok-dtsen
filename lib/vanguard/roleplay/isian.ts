// lib/vanguard/roleplay/isian.ts  (murni)
//
// (8 Nov 2026) Roleplay bersama kelas: pembersihan isian dari klien, penguncian satuan sesudah PERIKSA, dan tumpang tindih cakupan antar langkah.
// Isian peserta dipercaya HANYA setelah dibersihkan di sini (daftar rincian dan kotak dikenal, angka tak negatif, jumlah dibatasi).

import { RINCIAN_IV1 } from "../kuesioner/rincian";
import { perART } from "../kuesioner/engine";
import { selDikenal } from "../sel";
import { BAGIAN_SAH, adalahKunciIv1, kunciIv1, kunciSel, noRDariKunci, satuanCakupan, type BagianSesi, type CakupanSesi, type EntriRoleplay, type IsianRoleplay } from "./penilaian";

export const MAKS_ENTRI_IV1 = 800;
export const MAKS_KOTAK = 120;
const RINCIAN_SAH = new Set(RINCIAN_IV1.map((r) => r.no));

const angka = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 1e13 ? x : undefined);

/** Bersihkan isian dari klien. Entri tak dikenal atau tanpa angka dibuang; angka negatif/bukan angka diabaikan. */
export function bersihkanIsian(raw: unknown): IsianRoleplay {
  const o = (raw && typeof raw === "object" ? raw : {}) as { iv1?: unknown; nilai?: unknown };
  const iv1: EntriRoleplay[] = [];
  if (Array.isArray(o.iv1)) {
    for (const x of o.iv1.slice(0, MAKS_ENTRI_IV1)) {
      if (!x || typeof x !== "object") continue;
      const e = x as Record<string, unknown>;
      const r = typeof e.r === "number" && Number.isInteger(e.r) ? e.r : NaN;
      if (!RINCIAN_SAH.has(r)) continue;
      const k1 = angka(e.k1), k2 = angka(e.k2), k3 = angka(e.k3), k4 = angka(e.k4);
      if (k1 === undefined && k2 === undefined && k3 === undefined && k4 === undefined) continue;
      const bersih: EntriRoleplay = { r };
      if (k1 !== undefined) bersih.k1 = k1;
      if (k2 !== undefined) bersih.k2 = Math.round(k2);
      if (k3 !== undefined) bersih.k3 = k3;
      if (k4 !== undefined) bersih.k4 = Math.round(k4);
      if (perART(r)) {
        const art = typeof e.art === "number" && Number.isInteger(e.art) && e.art >= 1 && e.art <= 15 ? e.art : 1;
        bersih.art = art;
        if (typeof e.sumber === "number" && [0, 1, 2, 3].includes(e.sumber)) bersih.sumber = e.sumber;
      }
      if (typeof e.nama === "string" && e.nama.trim()) bersih.nama = e.nama.trim().slice(0, 80);
      if (typeof e.satuan === "string" && e.satuan.trim()) bersih.satuan = e.satuan.trim().slice(0, 30);
      iv1.push(bersih);
    }
  }
  // satu entri per (rincian, ART): yang terakhir menang
  const unik = new Map<string, EntriRoleplay>();
  for (const e of iv1) unik.set(`${e.r}|${e.art ?? 0}`, e);
  const nilai: Record<string, number> = {};
  if (o.nilai && typeof o.nilai === "object" && !Array.isArray(o.nilai)) {
    for (const [id, v] of Object.entries(o.nilai as Record<string, unknown>).slice(0, MAKS_KOTAK * 3)) {
      if (!selDikenal(id)) continue;
      const a = angka(v);
      if (a === undefined) continue;
      if (Object.keys(nilai).length >= MAKS_KOTAK) break;
      nilai[id] = Math.round(a);
    }
  }
  return { iv1: [...unik.values()].sort((a, b) => a.r - b.r || (a.art ?? 0) - (b.art ?? 0)), nilai };
}

/**
 * Gabungkan isian baru dari peserta dengan isian tersimpan: satuan yang TERKUNCI (langkahnya sudah diperiksa/selesai) tetap seperti yang tersimpan,
 * selain itu mengikuti isian baru. Mengembalikan isian akhir dan daftar satuan terkunci yang coba diubah (untuk pemberitahuan).
 */
export function gabungIsianTerkunci(baru: IsianRoleplay, lama: IsianRoleplay | null | undefined, terkunci: ReadonlySet<string>): { isian: IsianRoleplay; ditolak: string[] } {
  const ditolak = new Set<string>();
  const iv1Baru = (baru.iv1 ?? []).filter((e) => !terkunci.has(kunciIv1(e.r)));
  const iv1Lama = (lama?.iv1 ?? []).filter((e) => terkunci.has(kunciIv1(e.r)));
  const kuncianBaru = new Map<string, string>();
  for (const e of baru.iv1 ?? []) if (terkunci.has(kunciIv1(e.r))) kuncianBaru.set(kunciIv1(e.r), JSON.stringify(e));
  const kuncianLama = new Map<string, string>();
  for (const e of lama?.iv1 ?? []) if (terkunci.has(kunciIv1(e.r))) kuncianLama.set(kunciIv1(e.r), JSON.stringify(e));
  for (const k of new Set([...kuncianBaru.keys(), ...kuncianLama.keys()])) if (kuncianBaru.get(k) !== kuncianLama.get(k)) ditolak.add(k);

  const lamaNilai = lama?.nilai ?? {};
  const baruNilai = baru.nilai ?? {};
  const nilai: Record<string, number> = {};
  for (const [id, v] of Object.entries(baruNilai)) {
    const k = kunciSel(id);
    if (terkunci.has(k)) { if (lamaNilai[id] !== v) ditolak.add(k); } else nilai[id] = v;
  }
  for (const [id, v] of Object.entries(lamaNilai)) {
    const k = kunciSel(id);
    if (terkunci.has(k)) { nilai[id] = v; if (!(id in baruNilai)) ditolak.add(k); }
  }
  return { isian: { iv1: [...iv1Lama, ...iv1Baru].sort((a, b) => a.r - b.r || (a.art ?? 0) - (b.art ?? 0)), nilai }, ditolak: [...ditolak].sort() };
}

/** Satuan yang sudah terkunci = gabungan satuan semua langkah yang statusnya bukan "berjalan". */
export function satuanTerkunci(langkah: readonly (CakupanSesi & { status: string })[]): Set<string> {
  const s = new Set<string>();
  for (const l of langkah) if (l.status !== "berjalan") for (const k of satuanCakupan(l)) s.add(k);
  return s;
}

export type PeriksaCakupan = { ok: true; cakupan: CakupanSesi } | { ok: false; pesan: string };

/** Periksa cakupan langkah baru dari instruktur: bagian dikenal; IV.1 butuh rentang R yang memuat minimal satu rincian; blok V-VII tanpa rentang. */
export function periksaCakupan(raw: unknown): PeriksaCakupan {
  const o = (raw && typeof raw === "object" ? raw : {}) as { bagian?: unknown; dari?: unknown; sampai?: unknown };
  const bagian = o.bagian as BagianSesi;
  if (typeof o.bagian !== "string" || !BAGIAN_SAH.includes(bagian)) return { ok: false, pesan: "Bagian kuesioner tidak dikenal." };
  if (bagian !== "iv1") return { ok: true, cakupan: { bagian } };
  const dari = typeof o.dari === "number" && Number.isInteger(o.dari) ? o.dari : NaN;
  const sampai = typeof o.sampai === "number" && Number.isInteger(o.sampai) ? o.sampai : dari;
  if (!(dari >= 1) || !(sampai >= dari)) return { ok: false, pesan: "Isi rentang rincian dengan benar (dari ≤ sampai)." };
  const cakupan: CakupanSesi = { bagian, dari, sampai };
  if (satuanCakupan(cakupan).length === 0) return { ok: false, pesan: "Tidak ada rincian pada rentang itu." };
  return { ok: true, cakupan };
}

/** Cakupan baru tidak boleh beririsan dengan langkah yang sudah ada pada roleplay yang sama (satu satuan dinilai sekali). */
export function bentrokCakupan(baru: CakupanSesi, ada: readonly CakupanSesi[]): string[] {
  const pakai = new Set<string>();
  for (const l of ada) for (const k of satuanCakupan(l)) pakai.add(k);
  return satuanCakupan(baru).filter((k) => pakai.has(k));
}

export const noRDariSatuan = (k: string): number | null => (adalahKunciIv1(k) ? noRDariKunci(k) : null);
