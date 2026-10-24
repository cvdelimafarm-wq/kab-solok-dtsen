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
  /** Kunci stabil item POK (null untuk baris buatan), satuan dan volume Menjadi: bahan membuat RAB = Item dan item RAB baru. */
  kunci: string | null; satuan: string; volume: number;
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
      prioritas: it?.prioritas_kode ?? b.prioritas_kode ?? null, kunci: b.pok_kunci, satuan: b.sat_menjadi ?? b.sat_semula ?? "", volume: n(b.vol_menjadi),
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

export type ItemBulanan = {
  itemId: number; ro: string; akun: string; uraian: string; nilai: number[]; minggu: (number | null)[];
  /** Semua minggu yang bernilai pada tiap bulan, urut naik (tag minggu penuh, mis. [1, 3]). */
  tag: number[][];
  /** Jumlah baris rincian yang berjadwal pada item ini. */
  nBaris: number; total: number;
  /** Kunci stabil item POK (untuk kode item). */
  pokKunci: string | null;
};
export type RingkasBulanan = {
  item: ItemBulanan[]; perBulan: number[]; perMinggu: number[][]; total: number;
  rincian: Map<number, { itemId: number; ro: string; akun: string; uraian: string; ket: string; minggu: number; nilai: number }[]>;
};

/** Gabungan jadwal semua rincian: nilai per item per bulan (tag minggu = minggu dengan nilai terbesar pada bulan itu), total per bulan dan per minggu. */
export function susunBulanan(jadwal: JadwalItem[]): RingkasBulanan {
  const per = new Map<number, ItemBulanan>();
  const bobot = new Map<string, Map<number, number>>();
  const barisItem = new Map<number, Set<number>>();
  const perBulan = Array<number>(12).fill(0);
  const perMinggu = Array.from({ length: 12 }, () => Array<number>(4).fill(0));
  const rincian: RingkasBulanan["rincian"] = new Map();
  for (const j of jadwal) {
    const b = Number(j.bulan) - 1, m = Number(j.minggu), v = n(j.nilai);
    if (b < 0 || b > 11 || m < 1 || m > 4 || v <= 0) continue;
    const id = Number(j.item_id);
    const it = per.get(id) ?? { itemId: id, ro: j.ro_kode, akun: j.akun_menjadi, uraian: j.uraian, nilai: Array<number>(12).fill(0), minggu: Array<number | null>(12).fill(null), tag: Array.from({ length: 12 }, () => [] as number[]), nBaris: 0, total: 0, pokKunci: j.pok_kunci ?? null };
    const bs = barisItem.get(id) ?? new Set<number>(); bs.add(Number(j.baris_id)); barisItem.set(id, bs);
    it.nilai[b] += v; it.total += v; per.set(id, it);
    const k = `${id}-${b}`; const w = bobot.get(k) ?? new Map<number, number>(); w.set(m, (w.get(m) ?? 0) + v); bobot.set(k, w);
    perBulan[b] += v; perMinggu[b][m - 1] += v;
    const r = rincian.get(b) ?? []; r.push({ itemId: id, ro: j.ro_kode, akun: j.akun_menjadi, uraian: j.uraian, ket: j.ket ?? "", minggu: m, nilai: v }); rincian.set(b, r);
  }
  for (const [k, w] of bobot) {
    const [id, b] = k.split("-").map(Number);
    const terbesar = [...w.entries()].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0][0];
    const it = per.get(id)!;
    it.minggu[b] = terbesar;
    it.tag[b] = [...w.keys()].sort((a, c) => a - c);
  }
  for (const [id, bs] of barisItem) per.get(id)!.nBaris = bs.size;
  const item = [...per.values()].sort((a, b) => a.ro.localeCompare(b.ro) || a.akun.localeCompare(b.akun) || a.uraian.localeCompare(b.uraian) || a.itemId - b.itemId);
  return { item, perBulan, perMinggu, total: perBulan.reduce((s, x) => s + x, 0), rincian };
}

// ---------------------------------------------------------------- tampilan RAB bulanan dan perkiraan pencairan (papan 1 mockup)
export type FormatBulanan = "samping" | "lipat";
export const PILIHAN_FORMAT: { kode: FormatBulanan; nama: string }[] = [{ kode: "samping", nama: "Ke samping (kolom bulan)" }, { kode: "lipat", nama: "Lipat per bulan" }];

/** Teks tag minggu, mis. [1, 3] menjadi "M1, M3". */
export const teksTag = (minggu: number[]): string => minggu.map((m) => `M${m}`).join(", ");

/** Latar sel bernilai: biru makin pekat menurut nilai terhadap nilai terbesar; kosong = transparan. */
export function bayangBiru(v: number, maks: number): string {
  if (!(v > 0)) return "transparent";
  return `rgba(29,95,180,${(0.08 + (0.3 * v) / (maks > 0 ? maks : 1)).toFixed(2)})`;
}

export type KelompokBulananRo = { ro: string; item: ItemBulanan[]; perBulan: number[]; total: number };

