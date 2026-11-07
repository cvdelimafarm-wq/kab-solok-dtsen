// lib/keu/niat.ts
//
// (7 Nov 2026, langkah 2 rancangan "Kebutuhan, neraca RO, revisi") Rencana tindakan (niat) per butir POK dan neraca RO. MURNI (tanpa React dan basis data).
// Niat BUKAN revisi: hanya catatan rencana ketua tim atau admin RO atas butir yang Lebih atau Kurang (lib/keu/kebutuhan.ts), yang kelak mengisi kertas kerja
// revisi. Tabel: keu_niat_butir (skema-sql/20261107c_niat_butir.sql), satu baris per (RO, kunci_stabil butir).
//
//   Butir Lebih  : biarkan (bawaan) | lepas (donor; jumlah <= kelebihan)
//   Butir Kurang : tunda (bawaan; RAB tetap tercatat, belum terdanai) | tambal (dari donor di RO ini) | tambahan (minta tambahan pagu dari luar RO); jumlah <= kekurangan
//
// Neraca RO: Sumber dalam RO = jumlah Lepas. Kebutuhan sumber = jumlah Tambal + Tambahan + item baru di RAB (tidak punya pagu).
// Perubahan pagu RO = kebutuhan sumber - sumber dalam RO. Nol: pagu RO tetap (cocok dengan Revisi POK, pagu tidak berubah). Positif: pagu RO perlu naik
// (dari RO lain atau tambahan pusat). Negatif: dana yang dilepas lebih besar daripada yang dipakai di RO ini.

import { golonganItem, type Golongan } from "./kebutuhan";
import type { SelItem } from "./pokTata";

export type Niat = "biarkan" | "lepas" | "tunda" | "tambal" | "tambahan";
export const NIAT_LEBIH: readonly Niat[] = ["biarkan", "lepas"];
export const NIAT_KURANG: readonly Niat[] = ["tunda", "tambal", "tambahan"];
export const NIAT_BAWAAN: Record<"lebih" | "kurang", Niat> = { lebih: "biarkan", kurang: "tunda" };
export const LABEL_NIAT: Record<Niat, string> = { biarkan: "Biarkan", lepas: "Lepas sebagai donor", tunda: "Tunda", tambal: "Tambal dari donor", tambahan: "Minta tambahan pagu" };
export const PENJELAS_NIAT: Record<Niat, string> = {
  biarkan: "Pagu butir dibiarkan berlebih; tidak masuk revisi.",
  lepas: "Kelebihan dilepas supaya dapat dipakai menambal butir lain.",
  tunda: "Kekurangan belum dipenuhi; RAB tetap dicatat dan butir ditandai belum terdanai.",
  tambal: "Kekurangan ditutup dari kelebihan butir yang dilepas di RO ini.",
  tambahan: "Kekurangan ditutup dari luar RO (RO lain atau tambahan pagu dari pusat).",
};
export const MAKS_CATATAN = 500;

export type BarisNiat = { pok_kunci: string; niat: Niat; jumlah: number | null; catatan: string | null };

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const NIAT_SAH: readonly string[] = ["biarkan", "lepas", "tunda", "tambal", "tambahan"];

/** Larik JSON dari basis data menjadi peta kunci -> niat; baris yang tidak sah dibuang. */
export function normalisasiNiat(x: unknown): Map<string, BarisNiat> {
  const m = new Map<string, BarisNiat>();
  if (!Array.isArray(x)) return m;
  for (const e of x) {
    if (!adalahObjek(e)) continue;
    const kunci = typeof e.pok_kunci === "string" ? e.pok_kunci : "";
    const niat = typeof e.niat === "string" ? e.niat : "";
    if (kunci === "" || !NIAT_SAH.includes(niat)) continue;
    const jumlah = e.jumlah === null || e.jumlah === undefined || e.jumlah === "" ? null : Number(e.jumlah);
    m.set(kunci, { pok_kunci: kunci, niat: niat as Niat, jumlah: jumlah !== null && Number.isFinite(jumlah) && jumlah >= 0 ? jumlah : null, catatan: typeof e.catatan === "string" && e.catatan !== "" ? e.catatan : null });
  }
  return m;
}

export type BarisRencana = {
  detail_id: number; kunci: string; akun: string; uraian: string;
  golongan: "lebih" | "kurang";
  /** besar kelebihan atau kekurangan butir (positif) */
  besar: number;
  niat: Niat;
  /** jumlah yang dimaksud niat (0 untuk biarkan dan tunda) */
  jumlah: number;
  /** true bila belum ada pilihan tersimpan (memakai niat bawaan) */
  bawaan: boolean;
  /** true bila jumlah tersimpan melebihi besar yang sekarang sehingga dipotong */
  disesuaikan: boolean;
  catatan: string | null;
};

/** Niat yang membawa jumlah rupiah (lepas, tambal, tambahan). */
export const butuhJumlah = (n: Niat): boolean => n === "lepas" || n === "tambal" || n === "tambahan";
const pakaiJumlah = butuhJumlah;

/** Jumlah yang sah untuk niat berjumlah: kosong atau tidak valid = seluruh besar; tidak lebih dari besar; tidak negatif. */
export function jumlahSah(niat: Niat, jumlah: number | null | undefined, besar: number): { jumlah: number; disesuaikan: boolean } {
  if (!pakaiJumlah(niat)) return { jumlah: 0, disesuaikan: false };
  if (jumlah === null || jumlah === undefined || !Number.isFinite(jumlah)) return { jumlah: besar, disesuaikan: false };
  const bulat = Math.round(jumlah);
  if (bulat > besar) return { jumlah: besar, disesuaikan: true };
  return { jumlah: Math.max(bulat, 0), disesuaikan: false };
}

