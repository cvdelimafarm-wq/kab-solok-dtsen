// lib/sigapPengingat.ts
//
// (15 Okt 2026) Aturan MODAL pengingat dinamis -- lanjutan "yang belum dilengkapi" (lib/sigapKekurangan.ts). Murni (tanpa React/DB) supaya mudah diuji.
// Mockup: mockup-pengingat-dinamis-kekurangan.html.
//
// ATURAN
//  - Sumber = daftar kekurangan yang SAMA dengan kartu Beranda/Layer 2 (isi tidak bertentangan). Isinya berubah bila angkanya berubah (kunci = kode + judul).
//  - Hanya kekurangan yang bisa ditindaklanjuti dan cukup penting: skor >= SKOR_MODAL_MIN (izin susulan, hari ini, mendesak, pilih hari kerja);
//    "hari terlewat" TIDAK pernah jadi modal (cukup kartu + tombol WhatsApp).
//  - SEKALI per kekurangan: begitu tampil, kunci itu ditahan TUNDA_MENIT (2 jam) -- entah ditutup "Nanti", dibuka, atau halaman dimuat ulang.
//    Bila masih kurang setelah 2 jam, muncul lagi; bila angkanya berubah (foto 3 -> 4) itu kekurangan baru dengan kunci baru.
//  - Batas MAKS_PER_HARI (3) modal per hari (WIB). Kekurangan MENDESAK (skor >= SKOR_MENDESAK_MODAL, sisa < 2 jam) boleh melampaui batas, paling banyak
//    MAKS_TAMBAHAN_MENDESAK kali lagi.
//  - Hilang sendiri bila sudah lengkap (kekurangan tidak ada lagi di daftar).
//  - Tidak muncul: mode simulasi ("masuk sebagai"), ada hasil yang masih menunggu terkirim (antrean offline -- jangan beri peringatan palsu),
//    atau sudah ada dialog lain yang terbuka (pemanggil yang memeriksa dan meneruskan `tertahan`).

import type { Kekurangan } from "@/lib/sigapKekurangan";

export const SKOR_MODAL_MIN = 70;
export const SKOR_MENDESAK_MODAL = 88;
export const TUNDA_MENIT = 120;
export const MAKS_PER_HARI = 3;
export const MAKS_TAMBAHAN_MENDESAK = 2;

export type KeadaanPengingat = {
  /** tanggal WIB (YYYY-MM-DD) keadaan ini berlaku */
  hari: string;
  /** jumlah modal yang sudah tampil pada hari itu */
  tampil: number;
  /** kunci kekurangan -> ditahan sampai (ms epoch) */
  tunda: Record<string, number>;
};

/** Tanggal WIB (UTC+7) dari ms epoch. */
export function hariWib(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10);
}

export const kunciKekurangan = (k: Pick<Kekurangan, "kode" | "judul">): string => `${k.kode}|${k.judul}`;

/** Keadaan yang sah untuk hari ini: bentuk salah -> kosong; hari berganti -> hitungan mulai dari nol (tunda yang masih berlaku tetap dibawa). */
export function segarkanKeadaan(mentah: unknown, nowMs: number): KeadaanPengingat {
  const hari = hariWib(nowMs);
  const o = (mentah ?? {}) as Partial<KeadaanPengingat>;
  const tunda: Record<string, number> = {};
  if (o.tunda && typeof o.tunda === "object") {
    for (const [k, v] of Object.entries(o.tunda)) if (typeof v === "number" && Number.isFinite(v) && v > nowMs) tunda[k] = v;
  }
  const tampil = o.hari === hari && typeof o.tampil === "number" && o.tampil >= 0 ? Math.floor(o.tampil) : 0;
  return { hari, tampil, tunda };
}

export const layakModal = (k: Kekurangan): boolean => k.skor >= SKOR_MODAL_MIN && k.jenis !== "hari_terlewat";

/** Pilih satu kekurangan untuk ditampilkan sebagai modal (atau null). */
export function pilihPengingat(daftar: Kekurangan[], keadaan: KeadaanPengingat, nowMs: number, tertahan = false): Kekurangan | null {
  if (tertahan) return null;
  const k = segarkanKeadaan(keadaan, nowMs);
  const calon = daftar
    .filter(layakModal)
    .filter((x) => (k.tunda[kunciKekurangan(x)] ?? 0) <= nowMs)
    .filter((x) => (x.skor >= SKOR_MENDESAK_MODAL ? k.tampil < MAKS_PER_HARI + MAKS_TAMBAHAN_MENDESAK : k.tampil < MAKS_PER_HARI))
    .sort((a, b) => b.skor - a.skor);
  return calon[0] ?? null;
}

/** Catat bahwa modal untuk `x` sudah ditampilkan: hitungan hari naik, kunci ditahan TUNDA_MENIT. Mengembalikan keadaan baru (tidak mengubah masukan). */
export function catatTampil(keadaan: KeadaanPengingat, x: Pick<Kekurangan, "kode" | "judul">, nowMs: number): KeadaanPengingat {
  const k = segarkanKeadaan(keadaan, nowMs);
  return { hari: k.hari, tampil: k.tampil + 1, tunda: { ...k.tunda, [kunciKekurangan(x)]: nowMs + TUNDA_MENIT * 60_000 } };
}

/** Modal yang sedang tampil masih relevan? (hilang bila kekurangan itu sudah tidak ada) */
export const masihKurang = (daftar: Kekurangan[], x: Pick<Kekurangan, "kode" | "judul">): boolean => daftar.some((d) => kunciKekurangan(d) === kunciKekurangan(x));
