// lib/lokasiMitra.ts  (logika murni, tanpa DB/React)
//
// (31 Okt 2026) Layar "Lengkapi lokasi rumah" untuk Mitra Kepka (tujuan kartu emas "perlu lokasi" di Beranda dan tautan di halaman seleksi).
// Mitra yang titik domisilinya belum ada TIDAK bisa dinilai syarat jarak/domisili seleksi, jadi tidak bisa mendaftar. Layar ini hanya MELENGKAPI:
//   - titik rumah (GPS) diisi bila belum ada titik sah; titik yang sudah tercatat (termasuk yang berasal dari data Kepka) tidak bisa ditimpa
//     sendiri oleh Mitra -- mengubahnya lewat admin (mencegah titik dipindah demi memenuhi syarat jarak);
//   - kecamatan domisili diisi bila kosong; kecamatan yang sudah tercatat tidak diubah.
// Titik dari layar ini bersumber SUMBER_LOKASI_MANDIRI dan TIDAK menandai verifikasi (verif_at tetap kosong) -> status "berkoordinat".

import { dalamKotak } from "@/lib/pendataan";
import { titikSah } from "@/lib/penggunaPool";

export const SUMBER_LOKASI_MANDIRI = "gps mandiri (layar lokasi)";
/** Akurasi GPS terburuk yang boleh disimpan sebagai titik rumah (meter); selaras MAKS_AKURASI_M di foto kamera. */
export const MAKS_AKURASI_SIMPAN_M = 300;
/** Akurasi yang masih disarankan diulang (meter): di atas ini tampil saran pindah ke tempat terbuka, tetap boleh disimpan sampai batas di atas. */
export const AKURASI_BAIK_M = 100;

/** Cadangan bila daftar kecamatan dari bencana_wilayah gagal dibaca. */
export const KECAMATAN_SOLOK = [
  "BUKIT SUNDI", "DANAU KEMBAR", "GUNUNG TALANG", "HILIRAN GUMANTI", "IX KOTO SUNGAI LASI", "JUNJUNG SIRIH", "KUBUNG",
  "LEMBAH GUMANTI", "LEMBANG JAYA", "PANTAI CERMIN", "PAYUNG SEKAKI", "TIGO LURAH", "X KOTO DIATAS", "X KOTO SINGKARAK",
] as const;

const rapi = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** Tujuan "kembali" hanya jalur internal aplikasi (cegah open redirect). Selain itu null. */
export function tujuanKembali(mentah: unknown): string | null {
  if (typeof mentah !== "string") return null;
  const t = mentah.trim();
  if (t === "/") return "/";
  return /^\/sigap\/[A-Za-z0-9\-_/.]{1,120}$/.test(t) && !t.includes("//") && !t.includes("..") ? t : null;
}

/** Alamat layar lokasi, dengan tujuan kembali bila sah. */
export function alamatLokasi(kembali?: string | null): string {
  const k = tujuanKembali(kembali ?? null);
  return k ? `/sigap/lokasi-saya?kembali=${encodeURIComponent(k)}` : "/sigap/lokasi-saya";
}

export type KeadaanLokasi = { lat: number | null; lng: number | null; kecamatan: string | null };
export type KebutuhanLokasi = { titik: boolean; kecamatan: boolean };

/** Apa yang masih perlu dilengkapi Mitra. Kosong semuanya = lokasi sudah lengkap. */
export function kebutuhanLokasi(k: KeadaanLokasi): KebutuhanLokasi {
  return { titik: !titikSah(k.lat, k.lng), kecamatan: rapi(k.kecamatan) === "" };
}

export type IsiSimpanLokasi = { lat?: unknown; lng?: unknown; akurasi?: unknown; kecamatan?: unknown };
export type NilaiSimpanLokasi = { titik: { lat: number; lng: number; akurasi_m: number } | null; kecamatan: string | null };

const enam = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Memeriksa isi simpan terhadap kebutuhan. Hanya bagian yang dibutuhkan yang boleh dikirim:
 * titik yang sudah ada / kecamatan yang sudah ada tidak boleh ditimpa (galat), dan bagian yang dibutuhkan wajib ada.
 */
export function periksaSimpanLokasi(isi: unknown, perlu: KebutuhanLokasi, kecamatanSah: readonly string[]): { ok: true; nilai: NilaiSimpanLokasi } | { ok: false; pesan: string } {
  if (!perlu.titik && !perlu.kecamatan) return { ok: false, pesan: "Lokasi Anda sudah lengkap. Untuk mengubahnya, hubungi admin." };
  const o = (isi ?? {}) as IsiSimpanLokasi;
  const kirimTitik = o.lat !== undefined || o.lng !== undefined;
  const kirimKec = typeof o.kecamatan === "string" && o.kecamatan.trim() !== "";

  let titik: NilaiSimpanLokasi["titik"] = null;
  if (kirimTitik) {
    if (!perlu.titik) return { ok: false, pesan: "Titik rumah Anda sudah tercatat. Untuk mengubahnya, hubungi admin." };
  }
  if (perlu.titik) {
    const { lat, lng, akurasi } = o;
    if (typeof lat !== "number" || typeof lng !== "number" || !titikSah(lat, lng)) return { ok: false, pesan: "Titik lokasi belum terbaca. Ambil lokasi dulu." };
    if (!dalamKotak(lat, lng)) return { ok: false, pesan: "Titik berada di luar wilayah Kabupaten Solok. Pastikan Anda berada di rumah, lalu ambil lokasi lagi." };
    if (typeof akurasi !== "number" || !Number.isFinite(akurasi) || akurasi < 0) return { ok: false, pesan: "Akurasi GPS tidak terbaca. Ambil lokasi lagi." };
    if (akurasi > MAKS_AKURASI_SIMPAN_M) return { ok: false, pesan: `Akurasi GPS ±${Math.round(akurasi)} m terlalu kasar (maksimal ${MAKS_AKURASI_SIMPAN_M} m). Pindah ke tempat terbuka lalu ambil lokasi lagi.` };
    titik = { lat: enam(lat), lng: enam(lng), akurasi_m: Math.round(akurasi) };
  }

  let kecamatan: string | null = null;
  if (kirimKec && !perlu.kecamatan) return { ok: false, pesan: "Kecamatan Anda sudah tercatat. Untuk mengubahnya, hubungi admin." };
  if (perlu.kecamatan) {
    if (!kirimKec) return { ok: false, pesan: "Pilih kecamatan tempat tinggal Anda." };
    const pilih = rapi(o.kecamatan as string);
    const cocok = kecamatanSah.find((x) => rapi(x) === pilih);
    if (!cocok) return { ok: false, pesan: "Kecamatan tidak dikenal. Pilih dari daftar." };
    kecamatan = rapi(cocok);
  }
  return { ok: true, nilai: { titik, kecamatan } };
}

/** Tautan untuk memeriksa titik di peta (dibuka di tab baru). */
export const tautanPeta = (lat: number, lng: number): string => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
