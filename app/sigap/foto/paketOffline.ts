// app/sigap/foto/paketOffline.ts  (klien)
//
// (23 Okt 2026) Penyimpanan paket token Kamera SIGAP di HP (localStorage, satu paket per akun) + pengambilan saat ada sinyal.
// Logika murni ada di lib/sigapPaketOffline.ts. Semua fungsi di sini best-effort: gagal = diam, kamera tetap jalan seperti sebelumnya.

import { pemilikSesi } from "@/app/portal/sesi";
import { ambilJson } from "./klien";
import { ambilDariPaket, paketDariJawaban, perluPaketBaru, type PaketHp } from "@/lib/sigapPaketOffline";

const KUNCI = (akun: number) => `sigap-foto-paket:${akun}`;
let sedangMengambil = false;

function baca(akun: number): PaketHp | null {
  try {
    const mentah = localStorage.getItem(KUNCI(akun));
    if (!mentah) return null;
    const p = JSON.parse(mentah) as PaketHp;
    return p && Array.isArray(p.tokens) && p.akun_id === akun ? p : null;
  } catch {
    return null;
  }
}
function simpan(akun: number, p: PaketHp) {
  try {
    localStorage.setItem(KUNCI(akun), JSON.stringify(p));
  } catch {
    /* penyimpanan penuh/dimatikan: tanpa paket, perilaku lama (kuning tanpa verifikasi waktu) */
  }
}

/** Jumlah token paket yang masih ada (untuk petunjuk di layar). */
export function sisaTokenPaket(): number {
  const akun = pemilikSesi();
  return akun ? baca(akun)?.tokens.length ?? 0 : 0;
}

let sudahMinta = false;

/**
 * Memastikan service worker terdaftar (untuk petugas yang belum mengaktifkan notifikasi, SW belum terdaftar) dan meminta SW menyimpan halaman kamera
 * beserta berkas aplikasinya di HP, supaya Kamera SIGAP bisa dibuka dari awal tanpa sinyal. Sekali per muat halaman; best-effort.
 */
export async function siapkanHalamanKamera(): Promise<void> {
  if (sudahMinta || typeof navigator === "undefined" || !("serviceWorker" in navigator) || navigator.onLine === false) return;
  sudahMinta = true;
  try {
    const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
    const sw = reg.active ?? (await navigator.serviceWorker.ready).active;
    sw?.postMessage({ tipe: "simpan-halaman-kamera" });
  } catch {
    sudahMinta = false; // coba lagi pada pemanggilan berikutnya
  }
}

/** Ambil paket baru bila perlu. Dipanggil saat kamera dibuka, saat sinyal kembali, dan berkala. Aman dipanggil tanpa sinyal. */
export async function siapkanPaket(): Promise<void> {
  const akun = pemilikSesi();
  if (!akun || sedangMengambil) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  void siapkanHalamanKamera();
  if (!perluPaketBaru(baca(akun), akun, Date.now())) return;
  sedangMengambil = true;
  try {
    const mono = performance.now();
    const wall = Date.now();
    const j = await ambilJson<{ t: number; tokens: string[] }>("/api/sigap/foto/paket");
    const p = paketDariJawaban(j, akun, wall, mono, performance.timeOrigin);
    if (p) simpan(akun, p);
  } catch {
    /* tanpa sinyal / server: coba lagi nanti */
  } finally {
    sedangMengambil = false;
  }
}

/** Mengambil satu token paket untuk foto yang dipotret sekarang (tanpa sinyal). null = tidak ada paket yang sah. */
export function ambilTokenPaket(): { token: string; mono: number | null; wall: number } | null {
  const akun = pemilikSesi();
  if (!akun) return null;
  const r = ambilDariPaket(baca(akun), akun, Date.now(), performance.now(), performance.timeOrigin);
  if (!r) return null;
  simpan(akun, r.paket);
  return { token: r.token, mono: r.elapsed_mono, wall: r.elapsed_wall };
}
