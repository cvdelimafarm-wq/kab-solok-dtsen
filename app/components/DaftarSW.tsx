"use client";

import { useEffect } from "react";

// (8 Okt 2026) PWA SIGAP -- permintaan user: daftarkan service worker di semua halaman & tangkap event
// "beforeinstallprompt" sedini mungkin (event ini bisa muncul sebelum tombol Pasang sempat tampil),
// lalu simpan di window agar tombol PasangAplikasi bisa memakainya.

export type EventPasang = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global {
  interface Window {
    __sigapPasang?: EventPasang | null;
  }
}

export const EVENT_SIAP_PASANG = "sigap-siap-pasang";

export default function DaftarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* gagal daftar tidak mengganggu web biasa */
      });
    }
    const tangkap = (e: Event) => {
      e.preventDefault(); // tahan banner bawaan Chrome; tampilkan lewat tombol sendiri
      window.__sigapPasang = e as EventPasang;
      window.dispatchEvent(new Event(EVENT_SIAP_PASANG));
    };
    const terpasang = () => {
      window.__sigapPasang = null;
      window.dispatchEvent(new Event(EVENT_SIAP_PASANG));
    };
    window.addEventListener("beforeinstallprompt", tangkap);
    window.addEventListener("appinstalled", terpasang);
    return () => {
      window.removeEventListener("beforeinstallprompt", tangkap);
      window.removeEventListener("appinstalled", terpasang);
    };
  }, []);
  return null;
}
