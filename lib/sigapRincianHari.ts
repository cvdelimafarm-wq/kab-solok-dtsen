// lib/sigapRincianHari.ts
//
// (27 Okt 2026) Logika murni untuk jendela "Rincian hari" di tab Monitoring (Administrasi & SPJ): admin mengetuk tanggal hari kerja
// seorang petugas, lalu melihat laporan dan foto dokumentasi hari itu. Aman dipakai di klien dan server (tanpa akses database).
//  - pengelompokan lokasi laporan (kecamatan > nagari > jorong)
//  - penyusunan nomor foto 1..n beserta keterangannya (kosong tetap tampil sebagai kotak "belum ada")
//  - hari kerja sebelum/sesudah (panah di jendela)
//  - ringkasan kelengkapan hari itu
//  - hitungan zoom dan geser penampil foto (cubit, ketuk dua kali, batas geser)

import { labelFoto } from "./sigapLabelFoto";
import { jamWib } from "./sigapUrutanFoto";

export type LokasiLaporan = { kecamatan?: string | null; nagari?: string | null; jorong?: string | null; idsubsls?: string | null };
export type KelompokLokasi = { kecamatan: string; nagari: string; jorong: string[] };

const rapi = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Kelompokkan lokasi per (kecamatan, nagari) sesuai urutan kemunculan; jorong dobel dibuang. Baris tanpa nama sama sekali diabaikan. */
export function kelompokLokasi(lokasi: LokasiLaporan[] | null | undefined): KelompokLokasi[] {
  const peta = new Map<string, KelompokLokasi>();
  for (const l of lokasi ?? []) {
    const kec = rapi(l?.kecamatan);
    const nag = rapi(l?.nagari);
    const jor = rapi(l?.jorong);
    if (!kec && !nag && !jor) continue;
    const kunci = `${kec.toLowerCase()}|${nag.toLowerCase()}`;
    let g = peta.get(kunci);
    if (!g) {
      g = { kecamatan: kec, nagari: nag, jorong: [] };
      peta.set(kunci, g);
    }
    if (jor && !g.jorong.some((x) => x.toLowerCase() === jor.toLowerCase())) g.jorong.push(jor);
  }
  return Array.from(peta.values());
}

/** Satu baris ringkas, mis. "Koto Baru (Kec. Lembang): Jorong A, Jorong B · Salayo (Kec. Kubung): Jorong C". */
export function ringkasLokasi(lokasi: LokasiLaporan[] | null | undefined): string {
  return kelompokLokasi(lokasi)
    .map((g) => {
      const kepala = g.nagari ? `${g.nagari}${g.kecamatan ? ` (Kec. ${g.kecamatan})` : ""}` : g.kecamatan ? `Kec. ${g.kecamatan}` : "";
      const isi = g.jorong.join(", ");
      return kepala && isi ? `${kepala}: ${isi}` : kepala || isi;
    })
    .join(" · ");
}

export type SlotFoto<T> = { slot: number; label: string; foto: T | null };

/**
 * Nomor foto 1..n untuk satu hari. n = jumlah foto wajib kegiatan, atau nomor foto terbesar yang ada bila lebih besar.
 * Nomor tanpa foto tetap dikembalikan (foto = null) supaya kekurangan langsung terlihat.
 */
export function susunSlotFoto<T extends { slot: number }>(foto: T[] | null | undefined, jumlah: number, jenis?: string | null): SlotFoto<T>[] {
  const ada = new Map<number, T>();
  for (const f of foto ?? []) if (Number.isInteger(f?.slot) && f.slot >= 1 && !ada.has(f.slot)) ada.set(f.slot, f);
  const terbesar = ada.size ? Math.max(...ada.keys()) : 0;
  const n = Math.max(Number.isInteger(jumlah) && jumlah > 0 ? jumlah : 0, terbesar);
  const label = labelFoto(jenis);
  return Array.from({ length: n }, (_, i) => ({ slot: i + 1, label: label[i] ?? `Foto ${i + 1}`, foto: ada.get(i + 1) ?? null }));
}

export type Tetangga = { sebelum: string | null; sesudah: string | null; nomor: number; total: number };

