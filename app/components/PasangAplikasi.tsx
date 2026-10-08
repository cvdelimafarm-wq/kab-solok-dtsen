"use client";

import { useEffect, useState } from "react";
import { EVENT_SIAP_PASANG } from "./DaftarSW";

// (8 Okt 2026) Tombol "Pasang aplikasi SIGAP" -- PWA, permintaan user.
// - Android/Chrome: tombol memanggil dialog pasang bawaan.
// - iPhone (Safari): tidak ada dialog pasang, jadi tampil petunjuk "Bagikan → Tambahkan ke Layar Utama".
// - Sudah dibuka sebagai aplikasi (standalone): tidak tampil apa-apa.

type Mode = "sembunyi" | "tombol" | "ios";

function sudahAplikasi(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function iPhone(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function PasangAplikasi() {
  const [mode, setMode] = useState<Mode>("sembunyi");

  useEffect(() => {
    const perbarui = () => {
      if (sudahAplikasi()) return setMode("sembunyi");
      if (window.__sigapPasang) return setMode("tombol");
      setMode(iPhone() ? "ios" : "sembunyi");
    };
    perbarui();
    window.addEventListener(EVENT_SIAP_PASANG, perbarui);
    return () => window.removeEventListener(EVENT_SIAP_PASANG, perbarui);
  }, []);

  async function pasang() {
    const ev = window.__sigapPasang;
    if (!ev) return;
    await ev.prompt();
    await ev.userChoice.catch(() => null);
    window.__sigapPasang = null; // event hanya bisa dipakai sekali
    setMode("sembunyi");
  }

  if (mode === "sembunyi") return null;

  return (
    <div className="mt-5 flex max-w-xl items-center gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ikon/ikon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      {mode === "tombol" ? (
        <>
          <p className="flex-1 text-[13px] leading-snug text-blue-50">Pasang SIGAP di HP: ikon di layar utama, buka layar penuh.</p>
          <button type="button" onClick={pasang} className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-[13.5px] font-extrabold text-[#0F3D7A] shadow">
            Pasang aplikasi
          </button>
        </>
      ) : (
        <p className="flex-1 text-[13px] leading-snug text-blue-50">
          Pasang SIGAP di iPhone: buka di Safari, ketuk <b>Bagikan</b> (kotak bertanda panah), lalu <b>Tambahkan ke Layar Utama</b>.
        </p>
      )}
    </div>
  );
}
