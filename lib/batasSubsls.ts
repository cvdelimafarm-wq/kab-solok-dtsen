// lib/batasSubsls.ts
//
// (2 Nov 2026) Batas Sub SLS (poligon) sebagai lapisan di atas peta Lembar Pendataan. Fungsi MURNI (tanpa DOM) supaya bisa diuji.
// Berkas dibuat `node scripts/peta/gabung-batas-subsls.mjs` dari satu GeoJSON per Sub SLS (nama berkas = idsubsls 16 digit) lalu
// disalin ke public/peta/batas/. Koordinat WGS84 [bujur, lintang], dibulatkan 6 desimal, garis TIDAK disederhanakan (titik batas
// bersama tetangga tetap identik).
//   manifest.json : { versi, dibuat, kecamatan: { "1303040": { berkas, ukuran, n, bb } } }   bb = [minBujur, minLintang, maxBujur, maxLintang]
//   batas-<7 digit kecamatan>.json : { versi, fitur: [ { id, nm, kd, bb, g } ] }              g = MultiPolygon: poligon > cincin > [bujur, lintang]

import type { Proyeksi } from "./pendataan";

export type Bb = [number, number, number, number];
export type FiturBatas = { id: string; nm: string; kd: string; bb: Bb; g: number[][][][] };
export type KecBatas = { berkas: string; ukuran: number; n: number; bb: Bb | null };
export type ManifestBatas = { versi: string; dibuat: string; kecamatan: Record<string, KecBatas> };
export type KotakGeo = { minLng: number; minLat: number; maxLng: number; maxLat: number };
export type BerkasBatas = { versi: string; fitur: FiturBatas[] };

export const JALUR_BATAS = "/peta/batas";
export const NAMA_MANIFEST_BATAS = "manifest.json";
export const jalurCacheBatas = (berkas: string) => `/peta-cache/batas/${encodeURIComponent(berkas)}`;
/** Kode kecamatan = 7 digit pertama idsubsls (13 03 040 ...). */
export const idKecamatan = (idsubsls: string) => idsubsls.slice(0, 7);

const NAMA_BERKAS = /^batas-\d{7}\.json$/;
const adaAngka = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const bbSah = (v: unknown): v is Bb => Array.isArray(v) && v.length === 4 && v.every(adaAngka) && v[0] <= v[2] && v[1] <= v[3];

/** Manifest dari jaringan/penyimpanan; bentuk yang tidak dikenal diabaikan (tidak pernah melempar). */
export function bacaManifestBatas(mentah: unknown): ManifestBatas | null {
  if (!mentah || typeof mentah !== "object") return null;
  const m = mentah as Record<string, unknown>;
  if (typeof m.versi !== "string" || !m.versi || !m.kecamatan || typeof m.kecamatan !== "object") return null;
  const kecamatan: Record<string, KecBatas> = {};
  for (const [k, v] of Object.entries(m.kecamatan as Record<string, unknown>)) {
    if (!/^\d{7}$/.test(k) || !v || typeof v !== "object") continue;
    const b = v as Record<string, unknown>;
    if (typeof b.berkas !== "string" || !NAMA_BERKAS.test(b.berkas)) continue;
    kecamatan[k] = { berkas: b.berkas, ukuran: adaAngka(b.ukuran) ? b.ukuran : 0, n: adaAngka(b.n) ? b.n : 0, bb: bbSah(b.bb) ? b.bb : null };
  }
  return { versi: m.versi, dibuat: typeof m.dibuat === "string" ? m.dibuat : "", kecamatan };
}

function cincinSah(c: unknown): c is number[][] {
  return Array.isArray(c) && c.length >= 4 && c.every((t) => Array.isArray(t) && t.length >= 2 && adaAngka(t[0]) && adaAngka(t[1]));
}

