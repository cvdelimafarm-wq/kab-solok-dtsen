"use client";

import { useEffect } from "react";

// (6 Okt 2026) Kirim "detak" aktivitas tiap 60 detik selama tab terlihat -> log login & durasi SIGAP.
// auth: sesi (Bearer) utk portal/admin, atau token akun utk halaman petugas. Gagal kirim diabaikan.
export function useDetak(auth: { sesi?: string | null; token?: string | null }, halaman: string) {
  const { sesi, token } = auth;
  useEffect(() => {
    if (!sesi && !token) return;
    const kirim = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/sigap/aktivitas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(sesi ? { Authorization: `Bearer ${sesi}` } : {}) },
        body: JSON.stringify({ halaman, ...(token ? { token } : {}) }),
        keepalive: true,
      }).catch(() => {});
    };
    kirim();
    const t = setInterval(kirim, 60_000);
    const lihat = () => document.visibilityState === "visible" && kirim();
    document.addEventListener("visibilitychange", lihat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", lihat);
    };
  }, [sesi, token, halaman]);
}
