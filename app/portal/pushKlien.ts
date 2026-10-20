// app/portal/pushKlien.ts  (hanya klien)
//
// (8 Okt 2026) Notifikasi push SIGAP -- sisi browser: cek dukungan, minta izin, daftarkan perangkat ke server, uji, matikan.
// Server: /api/sigap/push. Service worker: /sw.js (event push & notificationclick).

import { apiPortal, bacaLihatSebagai } from "./sesi";

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

// (20 Okt 2026) Setiap langkah diberi batas waktu: di HP tertentu (sinyal lemah, layanan Google/penyimpan lambat) sebuah langkah bisa menggantung
// selamanya sehingga tombol "Aktifkan" tampak tidak bekerja. Kini selalu berakhir dengan pesan yang menunjuk langkah yang macet.
const BATAS_SERVER_MS = 15_000;
const BATAS_IZIN_MS = 45_000;
const BATAS_SW_MS = 12_000;
const BATAS_LANGGANAN_MS = 20_000;

export function denganBatas<T>(p: Promise<T>, ms: number, pesan: string): Promise<T> {
  return new Promise<T>((ok, gagal) => {
    const t = setTimeout(() => gagal(new Error(pesan)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      (e) => {
        clearTimeout(t);
        gagal(e);
      }
    );
  });
}

async function registrasi(): Promise<ServiceWorkerRegistration> {
  const r = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await denganBatas(navigator.serviceWorker.ready, BATAS_SW_MS, "Layanan notifikasi belum siap. Tutup lalu buka ulang aplikasi SIGAP, kemudian coba lagi.");
  return r;
}

async function kirimLangganan(sub: PushSubscription) {
  await denganBatas(apiPortal("/api/sigap/push", { method: "POST", body: JSON.stringify({ aksi: "daftar", langganan: sub.toJSON() }) }), BATAS_SERVER_MS, "Server tidak menjawab saat mendaftarkan HP. Periksa sinyal lalu coba lagi.");
}

/**
 * Keadaan notifikasi di perangkat ini. Bila izin sudah diberikan sebelumnya, langganan disinkronkan diam-diam
 * (mengaitkan perangkat ke akun yang sedang masuk, dan memperbarui langganan yang kedaluwarsa).
 */
export async function bacaStatusPush(): Promise<{ status: StatusPush; perangkat: number }> {
  // (10 Okt 2026) Mode "masuk sebagai" (akun super melihat tampilan petugas): JANGAN sinkronkan langganan -- kirimLangganan()
  // akan mengaitkan HP admin ke akun petugas yang sedang dilihat sehingga pengingat petugas itu mampir ke HP admin.
  // Kartu disembunyikan selama mode ini.
  if (bacaLihatSebagai()) return { status: "tidak_didukung", perangkat: 0 };
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
    // (20 Okt 2026) Pertanyaan izin diminta PALING DULU, sinkron di dalam ketukan. Sebelumnya ada `await` ke server lebih dulu; di HP dengan sinyal
    // lambat gerakan pengguna sudah kedaluwarsa sehingga HP tidak menampilkan pertanyaan izin dan tombol tampak "tidak bisa dipencet".
    const janjiIzin = Notification.requestPermission();
    const info = await denganBatas(apiPortal<InfoServer>("/api/sigap/push"), BATAS_SERVER_MS, "Server tidak menjawab. Periksa sinyal lalu coba lagi.");
    if (!info.siap || !info.publik) return { ok: false, pesan: "Notifikasi belum diaktifkan di server. Hubungi admin." };
    const izin = await denganBatas(janjiIzin, BATAS_IZIN_MS, "HP tidak menampilkan pertanyaan izin. Buka Pengaturan HP → Aplikasi → SIGAP → Notifikasi, aktifkan, lalu kembali ke SIGAP.");
    if (izin !== "granted") {
      return {
        ok: false,
        pesan:
          izin === "denied"
            ? "Izin notifikasi ditolak. Buka Pengaturan HP → Aplikasi → SIGAP → Notifikasi, ubah menjadi Izinkan, lalu kembali ke SIGAP."
            : "Pertanyaan izin tidak muncul atau ditutup. Buka Pengaturan HP → Aplikasi → SIGAP → Notifikasi, aktifkan, lalu kembali ke SIGAP.",
      };
    }
    const reg = await registrasi();
    const sub =
      (await denganBatas(reg.pushManager.getSubscription(), BATAS_LANGGANAN_MS, "Gagal membaca langganan notifikasi. Coba lagi.")) ??
      (await denganBatas(
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciKeBytes(info.publik) as BufferSource }),
        BATAS_LANGGANAN_MS,
        "HP tidak bisa terhubung ke layanan notifikasi (Google). Pastikan internet aktif dan Layanan Google Play berfungsi, lalu coba lagi."
      ));
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
