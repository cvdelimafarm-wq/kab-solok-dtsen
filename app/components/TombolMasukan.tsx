"use client";

// app/components/TombolMasukan.tsx
//
// (28 Okt 2026) Tombol "Masukan" melayang -- permintaan user: pojok kanan atas, bisa diseret, ada menu cadangan.
//  - 40 px, setengah transparan (penuh saat disentuh), di bawah header (bawaan 72 px dari atas) dan di bawah banner "Lihat sebagai".
//  - Bisa diseret; saat dilepas menempel ke tepi kiri/kanan terdekat. Posisi diingat per HP (localStorage, aman bila penyimpanan tidak ada).
//  - Hanya tampil bagi akun yang masuk, di Beranda dan halaman SIGAP (lib/sigapMasukan.ts: tombolTersembunyi). Lapisannya (z-45) di bawah modal (z-50+),
//    kamera, dan peta layar penuh, sehingga tidak pernah menutupi dialog.
//  - Menu cadangan (bila tombol terhalang/tersembunyi): "Kirim masukan" di Beranda (menu umum), sidebar/menu akun SIGAP; halaman /sigap/masukan.
//  - Ketuk membuka lembar geser berisi FormMasukan; tautan ke "Masukan saya".

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { bacaSesi } from "@/app/portal/sesi";
import FormMasukan from "@/app/components/FormMasukan";
import { KUNCI_POSISI, POSISI_BAWAAN, UKURAN_TOMBOL, adalahSeretan, bacaPosisi, letakTombol, posisiDariTitik, tombolTersembunyi, type Posisi } from "@/lib/sigapMasukan";

function bacaBanner(): number {
  try {
    const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--tinggi-banner"), 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export default function TombolMasukan() {
  const jalur = usePathname() || "/";
  const [masuk, setMasuk] = useState(false);
  const [pos, setPos] = useState<Posisi>(POSISI_BAWAAN);
  const [tinggi, setTinggi] = useState(800);
  const [banner, setBanner] = useState(0);
  const [seret, setSeret] = useState<{ x: number; y: number } | null>(null);
  const [buka, setBuka] = useState(false);
  const [halamanAsal, setHalamanAsal] = useState("/");
  const jari = useRef<{ id: number; x0: number; y0: number; gerak: boolean } | null>(null);
  const barusSeret = useRef(false);

  // posisi tersimpan
  useEffect(() => {
    try {
      const p = bacaPosisi(localStorage.getItem(KUNCI_POSISI));
      if (p) setPos(p);
    } catch {
      /* bawaan */
    }
  }, []);

  // sesi (login/keluar terjadi tanpa pindah halaman) -- diperiksa berkala dan saat penyimpanan berubah
  useEffect(() => {
    const cek = () => setMasuk(!!bacaSesi());
    cek();
    const t = setInterval(cek, 2000);
    window.addEventListener("storage", cek);
    return () => {
      clearInterval(t);
      window.removeEventListener("storage", cek);
    };
  }, []);

  // tinggi layar & banner "Lihat sebagai" (diatur BannerLihatSebagai lewat --tinggi-banner)
  useEffect(() => {
    const ukur = () => {
      setTinggi(window.innerHeight);
      setBanner(bacaBanner());
    };
    ukur();
    window.addEventListener("resize", ukur);
    const mo = new MutationObserver(() => setBanner(bacaBanner()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      window.removeEventListener("resize", ukur);
      mo.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!buka) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBuka(false);
    };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, [buka]);

  const lepas = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const j = jari.current;
      jari.current = null;
      if (!j) return;
      try {
        e.currentTarget.releasePointerCapture(j.id);
      } catch {
        /* sudah dilepas */
      }
      if (!j.gerak) return setSeret(null);
      barusSeret.current = true;
      setTimeout(() => (barusSeret.current = false), 80);
      const p = posisiDariTitik(e.clientX, e.clientY - banner, window.innerWidth, window.innerHeight);
      setPos(p);
      setSeret(null);
      try {
        localStorage.setItem(KUNCI_POSISI, JSON.stringify(p));
      } catch {
        /* posisi tidak diingat */
      }
    },
    [banner]
  );

  if (!masuk || tombolTersembunyi(jalur)) return null;

  const letak = letakTombol(pos, tinggi, banner);
  const gaya: React.CSSProperties = seret
    ? { top: Math.min(Math.max(seret.y - UKURAN_TOMBOL / 2, 0), tinggi - UKURAN_TOMBOL), left: Math.max(seret.x - UKURAN_TOMBOL / 2, 0), touchAction: "none" }
    : {
        top: `calc(${letak.top}px + env(safe-area-inset-top, 0px))`,
        ...(letak.left !== undefined ? { left: `calc(${letak.left}px + env(safe-area-inset-left, 0px))` } : { right: `calc(${letak.right}px + env(safe-area-inset-right, 0px))` }),
        touchAction: "none",
      };

  return (
    <>
      <button
        type="button"
        aria-label="Kirim masukan atau laporkan masalah (bisa digeser)"
        title="Kirim masukan"
        data-tombol-masukan
        style={{ ...gaya, width: UKURAN_TOMBOL, height: UKURAN_TOMBOL }}
        className={`fixed z-[45] grid select-none place-items-center rounded-full bg-[#0F2A52] text-white shadow-[0_2px_8px_rgba(15,42,82,.35)] ring-1 ring-white/50 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B400] ${seret ? "opacity-100" : "opacity-60 active:opacity-100"}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          jari.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, gerak: false };
        }}
        onPointerMove={(e) => {
          const j = jari.current;
          if (!j || j.id !== e.pointerId) return;
          if (!j.gerak && adalahSeretan(e.clientX - j.x0, e.clientY - j.y0)) j.gerak = true;
          if (j.gerak) setSeret({ x: e.clientX, y: e.clientY });
        }}
        onPointerUp={lepas}
        onPointerCancel={lepas}
        onClick={() => {
          if (barusSeret.current) return;
          setHalamanAsal(jalur);
          setBuka(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[20px] w-[20px] fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
          <path d="M12 8v4.2M12 15.6v.1" />
        </svg>
      </button>

      {buka && (
        <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="presentation" onClick={() => setBuka(false)}>
          <div role="dialog" aria-modal="true" aria-label="Kirim masukan" className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[20px] bg-[#F5F8FE] p-4 pb-6 text-[#1B2B4B] shadow-xl sm:rounded-[20px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 text-[16px] font-extrabold text-[#0F2A52]">Kirim masukan</h2>
              <Link href={`/sigap/masukan?dari=${encodeURIComponent(halamanAsal)}`} onClick={() => setBuka(false)} className="flex-none text-[12.5px] font-bold text-[#1F5FD1] underline">
                Masukan saya
              </Link>
              <button type="button" onClick={() => setBuka(false)} aria-label="Tutup" className="grid h-10 w-10 flex-none place-items-center rounded-full text-[#4D5B6B] hover:bg-white">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[20px] w-[20px] fill-none stroke-current stroke-2 [stroke-linecap:round]">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <FormMasukan halaman={halamanAsal} autoFokus onSelesai={() => setBuka(false)} />
          </div>
        </div>
      )}
    </>
  );
}
