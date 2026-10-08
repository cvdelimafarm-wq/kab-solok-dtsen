"use client";

// app/components/PingAplikasi.tsx
//
// (8 Okt 2026) Pemantauan pemasangan aplikasi (permintaan user: "apakah ada monitoring siapa yang sudah install?"). Saat SIGAP dibuka oleh akun yang sudah masuk,
// HP melapor ke /api/sigap/ping: "aplikasi" (dibuka dari ikon layar utama) atau "browser" (tab biasa). Dibatasi sekali per 30 menit per mode.
// Hanya mengirim jenis mode & platform HP; tanpa lokasi atau data pribadi. Kegagalan diabaikan.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { modeAplikasi } from "@/lib/sigapGerbangApp";
import { bacaSesi } from "@/app/portal/sesi";

const JEDA_MS = 30 * 60_000;

function platform(): "android" | "ios" | "lain" {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "lain";
}

async function lapor() {
  try {
    const sesi = bacaSesi();
    if (!sesi) return;
    const aplikasi = modeAplikasi({
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      fullscreenAtauMinimal: window.matchMedia("(display-mode: fullscreen)").matches || window.matchMedia("(display-mode: minimal-ui)").matches,
      iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
      referrer: document.referrer,
    });
    const mode = aplikasi ? "aplikasi" : "browser";
    const kunci = `sigap_ping_${mode}`;
    const terakhir = Number(localStorage.getItem(kunci) ?? 0);
    if (Date.now() - terakhir < JEDA_MS) return;
    localStorage.setItem(kunci, String(Date.now()));
    await fetch("/api/sigap/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesi}` },
      body: JSON.stringify({ mode, platform: platform() }),
      keepalive: true,
    });
  } catch {
    /* abaikan */
  }
}

export default function PingAplikasi() {
  const pathname = usePathname();
  useEffect(() => {
    lapor();
  }, [pathname]);
  useEffect(() => {
    const c = () => document.visibilityState === "visible" && lapor();
    document.addEventListener("visibilitychange", c);
    return () => document.removeEventListener("visibilitychange", c);
  }, []);
  return null;
}
