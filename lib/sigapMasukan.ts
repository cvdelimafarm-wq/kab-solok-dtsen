// lib/sigapMasukan.ts
//
// (28 Okt 2026) Tombol "Masukan" melayang + lembar masukan + menu "Usulan perbaikan" di SIGAP Kelola. Logika murni (tanpa React/DB) supaya bisa diuji:
// validasi isi masukan, merapikan alamat halaman (token di alamat dibuang), posisi tombol yang bisa diseret (menempel ke tepi kiri/kanan),
// kapan tombol disembunyikan, dan urutan/label status usulan.

export const JENIS_MASUKAN = ["galat", "saran", "pertanyaan"] as const;
export type JenisMasukan = (typeof JENIS_MASUKAN)[number];
export const LABEL_JENIS: Record<JenisMasukan, string> = { galat: "Ada yang salah", saran: "Saran perbaikan", pertanyaan: "Pertanyaan" };

export const STATUS_MASUKAN = ["baru", "dibaca", "diproses", "selesai", "ditolak"] as const;
export type StatusMasukan = (typeof STATUS_MASUKAN)[number];
export const LABEL_STATUS: Record<StatusMasukan, string> = { baru: "Baru", dibaca: "Dibaca", diproses: "Diproses", selesai: "Selesai", ditolak: "Tidak diambil" };

export const ISI_MIN = 5;
export const ISI_MAKS = 2000;
export const CATATAN_MAKS = 1000;
/** Batas foto layar (setelah dikecilkan di HP). */
export const GAMBAR_MAKS_BYTE = 3 * 1024 * 1024;
export const GAMBAR_TIPE = ["image/jpeg", "image/png", "image/webp"] as const;

export const adalahJenis = (v: unknown): v is JenisMasukan => typeof v === "string" && (JENIS_MASUKAN as readonly string[]).includes(v);
export const adalahStatus = (v: unknown): v is StatusMasukan => typeof v === "string" && (STATUS_MASUKAN as readonly string[]).includes(v);