/** Pilihan niat yang berlaku untuk golongan butir. */
export const niatUntuk = (g: "lebih" | "kurang"): readonly Niat[] => (g === "lebih" ? NIAT_LEBIH : NIAT_KURANG);

/**
 * Daftar rencana untuk butir yang Lebih atau Kurang (butir Cukup dan Belum dikaji tidak punya niat). Niat tersimpan yang tidak cocok dengan golongan
 * sekarang (mis. "tambal" pada butir yang kini Lebih) diabaikan dan diganti niat bawaan.
 */
export function susunRencana(item: readonly SelItem[], tersimpan: ReadonlyMap<string, BarisNiat>): BarisRencana[] {
  const out: BarisRencana[] = [];
  for (const i of item) {
    const g: Golongan = golonganItem(i);
    if ((g !== "lebih" && g !== "kurang") || i.gap === null) continue;
    const besar = Math.abs(i.gap);
    const t = tersimpan.get(i.kunci);
    const sah = t !== undefined && niatUntuk(g).includes(t.niat);
    const niat = sah && t ? t.niat : NIAT_BAWAAN[g];
    const { jumlah, disesuaikan } = jumlahSah(niat, sah && t ? t.jumlah : null, besar);
    out.push({ detail_id: i.detail_id, kunci: i.kunci, akun: i.akun, uraian: i.uraian, golongan: g, besar, niat, jumlah, bawaan: !sah, disesuaikan, catatan: sah && t ? t.catatan : null });
  }
  return out.sort((a, b) => (a.golongan === b.golongan ? b.besar - a.besar || a.detail_id - b.detail_id : a.golongan === "kurang" ? -1 : 1));
}

export type NeracaRo = {
  lepas: number; tambal: number; tambahan: number; baru: number;
  /** kekurangan butir yang ditunda (belum terdanai) */
  tunda: number;
  /** kebutuhan sumber = tambal + tambahan + baru */
  kebutuhanSumber: number;
  /** perubahan pagu RO = kebutuhan sumber - lepas */
  perubahanPagu: number;
  status: "tetap" | "naik" | "turun";
};

export function hitungNeraca(rencana: readonly BarisRencana[], baru = 0): NeracaRo {
  const n: NeracaRo = { lepas: 0, tambal: 0, tambahan: 0, baru: Math.max(0, Math.round(baru)), tunda: 0, kebutuhanSumber: 0, perubahanPagu: 0, status: "tetap" };
  for (const r of rencana) {
    if (r.niat === "lepas") n.lepas += r.jumlah;
    else if (r.niat === "tambal") n.tambal += r.jumlah;
    else if (r.niat === "tambahan") n.tambahan += r.jumlah;
    else if (r.niat === "tunda") n.tunda += r.besar;
  }
  n.kebutuhanSumber = n.tambal + n.tambahan + n.baru;
  n.perubahanPagu = n.kebutuhanSumber - n.lepas;
  n.status = n.perubahanPagu === 0 ? "tetap" : n.perubahanPagu > 0 ? "naik" : "turun";
  return n;
}

const rp = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;

/** Kalimat neraca rencana: apa arti pilihan sekarang bagi pagu RO. */
export function kalimatRencana(n: NeracaRo): string {
  if (n.lepas === 0 && n.kebutuhanSumber === 0) {
    return n.tunda > 0 ? `Belum ada dana yang dilepas atau ditambal. Kekurangan ${rp(n.tunda)} ditunda (RAB tetap tercatat, belum terdanai).` : "Belum ada rencana pelepasan atau penambalan.";
  }
  const sumber = `Dilepas ${rp(n.lepas)}, dibutuhkan ${rp(n.kebutuhanSumber)}${n.baru > 0 ? ` (termasuk item baru ${rp(n.baru)})` : ""}.`;
  const akhir = n.tunda > 0 ? ` Kekurangan ${rp(n.tunda)} ditunda.` : "";
  if (n.status === "tetap") return `${sumber} Seimbang: pagu RO tetap.${akhir}`;
  if (n.status === "naik") return `${sumber} Pagu RO perlu naik ${rp(n.perubahanPagu)} (dari RO lain atau tambahan pusat), atau kurangi penambalan dan pilih Tunda.${akhir}`;
  return `${sumber} Dana dilepas ${rp(-n.perubahanPagu)} melebihi yang dipakai di RO ini: pagu RO turun bila dilepas ke RO lain, atau kurangi jumlah yang dilepas.${akhir}`;
}

/** Isi yang dikirim ke basis data untuk satu pilihan. */
export function isiSimpan(roKode: string, kunci: string, niat: Niat, jumlah: number | null, catatan: string | null): Record<string, unknown> {
  return { ro_kode: roKode, pok_kunci: kunci, niat, jumlah: pakaiJumlah(niat) ? Math.max(0, Math.round(jumlah ?? 0)) : null, catatan: catatan && catatan.trim() !== "" ? catatan.trim().slice(0, MAKS_CATATAN) : null };
}

/** Teks kotak jumlah: angka dengan pemisah ribuan titik; kosong bila 0. */
export const tampilJumlah = (n: number): string => (Number.isFinite(n) && n > 0 ? Math.round(n).toLocaleString("id-ID") : "");
/** Membaca isian kotak jumlah (hanya angka yang dihitung; titik pemisah diabaikan). Kosong = null. */
export function bacaJumlah(teks: string): number | null {
  const angka = teks.replace(/\D/g, "");
  if (angka === "") return null;
  const n = Number(angka);
  return Number.isSafeInteger(n) ? n : null;
}
