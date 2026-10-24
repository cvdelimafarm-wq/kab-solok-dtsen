// lib/keu/rabInline.ts
//
// (24 Okt 2026) Tahap 4l: logika murni editor rincian RAB di dalam tabel RAB per KRO (papan 1 mockup): draf rincian per item, rencana simpan
// (hapus, ubah, tambah) yang dibandingkan dengan isi basis data, jumlah draf, dan kelompok hierarki RO > Komponen > Akun. Tanpa React/DB.
// Basis data (penjaga tabel keu_rab_baris, keu_rab_hapus_baris) tetap yang memutuskan; berkas ini hanya mencegah kiriman sia-sia.

import { barisKosong, dataBaris, jumlahBaris, periksaBaris, type BarisRabRow, type IsianBaris } from "./rab";
import type { BarisRabKro } from "./rabKro";

export type Draft = { kunci: string; id: number | null; f: IsianBaris };

const teksVolume = (v: number | string): string => String(Number(v)).replace(".", ",");

/** Isian form dari baris rincian yang tersimpan. */
export function isianDariRow(b: BarisRabRow): IsianBaris {
  return {
    ket: b.ket ?? "", volume: teksVolume(b.volume), satuan: b.satuan ?? "", harga: String(Math.round(Number(b.harga_satuan))),
    periode: b.periode, bulan_mulai: Number(b.bulan_mulai), bulan_sampai: Number(b.bulan_sampai), minggu: Number(b.minggu),
  };
}

/** Draf awal editor = rincian tersimpan (urut menurut `urut`). Kunci draf = `b<id>`; baris baru memakai `n<angka>` dari pemanggil. */
export function drafDariRows(baris: BarisRabRow[]): Draft[] {
  return [...baris].sort((a, b) => Number(a.urut) - Number(b.urut) || Number(a.baris_id) - Number(b.baris_id)).map((b) => ({ kunci: `b${b.baris_id}`, id: Number(b.baris_id), f: isianDariRow(b) }));
}

export const drafBaru = (kunci: string, satuan: string, bulan: number, dasar?: IsianBaris): Draft => ({ kunci, id: null, f: dasar ? { ...dasar } : barisKosong(satuan, bulan) });

export const jumlahDraft = (d: Draft[]): number => d.reduce((s, x) => s + (jumlahBaris(x.f) ?? 0), 0);

const sama = (a: IsianBaris, b: IsianBaris): boolean =>
  a.ket.trim() === b.ket.trim() && a.volume.trim().replace(",", ".") === b.volume.trim().replace(",", ".") && a.satuan.trim() === b.satuan.trim() && a.harga.trim() === b.harga.trim() &&
  a.periode === b.periode && a.bulan_mulai === b.bulan_mulai && (a.periode === "sekali" || a.bulan_sampai === b.bulan_sampai) && a.minggu === b.minggu;

export type RencanaSimpan = { hapus: number[]; ubah: { id: number; data: Record<string, unknown> }[]; baru: { data: Record<string, unknown> }[]; galat: string[]; adaUbah: boolean };

/**
 * Selisih antara rincian tersimpan dan draf: baris yang hilang dari draf dihapus, baris yang isiannya berubah diperbarui (menjadi rincian biasa:
 * sama_dengan_item dimatikan, jumlah_tetap dikosongkan), baris tanpa id ditambahkan dengan `urut` setelah yang terbesar. Semua isian diperiksa dulu.
 */
export function rencanaSimpan(asli: BarisRabRow[], draft: Draft[]): RencanaSimpan {
  const peta = new Map(asli.map((b) => [Number(b.baris_id), b]));
  const galat: string[] = [];
  draft.forEach((d, i) => { for (const g of periksaBaris(d.f)) galat.push(`Rincian ${i + 1}: ${g}`); });
  const ada = new Set(draft.filter((d) => d.id !== null).map((d) => d.id as number));
  const hapus = asli.map((b) => Number(b.baris_id)).filter((id) => !ada.has(id));
  const ubah: RencanaSimpan["ubah"] = [];
  for (const d of draft) {
    if (d.id === null) continue;
    const a = peta.get(d.id);
    if (a && !sama(isianDariRow(a), d.f)) ubah.push({ id: d.id, data: { ...dataBaris(d.f), sama_dengan_item: false, jumlah_tetap: null } });
  }
  let urut = asli.reduce((m, b) => Math.max(m, Number(b.urut)), 0);
  const baru = draft.filter((d) => d.id === null).map((d) => ({ data: { ...dataBaris(d.f), urut: ++urut } }));
  return { hapus, ubah, baru, galat, adaUbah: hapus.length + ubah.length + baru.length > 0 };
}

// ---------------------------------------------------------------- hierarki RO > Komponen > Akun
export type KelompokAkun = { akun: string; baris: BarisRabKro[]; pok: number; rab: number };
export type KelompokKomp = { komponen: string; akun: KelompokAkun[]; pok: number; rab: number };
export type KelompokRo = { ro: string; komponen: KelompokKomp[]; pok: number; rab: number };

/** Mengelompokkan baris (sudah disaring) menjadi RO > Komponen > Akun; jumlah RAB hanya dari item ber-RAB yang belum selesai. */
export function kelompokkanRab(baris: BarisRabKro[]): KelompokRo[] {
  const jml = (x: BarisRabKro[]) => ({ pok: x.reduce((s, b) => s + b.pok, 0), rab: x.filter((b) => b.rab !== null && b.status !== "selesai").reduce((s, b) => s + (b.rab ?? 0), 0) });
  const ros = [...new Set(baris.map((b) => b.ro))].sort();
  return ros.map((ro) => {
    const dalamRo = baris.filter((b) => b.ro === ro);
    const komp = [...new Set(dalamRo.map((b) => b.komponen))].sort().map((k) => {
      const dalamK = dalamRo.filter((b) => b.komponen === k);
      const akun = [...new Set(dalamK.map((b) => b.akun))].sort().map((a) => { const dalamA = dalamK.filter((b) => b.akun === a); return { akun: a, baris: dalamA, ...jml(dalamA) }; });
      return { komponen: k, akun, ...jml(dalamK) };
    });
    return { ro, komponen: komp, ...jml(dalamRo) };
  });
}

/** Item POK yang bisa dibuatkan RAB = Item secara massal: belum ber-RAB, punya kunci POK, jumlah POK > 0, pada RO yang dapat diubah. */
export function calonSamaDenganItem(baris: BarisRabKro[], boleh: (ro: string) => boolean): BarisRabKro[] {
  return baris.filter((b) => b.status === "belum" && b.kunci !== null && b.pok > 0 && boleh(b.ro));
}
