// lib/sigapIzinPesan.ts  (murni; dipakai server)
//
// (2 Nov 2026) Tahap G: isi notifikasi push untuk alur buka kunci tahapan (rancangan-pelatihan-5-tab-hierarki 5.6).
//   - diminta   : peserta mengajukan -> panitia + instruktur kelasnya
//   - diputuskan: pengelola menyetujui / menolak -> peserta yang mengajukan
//   - dibuka    : pengelola membuka langsung dari Monitoring -> peserta bersangkutan
// Judul <= 80 huruf, isi <= 240 huruf (batas lib/sigapPushUtil).

import { LABEL_TAHAP, tahapTesValid } from "@/lib/sigapTahapan";
import { tautanPelatihan } from "@/lib/tautanPelatihan";

export type PesanIzin = { judul: string; isi: string; url: string; tag: string };

export const URL_PENGELOLA = "/sigap/pelatihan/hari-ini";
export const URL_PESERTA = "/sigap/pelatihan";
const MAKS_JUDUL = 80;
const MAKS_ISI = 240;

const rapi = (s: string): string => s.replace(/\s+/g, " ").trim();
const potong = (s: string, maks: number): string => (s.length <= maks ? s : `${s.slice(0, Math.max(0, maks - 1)).trimEnd()}…`);
const labelTahap = (tahap: string): string => (tahapTesValid(tahap) ? LABEL_TAHAP[tahap] : "tahapan");
const panggil = (nama: string): string => rapi(nama).split(",")[0].trim() || "Peserta";

/** Peserta mengajukan buka kunci -> untuk panitia / instruktur. */
export function pesanIzinDiminta(nama: string, tahap: string, alasan: string, izinId?: number | null, kegiatanId?: number | null): PesanIzin {
  const t = labelTahap(tahap);
  return {
    judul: potong(`Permintaan buka kunci ${t}`, MAKS_JUDUL),
    isi: potong(`${panggil(nama)} meminta ${t} dibuka. Alasan: ${rapi(alasan)}`, MAKS_ISI),
    url: tautanPelatihan(URL_PENGELOLA, kegiatanId),
    tag: izinId ? `izin-minta-${izinId}` : "izin-minta",
  };
}

/** Keputusan atas permintaan -> untuk peserta yang mengajukan. */
export function pesanIzinDiputuskan(setuju: boolean, tahap: string, oleh: string, izinId?: number | null, kegiatanId?: number | null): PesanIzin {
  const t = labelTahap(tahap);
  const siapa = panggil(oleh);
  return {
    judul: potong(setuju ? `${t} dibuka` : `Permintaan ${t} ditolak`, MAKS_JUDUL),
    isi: potong(
      setuju
        ? `${siapa} menyetujui permintaan Anda. ${t} dapat dikerjakan sampai pukul 23.59 WIB hari ini.`
        : `${siapa} belum dapat membuka ${t}. Selesaikan tahapan sebelumnya, atau hubungi panitia/instruktur.`,
      MAKS_ISI
    ),
    url: tautanPelatihan(URL_PESERTA, kegiatanId),
    tag: izinId ? `izin-putus-${izinId}` : "izin-putus",
  };
}

/** Pengelola membuka langsung -> untuk peserta bersangkutan. */
export function pesanIzinDibuka(tahap: string, oleh: string, akunId?: number | null, kegiatanId?: number | null): PesanIzin {
  const t = labelTahap(tahap);
  return {
    judul: potong(`${t} dibuka untuk Anda`, MAKS_JUDUL),
    isi: potong(`${panggil(oleh)} membuka ${t}. Dapat dikerjakan sampai pukul 23.59 WIB hari ini.`, MAKS_ISI),
    url: tautanPelatihan(URL_PESERTA, kegiatanId),
    tag: akunId ? `izin-buka-${akunId}-${tahap}` : "izin-buka",
  };
}

/** Gabungkan daftar penerima: unik, bilangan bulat positif, tanpa `kecuali` (pelaku sendiri). */
export function gabungPenerimaIzin(daftar: ReadonlyArray<ReadonlyArray<number | null | undefined>>, kecuali: number | null): number[] {
  const s = new Set<number>();
  for (const d of daftar) for (const v of d) if (typeof v === "number" && Number.isInteger(v) && v > 0 && v !== kecuali) s.add(v);
  return [...s].sort((a, b) => a - b);
}
