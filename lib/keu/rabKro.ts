// lib/keu/rabKro.ts
//
// (24 Okt 2026) Logika murni sub-tab "RAB" dan "RAB bulanan" pada halaman Kertas Kerja per KRO (papan 1 mockup): menyandingkan POK Menjadi
// dengan RAB per item (status, selisih, dana bebas dari item selesai) dan menyusun perkiraan pencairan per bulan dengan tag minggu.
// Tanpa React/DB. Data: keu_v_kk_baris (BarisMx), keu_v_rab_item, keu_v_rab_jadwal_item.

import { n } from "./kk";
import type { BarisMx } from "./matriks";

export type ItemRabKro = { item_id: number; rab_id: number; pok_kunci: string | null; baru?: boolean; status: string; jumlah_rab: number | string; selesai: boolean; prioritas_kode?: string | null };
export const STATUS_RAB_ITEM = ["sama", "rinci", "belum", "selesai"] as const;
export type StatusRabItem = (typeof STATUS_RAB_ITEM)[number];
export const LABEL_STATUS_ITEM: Record<StatusRabItem, string> = { sama: "RAB = Item", rinci: "Rinci", belum: "Belum ada RAB", selesai: "Selesai" };

export type BarisRabKro = {
  id: number; ro: string; kode: string; uraian: string; akun: string; komponen: string; pok: number; rab: number | null; selisih: number | null;
  booked: number; real: number; sisa: number; status: StatusRabItem; itemId: number | null; prioritas: string | null;
};
export type RingkasRabKro = { total: number; sama: number; rinci: number; belum: number; selesai: number; pokBerRab: number; rab: number; selisih: number; danaBebas: number };

const statusDari = (it: ItemRabKro | null): StatusRabItem => {
  if (!it) return "belum";
  if (it.selesai) return "selesai";
  return (STATUS_RAB_ITEM as readonly string[]).includes(it.status) ? (it.status as StatusRabItem) : "belum";
};

/** Hanya item POK sebenarnya (bukan Dana penggenap); dipasangkan dengan item RAB lewat rab_item_id, atau kunci stabil bila belum tertaut. */
export function sandingkanRab(baris: BarisMx[], item: ItemRabKro[]): { baris: BarisRabKro[]; ringkas: RingkasRabKro } {
  const perId = new Map(item.map((i) => [Number(i.item_id), i]));
  const perKunci = new Map(item.filter((i) => i.pok_kunci).map((i) => [i.pok_kunci as string, i]));
  const hasil: BarisRabKro[] = [];
  for (const b of baris) {
    if (b.penggenap) continue;
    const it = (b.rab_item_id !== null ? perId.get(b.rab_item_id) : undefined) ?? (b.pok_kunci ? perKunci.get(b.pok_kunci) : undefined) ?? null;
    const status = statusDari(it);
    const pok = n(b.jumlah_menjadi), rab = it && status !== "belum" ? n(it.jumlah_rab) : null;
    hasil.push({
      id: b.id, ro: b.ro_kode, kode: b.nomor ?? "", uraian: b.uraian_menjadi ?? b.uraian_semula ?? "", akun: b.akun_menjadi, komponen: b.komponen_kode, pok, rab,
      selisih: rab === null ? null : rab - pok, booked: b.booked, real: b.real, sisa: pok - b.booked - b.real, status, itemId: it ? Number(it.item_id) : null,
      prioritas: it?.prioritas_kode ?? b.prioritas_kode ?? null,
    });
  }
  const ada = hasil.filter((x) => x.rab !== null && x.status !== "selesai");
  const ringkas: RingkasRabKro = {
    total: hasil.length, sama: hasil.filter((x) => x.status === "sama").length, rinci: hasil.filter((x) => x.status === "rinci").length,
    belum: hasil.filter((x) => x.status === "belum").length, selesai: hasil.filter((x) => x.status === "selesai").length,
    pokBerRab: ada.reduce((s, x) => s + x.pok, 0), rab: ada.reduce((s, x) => s + (x.rab ?? 0), 0), selisih: 0,
    danaBebas: hasil.filter((x) => x.status === "selesai").reduce((s, x) => s + Math.max(0, x.sisa), 0),
  };
  ringkas.selisih = ringkas.rab - ringkas.pokBerRab;
  return { baris: hasil, ringkas };
}