/** Isi satu berkas kecamatan. Fitur yang rusak dibuang satu per satu; null bila bentuk berkas tidak dikenal sama sekali. */
export function bacaBerkasBatas(mentah: unknown): BerkasBatas | null {
  if (!mentah || typeof mentah !== "object") return null;
  const b = mentah as Record<string, unknown>;
  if (!Array.isArray(b.fitur)) return null;
  const fitur: FiturBatas[] = [];
  for (const f of b.fitur as unknown[]) {
    if (!f || typeof f !== "object") continue;
    const x = f as Record<string, unknown>;
    if (typeof x.id !== "string" || !/^\d{16}$/.test(x.id) || !bbSah(x.bb) || !Array.isArray(x.g)) continue;
    const g = (x.g as unknown[]).filter((p): p is number[][][] => Array.isArray(p) && p.length > 0 && p.every(cincinSah));
    if (g.length === 0) continue;
    fitur.push({ id: x.id, nm: typeof x.nm === "string" ? x.nm : "", kd: typeof x.kd === "string" ? x.kd : "", bb: x.bb, g });
  }
  return { versi: typeof b.versi === "string" ? b.versi : "", fitur };
}

const beririsan = (a: Bb, b: Bb) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Kotak (bujur-lintang) yang membungkus titik KK, dilebarkan `margin` (fraksi dari bentang, minimal `minimal` derajat). null bila tanpa titik. */
export function kotakKk(titik: readonly { lat: number; lng: number }[], margin = 0.2, minimal = 0.002): KotakGeo | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const t of titik) {
    if (!adaAngka(t.lat) || !adaAngka(t.lng)) continue;
    if (t.lat < minLat) minLat = t.lat;
    if (t.lat > maxLat) maxLat = t.lat;
    if (t.lng < minLng) minLng = t.lng;
    if (t.lng > maxLng) maxLng = t.lng;
  }
  if (!adaAngka(minLat) || !adaAngka(minLng)) return null;
  const mx = Math.max((maxLng - minLng) * margin, minimal);
  const my = Math.max((maxLat - minLat) * margin, minimal);
  return { minLng: minLng - mx, minLat: minLat - my, maxLng: maxLng + mx, maxLat: maxLat + my };
}

/** Kode kecamatan yang kotaknya beririsan dengan `kotak`. Manifest tanpa kotak (bb) untuk sebuah kecamatan: kecamatan itu ikut (lebih baik berlebih daripada hilang). */
export function kecamatanUntukKotak(m: ManifestBatas, kotak: KotakGeo): string[] {
  const k: Bb = [kotak.minLng, kotak.minLat, kotak.maxLng, kotak.maxLat];
  return Object.entries(m.kecamatan)
    .filter(([, v]) => !v.bb || beririsan(v.bb, k))
    .map(([kode]) => kode)
    .sort();
}

/** Kunci stabil dari kotak (dibulatkan 3 desimal ~ 110 m) supaya efek pemuatan tidak berulang karena selisih kecil. */
export const kunciKotak = (k: KotakGeo | null) => (k ? [k.minLng, k.minLat, k.maxLng, k.maxLat].map((v) => v.toFixed(3)).join(",") : "");

const bulat = (v: number) => Math.round(v * 100) / 100;

/** Jalur SVG ("M x y L ... Z") satu fitur pada kanvas `proj`. Cincin dengan kurang dari 3 titik dibuang. */
export function jalurBatas(f: FiturBatas, proj: Pick<Proyeksi, "x" | "y">): string {
  const bagian: string[] = [];
  for (const poligon of f.g) {
    for (const cincin of poligon) {
      if (cincin.length < 3) continue;
      let s = "";
      for (let i = 0; i < cincin.length; i++) {
        s += `${i === 0 ? "M" : "L"}${bulat(proj.x(cincin[i][0]))} ${bulat(proj.y(cincin[i][1]))}`;
      }
      bagian.push(`${s}Z`);
    }
  }
  return bagian.join("");
}

