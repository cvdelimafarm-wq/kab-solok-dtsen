// lib/aturanLingkup.ts
//
// (6 Nov 2026, paket P2 audit Kelola) Aturan murni (tanpa basis data) untuk tiga hal:
//  1. Siapa yang boleh direset PIN-nya oleh admin non-Admin Aplikasi (sasaran terlindungi + sasaran harus bertugas di kegiatan yang dikelola aktor).
//  2. Siapa yang boleh mengubah izin peran / memberi peran (cegah naik hak sendiri).
//  3. Menyaring data admin per kegiatan sesuai lingkup izin menu (mis. `bencana.admin`).
// Sengaja dipisah dari rute supaya bisa diuji tanpa mock basis data.

import { lingkup, type Level, type PetaIzin } from "@/lib/sigapAkses";

export type LingkupKegiatan = "semua" | number[];

/** Peran yang PIN-nya hanya boleh direset Admin Aplikasi (warisan 7 Okt 2026). */
export const PERAN_PIN_TERLINDUNGI = ["admin_aplikasi", "admin_anggaran"];

/** Menu yang menentukan hak tertinggi: hanya Admin Aplikasi (izin `portal.kelola`) boleh memberi atau mengubahnya. */
export const MENU_HAK_TERTINGGI = ["portal.kelola", "akses.kelola"];

export type GalatAturan = { error: string; status: number };

/** Lingkup kegiatan gabungan dari beberapa menu pada level `kelola`. [] = tidak punya lingkup sama sekali. */
export function lingkupGabungan(izin: PetaIzin, menu: string[], level: Level = "kelola"): LingkupKegiatan {
  const hasil = new Set<number>();
  for (const m of menu) {
    const x = izin[m];
    if (!x) continue;
    if (level === "kelola" && x.level !== "kelola") continue;
    const l = lingkup(izin, m);
    if (l === "semua") return "semua";
    for (const k of l) hasil.add(k);
  }
  return Array.from(hasil);
}

// ---------------------------------------------------------------- 1. Reset PIN

export type SasaranReset = {
  aktif: boolean;
  /** kode peran yang dipegang akun sasaran */
  peranKode: string[];
  /** akun sasaran memegang peran yang punya izin level `kelola` pada menu apa pun */
  punyaIzinKelola: boolean;
  /** kegiatan_id penugasan AKTIF milik akun sasaran */
  kegiatanPenugasan: number[];
};

/**
 * Boleh tidaknya akun `sasaran` direset PIN-nya oleh `aktor`. null = boleh.
 * - Admin Aplikasi (`adminAplikasi`) boleh mereset siapa pun (kecuali dirinya, diperiksa pemanggil).
 * - Lainnya: sasaran bukan admin dan bukan pemegang izin `kelola` apa pun; bila lingkup aktor bukan "semua",
 *   sasaran harus punya penugasan aktif di kegiatan yang boleh dikelola aktor.
 */
export function periksaSasaranReset(aktor: { adminAplikasi: boolean; lingkup: LingkupKegiatan }, sasaran: SasaranReset): GalatAturan | null {
  if (!sasaran.aktif) return { error: "Akun ini tidak aktif.", status: 409 };
  if (aktor.adminAplikasi) return null;
  if (sasaran.peranKode.some((k) => PERAN_PIN_TERLINDUNGI.includes(k)) || sasaran.punyaIzinKelola) {
    return { error: "PIN akun admin atau pengelola hanya dapat direset oleh Admin Aplikasi.", status: 403 };
  }
  const l = aktor.lingkup;
  if (l === "semua") return null;
  const ada = sasaran.kegiatanPenugasan.some((k) => l.includes(k));
  if (!ada) return { error: "Akun ini tidak bertugas di kegiatan yang Anda kelola.", status: 403 };
  return null;
}

// ---------------------------------------------------------------- 2. Hak

