// app/portal/pushKlien.ts  (hanya klien)
//
// (8 Okt 2026) Notifikasi push SIGAP -- sisi browser: cek dukungan, minta izin, daftarkan perangkat ke server, uji, matikan.
// Server: /api/sigap/push. Service worker: /sw.js (event push & notificationclick).

import { apiPortal } from "./sesi";

export type StatusPush = "memuat" | "tidak_didukung" | "perlu_pasang_ios" | "belum_siap_server" | "diblokir" | "belum_aktif" | "aktif";

type InfoServer = { siap: boolean; publik: string | null; perangkat: number };

const adaDukungan = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const iPhoneIPad = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const sudahTerpasang = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Kunci publik VAPID (base64url) -> bytes untuk subscribe(). */
export function kunciKeBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registrasi(): Promise<ServiceWorkerRegistration> {
  const r = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  return r;
}

async function kirimLangganan(sub: PushSubscription) {
  await apiPortal("/api/sigap/push", { method: "POST", body: JSON.stringify({ aksi: "daftar", langganan: sub.toJSON() }) });
}

/**
 * Keadaan notifikasi di perangkat ini. Bila izin sudah diberikan sebelumnya, langganan disinkronkan diam-diam
 * (mengaitkan perangkat ke akun yang sedang masuk, dan memperbarui langganan yang kedaluwarsa).
 */
export async function bacaStatusPush(): Promise<{ status: StatusPush; perangkat: number }> {
  if (!adaDukungan()) return { status: iPhoneIPad() && !sudahTerpasang() ? "perlu_pasang_ios" : "tidak_didukung", perangkat: 0 };
  if (iPhoneIPad() && !sudahTerpasang()) return { status: "perlu_pasang_ios", perangkat: 0 };
  let info: InfoServer;
  try {
    info = await apiPortal<InfoServer>("/api/sigap/push");
  } catch {
    return { status: "tidak_didukung", perangkat: 0 };
  }
  if (!info.siap || !info.publik) return { status: "belum_siap_server", perangkat: info.perangkat };
  if (Notification.permission === "denied") return { status: "diblokir", perangkat: info.perangkat };
  if (Notification.permission !== "granted") return { status: "belum_aktif", perangkat: info.perangkat };
  try {
    const reg = await registrasi();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciKeBytes(info.publik) as BufferSource });
    await kirimLangganan(sub);
    return { status: "aktif", perangkat: Math.max(1, info.perangkat) };
  } catch {
    return { status: "belum_aktif", perangkat: info.perangkat };
  }
}

/** Dipanggil dari tombol (wajib gerakan pengguna agar izin bisa diminta). */
export async function aktifkanPush(): Promise<{ ok: boolean; pesan?: string }> {
  try {
    if (!adaDukungan()) return { ok: false, pesan: "Browser ini belum mendukung notifikasi." };
    const info = await apiPortal<InfoServer>("/api/sigap/push");
    if (!info.siap || !info.publik) return { ok: false, pesan: "Notifikasi belum diaktifkan di server. Hubungi admin." };
    const izin = await Notification.requestPermission();
    if (izin !== "granted") return { ok: false, pesan: izin === "denied" ? "Izin notifikasi ditolak. Buka pengaturan situs di browser dan izinkan notifikasi." : "Izin notifikasi belum diberikan." };
    const reg = await registrasi();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciKeBytes(info.publik) as BufferSource }));
    await kirimLangganan(sub);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengaktifkan notifikasi. Coba lagi." };
  }
}

/** Matikan notifikasi di perangkat ini (langganan dilepas di browser dan dinonaktifkan di server). */
export async function matikanPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await apiPortal("/api/sigap/push", { method: "POST", body: JSON.stringify({ aksi: "batal", endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    /* abaikan */
  }
}

export async function ujiPush(): Promise<{ ok: boolean; pesan: string }> {
  try {
    const r = await apiPortal<{ ok: boolean; terkirim: number; perangkat: number }>("/api/sigap/push", { method: "POST", body: JSON.stringify({ aksi: "uji" }) });
    return { ok: r.terkirim > 0, pesan: r.terkirim > 0 ? "Notifikasi uji terkirim. Periksa bilah notifikasi HP Anda." : "Notifikasi uji tidak sampai. Coba matikan lalu aktifkan lagi." };
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : "Gagal mengirim uji." };
  }
}