/** Kotak fitur pada kanvas beririsan dengan kanvas (0..lebar, 0..tinggi) yang dilebarkan `longgar`? Yang jauh di luar tidak perlu digambar. */
export function tampakDiKanvas(f: Pick<FiturBatas, "bb">, proj: Pick<Proyeksi, "x" | "y" | "lebar" | "tinggi">, longgar = 0): boolean {
  const x1 = proj.x(f.bb[0]);
  const x2 = proj.x(f.bb[2]);
  const y1 = proj.y(f.bb[3]); // lintang besar = atas = y kecil
  const y2 = proj.y(f.bb[1]);
  return Math.max(x1, x2) >= -longgar && Math.min(x1, x2) <= proj.lebar + longgar && Math.max(y1, y2) >= -longgar && Math.min(y1, y2) <= proj.tinggi + longgar;
}

/**
 * Yang digambar bila ada Sub SLS aktif: Sub SLS itu dan tetangga yang kotaknya bersinggungan (dilebarkan `longgar` derajat).
 * Tanpa Sub SLS aktif (atau idnya tidak ada di `fitur`): semuanya. Mencegah peta menjadi "jaring laba-laba" ketika KK tersebar jauh.
 */
export function tetanggaDekat(fitur: readonly FiturBatas[], aktifId: string | null, longgar = 0.0003): FiturBatas[] {
  const a = aktifId ? fitur.find((f) => f.id === aktifId) : undefined;
  if (!a) return [...fitur];
  const k: Bb = [a.bb[0] - longgar, a.bb[1] - longgar, a.bb[2] + longgar, a.bb[3] + longgar];
  return fitur.filter((f) => f.id === aktifId || beririsan(f.bb, k));
}

export type PandangBatas = { cx: number; cy: number; z: number };

/** Pandangan (pusat dan zoom) yang memuat kotak `bb` dengan ruang `margin` di sekelilingnya; zoom dibatasi 1..zMaks dan pusat dijaga tetap di dalam kanvas. */
export function pandangUntukBb(bb: Bb, proj: Pick<Proyeksi, "x" | "y" | "lebar" | "tinggi">, margin = 0.25, zMaks = 8): PandangBatas {
  const x1 = proj.x(bb[0]);
  const x2 = proj.x(bb[2]);
  const y1 = proj.y(bb[3]);
  const y2 = proj.y(bb[1]);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const zFit = Math.min(proj.lebar / Math.max(w * (1 + 2 * margin), 1e-6), proj.tinggi / Math.max(h * (1 + 2 * margin), 1e-6));
  const z = Math.max(1, Math.min(zMaks, zFit));
  const hw = proj.lebar / 2 / z;
  const hh = proj.tinggi / 2 / z;
  const klem = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return { cx: klem((x1 + x2) / 2, hw, proj.lebar - hw), cy: klem((y1 + y2) / 2, hh, proj.tinggi - hh), z };
}

export type FiturGambar = { id: string; nm: string; d: string };

/** Fitur yang tampak di kanvas beserta jalurnya (Sub SLS aktif dan tetangganya bila ada aktif), Sub SLS aktif di urutan terakhir supaya tergambar di atas tetangganya. */
export function siapkanGambarBatas(fitur: readonly FiturBatas[], proj: Proyeksi | null, aktifId: string | null): FiturGambar[] {
  if (!proj) return [];
  const hasil: FiturGambar[] = [];
  for (const f of tetanggaDekat(fitur, aktifId)) {
    if (!tampakDiKanvas(f, proj, 40)) continue;
    const d = jalurBatas(f, proj);
    if (d) hasil.push({ id: f.id, nm: f.nm, d });
  }
  return hasil.sort((a, b) => Number(a.id === aktifId) - Number(b.id === aktifId));
}

/** Gabung fitur beberapa kecamatan tanpa id ganda (kecamatan bertetangga tidak berbagi id, ini hanya pengaman). */
export function gabungFitur(daftar: readonly (readonly FiturBatas[])[]): FiturBatas[] {
  const lihat = new Set<string>();
  const hasil: FiturBatas[] = [];
  for (const d of daftar) for (const f of d) if (!lihat.has(f.id)) (lihat.add(f.id), hasil.push(f));
  return hasil;
}
