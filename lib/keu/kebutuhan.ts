// lib/keu/kebutuhan.ts
//
// (7 Nov 2026, langkah 1 rancangan "Kebutuhan, neraca RO, revisi") Golongan butir dan ringkasan Gap satu RO. MURNI (tanpa React dan basis data).
//
// Kebutuhan butir = Realisasi + Sisa kebutuhan, dengan Sisa kebutuhan = RAB butir (kebutuhan ke depan yang belum dibayar; pokTata.hitungItem); butir Selesai = Realisasi saja.
// (7 Nov 2026, koreksi) Rumus awal max(RAB, Realisasi) keliru: RAB per survei berisi kebutuhan periode yang BELUM dibayar (mis. Seruti TW IV bulan 11-12), jadi
// realisasi periode lain tidak boleh mengurangi RAB. Konsekuensi: RAB yang sudah dibayar dan sudah masuk Realisasi dapat terhitung ganda sampai barisnya ditutup
// oleh catatan PJ Administrasi; rumus penuh "Realisasi + Catatan SIGAP belum tercermin + RAB sisa" menyusul di langkah 3. Item baru di RAB (belum ada di POK)
// tidak punya pagu, jadi seluruh jumlahnya adalah kekurangan yang butuh sumber.
//
// Golongan (berdasarkan Gap butir = Pagu - Kebutuhan):
//   Belum dikaji : butir belum ber-RAB (gap tidak diketahui). Pagunya TIDAK dianggap lebih.
//   Cukup        : |gap| tidak lebih dari batas toleransi (1% pagu butir, minimal Rp 1.000)
//   Lebih        : gap positif di atas toleransi (calon donor)
//   Kurang       : gap negatif di bawah toleransi (perlu ditambal, ditunda, atau diminta tambahan)

import type { Pohon, SelItem } from "./pokTata";

export type Golongan = "cukup" | "lebih" | "kurang" | "belum";
export const URUT_GOLONGAN: readonly Golongan[] = ["kurang", "lebih", "cukup", "belum"];
export const LABEL_GOLONGAN: Record<Golongan, string> = { cukup: "Cukup", lebih: "Lebih", kurang: "Kurang", belum: "Belum dikaji" };
export const WARNA_GOLONGAN: Record<Golongan, "hijau" | "biru" | "merah" | "abu"> = { cukup: "hijau", lebih: "biru", kurang: "merah", belum: "abu" };

export const TOLERANSI_PECAHAN = 0.01;
export const TOLERANSI_MINIMUM = 1000;

/** Batas selisih (rupiah) yang masih dianggap Cukup untuk satu butir berpagu `pok`. */
export const batasCukup = (pok: number): number => Math.max(TOLERANSI_MINIMUM, Math.round(Math.abs(pok) * TOLERANSI_PECAHAN));

export function golongan(gap: number | null, pok: number): Golongan {
  if (gap === null) return "belum";
  const batas = batasCukup(pok);
  if (gap > batas) return "lebih";
  if (gap < -batas) return "kurang";
  return "cukup";
}

/** Kebutuhan butir = realisasi + sisa kebutuhan; kosong bila sisa kebutuhan tidak diketahui (belum ber-RAB). */
export const kebutuhan = (realisasi: number, sisa: number | null): number | null => (sisa === null ? null : realisasi + sisa);

export const golonganItem = (i: Pick<SelItem, "gap" | "pok">): Golongan => golongan(i.gap, i.pok);

export function semuaItem(p: Pohon): SelItem[] {
  return p.komponen.flatMap((k) => k.sub.flatMap((s) => s.akun.flatMap((a) => a.item)));
}

export type ButirGap = { detail_id: number; akun: string; uraian: string; gap: number };
/** Item RAB yang belum ada di POK (bahan revisi). */
export type ItemBaruRab = { akun_kode?: string; uraian?: string; jumlah_rab: number | string };
export type RingkasGapRo = {
  nItem: number; nDikaji: number; nCukup: number; nLebih: number; nKurang: number; nBelum: number;
  /** jumlah gap butir Lebih (positif) dan jumlah kekurangan butir Kurang (positif) */
  lebih: number; kurang: number;
  /** sisa pagu (Pagu - Realisasi) butir yang belum dikaji; tidak ikut dihitung sebagai lebih */
  belumSisaPagu: number;
  /** jumlah gap semua butir yang sudah dikaji (termasuk Cukup) dikurangi item baru di RAB; null bila belum ada butir dikaji maupun item baru */
  bersih: number | null;
  paguDikaji: number; kebutuhanDikaji: number;
  /** butir Lebih dan Kurang terbesar (paling banyak `n`), urut menurun menurut besar selisih */
  teratasLebih: ButirGap[]; teratasKurang: ButirGap[];
  /** item baru di RAB (di luar POK): banyaknya, jumlahnya (seluruhnya kekurangan), dan yang terbesar */
  nBaru: number; baru: number; teratasBaru: ButirGap[];
};

