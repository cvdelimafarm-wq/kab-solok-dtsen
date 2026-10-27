// lib/sigapCacheKerja.ts
//
// (28 Okt 2026) Pembantu murni untuk simpanan data halaman kerja (Transport lokal, dll.): memperlakukan data lama dengan aman dan memberi
// pesan galat yang sama seperti sebelum ada simpanan. Tanpa React/DB supaya bisa diuji.

/** Tautan foto bertanda tangan dari server berlaku 1 jam; data tersimpan lebih tua dari ini tidak boleh menampilkan tautan lamanya. */
export const BATAS_URL_FOTO_MS = 50 * 60_000;

type DenganFoto = { penugasan?: { hari?: { foto?: { url: string | null }[] }[] }[] };

/**
 * Data dari simpanan yang umurnya melewati `batas`: tautan foto dikosongkan (halaman sudah menampilkan petak foto tanpa gambar bila url null),
 * supaya tidak muncul gambar rusak selagi data segar diambil. Lebih muda dari batas -> objek yang sama dikembalikan (tanpa salinan).
 */
export function buangUrlFotoLama<T extends DenganFoto>(data: T, umurMs: number, batas: number = BATAS_URL_FOTO_MS): T {
  if (umurMs <= batas || !data.penugasan) return data;
  return {
    ...data,
    penugasan: data.penugasan.map((p) => (p.hari ? { ...p, hari: p.hari.map((h) => (h.foto ? { ...h, foto: h.foto.map((f) => ({ ...f, url: null })) } : h)) } : p)),
  };
}

/** Tanggal hari ini menurut WIB (YYYY-MM-DD) dari waktu HP. */
export const hariWib = (ms: number): string => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** Simpanan hanya boleh ditampilkan bila disusun untuk hari yang sama (status "hari ini"/"terlewat" bergantung tanggal). */
export const simpananHariIni = (hariDiData: unknown, sekarangMs: number): boolean => typeof hariDiData === "string" && hariDiData === hariWib(sekarangMs);

export type GalatMuat = { sesiTidakSah: boolean; pesan: string };

/** Galat muat halaman kerja -> pesan untuk petugas. status 404 = token tidak dikenal; tanpa status = jaringan; 5xx tanpa pesan server = server sibuk. */
export function galatMuatKerja(e: unknown): GalatMuat {
  const g = e as { status?: number; message?: string } | null;
  const status = typeof g?.status === "number" ? g.status : undefined;
  const pesan = typeof g?.message === "string" ? g.message.trim() : "";
  const pesanServer = pesan !== "" && !/^Gagal \(\d+\)\.?$/.test(pesan);
  if (status === undefined) return { sesiTidakSah: false, pesan: "Koneksi terputus. Periksa sinyal, lalu coba lagi." };
  if (pesanServer) return { sesiTidakSah: status === 404, pesan };
  return { sesiTidakSah: status === 404, pesan: status >= 500 ? "Server sedang sibuk. Coba lagi sebentar lagi." : "Gagal memuat." };
}
