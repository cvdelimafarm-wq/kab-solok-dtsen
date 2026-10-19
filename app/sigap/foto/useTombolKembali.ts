"use client";

// app/sigap/foto/useTombolKembali.ts
//
// (20 Okt 2026) Tombol Back HP/peramban saat layar pratinjau/hasil foto terbuka: kembali ke layar kamera (siap memotret lagi), BUKAN keluar ke
// beranda. Caranya: saat `aktif` menyala, satu entri riwayat tambahan didorong; Back membuangnya dan memanggil `onKembali`.
// Bila layar ditutup lewat tombol di aplikasi (Ulangi foto, Foto lagi), entri tambahan itu dibuang lagi supaya Back berikutnya
// tetap keluar normal dari halaman (tidak perlu dua kali tekan). Aman bila halaman ditinggalkan dengan cara lain: entri hanya
// dibuang bila masih berada di entri tambahan itu.

import { useEffect, useRef } from "react";

const PENANDA = "sigapFotoKembali";

/** `onKembali` boleh mengembalikan false = Back diabaikan (mis. foto sedang dikirim): entri tambahan didorong lagi. */
export function useTombolKembali(aktif: boolean, onKembali: () => void | boolean) {
  const panggil = useRef(onKembali);
  panggil.current = onKembali;

  useEffect(() => {
    if (!aktif) return;
    window.history.pushState({ [PENANDA]: 1 }, "");
    let sisa = true; // entri tambahan masih ada
    const popstate = () => {
      if (!sisa) return;
      sisa = false; // Back sudah membuangnya
      if (panggil.current() === false) {
        window.history.pushState({ [PENANDA]: 1 }, "");
        sisa = true;
      }
    };
    window.addEventListener("popstate", popstate);
    return () => {
      window.removeEventListener("popstate", popstate);
      const masihDiEntriKita = (window.history.state as Record<string, unknown> | null)?.[PENANDA] === 1;
      if (sisa && masihDiEntriKita) window.history.back();
    };
  }, [aktif]);
}