/** Mengubah izin satu peran (menu + level). null = boleh. */
export function periksaUbahIzin(p: { adminAplikasi: boolean; peranDipegang: number[]; peranId: number; menu: string }): GalatAturan | null {
  if (p.adminAplikasi) return null;
  if (p.peranDipegang.includes(p.peranId)) return { error: "Anda tidak dapat mengubah izin peran yang Anda pegang sendiri. Minta Admin Aplikasi.", status: 403 };
  if (MENU_HAK_TERTINGGI.includes(p.menu)) return { error: "Izin menu Kelola Aplikasi dan Kelola Peran & Akses hanya dapat diubah Admin Aplikasi.", status: 403 };
  return null;
}

/** Memberi peran kepada akun. `menuPeran` = kode menu yang dipegang peran itu. null = boleh. */
export function periksaBeriPeran(p: { adminAplikasi: boolean; aktorId: number; akunId: number; menuPeran: string[] }): GalatAturan | null {
  if (p.adminAplikasi) return null;
  if (p.aktorId === p.akunId) return { error: "Anda tidak dapat memberi peran kepada akun Anda sendiri. Minta Admin Aplikasi.", status: 403 };
  if (p.menuPeran.some((m) => MENU_HAK_TERTINGGI.includes(m))) return { error: "Peran yang memuat izin Kelola Aplikasi atau Kelola Peran & Akses hanya dapat diberikan Admin Aplikasi.", status: 403 };
  return null;
}

/**
 * Memberi atau mencabut peran pada kegiatan `kegiatanId` (null = peran berlaku untuk semua kegiatan). Pemegang `akses.kelola` berlingkup hanya boleh
 * mengurus peran pada kegiatan dalam lingkupnya; peran tanpa kegiatan hanya oleh pengelola akses berlingkup semua. null = boleh.
 * (Celah yang ditemukan saat uji produksi P2: PJ kegiatan 2 dapat memberi `pengelola_psp` kegiatan 1.)
 */
export function periksaLingkupPeran(p: { adminAplikasi: boolean; izin: PetaIzin; kegiatanId: number | null }): GalatAturan | null {
  if (p.adminAplikasi) return null;
  const x = p.izin["akses.kelola"];
  if (!x || x.level !== "kelola") return { error: "Tidak punya izin Kelola Peran & Akses.", status: 403 };
  if (x.semua) return null;
  if (p.kegiatanId == null) return { error: "Peran tanpa kegiatan (berlaku untuk semua kegiatan) hanya dapat diurus pengelola akses yang berlingkup semua kegiatan.", status: 403 };
  if (!x.kegiatan.includes(p.kegiatanId)) return { error: "Kegiatan ini di luar lingkup Anda.", status: 403 };
  return null;
}

// ---------------------------------------------------------------- 3. Saring per kegiatan

/** Boleh `kelola` pada kegiatan `kegiatanId` lewat menu `menu`? (lingkup izin ikut dihitung) */
export function bolehKelolaKegiatan(izin: PetaIzin, menu: string, kegiatanId: number): boolean {
  const x = izin[menu];
  if (!x || x.level !== "kelola") return false;
  return x.semua || x.kegiatan.includes(kegiatanId);
}

/**
 * Menyaring data admin berbentuk `{ kegiatan: {id}[], konfig: Record<id, ...>, ...lain }` ke kegiatan yang terlihat menurut izin menu.
 * Lingkup "semua" = data apa adanya.
 */
export function saringPerKegiatan<T extends { kegiatan: { id: number }[]; konfig: Record<string, unknown> }>(data: T, izin: PetaIzin, menu: string): T {
  const l = lingkup(izin, menu);
  if (l === "semua") return data;
  const boleh = new Set(l);
  const konfig: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data.konfig)) if (boleh.has(Number(k))) konfig[k] = v;
  return { ...data, kegiatan: data.kegiatan.filter((k) => boleh.has(Number(k.id))), konfig };
}
