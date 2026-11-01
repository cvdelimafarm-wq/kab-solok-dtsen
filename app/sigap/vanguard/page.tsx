// app/sigap/vanguard/page.tsx
//
// (1 Nov 2026) VANGUARD V2b: halaman simulasi pengisian kuesioner KP (VSEN26.KP). Dua pintu masuk (keputusan Iqbal 1 Nov):
//   /sigap/vanguard                 = simulasi bebas dari kartu promosi di Beranda (semua pengguna): penilaian di perangkat, TIDAK dicatat;
//   /sigap/vanguard?k=ID&dari=PATH  = dari kartu di tab Hari Ini kegiatan yang menyalakan Vanguard: percobaan dicatat di server (api/sigap/vanguard).
// "?dari=" = jalan pulang ("Kembali ke SIGAP"), hanya jalur internal (lib/vanguard/navigasi.ts).

import { Suspense } from "react";
import Vanguard from "./Vanguard";

export const dynamic = "force-dynamic";

export default function HalamanVanguard() {
  return (
    <Suspense fallback={null}>
      <Vanguard />
    </Suspense>
  );
}
