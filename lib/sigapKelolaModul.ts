// lib/sigapKelolaModul.ts
//
// (10 Okt 2026) Daftar modul pengelolaan yang halaman awalnya berupa "daftar kegiatan per kegiatan induk" -- permintaan user:
// "pada kelola pelatihan ... tampilkan dulu list pelatihan berdasarkan kegiatan; demikian juga translok dan proses bisnis yang lain".
// Satu tempat untuk menambah proses bisnis berikutnya (pendataan, evaluasi, anggaran, ...): cukup tambahkan entri di MODUL_KELOLA,
// lalu pasang <DaftarKegiatan modul="..."> di halaman kelolanya. Logika murni (tanpa database) supaya mudah diuji.

import { KODE_KEGIATAN_PELATIHAN } from "./sigapTes";

export type KodeModulKelola = "pelatihan" | "translok";

export type KegiatanRingkas = { id: number; kode: string; nama: string; jenis: string | null; aktif: boolean };

export type ModulKelola = {
  kode: KodeModulKelola;
  /** Nama satuan di daftar, mis. "pelatihan", "kegiatan". */
  satuan: string;
  /** Label jumlah orang, mis. "peserta", "petugas". */
  labelOrang: string;
  /** Menu izin; akun boleh melihat kegiatan bila punya SALAH SATU menu ini (level lihat) untuk kegiatan tsb. */
  menuIzin: string[];
  /** Menu yang menentukan "boleh mengubah" (level kelola). */
  menuKelola: string[];
  /** Kegiatan mana yang termasuk modul ini. */
  cocok: (k: KegiatanRingkas) => boolean;
  /** Halaman kelola sudah bisa membuka kegiatan ini? (modul yang baru mendukung satu kegiatan) */
  tersambung: (k: KegiatanRingkas) => boolean;
};

export const MODUL_KELOLA: Record<KodeModulKelola, ModulKelola> = {
  pelatihan: {
    kode: "pelatihan",
    satuan: "pelatihan",
    labelOrang: "peserta",
    menuIzin: ["pelatihan.kelola"],
    menuKelola: ["pelatihan.kelola"],
    cocok: (k) => k.jenis === "pelatihan",
    // Kelola Pelatihan saat ini baru melayani satu pelatihan.
    tersambung: (k) => k.kode === KODE_KEGIATAN_PELATIHAN,
  },
  translok: {
    kode: "translok",
    satuan: "kegiatan",
    labelOrang: "petugas",
    menuIzin: ["translok.monitoring", "translok.penugasan", "translok.kegiatan", "translok.verifikasi"],
    menuKelola: ["translok.penugasan", "translok.verifikasi"],
    cocok: () => true, // semua kegiatan punya penugasan & transport lokal
    tersambung: () => true,
  },
};

export function modulKelolaValid(x: unknown): x is KodeModulKelola {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(MODUL_KELOLA, x);
}

export type StatusKegiatan = "akan_datang" | "berlangsung" | "selesai" | "nonaktif";

/** Status menurut tanggal (YYYY-MM-DD, WIB). */
export function statusKegiatan(k: { aktif: boolean; tanggal_mulai: string | null; tanggal_selesai: string | null }, hariIni: string): StatusKegiatan {
  if (!k.aktif) return "nonaktif";
  if (k.tanggal_mulai && hariIni < k.tanggal_mulai) return "akan_datang";
  if (k.tanggal_selesai && hariIni > k.tanggal_selesai) return "selesai";
  return "berlangsung";
}

/** Kelompokkan kegiatan per induk (urutan induk dipertahankan); sisanya ke "Kegiatan lainnya". Satu kegiatan hanya masuk satu induk. */
export function kelompokkanPerInduk<T extends { id: number }>(
  kegiatan: T[],
  induk: { kode: string; nama: string; kegiatan_ids: number[] }[],
  namaLainnya: string
): { induk_kode: string | null; induk_nama: string; isi: T[] }[] {
  const sisa = new Set(kegiatan.map((k) => k.id));
  const hasil: { induk_kode: string | null; induk_nama: string; isi: T[] }[] = [];
  for (const i of induk) {
    const isi = kegiatan.filter((k) => i.kegiatan_ids.includes(k.id) && sisa.has(k.id));
    if (isi.length === 0) continue;
    isi.forEach((k) => sisa.delete(k.id));
    hasil.push({ induk_kode: i.kode, induk_nama: i.nama, isi });
  }
  const lain = kegiatan.filter((k) => sisa.has(k.id));
  if (lain.length) hasil.push({ induk_kode: null, induk_nama: namaLainnya, isi: lain });
  return hasil;
}