/** Item dikelompokkan per RO (urut kode RO), dengan jumlah per bulan tiap RO. `ro` kosong = semua RO. */
export function kelompokBulanan(item: ItemBulanan[], ro: string | null = null): { kelompok: KelompokBulananRo[]; perBulan: number[]; total: number; maks: number } {
  const peta = new Map<string, KelompokBulananRo>();
  const perBulan = Array<number>(12).fill(0);
  let maks = 0;
  for (const it of item) {
    if (ro && it.ro !== ro) continue;
    const k = peta.get(it.ro) ?? { ro: it.ro, item: [], perBulan: Array<number>(12).fill(0), total: 0 };
    k.item.push(it);
    it.nilai.forEach((v, i) => { k.perBulan[i] += v; perBulan[i] += v; if (v > maks) maks = v; });
    k.total += it.total;
    peta.set(it.ro, k);
  }
  const kelompok = [...peta.values()].sort((a, b) => a.ro.localeCompare(b.ro));
  return { kelompok, perBulan, total: perBulan.reduce((s, x) => s + x, 0), maks };
}

export type RincianBulan = { itemId: number; ro: string; akun: string; uraian: string; ket: string; minggu: number; nilai: number };
export type Pencairan = { bulan: { no: number; total: number; minggu: number[]; rincian: RincianBulan[] }[]; total: number; maks: number };

/** Perkiraan kebutuhan pencairan: per bulan, per minggu M1..M4, dan baris rincian. `ro` kosong = semua RO. */
export function susunPencairan(jadwal: JadwalItem[], ro: string | null = null): Pencairan {
  const r = susunBulanan(ro ? jadwal.filter((j) => j.ro_kode === ro) : jadwal);
  let maks = 0;
  const bulan = r.perBulan.map((total, i) => {
    const minggu = r.perMinggu[i];
    for (const v of minggu) if (v > maks) maks = v;
    const rincian = (r.rincian.get(i) ?? []).slice().sort((a, b) => a.minggu - b.minggu);
    return { no: i + 1, total, minggu, rincian };
  });
  return { bulan, total: r.total, maks };
}

/** Keterangan baris bulan pada format lipat, mis. "3 baris rincian · M1, M3" atau "tidak ada pencairan". */
export function ketBulan(b: { total: number; minggu: number[]; rincian: unknown[] }): string {
  if (!(b.total > 0)) return "tidak ada pencairan";
  return `${b.rincian.length} baris rincian · ${b.minggu.map((v, i) => (v > 0 ? `M${i + 1}` : "")).filter(Boolean).join(", ")}`;
}

/** Berapa baris rincian yang jumlah jadwal bulanannya tidak sama dengan jumlah rincian (ditandai "≠"). `jumlahRincian`: baris_id menjadi jumlah. */
export function barisJadwalBeda(jadwal: JadwalItem[], jumlahRincian: Map<number, number>): number[] {
  const jumlah = new Map<number, number>();
  for (const j of jadwal) jumlah.set(Number(j.baris_id), (jumlah.get(Number(j.baris_id)) ?? 0) + n(j.nilai));
  const hasil: number[] = [];
  for (const [id, v] of jumlah) {
    const asli = jumlahRincian.get(id);
    if (asli !== undefined && Math.abs(asli - v) > 0.5) hasil.push(id);
  }
  return hasil.sort((a, b) => a - b);
}

export const teksBeda = (jumlah: number): string =>
  `${jumlah} baris rincian jumlah jadwal per bulannya tidak sama dengan jumlah rincian. Perkiraan di bawah memakai jadwal per bulan apa adanya; Ratakan ulang untuk kembali ke periode.`;

/** Catatan kaki perkiraan; `belumRab` = jumlah POK item yang belum punya RAB (tidak masuk perkiraan). */
export const teksCatatanPencairan = (belumRab: number, fmt: (v: number) => string): string =>
  `Item yang belum punya RAB (POK Rp ${fmt(belumRab)}) dan item selesai tidak masuk perkiraan ini. Periode Bulanan: tiap bulan dari bulan mulai sampai bulan akhir, pada tag minggu yang sama (mis. M3 tiap bulan); Triwulanan: tiap tiga bulan. Setiap bulan boleh diubah sendiri (nilai dan tag). Tag minggu adalah perkiraan kas, bukan tanggal pasti.`;

/** Usulan tag minggu bawaan per jenis belanja. Ilustrasi (kebiasaan kas umum), bukan aturan; tag sebenarnya diatur per rincian. */
export const USULAN_TAG: { nama: string; akun: string; tag: number; alasan: string }[] = [
  { nama: "Belanja bahan", akun: "521211", tag: 2, alasan: "Dibeli setelah kebutuhan kegiatan pasti, sebelum pelaksanaan." },
  { nama: "Honor output kegiatan", akun: "521213", tag: 4, alasan: "Dibayar setelah keluaran kegiatan diterima, biasanya akhir bulan." },
  { nama: "Barang persediaan konsumsi", akun: "521811", tag: 1, alasan: "Kebutuhan rutin awal bulan." },
  { nama: "Jasa profesi", akun: "522151", tag: 4, alasan: "Dibayar setelah jasa selesai dan berita acara terbit." },
  { nama: "Perjalanan dinas biasa", akun: "524111", tag: 3, alasan: "Berangkat pertengahan bulan; pencairan uang muka sebelum berangkat." },
  { nama: "Paket meeting dalam kota", akun: "524114", tag: 3, alasan: "Pelaksanaan pertengahan bulan; tagihan dibayar sesudahnya." },
  { nama: "Paket meeting luar kota", akun: "524119", tag: 3, alasan: "Pelaksanaan pertengahan bulan; tagihan dibayar sesudahnya." },
  { nama: "Belanja modal peralatan dan mesin", akun: "532111", tag: 2, alasan: "Pengadaan perlu waktu; dipesan awal, dibayar saat barang diterima." },
];

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