// ---------------------------------------------------------------- RAB bulanan
export type JadwalItem = { rab_id: number; ro_kode: string; item_id: number; pok_kunci: string | null; akun_menjadi: string; uraian: string; baris_id: number; ket: string | null; bulan: number; minggu: number; nilai: number | string };
export const NAMA_BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;
export const NAMA_BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"] as const;
export const RENTANG_MINGGU: Record<number, string> = { 1: "tgl 1-7", 2: "tgl 8-14", 3: "tgl 15-21", 4: "tgl 22 sampai akhir bulan" };

export type ItemBulanan = { itemId: number; ro: string; akun: string; uraian: string; nilai: number[]; minggu: (number | null)[]; total: number };
export type RingkasBulanan = {
  item: ItemBulanan[]; perBulan: number[]; perMinggu: number[][]; total: number;
  rincian: Map<number, { itemId: number; ro: string; akun: string; uraian: string; ket: string; minggu: number; nilai: number }[]>;
};

/** Gabungan jadwal semua rincian: nilai per item per bulan (tag minggu = minggu dengan nilai terbesar pada bulan itu), total per bulan dan per minggu. */
export function susunBulanan(jadwal: JadwalItem[]): RingkasBulanan {
  const per = new Map<number, ItemBulanan>();
  const bobot = new Map<string, Map<number, number>>();
  const perBulan = Array<number>(12).fill(0);
  const perMinggu = Array.from({ length: 12 }, () => Array<number>(4).fill(0));
  const rincian: RingkasBulanan["rincian"] = new Map();
  for (const j of jadwal) {
    const b = Number(j.bulan) - 1, m = Number(j.minggu), v = n(j.nilai);
    if (b < 0 || b > 11 || m < 1 || m > 4 || v <= 0) continue;
    const id = Number(j.item_id);
    const it = per.get(id) ?? { itemId: id, ro: j.ro_kode, akun: j.akun_menjadi, uraian: j.uraian, nilai: Array<number>(12).fill(0), minggu: Array<number | null>(12).fill(null), total: 0 };
    it.nilai[b] += v; it.total += v; per.set(id, it);
    const k = `${id}-${b}`; const w = bobot.get(k) ?? new Map<number, number>(); w.set(m, (w.get(m) ?? 0) + v); bobot.set(k, w);
    perBulan[b] += v; perMinggu[b][m - 1] += v;
    const r = rincian.get(b) ?? []; r.push({ itemId: id, ro: j.ro_kode, akun: j.akun_menjadi, uraian: j.uraian, ket: j.ket ?? "", minggu: m, nilai: v }); rincian.set(b, r);
  }
  for (const [k, w] of bobot) {
    const [id, b] = k.split("-").map(Number);
    const terbesar = [...w.entries()].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0][0];
    per.get(id)!.minggu[b] = terbesar;
  }
  const item = [...per.values()].sort((a, b) => a.ro.localeCompare(b.ro) || a.akun.localeCompare(b.akun) || a.uraian.localeCompare(b.uraian) || a.itemId - b.itemId);
  return { item, perBulan, perMinggu, total: perBulan.reduce((s, x) => s + x, 0), rincian };
}

/** Rentang bulan yang berisi nilai, mis. "Mar-Mei"; kosong bila tidak ada. */
export function rentangBulan(nilai: number[]): string {
  const ada = nilai.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  if (ada.length === 0) return "";
  return ada[0] === ada[ada.length - 1] ? NAMA_BULAN_PENDEK[ada[0]] : `${NAMA_BULAN_PENDEK[ada[0]]}-${NAMA_BULAN_PENDEK[ada[ada.length - 1]]}`;
}

/** Perubahan POK (hanya baris yang berubah) untuk matriks semula-menjadi dan ekspor. */
export function barisBerubah(baris: BarisMx[]): BarisMx[] {
  return baris.filter((b) => n(b.selisih) !== 0 || b.baru || b.penggenap || b.pindah_dari !== null || b.pindah_ke !== null || b.pemicu !== null || n(b.jumlah_semula) !== n(b.jumlah_menjadi));
}

/** CSV (titik koma, kutip ganda) -- dibuka Excel di lokal Indonesia. */
export function keCsv(kepala: string[], isi: (string | number)[][]): string {
  const sel = (v: string | number) => { const s = String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [kepala, ...isi].map((r) => r.map(sel).join(";")).join("\r\n");
}