/** Hari kerja sebelum dan sesudah `t` dalam daftar tanggal petugas (urut menaik, dobel dibuang). `nomor` 1-based; 0 bila `t` tidak ada. */
export function hariTetangga(daftar: string[] | null | undefined, t: string): Tetangga {
  const u = Array.from(new Set(daftar ?? [])).sort();
  const i = u.indexOf(t);
  if (i < 0) return { sebelum: null, sesudah: null, nomor: 0, total: u.length };
  return { sebelum: i > 0 ? u[i - 1] : null, sesudah: i < u.length - 1 ? u[i + 1] : null, nomor: i + 1, total: u.length };
}

export type Kelengkapan = {
  laporan: "ok" | "kurang" | "tidak_wajib";
  foto: "ok" | "kurang";
  nFoto: number;
  wajibFoto: number;
  /** foto yang masih kurang dari aturan kegiatan (0 bila sudah cukup) */
  kurangFoto: number;
};

/** Cermin aturan hariLengkap (lib/sigap): laporan hanya dihitung bila kegiatan mewajibkannya; foto cukup bila >= jumlah wajib. */
export function kelengkapanHari(p: { adaLaporan: boolean; wajibLaporan: boolean; nFoto: number; wajibFoto: number }): Kelengkapan {
  const wajibFoto = Math.max(0, Math.floor(p.wajibFoto || 0));
  const nFoto = Math.max(0, Math.floor(p.nFoto || 0));
  return {
    laporan: !p.wajibLaporan ? "tidak_wajib" : p.adaLaporan ? "ok" : "kurang",
    foto: nFoto >= wajibFoto ? "ok" : "kurang",
    nFoto,
    wajibFoto,
    kurangFoto: Math.max(0, wajibFoto - nFoto),
  };
}

/** "10.57" dari waktu ISO; "–" bila kosong atau tidak valid. */
export function jamDariIso(iso: string | null | undefined): string {
  if (!iso) return "–";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? jamWib(ms) : "–";
}

// ------------------------------------------------------------------ zoom & geser penampil foto
export const ZOOM_MIN = 1;
export const ZOOM_MAKS = 5;
/** Skala yang dipakai ketukan dua kali dari ukuran asli. */
export const ZOOM_KETUK_DUA = 2.5;

export type Titik = { x: number; y: number };
export type Ukuran = { w: number; h: number };

export function batasiZoom(s: number): number {
  if (!Number.isFinite(s)) return ZOOM_MIN;
  return Math.min(ZOOM_MAKS, Math.max(ZOOM_MIN, s));
}

export function jarakDuaTitik(a: Titik, b: Titik): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function titikTengah(a: Titik, b: Titik): Titik {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Batasi geseran agar foto tidak keluar dari layar. Foto digeser dari tengah (transform-origin tengah).
 * `foto` = ukuran foto saat skala 1, `layar` = ukuran area penampil. Pada sumbu yang foto berskala masih lebih kecil dari layar, geseran dikunci 0.
 */
export function batasiGeser(g: Titik, skala: number, foto: Ukuran, layar: Ukuran): Titik {
  const s = batasiZoom(skala);
  const maks = (f: number, l: number) => Math.max(0, (f * s - l) / 2);
  const mx = maks(foto.w, layar.w);
  const my = maks(foto.h, layar.h);
  return { x: Math.min(mx, Math.max(-mx, g.x)), y: Math.min(my, Math.max(-my, g.y)) };
}

/**
 * Geseran baru supaya titik di bawah jari (`titik`, relatif terhadap tengah layar) tetap di tempatnya ketika skala berubah dari `lama` ke `baru`.
 * Dasar: layar = geser + skala * isi, jadi isi = (titik - geser) / skala.
 */
export function zoomKeTitik(lama: number, baru: number, titik: Titik, geser: Titik): Titik {
  if (!(lama > 0)) return geser;
  const r = baru / lama;
  return { x: titik.x - (titik.x - geser.x) * r, y: titik.y - (titik.y - geser.y) * r };
}

/** Geser horizontal cukup jauh dan dominan => pindah foto. Hanya bila foto belum diperbesar. -1 = sebelumnya, 1 = berikutnya, 0 = tidak. */
export function arahGeserFoto(dx: number, dy: number, skala: number, ambang = 56): -1 | 0 | 1 {
  if (skala > 1.02) return 0;
  if (Math.abs(dx) < ambang || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
