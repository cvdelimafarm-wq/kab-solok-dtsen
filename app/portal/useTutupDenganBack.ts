"use client";

// app/portal/useTutupDenganBack.ts
//
// (29 Okt 2026) Pakai di setiap modal / layar penuh yang bisa ditutup: selama `aktif` true, tombol Back HP memanggil `tutup`
// (sama dengan ketuk ✕ / Batal). Rincian mekanisme: app/portal/lapisan.ts.
//
// Aturan pakai: panggil di komponen yang BENAR-BENAR dipasang (mount) selama lapisan terbuka, bukan di fungsi yang dipanggil biasa
// (mis. `{LembarLihat()}`), karena hook tidak boleh bersyarat. `tutup` boleh berubah identitas tiap render.

import { useEffect, useRef } from "react";
import { daftarLapisan } from "@/app/portal/lapisan";

export function useTutupDenganBack(aktif: boolean, tutup: () => void) {
  const ref = useRef(tutup);
  useEffect(() => {
    ref.current = tutup;
  });
  useEffect(() => {
    if (!aktif) return;
    return daftarLapisan(() => ref.current());
  }, [aktif]);
}
