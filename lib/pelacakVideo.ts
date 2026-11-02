// lib/pelacakVideo.ts  (murni; dipakai klien pemutar video)
//
// (2 Nov 2026) Tahap C: perekam bagian video yang BENAR-BENAR diputar. Dipanggil tiap ~1 detik oleh pemutar YouTube. Tidak tahu apa pun tentang React / YouTube sehingga dapat diuji.
// Aturan: bagian dihitung hanya saat sedang memutar, tab terlihat, dan kecepatan <= 1,25x. Lompatan posisi (geser / seek) menutup bagian lama dan memulai yang baru tanpa menghitung lompatannya.

import { LAJU_MAKS, MAKS_SEGMEN_LAPORAN, type Segmen } from "./sigapMateri";

export const LONCAT_DETIK = 3; // selisih posisi antar-tik di atas ini dianggap lompatan
export const MIN_SEGMEN = 1; // bagian lebih pendek dari 1 detik dibuang

export type Pelacak = {
  /** awal bagian yang sedang terbuka (null = tidak sedang merekam) */
  mulai: number | null;
  /** posisi terakhir yang tercatat pada bagian terbuka */
  terakhir: number | null;
  /** bagian yang sudah ditutup tetapi belum terkirim */
  tunda: Segmen[];
};

export const pelacakBaru = (): Pelacak => ({ mulai: null, terakhir: null, tunda: [] });

const tutup = (p: Pelacak): Pelacak => {
  if (p.mulai !== null && p.terakhir !== null && p.terakhir - p.mulai >= MIN_SEGMEN) return { mulai: null, terakhir: null, tunda: [...p.tunda, [p.mulai, p.terakhir]] };
  return { mulai: null, terakhir: null, tunda: p.tunda };
};

/**
 * Satu tik pemutar. `posisi` detik, `memutar` = status PLAYING, `terlihat` = tab terlihat, `laju` = kecepatan putar.
 * Mengembalikan keadaan baru (tidak mengubah masukan).
 */
export function tikPelacak(p: Pelacak, posisi: number, memutar: boolean, terlihat: boolean, laju: number): Pelacak {
  if (!Number.isFinite(posisi) || posisi < 0) return tutup(p);
  if (!memutar || !terlihat || laju > LAJU_MAKS + 0.001) return tutup(p);
  if (p.mulai === null || p.terakhir === null) return { mulai: posisi, terakhir: posisi, tunda: p.tunda };
  // mundur atau melompat jauh: tutup bagian lama, mulai yang baru di posisi sekarang
  if (posisi < p.terakhir - 0.5 || posisi - p.terakhir > LONCAT_DETIK) return { ...tutup(p), mulai: posisi, terakhir: posisi };
  return { mulai: p.mulai, terakhir: Math.max(p.terakhir, posisi), tunda: p.tunda };
}

/**
 * Mengambil bagian yang siap dikirim: semua bagian tertutup + bagian terbuka sampai posisi terakhir (bagian terbuka tetap berjalan: awalnya dimajukan).
 * `paksaTutup` menutup bagian terbuka (mis. saat jeda / selesai / tab disembunyikan). Paling banyak MAKS_SEGMEN_LAPORAN bagian; sisanya tetap menunggu.
 */
export function ambilLaporan(p: Pelacak, paksaTutup = false): { kirim: Segmen[]; sisa: Pelacak } {
  let k = paksaTutup ? tutup(p) : p;
  const siap: Segmen[] = [...k.tunda];
  let mulai = k.mulai;
  if (mulai !== null && k.terakhir !== null && k.terakhir - mulai >= MIN_SEGMEN) {
    siap.push([mulai, k.terakhir]);
    mulai = k.terakhir;
  }
  const kirim = siap.slice(0, MAKS_SEGMEN_LAPORAN);
  const tertinggal = siap.slice(MAKS_SEGMEN_LAPORAN);
  return { kirim, sisa: { mulai, terakhir: k.terakhir, tunda: tertinggal } };
}

/** Pengiriman gagal: kembalikan bagian ke antrean supaya tidak hilang (tahan koneksi putus). Antrean dibatasi agar memori tidak membengkak. */
export function kembalikan(p: Pelacak, gagal: readonly Segmen[], batas = 60): Pelacak {
  return { ...p, tunda: [...gagal, ...p.tunda].slice(-batas) };
}
