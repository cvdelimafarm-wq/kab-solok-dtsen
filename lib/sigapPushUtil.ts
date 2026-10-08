// lib/sigapPushUtil.ts
//
// (8 Okt 2026) Notifikasi push SIGAP: fungsi MURNI (tanpa database/React) dipakai server & klien --
// validasi langganan dari browser, penyaring alamat layanan push (cegah server dipakai menembak alamat sembarang),
// penyaring pesan & tautan tujuan.

export const MAKS_JUDUL_PUSH = 80;
export const MAKS_ISI_PUSH = 240;
export const MAKS_PENERIMA_PUSH = 300;
export const MAKS_PERANGKAT_PER_AKUN = 10;

/** Layanan push resmi browser (FCM = Chrome/Android/Samsung, Mozilla = Firefox, Apple = Safari, Windows = Edge). */
const HOST_PUSH: RegExp[] = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

/** Alamat langganan hanya boleh https ke layanan push resmi di atas (server memanggil alamat ini saat mengirim). */
export function endpointAman(u: unknown): u is string {
  if (typeof u !== "string" || u.length < 20 || u.length > 1000 || /\s/.test(u)) return false;
  try {
    const p = new URL(u);
    if (p.protocol !== "https:" || p.username || p.password || (p.port && p.port !== "443")) return false;
    return HOST_PUSH.some((r) => r.test(p.hostname));
  } catch {
    return false;
  }
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export type LanggananValid = { endpoint: string; p256dh: string; auth: string };

/** Bentuk `PushSubscription.toJSON()` dari browser. */
export function validasiLangganan(x: unknown): { ok: true; nilai: LanggananValid } | { ok: false; pesan: string } {
  const o = (x ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!endpointAman(o.endpoint)) return { ok: false, pesan: "Alamat layanan notifikasi perangkat tidak dikenal." };
  const p = o.keys?.p256dh;
  const a = o.keys?.auth;
  if (typeof p !== "string" || !B64URL.test(p) || p.length < 80 || p.length > 100) return { ok: false, pesan: "Kunci perangkat tidak valid." };
  if (typeof a !== "string" || !B64URL.test(a) || a.length < 20 || a.length > 30) return { ok: false, pesan: "Kunci perangkat tidak valid." };
  return { ok: true, nilai: { endpoint: o.endpoint, p256dh: p, auth: a } };
}

/** Tautan tujuan notifikasi: hanya path internal ("/sigap/pelatihan"), bukan alamat luar. Kosong -> "/". */
export function urlInternalAman(u: unknown): string | null {
  if (u === undefined || u === null || u === "") return "/";
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (s.length > 200 || !s.startsWith("/") || s.startsWith("//") || /[\\\s\u0000-\u001f]/.test(s)) return null;
  return s;
}

export type PesanPush = { judul: string; isi: string; url: string };

export function validasiPesanPush(x: unknown): { ok: true; nilai: PesanPush } | { ok: false; pesan: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  const judul = typeof o.judul === "string" ? o.judul.replace(/\s+/g, " ").trim() : "";
  const isi = typeof o.isi === "string" ? o.isi.replace(/\r\n?/g, "\n").trim() : "";
  if (!judul) return { ok: false, pesan: "Judul notifikasi wajib diisi." };
  if (!isi) return { ok: false, pesan: "Isi notifikasi wajib diisi." };
  if (judul.length > MAKS_JUDUL_PUSH) return { ok: false, pesan: `Judul maksimal ${MAKS_JUDUL_PUSH} karakter.` };
  if (isi.length > MAKS_ISI_PUSH) return { ok: false, pesan: `Isi maksimal ${MAKS_ISI_PUSH} karakter.` };
  const url = urlInternalAman(o.url);
  if (url === null) return { ok: false, pesan: "Tautan tujuan harus berupa halaman SIGAP (diawali /)." };
  return { ok: true, nilai: { judul, isi, url } };
}

// ---------------------------------------------------------------- bentuk data tab Notifikasi (Kelola Pelatihan)
export type StatusTesPush = "selesai" | "mengerjakan" | "belum";
export type PesertaPush = {
  akun_id: number;
  nama: string;
  kelas: number | null;
  peran: string;
  /** jumlah perangkat aktif yang mengizinkan notifikasi */
  notif: number;
  pretest: StatusTesPush;
  posttest: StatusTesPush;
  /** minimal satu presensi tercatat hari ini (WIB) */
  presensi_hari_ini: boolean;
  /** (8 Okt 2026) pemasangan aplikasi: pernah membuka SIGAP dari ikon layar utama? (sigap_aplikasi_pakai) */
  aplikasi: { terpasang: boolean; terakhir_aplikasi_at: string | null; terakhir_browser_at: string | null; platform: string | null };
};
export type RiwayatPush = { id: number; judul: string; isi: string; url: string | null; jumlah_akun: number; jumlah_perangkat: number; terkirim: number; gagal: number; dibuat_at: string; oleh: string | null };