export function ringkasGapRo(item: readonly SelItem[], n = 3, baru: readonly ItemBaruRab[] = []): RingkasGapRo {
  const r: RingkasGapRo = {
    nItem: item.length, nDikaji: 0, nCukup: 0, nLebih: 0, nKurang: 0, nBelum: 0, lebih: 0, kurang: 0, belumSisaPagu: 0, bersih: null, paguDikaji: 0, kebutuhanDikaji: 0,
    teratasLebih: [], teratasKurang: [], nBaru: 0, baru: 0, teratasBaru: [],
  };
  const lebih: ButirGap[] = []; const kurang: ButirGap[] = [];
  let bersih = 0;
  for (const i of item) {
    const g = golonganItem(i);
    if (g === "belum" || i.gap === null) { r.nBelum += 1; r.belumSisaPagu += i.sisaPagu; continue; }
    r.nDikaji += 1; bersih += i.gap; r.paguDikaji += i.pok; r.kebutuhanDikaji += i.pok - i.gap;
    const butir: ButirGap = { detail_id: i.detail_id, akun: i.akun, uraian: i.uraian, gap: i.gap };
    if (g === "lebih") { r.nLebih += 1; r.lebih += i.gap; lebih.push(butir); }
    else if (g === "kurang") { r.nKurang += 1; r.kurang += -i.gap; kurang.push(butir); }
    else r.nCukup += 1;
  }
  r.bersih = r.nDikaji === 0 ? null : bersih;
  r.teratasLebih = lebih.sort((a, b) => b.gap - a.gap || a.detail_id - b.detail_id).slice(0, n);
  r.teratasKurang = kurang.sort((a, b) => a.gap - b.gap || a.detail_id - b.detail_id).slice(0, n);
  const baruBerjumlah = baru.map((b, idx) => ({ detail_id: -(idx + 1), akun: b.akun_kode ?? "", uraian: b.uraian ?? "", gap: -Number(b.jumlah_rab) })).filter((b) => Number.isFinite(b.gap) && b.gap < 0);
  r.nBaru = baruBerjumlah.length; r.baru = baruBerjumlah.reduce((s, b) => s - b.gap, 0);
  r.teratasBaru = [...baruBerjumlah].sort((a, b) => a.gap - b.gap || b.detail_id - a.detail_id).slice(0, n);
  // item baru tidak punya pagu: seluruh jumlahnya menambah kebutuhan dan mengurangi gap bersih
  if (r.nBaru > 0) { r.bersih = (r.bersih ?? 0) - r.baru; r.kebutuhanDikaji += r.baru; }
  return r;
}

/** Kalimat neraca: apakah kelebihan cukup menutup kekurangan di dalam RO ini (butir yang sudah dikaji, ditambah item baru di RAB yang tidak punya pagu). */
export function kalimatNeraca(r: Pick<RingkasGapRo, "lebih" | "kurang" | "nDikaji" | "nBelum"> & { baru?: number }): string {
  const rp = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;
  const kurang = r.kurang + (r.baru ?? 0);
  if (r.nDikaji === 0 && !(r.baru && r.baru > 0)) return "Belum ada butir yang ber-RAB, jadi belum ada kelebihan atau kekurangan yang dapat dihitung.";
  r = { ...r, kurang };
  const sisa = r.lebih - r.kurang;
  const akhir = r.nBelum > 0 ? ` ${r.nBelum} butir belum dikaji tidak ikut dihitung.` : "";
  if (r.kurang === 0 && r.lebih === 0) return `Semua butir yang sudah ber-RAB cukup.${akhir}`;
  if (r.kurang === 0) return `Tidak ada kekurangan. Kelebihan ${rp(r.lebih)} dapat dibiarkan atau dilepas sebagai donor revisi.${akhir}`;
  if (sisa >= 0) return `Kelebihan ${rp(r.lebih)} cukup menutup seluruh kekurangan ${rp(r.kurang)}${sisa > 0 ? `; masih tersisa ${rp(sisa)}` : " dan pas"}.${akhir}`;
  return `Kekurangan ${rp(r.kurang)} melebihi kelebihan ${rp(r.lebih)} sebesar ${rp(-sisa)}; selisih ini perlu sumber dari luar RO (RO lain atau tambahan pagu) atau pemenuhannya ditunda.${akhir}`;
}
