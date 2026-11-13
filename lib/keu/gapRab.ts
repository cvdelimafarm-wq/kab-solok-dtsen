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

/**
 * (13 Nov 2026, Fase 0 butir 2) Uraian biaya Gap yang SAMA dipakai halaman Gap dan tab RAB per survei, supaya kedua layar menulis angka dari satu
 * sumber. Contoh Seruti TW IV: RAB per survei Rp45.315.000 + Rp888.000 dari identifikasi (honor instruktur akun 522151 belum punya baris RAB)
 * = Rp46.203.000 pada Gap. Bila RAB belum Siap: seluruh biaya dari identifikasi (rab = 0).
 */
export type UraiGapRab = { sumber: "rab" | "identifikasi"; rab: number; tambahan: number; akunTambahan: { akun: string; jumlah: number; uraian: string[] }[]; total: number };
export function uraiGapRab(rincian: BarisRincian[], rab: RabSurveiGap | null | undefined): UraiGapRab {
  const g = rincianUntukGap(rincian, rab);
  if (g.sumber === "identifikasi") {
    const total = jumlahIdent(rincian);
    return { sumber: "identifikasi", rab: 0, tambahan: total, akunTambahan: [], total };
  }
  const jumlahRab = (rab?.baris ?? []).reduce((t, b) => t + b.jumlah, 0);
  const akunRab = new Set((rab?.baris ?? []).map((b) => akun6(b.akun)));
  const per = new Map<string, { jumlah: number; uraian: string[] }>();
  for (const b of rincian) {
    const a = akun6(b.akun);
    if (akunRab.has(a)) continue;
    const x = per.get(a) ?? { jumlah: 0, uraian: [] };
    x.jumlah += b.jumlah ?? 0;
    x.uraian.push(b.uraian);
    per.set(a, x);
  }
  // akun yang rinciannya belum berangka (mis. konsumsi rapat tanpa jumlah peserta) tidak disebut: tidak menambah biaya Gap
  const akunTambahan = [...per.entries()].map(([akun, x]) => ({ akun, ...x })).filter((x) => x.jumlah !== 0).sort((p, q) => p.akun.localeCompare(q.akun));
  const tambahan = akunTambahan.reduce((t, x) => t + x.jumlah, 0);
  return { sumber: "rab", rab: jumlahRab, tambahan, akunTambahan, total: jumlahRab + tambahan };
}

/** Kalimat uraian untuk kedua layar. */
export function kalimatUraiGap(u: UraiGapRab): string {
  if (u.sumber === "identifikasi") return `Biaya pada Gap ${rupiah(u.total)}, seluruhnya dihitung dari identifikasi (RAB per survei belum ditandai Siap).`;
  if (u.tambahan === 0 || u.akunTambahan.length === 0) return `Biaya pada Gap = RAB per survei ${rupiah(u.rab)}.`;
  const akun = u.akunTambahan.map((a) => `akun ${a.akun} ${rupiah(a.jumlah)}`).join(", ");
  return `Biaya pada Gap ${rupiah(u.total)} = RAB per survei ${rupiah(u.rab)} + ${rupiah(u.tambahan)} dari identifikasi untuk akun yang belum punya baris RAB (${akun}).`;
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
  const u = uraiGapRab(rincian, rab);
  const selisih = u.total - ident;
  // (13 Nov 2026, Fase 0) dulu total (RAB + tambahan identifikasi) disebut "RAB per survei", sehingga berbeda dengan tab RAB; kini diuraikan.
  if (Math.abs(selisih) > 0.5) {
    t.push({ kunci: "biaya:rab_selisih", tingkat: "info", pesan: `${kalimatUraiGap(u)} Identifikasi menghitung ${rupiah(ident)} (${selisih > 0 ? "lebih" : "kurang"} ${rupiah(Math.abs(selisih))}).` });
  }
  if (g.dariIdentifikasi > 0) t.push({ kunci: "biaya:rab_sebagian", tingkat: "info", pesan: `${g.dariIdentifikasi} rincian pada akun yang belum punya baris RAB per survei dihitung dari identifikasi: ${u.akunTambahan.map((a) => `akun ${a.akun} ${rupiah(a.jumlah)}`).join(", ") || "-"}. Tambahkan barisnya di tab RAB bila memang dibayar.` });
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
