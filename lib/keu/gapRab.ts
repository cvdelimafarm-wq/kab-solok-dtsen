// lib/keu/gapRab.ts
//
// (28 Okt 2026) Sambungan RAB per survei ke Gap (logika murni). Rencana biaya pada Gap: bila RAB per survei berstatus SIAP, dipakai baris RAB bertanda
// identifikasi (angka yang benar-benar disusun); akun yang belum punya satu pun baris RAB tetap dihitung dari identifikasi supaya kebutuhan tidak terlalu rendah.
// Bila masih Draf atau belum ada, Gap tetap memakai kebutuhan dari identifikasi dan hanya memberi tahu. Temuan tidak pernah memblokir.

import type { BarisRincian } from "./lanjutan";
import type { BarisRabRow } from "./rab";
import { statusDari, type BarisStatusSurvei, type StatusSurvei } from "./rabStatus";
import { rupiah } from "./ro";

export type BarisRabGap = { akun: string; ket: string; volume: number; satuan: string; harga: number; jumlah: number };
/** `berubah` = jumlah baris RAB yang saran identifikasinya kini berbeda dari saat disalin (selisihSaran). `status` null = belum pernah ditetapkan (= draf). */
export type RabSurveiGap = { status: StatusSurvei | null; baris: BarisRabGap[]; berubah: number };
export type TemuanRab = { kunci: string; tingkat: "info" | "sedang"; pesan: string };

const akun6 = (a: string): string => a.slice(0, 6);
const jumlahIdent = (r: BarisRincian[]): number => r.reduce((s, b) => s + (b.jumlah ?? 0), 0);

export function rincianUntukGap(rincian: BarisRincian[], rab: RabSurveiGap | null | undefined): { rincian: BarisRincian[]; sumber: "rab" | "identifikasi"; dariIdentifikasi: number } {
  if (!rab || rab.status !== "siap" || rab.baris.length === 0) return { rincian, sumber: "identifikasi", dariIdentifikasi: rincian.length };
  const dariRab: BarisRincian[] = rab.baris.map((b) => ({
    kelompok: "Lain-lain", uraian: b.ket, akun: akun6(b.akun), volume: b.volume, satuan: b.satuan, tarif: b.harga, jumlah: b.jumlah, catatan: "", perk: false,
  }));
  const akunRab = new Set(dariRab.map((b) => b.akun));
  const sisa = rincian.filter((b) => !akunRab.has(akun6(b.akun)));
  return { rincian: [...dariRab, ...sisa.map((b) => ({ ...b, akun: akun6(b.akun) }))], sumber: "rab", dariIdentifikasi: sisa.length };
}

export function temuanRabSurvei(rab: RabSurveiGap | null | undefined, rincian: BarisRincian[]): TemuanRab[] {
  if (!rab) return [];
  const t: TemuanRab[] = [];
  const ident = jumlahIdent(rincian);
  if (rab.baris.length === 0) {
    if (ident > 0) t.push({ kunci: "biaya:rab_belum", tingkat: "info", pesan: "RAB per survei belum disalin dari identifikasi ini; biaya pada Gap memakai kebutuhan dari identifikasi." });
    return t;
  }
  if (rab.berubah > 0) t.push({ kunci: "biaya:rab_berubah", tingkat: "sedang", pesan: `${rab.berubah} rincian RAB berbeda dari saran identifikasi terbaru (identifikasi diubah sesudah disalin). Perbarui RAB per survei agar Gap dan RAB sejalan.` });
  if (rab.status !== "siap") {
    t.push({ kunci: "biaya:rab_draf", tingkat: "info", pesan: `RAB per survei masih Draf (${rab.baris.length} rincian); biaya pada Gap masih memakai kebutuhan dari identifikasi sampai RAB per survei ditandai Siap.` });
    return t;
  }
  const g = rincianUntukGap(rincian, rab);
  const total = jumlahIdent(g.rincian);
  const selisih = total - ident;
  if (Math.abs(selisih) > 0.5) {
    t.push({ kunci: "biaya:rab_selisih", tingkat: "info", pesan: `Biaya pada Gap memakai RAB per survei (${rupiah(total)}); identifikasi menghitung ${rupiah(ident)} (${selisih > 0 ? "lebih" : "kurang"} ${rupiah(Math.abs(selisih))}).` });
  }
  if (g.dariIdentifikasi > 0) t.push({ kunci: "biaya:rab_sebagian", tingkat: "info", pesan: `${g.dariIdentifikasi} rincian pada akun yang belum punya baris RAB per survei dihitung dari identifikasi.` });
  return t;
}

/**
 * Bahan Gap dari baris yang dibaca: baris RAB bertanda identifikasi ini (akun diambil dari item RAB-nya), status dari keu_rab_survei. `berubah` = baris yang disalin
 * dari versi identifikasi lebih lama daripada versi sekarang (perubahan lanjutan yang tidak menaikkan versi hanya terdeteksi di tab RAB per survei).
 * Mengembalikan null bila RAB-nya tidak ada.
 */
export function susunRabSurveiGap(
  rabAda: boolean, baris: Pick<BarisRabRow, "item_id" | "ket" | "volume" | "satuan" | "harga_satuan" | "jumlah" | "ident_id" | "ident_ver">[],
  itemAkun: { id: number; akun_kode: string }[], status: Pick<BarisStatusSurvei, "ident_id" | "status">[] | null | undefined, identId: number, identVer: number,
): RabSurveiGap | null {
  if (!rabAda) return null;
  const akun = new Map(itemAkun.map((i) => [i.id, i.akun_kode]));
  const milik = baris.filter((b) => b.ident_id === identId);
  const rab: BarisRabGap[] = milik.map((b) => ({
    akun: akun.get(b.item_id) ?? "", ket: b.ket, volume: Number(b.volume), satuan: b.satuan, harga: Number(b.harga_satuan), jumlah: Number(b.jumlah),
  }));
  const berubah = milik.filter((b) => typeof b.ident_ver === "number" && b.ident_ver < identVer).length;
  return { status: status && status.some((x) => x.ident_id === identId) ? statusDari(status, identId) : null, baris: rab.filter((b) => b.akun !== ""), berubah };
}
