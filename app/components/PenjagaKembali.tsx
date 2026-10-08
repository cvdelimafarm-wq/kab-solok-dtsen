"use client";

// app/components/PenjagaKembali.tsx
//
// (8 Okt 2026) Tombol Back (HP) -- permintaan user: "tombol back sering terlalu jauh atau malah keluar dari aplikasi". Tiga perbaikan:
//  1. Jejak halaman (sessionStorage) supaya tombol panah di header tahu apakah cukup "kembali" atau harus "ganti ke induk" (riwayat tidak menumpuk).
//  2. Aplikasi terpasang dibuka langsung di halaman dalam (mis. dari notifikasi, riwayat kosong): induknya disisipkan ke riwayat, sehingga Back
//     naik satu layer (Layer 3 -> Layer 2 -> Beranda) dan tidak langsung keluar aplikasi.
//  3. Di Beranda (aplikasi terpasang): Back pertama hanya menampilkan "Tekan sekali lagi untuk keluar"; Back kedua dalam 2 detik baru keluar.
// Logika murni: lib/sigapNavigasi.ts. Bukan keamanan data, hanya kenyamanan navigasi.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { leluhur, perbaruiJejak } from "@/lib/sigapNavigasi";
import { modeAplikasi } from "@/lib/sigapGerbangApp";
import { bacaSesi } from "@/app/portal/sesi";
import { bacaJejak, simpanJejak } from "@/app/portal/navigasi";

function sebagaiAplikasi(): boolean {
  try {
    return modeAplikasi({
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      fullscreenAtauMinimal: window.matchMedia("(display-mode: fullscreen)").matches || window.matchMedia("(display-mode: minimal-ui)").matches,
      iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
      referrer: document.referrer,
    });
  } catch {
    return false;
  }
}

type StateJaga = { sigapJaga?: number } | null;

export default function PenjagaKembali() {
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState(false);
  const merakit = useRef(false); // sedang menyisipkan induk ke riwayat: jangan catat jejak
  const siap = useRef(false);
  const armed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1 + 2. Jejak halaman & penyisipan induk
  useEffect(() => {
    if (!pathname || merakit.current) return;
    const lama = bacaJejak();
    simpanJejak(perbaruiJejak(lama, pathname));
    if (siap.current || lama.length > 0) {
      siap.current = true;
      return;
    }
    siap.current = true;
    // halaman pertama sesi ini; di aplikasi terpasang & sudah masuk -> sisipkan induk
    if (!sebagaiAplikasi() || !bacaSesi()) return;
    const rantai = leluhur(pathname);
    if (rantai.length === 0) return;
    const tujuan = window.location.pathname + window.location.search + window.location.hash;
    merakit.current = true;
    router.replace(rantai[0]);
    const urut = [...rantai.slice(1), tujuan];
    urut.forEach((h, i) => setTimeout(() => router.push(h), 120 * (i + 1)));
    setTimeout(() => {
      simpanJejak([...rantai, pathname]);
      merakit.current = false;
    }, 120 * (urut.length + 2));
  }, [pathname, router]);

  // 3. Beranda: Back dua kali untuk keluar
  useEffect(() => {
    if (pathname !== "/" || !sebagaiAplikasi()) return;
    const st = window.history.state as StateJaga;
    if (!st?.sigapJaga) window.history.pushState({ ...(st ?? {}), sigapJaga: 1 }, "", window.location.href);
    const onPop = (e: PopStateEvent) => {
      if ((e.state as StateJaga)?.sigapJaga) return; // mendarat di penjaga lama
      if (window.location.pathname !== "/") return;
      if (armed.current) {
        armed.current = false;
        window.history.back(); // Back kedua: biarkan keluar
        return;
      }
      armed.current = true;
      setToast(true);
      window.history.pushState({ ...(window.history.state ?? {}), sigapJaga: 1 }, "", window.location.href);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        armed.current = false;
        setToast(false);
      }, 2000);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [pathname]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-8 z-[90] flex justify-center px-4">
      <span className="rounded-full bg-[#0F2A52] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(15,42,82,.35)]">Tekan sekali lagi untuk keluar</span>
    </div>
  );
}
