"use client";

// app/sigap/PemblokirSesi.tsx
//
// (9 Nov 2026) MODAL PEMBLOKIR untuk peserta saat sesi dibuka: Pretest/Posttest yang dimulai instruktur, Vanguard roleplay, dan ruang Adu Sigap.
// Setelan bawaan semua pelatihan (putusan Iqbal). Dipasang di app/sigap/layout.tsx sehingga berlaku di semua halaman SIGAP.
//   - Menutup seluruh layar, tidak bisa ditutup (tanpa tombol tutup, klik latar, atau Esc). Satu-satunya jalan: tombol ke halaman sesinya.
//   - Hilang sendiri saat sesi selesai/ditutup/sudah dikerjakan (server yang memutuskan, dipoll tiap beberapa detik), dan tidak tampil di halaman sesi itu sendiri.
//   - Hanya untuk peserta: panitia, instruktur, dan admin tidak pernah diblokir. Galat jaringan/server = tidak ada modal.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bacaSesi, fetchJson } from "./admin/api";
import { jalurBebasBlokir, sedangDiHalamanSesi, teksModal, type SesiTerbuka } from "@/lib/sigapSesiTerbuka";

const JEDA_MS = 6000;

export default function PemblokirSesi() {
  const jalur = usePathname() ?? "/";
  const [sesi, setSesi] = useState<SesiTerbuka[]>([]);
  const terlihat = useRef<Set<string>>(new Set());
  const bebas = jalurBebasBlokir(jalur);

  useEffect(() => {
    if (bebas) {
      setSesi([]);
      return;
    }
    let hidup = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const muat = async () => {
      if (!hidup) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return void jadwalkan();
      if (bacaSesi()) {
        try {
          const d = await fetchJson<{ sesi?: SesiTerbuka[] }>("/api/sigap/pelatihan/sesi-terbuka");
          if (hidup) setSesi(Array.isArray(d.sesi) ? d.sesi : []);
        } catch {
          /* galat = tidak mengubah keadaan; modal yang sudah tampil tetap sampai server menyatakan selesai */
        }
      } else if (hidup) setSesi([]);
      jadwalkan();
    };
    const jadwalkan = () => {
      if (hidup) timer = setTimeout(() => void muat(), JEDA_MS);
    };
    const saatTampil = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void muat();
      }
    };
    void muat();
    document.addEventListener("visibilitychange", saatTampil);
    window.addEventListener("focus", saatTampil);
    return () => {
      hidup = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", saatTampil);
      window.removeEventListener("focus", saatTampil);
    };
  }, [bebas]);

  const tampil = !bebas && sesi.length > 0 && !sedangDiHalamanSesi(jalur, sesi);
  const utama = sesi[0];

  // getar sekali untuk sesi yang baru muncul
  useEffect(() => {
    if (!tampil || !utama) return;
    if (terlihat.current.has(utama.kunci)) return;
    terlihat.current.add(utama.kunci);
    try {
      navigator.vibrate?.([250, 120, 250]);
    } catch {
      /* tidak didukung */
    }
  }, [tampil, utama]);

  // kunci gulir latar selama modal tampil
  useEffect(() => {
    if (!tampil) return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [tampil]);

  if (!tampil || !utama) return null;
  const t = teksModal(utama);
  const lain = sesi.length - 1;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B1B3A]/80 p-4" role="alertdialog" aria-modal="true" aria-labelledby="blok-judul" aria-describedby="blok-isi" onKeyDown={(e) => e.stopPropagation()}>
      <div className="w-full max-w-[400px] rounded-[22px] bg-white p-5 text-center shadow-2xl">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#FFF4D6] text-[28px]" aria-hidden="true">⏱️</div>
        <b id="blok-judul" className="block text-[19px] font-extrabold leading-snug text-[#0F2A52]">{t.judul}</b>
        <p id="blok-isi" className="mt-2 text-[14.5px] leading-snug text-[#2B3A55]">{t.isi}</p>
        {lain > 0 && <p className="mt-2 text-[12.5px] font-semibold text-[#8A6200]">Ada {lain} sesi lain yang juga dibuka.</p>}
        <Link href={utama.url} autoFocus className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-[14px] bg-[#1F5FD1] px-4 text-[15px] font-extrabold text-white shadow-sm active:bg-[#1A4FB8]">
          {t.tombol}
        </Link>
        <p className="mt-3 text-[11.5px] text-[#6B7A90]">Ada kendala? Hubungi instruktur kelas Anda.</p>
      </div>
    </div>
  );
}
