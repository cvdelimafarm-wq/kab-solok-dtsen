// lib/seleksiTurunanObjek.ts  (murni, tanpa basis data)
//
// (8 Nov 2026, D4) Wilayah seleksi yang DITURUNKAN dari daftar sampel MODEL 2/3 (sigap_sampel_objek), pasangan wilayahDariSampel (model 1, lib/seleksiTurunan.ts).
// Pengelompokan per wilayah pada tingkat profil: kecamatan (7 digit), nagari (10), SLS (14); profil tingkat sub SLS (16) dikelompokkan ke SLS-nya (14) karena seleksi
// paling dalam bertingkat SLS. Jumlah sampel = jumlah kolom "jumlah". Titik wilayah = rata-rata lat/lng objek bila ada (atribut), kalau tidak titik SLS dari master koordinat.
// Hanya usulan: PJ memutuskan lewat tombol. Aturan kelayakan tetap di lib/seleksiSyarat.ts.

import { MAKS_WILAYAH, type WilayahSeleksi } from "@/lib/seleksiSyarat";

export type BarisObjekSeleksi = { kode_wilayah: string | null; jumlah: number; lat: number | null; lng: number | null };
export type NamaWilayahMin = { kecamatan: string; nagari: string; sls: string };
export type TingkatSeleksiObjek = "kecamatan" | "nagari" | "sls" | "sub_sls";

export type HasilWilayahObjek = {
  wilayah: WilayahSeleksi[];
  /** Jumlah wilayah berbeda (sebelum dipotong). */
  jumlah_wilayah: number;
  /** Total sampel (jumlah seluruh baris yang berwilayah). */
  sampel: number;
  /** Objek tanpa wilayah (tidak ikut). */
  tanpa_wilayah: number;
  /** Wilayah yang kodenya tidak dikenal master (nama tidak bisa diturunkan). */
  tak_dikenal: number;
  /** Wilayah yang tidak dimasukkan karena melebihi batas wilayah per seleksi. */
  terpotong: number;
};

const PANJANG: Record<"kecamatan" | "nagari" | "sls", number> = { kecamatan: 7, nagari: 10, sls: 14 };
const titikSah = (lat: number | null | undefined, lng: number | null | undefined): lat is number =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -11.5 && lat <= 6.5 && lng >= 94.5 && lng <= 141.5;
const rata = (a: number[]): number => Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 1e6) / 1e6;

/** Tingkat kelompok seleksi dari tingkat profil (sub SLS naik ke SLS). */
export const tingkatKelompok = (t: TingkatSeleksiObjek): "kecamatan" | "nagari" | "sls" => (t === "sub_sls" ? "sls" : t);

/** Kode kelompok untuk satu baris pada tingkat tertentu; null bila kode kosong atau lebih pendek dari tingkat. */
export function kodeKelompok(kode: string | null, tingkat: TingkatSeleksiObjek): string | null {
  const k = String(kode ?? "").trim();
  const p = PANJANG[tingkatKelompok(tingkat)];
  return /^\d+$/.test(k) && k.length >= p ? k.slice(0, p) : null;
}

/**
 * @param nama peta kode kelompok -> nama wilayah (dari master); kode yang tidak ada di peta dihitung tak_dikenal dan diberi nama "Wilayah <kode>".
 * @param koordSls titik SLS dari master koordinat (hanya dipakai bila tingkat kelompok = SLS dan objek tidak punya titik).
 */
export function wilayahDariObjek(
  baris: readonly BarisObjekSeleksi[],
  tingkat: TingkatSeleksiObjek,
  nama: ReadonlyMap<string, NamaWilayahMin>,
  koordSls: ReadonlyMap<string, { lat: number; lng: number }> = new Map(),
  maks: number = MAKS_WILAYAH,
): HasilWilayahObjek {
  const per = new Map<string, { sampel: number; lat: number[]; lng: number[] }>();
  let tanpa = 0;
  let total = 0;
  for (const b of baris) {
    const k = kodeKelompok(b.kode_wilayah, tingkat);
    if (!k) {
      tanpa++;
      continue;
    }
    const n = Number.isFinite(Number(b.jumlah)) && Number(b.jumlah) > 0 ? Math.floor(Number(b.jumlah)) : 1;
    const g = per.get(k) ?? { sampel: 0, lat: [], lng: [] };
    g.sampel += n;
    total += n;
    if (titikSah(b.lat, b.lng)) {
      g.lat.push(b.lat as number);
      g.lng.push(b.lng as number);
    }
    per.set(k, g);
  }
  const lv = tingkatKelompok(tingkat);
  let takDikenal = 0;
  const semua: WilayahSeleksi[] = [];
  for (const k of [...per.keys()].sort()) {
    const g = per.get(k) as { sampel: number; lat: number[]; lng: number[] };
    const info = nama.get(k);
    if (!info) takDikenal++;
    const master = lv === "sls" ? koordSls.get(k) : undefined;
    semua.push({
      kode: k,
      nama: info ? (lv === "kecamatan" ? info.kecamatan : lv === "nagari" ? info.nagari : `${info.nagari} · ${info.sls}`) : `Wilayah ${k}`,
      kecamatan: info ? info.kecamatan.toUpperCase() : null,
      nagari: info && lv !== "kecamatan" ? info.nagari.toUpperCase() : null,
      lat: g.lat.length > 0 ? rata(g.lat) : master?.lat ?? null,
      lng: g.lng.length > 0 ? rata(g.lng) : master?.lng ?? null,
      jumlah_sampel: g.sampel,
      kebutuhan_ppl: 0,
      kebutuhan_pml: 0,
    });
  }
  const dipakai = semua.slice(0, maks);
  return { wilayah: dipakai, jumlah_wilayah: semua.length, sampel: total, tanpa_wilayah: tanpa, tak_dikenal: takDikenal, terpotong: Math.max(0, semua.length - dipakai.length) };
}
