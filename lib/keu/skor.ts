// lib/keu/skor.ts
//
// (25 Okt 2026) Papan 12 bagian 3: skor kualitas RAB per RO untuk dilihat semua pengguna. Logika murni (tanpa React/DB): baris skor menurut bobot dan
// ambang master, bobot dalam persen, dan rincian bulanan rencana penarikan (RAB sah) dibandingkan realisasi. Rumus skor tetap di view keu_v_skor_ro
// (sementara; menunggu keputusan PPK).

import { hitungSkor, totalBobot, type Ambang, type Bobot, type HasilSkor, type SkorRo } from "@/lib/keu/master";
import type { WarnaChip } from "@/lib/keu/revisi";

export const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** Kategori dari view (Baik, Cukup, Perlu pembinaan) dan hitungan klien menggunakan kata yang sama. */
export const WARNA_KATEGORI: Record<string, WarnaChip> = { Baik: "hijau", Cukup: "kuning", "Perlu pembinaan": "merah", Kurang: "merah" };

export type BarisSkorRo = HasilSkor & { nama: string };
/** Satu baris per RO yang punya skor, urut kode RO. RO tanpa nama master memakai kodenya. */
export function barisSkor(skor: SkorRo[], ro: { kode: string; nama: string }[], b: Bobot, a: Ambang): BarisSkorRo[] {
  const nama = new Map(ro.map((r) => [r.kode, r.nama]));
  return skor.map((s) => ({ ...hitungSkor(s, b, a), nama: nama.get(s.ro_kode) ?? s.ro_kode })).sort((x, y) => x.ro_kode.localeCompare(y.ro_kode));
}

/** Bobot sebagai persen yang dinormalkan ke 100 (bobot 0 tetap 0). Total 0 -> semua 0. */
export function persenBobot(b: Bobot): Bobot {
  const t = totalBobot(b);
  const p = (v: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
  return { penarikan: p(b.penarikan), volume: p(b.volume), cakupan: p(b.cakupan), disiplin: p(b.disiplin) };
}

export type BulanRinci = { bulan: number; nama: string; rencana: number; real: number; selisih: number };
const n = (v: number | string | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Januari sampai `sampai`: rencana penarikan (jumlah jadwal RAB sah) lawan realisasi bulan itu; selisih = realisasi - rencana. */
export function rincianBulanan(jadwal: { bulan: number | string; nilai: number | string }[], real: { bulan: number | string; realisasi_bulan: number | string | null }[], sampai: number): BulanRinci[] {
  const hasil: BulanRinci[] = [];
  for (let m = 1; m <= Math.min(12, Math.max(0, Math.floor(sampai))); m++) {
    const rencana = jadwal.filter((j) => Number(j.bulan) === m).reduce((a, j) => a + n(j.nilai), 0);
    const r = real.filter((x) => Number(x.bulan) === m).reduce((a, x) => a + n(x.realisasi_bulan), 0);
    hasil.push({ bulan: m, nama: BULAN_PENDEK[m - 1], rencana, real: r, selisih: r - rencana });
  }
  return hasil;
}
export const nilaiSkor = (v: number | null): string => (v === null ? "-" : String(Math.round(v * 10) / 10).replace(".", ","));
