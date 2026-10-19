// lib/petaDasar.ts  (murni, tanpa DOM)
//
// (20 Okt 2026) Peta dasar (jalan, sungai, nama tempat) di bawah titik KK pada tab Peta Lembar Pendataan.
// Titik KK tetap digambar PetaKk (SVG) dengan geser/cubit sendiri; peta dasar hanya LATAR yang mengikuti kamera SVG itu (Pandang).
// Berkas peta: satu berkas PMTiles per tim PML (kunci = bencana_petugas.id PML = DataTimPendataan.pml.id), disimpan di bucket Storage "peta-dasar".

import type { Proyeksi } from "@/lib/pendataan";

export const BUCKET_PETA_DASAR = "peta-dasar";
export const ZOOM_MAKS_BERKAS = 15; // zoom terbesar di berkas; lebih besar dari itu diperbesar (overzoom) oleh peta
export const UMUR_DASAR_TANPA_MANIFEST_MS = 60 * 24 * 3_600_000;
/** Meter per piksel pada zoom 0 (ubin 512 px, ekuator), dipakai MapLibre GL. */
export const MPP_ZOOM0 = 40075016.686 / 512;

export type Kamera = { lng: number; lat: number; zoom: number };
export type PandangPeta = { cx: number; cy: number; z: number };
export type ProyeksiMin = Pick<Proyeksi, "x" | "y" | "meterPerSatuan">;

/**
 * Kamera peta dasar yang padanannya sama dengan tampilan SVG PetaKk (viewBox lebar/z x tinggi/z, ditaruh "meet" di tengah wadah lebarPx x tinggiPx).
 * Proyeksi KK linear (equirectangular dengan koreksi cos lintang), maka kebalikannya dari dua titik acuan.
 */
export function kameraDariPandang(proj: ProyeksiMin, p: PandangPeta, lebarPx: number, tinggiPx: number, L = 360, T = 440): Kamera | null {
  if (!(lebarPx > 0) || !(tinggiPx > 0) || !(p.z > 0)) return null;
  const dx = proj.x(1) - proj.x(0); // satuan SVG per derajat bujur
  const dy = proj.y(1) - proj.y(0); // satuan SVG per derajat lintang (negatif)
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx === 0 || dy === 0) return null;
  const lng = (p.cx - proj.x(0)) / dx;
  const lat = (p.cy - proj.y(0)) / dy;
  const skala = Math.min(lebarPx / (L / p.z), tinggiPx / (T / p.z)); // piksel layar per satuan SVG
  const mpp = proj.meterPerSatuan / skala;
  if (!(mpp > 0) || !Number.isFinite(mpp)) return null;
  const zoom = Math.log2((MPP_ZOOM0 * Math.cos((lat * Math.PI) / 180)) / mpp);
  if (!Number.isFinite(zoom)) return null;
  return { lng, lat, zoom: Math.max(0, Math.min(22, zoom)) };
}

// ------------------------------------------------------------------ berkas peta per tim
export type BerkasTim = { berkas: string; ukuran: number; versi: string };
export type ManifestDasar = { versi: string; dibuat: string; tim: Record<string, BerkasTim> };

export const namaBerkasTim = (pmlId: number) => `tim-${pmlId}.pmtiles`;
export const jalurCacheDasar = (nama: string) => `/peta-cache/dasar/${encodeURIComponent(nama)}`;
export const jalurCacheGlyph = (font: string, rentang: string) => `/peta-cache/dasar/glyphs/${encodeURIComponent(font)}/${rentang}.pbf`;

export function urlPublikBerkas(supabaseUrl: string, nama: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET_PETA_DASAR}/${encodeURIComponent(nama)}`;
}

/** Manifest dari jaringan/penyimpanan: abaikan bentuk yang tidak dikenal (tidak pernah melempar). */
export function bacaManifestDasar(mentah: unknown): ManifestDasar | null {
  if (!mentah || typeof mentah !== "object") return null;
  const m = mentah as Record<string, unknown>;
  if (typeof m.versi !== "string" || !m.tim || typeof m.tim !== "object") return null;
  const tim: Record<string, BerkasTim> = {};
  for (const [k, v] of Object.entries(m.tim as Record<string, unknown>)) {
    if (!/^\d+$/.test(k) || !v || typeof v !== "object") continue;
    const b = v as Record<string, unknown>;
    if (typeof b.berkas !== "string" || !/^[\w.-]+\.pmtiles$/.test(b.berkas)) continue;
    if (typeof b.ukuran !== "number" || !(b.ukuran > 0)) continue;
    tim[k] = { berkas: b.berkas, ukuran: b.ukuran, versi: typeof b.versi === "string" ? b.versi : m.versi };
  }
  return { versi: m.versi, dibuat: typeof m.dibuat === "string" ? m.dibuat : "", tim };
}

export const berkasUntukTim = (m: ManifestDasar | null, pmlId: number): BerkasTim | null => (m ? m.tim[String(pmlId)] ?? null : null);

/** Salinan di HP masih berlaku? Bila manifest diketahui, versinya harus sama; bila tidak (luring), terima sampai 60 hari. */
export function salinanBerlaku(c: { versi: string | null; disimpanAt: number }, m: BerkasTim | null, sekarang = Date.now()): boolean {
  if (m) return !!c.versi && c.versi === m.versi;
  return c.disimpanAt > 0 && sekarang - c.disimpanAt <= UMUR_DASAR_TANPA_MANIFEST_MS;
}

export function labelUkuran(byte: number): string {
  if (byte >= 1024 * 1024) return `${(byte / 1024 / 1024).toFixed(byte >= 10 * 1024 * 1024 ? 0 : 1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(byte / 1024))} KB`;
}

export type PilihanLapisan = "jalan" | "titik";