/** Teks bebas: CRLF -> LF, karakter kendali dibuang (tab & baris baru tetap), spasi ujung dibuang, baris kosong beruntun dipadatkan. */
export function bersihkanTeks(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Alamat halaman yang disimpan bersama masukan: hanya jalur (tanpa ?query dan #hash), dan potongan yang mirip token (>= 16 karakter huruf/angka,
 * mis. alamat translok/<token>) diganti ":token" supaya token pribadi tidak ikut tersimpan. Maks 120 karakter.
 */
export function rapikanHalaman(v: unknown): string {
  if (typeof v !== "string") return "";
  let p = v.trim();
  const i = p.search(/[?#]/);
  if (i >= 0) p = p.slice(0, i);
  if (!p.startsWith("/")) return "";
  p = p
    .split("/")
    .map((s) => (/^[A-Za-z0-9_-]{16,}$/.test(s) ? ":token" : s))
    .join("/");
  return p.slice(0, 120);
}

export type MasukanBersih = { jenis: JenisMasukan; isi: string; halaman: string; peran: string; versi: string; perangkat: string };

const potong = (v: unknown, n: number) => (typeof v === "string" ? bersihkanTeks(v).replace(/\n/g, " ").slice(0, n) : "");

export function periksaMasukan(m: { jenis?: unknown; isi?: unknown; halaman?: unknown; peran?: unknown; versi?: unknown; perangkat?: unknown }): { ok: true; nilai: MasukanBersih } | { ok: false; pesan: string } {
  if (!adalahJenis(m.jenis)) return { ok: false, pesan: "Pilih jenis masukan." };
  const isi = bersihkanTeks(m.isi);
  if (isi.length < ISI_MIN) return { ok: false, pesan: `Tulis masukan minimal ${ISI_MIN} karakter.` };
  if (isi.length > ISI_MAKS) return { ok: false, pesan: `Masukan terlalu panjang (maks ${ISI_MAKS} karakter).` };
  return { ok: true, nilai: { jenis: m.jenis, isi, halaman: rapikanHalaman(m.halaman), peran: potong(m.peran, 60), versi: potong(m.versi, 40), perangkat: potong(m.perangkat, 160) } };
}

/** Catatan admin boleh kosong (menghapus catatan); dipotong ke batas. */
export function periksaCatatan(v: unknown): string {
  return bersihkanTeks(v).slice(0, CATATAN_MAKS);
}

/** Jalur penyimpanan foto layar: masukan/<akun>/<kode>.<ekstensi>. Kode dari pemanggil (acak). */
export function jalurGambar(akunId: number, kode: string, tipe: string): string {
  const ext = tipe === "image/png" ? "png" : tipe === "image/webp" ? "webp" : "jpg";
  return `masukan/${akunId}/${kode.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}.${ext}`;
}

/** Jalur gambar yang sah untuk diunduh admin (mencegah path lain dibuka lewat kolom ini). */
export const jalurGambarSah = (p: unknown): p is string => typeof p === "string" && /^masukan\/\d+\/[A-Za-z0-9]{6,32}\.(jpg|png|webp)$/.test(p);

/* ------------------------------------------------------------------ tombol melayang ------------------------------------------------------------------ */

export const UKURAN_TOMBOL = 40;
export const TEPI_TOMBOL = 6;
/** Tombol tidak boleh naik ke bawah batas ini (di bawah header/banner) maupun turun ke dekat bilah bawah. */
export const BATAS_ATAS = 64;
export const BATAS_BAWAH = 80;

export type Posisi = { sisi: "kiri" | "kanan"; atas: number };
/** Bawaan: pojok kanan, di bawah header (56px) supaya tidak menutupi tombol header. */
export const POSISI_BAWAAN: Posisi = { sisi: "kanan", atas: 72 };

export const KUNCI_POSISI = "sigap_masukan_posisi_v1";

export function jepitAtas(atas: number, tinggiLayar: number, atasMin = BATAS_ATAS, bawahMin = BATAS_BAWAH): number {
  const maks = Math.max(atasMin, tinggiLayar - bawahMin - UKURAN_TOMBOL);
  if (!Number.isFinite(atas)) return atasMin;
  return Math.min(Math.max(atas, atasMin), maks);
}

/** Dari titik pusat jari (px) -> posisi tersimpan: menempel ke tepi terdekat, tinggi dijepit. */
export function posisiDariTitik(cx: number, cy: number, lebarLayar: number, tinggiLayar: number, atasMin = BATAS_ATAS): Posisi {
  return { sisi: cx < lebarLayar / 2 ? "kiri" : "kanan", atas: jepitAtas(cy - UKURAN_TOMBOL / 2, tinggiLayar, atasMin) };
}

/** Membaca posisi dari teks simpanan; teks rusak/tidak sah -> null (pemanggil memakai bawaan). */
export function bacaPosisi(teks: string | null | undefined): Posisi | null {
  if (!teks) return null;
  try {
    const o = JSON.parse(teks) as { sisi?: unknown; atas?: unknown };
    if ((o.sisi !== "kiri" && o.sisi !== "kanan") || typeof o.atas !== "number" || !Number.isFinite(o.atas)) return null;
    return { sisi: o.sisi, atas: o.atas };
  } catch {
    return null;
  }
}

/** Gaya letak tombol (px): atas dijepit lagi terhadap layar saat ini (layar bisa diputar/berubah), ditambah tinggi banner bila ada. */
export function letakTombol(p: Posisi, tinggiLayar: number, tinggiBanner = 0): { top: number; left?: number; right?: number } {
  const top = jepitAtas(p.atas + tinggiBanner, tinggiLayar, BATAS_ATAS + tinggiBanner);
  return p.sisi === "kiri" ? { top, left: TEPI_TOMBOL } : { top, right: TEPI_TOMBOL };
}

/**
 * Tombol hanya tampil di Beranda ("/") dan halaman SIGAP ("/sigap/..."); tidak di lembar masukan sendiri. Halaman lain (verifikasi publik, aplikasi
 * DTSEN, dst.) bukan urusan SIGAP. Kamera dan penampil layar penuh menutupinya sendiri karena lapisannya (z-index) lebih tinggi.
 */
export function tombolTersembunyi(jalur: string): boolean {
  const p = (jalur.split("?")[0].replace(/\/+$/, "") || "/");
  if (p === "/sigap/masukan") return true;
  return !(p === "/" || p.startsWith("/sigap/"));
}

/** Ketukan vs seretan: jari berpindah lebih dari ambang px dianggap seretan. */
export function adalahSeretan(dx: number, dy: number, ambang = 6): boolean {
  return Math.hypot(dx, dy) > ambang;
}

/* ------------------------------------------------------------------ daftar usulan (admin) ------------------------------------------------------------------ */

export type RingkasMasukan = { jenis: string; status: string };

/** Hitungan per status untuk lencana di halaman Kelola. */
export function hitungStatus(daftar: readonly { status: string }[]): Record<StatusMasukan, number> {
  const h: Record<StatusMasukan, number> = { baru: 0, dibaca: 0, diproses: 0, selesai: 0, ditolak: 0 };
  for (const d of daftar) if (adalahStatus(d.status)) h[d.status]++;
  return h;
}

/** Urutan tampil: yang belum selesai di atas (baru, dibaca, diproses), lalu selesai/ditolak; di dalam kelompok terbaru dulu. */
export function urutkanMasukan<T extends { status: string; dibuat_at: string }>(daftar: readonly T[]): T[] {
  const bobot = (s: string) => (s === "baru" ? 0 : s === "dibaca" ? 1 : s === "diproses" ? 2 : 3);
  return [...daftar].sort((a, b) => bobot(a.status) - bobot(b.status) || (a.dibuat_at < b.dibuat_at ? 1 : a.dibuat_at > b.dibuat_at ? -1 : 0));
}

/** Peralihan status yang diizinkan admin (bebas selama nilainya sah; ditolak/selesai bisa dibuka lagi). */
export const bolehUbahStatus = (ke: unknown): ke is StatusMasukan => adalahStatus(ke);

/** Ringkas perangkat dari user agent: "Android · Chrome" dll; tanpa rincian versi supaya singkat. */
export function ringkasPerangkat(ua: string, mandiri: boolean): string {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "?";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/i.test(ua) ? "Samsung" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "?";
  return `${os} · ${br}${mandiri ? " · aplikasi terpasang" : ""}`;
}
