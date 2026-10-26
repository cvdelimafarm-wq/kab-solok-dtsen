// lib/delego/bukti.ts
//
// (26 Okt 2026) Bukti foto laporan harian Delego. Logika murni (tanpa jaringan): jenis gambar dari byte awal, batas ukuran, lokasi berkas di penyimpanan,
// dan bentuk butir bukti pada keu_dlg_laporan.bukti (jsonb, maksimal 5 butir, 3000 karakter seluruhnya).
//
// Butir bukti: teks lama ("nama berkas atau tautan") tetap terbaca; butir baru berupa objek { ket, path }:
//   ket  = keterangan singkat (boleh kosong), path = lokasi berkas di penyimpanan sigap-files (delego/<delegasi>/<hash>.<ext>).
// Basis data tidak diubah: kolom bukti sudah jsonb. Hak melihat foto diperiksa server lewat keu_dlg_saya / keu_dlg_bahan (lihat rute).

export const MAKS_BUTIR = 5;
export const MAKS_BYTE = 6 * 1024 * 1024; // 6 MB sesudah dikompres di HP biasanya < 1 MB
export const MAKS_KET = 120;
export const MAKS_JSON = 3000;

export type JenisGambar = "jpeg" | "png" | "webp";
export const TIPE_ISI: Record<JenisGambar, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const EKSTENSI: Record<JenisGambar, string> = { jpeg: "jpg", png: "png", webp: "webp" };

export type ButirBukti = { ket: string; path: string | null; teks: string };

/** Jenis gambar dari byte awal berkas (nama dan tipe kiriman klien tidak dipercaya). null = bukan jpeg/png/webp. */
export function jenisGambar(b: Uint8Array): JenisGambar | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/** Pesan galat bila ukuran tidak sah, selain itu null. */
export function periksaUkuran(ukuran: number): string | null {
  if (!Number.isFinite(ukuran) || ukuran <= 0) return "Berkas kosong.";
  if (ukuran > MAKS_BYTE) return `Foto terlalu besar (maksimal ${Math.round(MAKS_BYTE / 1024 / 1024)} MB).`;
  return null;
}

export const RE_HASH = /^[0-9a-f]{16,64}$/;

/** Lokasi berkas bukti di penyimpanan. Hash isi (SHA-256, 32 huruf pertama) membuat berkas yang sama tidak tersimpan dua kali. */
export function lokasiBukti(delegasi: number, hash: string, jenis: JenisGambar): string {
  if (!Number.isInteger(delegasi) || delegasi <= 0) throw new Error("delegasi tidak sah");
  if (!RE_HASH.test(hash)) throw new Error("hash tidak sah");
  return `delego/${delegasi}/${hash.slice(0, 32)}.${EKSTENSI[jenis]}`;
}

const RE_PATH = /^delego\/(\d+)\/[0-9a-f]{16,64}\.(jpg|png|webp)$/;

/** Delegasi pemilik path bukti, atau null bila bentuk path tidak sah (mencegah membaca berkas lain di penyimpanan). */
export function delegasiDariPath(path: unknown): number | null {
  if (typeof path !== "string") return null;
  const m = RE_PATH.exec(path);
  return m ? Number(m[1]) : null;
}

export function tipeDariPath(path: string): string {
  return path.endsWith(".png") ? TIPE_ISI.png : path.endsWith(".webp") ? TIPE_ISI.webp : TIPE_ISI.jpeg;
}

/** Membaca satu butir bukti dari basis data (teks lama atau objek baru) menjadi bentuk seragam. */
export function bacaButir(x: unknown): ButirBukti | null {
  if (typeof x === "string") {
    const t = x.trim();
    return t ? { ket: t, path: null, teks: t } : null;
  }
  if (x && typeof x === "object") {
    const o = x as { ket?: unknown; path?: unknown };
    const ket = typeof o.ket === "string" ? o.ket.trim() : "";
    const path = delegasiDariPath(o.path) !== null ? (o.path as string) : null;
    if (!ket && !path) return null;
    return { ket, path, teks: ket || "Foto" };
  }
  return null;
}

export const bacaDaftar = (arr: unknown[] | null | undefined): ButirBukti[] => (arr ?? []).map(bacaButir).filter((b): b is ButirBukti => b !== null);

/** Bentuk untuk disimpan: foto menjadi { ket, path }, teks lama tetap teks. Dipotong ke batas jumlah dan panjang. */
export function untukSimpan(daftar: { ket: string; path: string | null }[]): (string | { ket: string; path: string })[] {
  const hasil: (string | { ket: string; path: string })[] = [];
  for (const b of daftar) {
    const ket = b.ket.trim().slice(0, MAKS_KET);
    if (b.path && delegasiDariPath(b.path) !== null) hasil.push({ ket, path: b.path });
    else if (ket) hasil.push(ket);
    if (hasil.length >= MAKS_BUTIR) break;
  }
  return hasil;
}

/** True bila daftar simpan muat di batas basis data (3000 karakter). */
export const muatDiBatas = (h: unknown[]): boolean => JSON.stringify(h).length <= MAKS_JSON;

/** Semua path foto pada satu daftar bukti basis data. */
export const daftarPath = (arr: unknown[] | null | undefined): string[] => bacaDaftar(arr).flatMap((b) => (b.path ? [b.path] : []));

/** Ukuran sisi terpanjang setelah dikecilkan di HP, mempertahankan rasio; tidak pernah memperbesar. */
export function ukuranKecil(lebar: number, tinggi: number, maks = 1600): { w: number; h: number } {
  const sisi = Math.max(lebar, tinggi);
  if (!(sisi > maks)) return { w: Math.round(lebar), h: Math.round(tinggi) };
  const skala = maks / sisi;
  return { w: Math.max(1, Math.round(lebar * skala)), h: Math.max(1, Math.round(tinggi * skala)) };
}

/** True bila `path` tercatat pada salah satu laporan yang diberikan (laporan yang boleh dilihat akun itu, dari basis data). */
export const ditemukanDiLaporan = (path: string, laporan: { bukti?: unknown[] | null }[] | null | undefined): boolean =>
  (laporan ?? []).some((l) => daftarPath(l.bukti).includes(path));

/** True bila `path` tercatat pada salah satu hasil kerja yang diberikan (hasil yang boleh dilihat akun itu, dari basis data). */
export const ditemukanDiHasil = (path: string, hasil: { butir?: unknown[] | null }[] | null | undefined): boolean =>
  (hasil ?? []).some((h) => daftarPath(h.butir).includes(path));

/** Gabungan: path tercatat pada laporan atau hasil kerja yang boleh dilihat. */
export const ditemukanDiBukti = (path: string, laporan: { bukti?: unknown[] | null }[] | null | undefined, hasil: { butir?: unknown[] | null }[] | null | undefined): boolean =>
  ditemukanDiLaporan(path, laporan) || ditemukanDiHasil(path, hasil);
