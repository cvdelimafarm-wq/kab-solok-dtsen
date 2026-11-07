// lib/petaWilayah.ts
//
// (7 Nov 2026) Peta mini satu sub SLS di HP (A1b): batas sub SLS + titik KK master (utama / cadangan / lainnya). Fungsi MURNI (tanpa DOM) agar bisa diuji.
// Memakai lib/batasSubsls (bacaan berkas batas, jalur SVG) dan lib/pendataan (proyeksi tanpa basemap).

import { buatProyeksi, type Proyeksi, type Titik } from "./pendataan";
import { jalurBatas, type FiturBatas } from "./batasSubsls";

export type PeranTitik = "utama" | "cadangan" | "lain";
export type TitikKk = { id: number; nama: string; x: number; y: number; peran: PeranTitik };
export type GambarPeta = { lebar: number; tinggi: number; jalur: string; titik: TitikKk[]; tanpaKoordinat: number; adaBatas: boolean; meterPerSatuan: number };

type BarisKk = { id: number; nama_kk: string; lat: number | null; lng: number | null };

const sahLat = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
const sahLng = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;

/** Semua titik sudut poligon sebuah fitur (untuk membingkai kanvas). */
export function titikBatas(f: FiturBatas | null | undefined): Titik[] {
  const hasil: Titik[] = [];
  if (!f) return hasil;
  for (const poligon of f.g) for (const cincin of poligon) for (const t of cincin) hasil.push({ lng: t[0], lat: t[1] });
  return hasil;
}

/**
 * Menyiapkan gambar: kanvas dibingkai oleh batas sub SLS (bila ada) ditambah titik KK ber-koordinat.
 * `peran` memetakan id KK ke peran tag; KK tanpa tag = "lain". null bila tidak ada batas dan tidak ada KK ber-koordinat.
 */
export function siapkanPetaSub(
  fitur: FiturBatas | null | undefined,
  kk: readonly BarisKk[],
  peran: ReadonlyMap<number, "utama" | "cadangan">,
  lebar = 340,
  tinggi = 260,
): GambarPeta | null {
  const berKoordinat = kk.filter((k): k is BarisKk & { lat: number; lng: number } => sahLat(k.lat) && sahLng(k.lng));
  const semua: Titik[] = [...titikBatas(fitur), ...berKoordinat.map((k) => ({ lat: k.lat, lng: k.lng }))];
  const proj: Proyeksi | null = buatProyeksi(semua, lebar, tinggi);
  if (!proj) return null;
  const jalur = fitur ? jalurBatas(fitur, proj) : "";
  const titik: TitikKk[] = berKoordinat.map((k) => ({ id: k.id, nama: k.nama_kk, x: proj.x(k.lng), y: proj.y(k.lat), peran: peran.get(k.id) ?? "lain" }));
  // yang bertanda digambar terakhir supaya tidak tertutup titik lain
  const urut: Record<PeranTitik, number> = { lain: 0, cadangan: 1, utama: 2 };
  titik.sort((a, b) => urut[a.peran] - urut[b.peran]);
  return { lebar, tinggi, jalur, titik, tanpaKoordinat: kk.length - berKoordinat.length, adaBatas: jalur !== "", meterPerSatuan: proj.meterPerSatuan };
}

/** Panjang batang skala yang enak dibaca (meter) dan lebarnya di kanvas. */
export function batangSkala(meterPerSatuan: number, lebarMaks = 90): { meter: number; lebar: number } {
  if (!(meterPerSatuan > 0) || !Number.isFinite(meterPerSatuan)) return { meter: 0, lebar: 0 };
  const calon = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  let pilih = calon[0];
  for (const c of calon) if (c / meterPerSatuan <= lebarMaks) pilih = c;
  return { meter: pilih, lebar: pilih / meterPerSatuan };
}

/** Alamat berkas batas kecamatan untuk sebuah sub SLS menurut manifest; null bila kecamatannya tidak ada di manifest. */
export function berkasUntukSub(manifest: { kecamatan: Record<string, { berkas: string }> } | null, idsubsls: string): string | null {
  if (!manifest || !/^\d{16}$/.test(idsubsls)) return null;
  return manifest.kecamatan[idsubsls.slice(0, 7)]?.berkas ?? null;
}
