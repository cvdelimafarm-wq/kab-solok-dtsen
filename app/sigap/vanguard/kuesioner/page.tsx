// app/sigap/vanguard/kuesioner/page.tsx
//
// (1 Nov 2026) VANGUARD V6d: Mode Kuesioner Penuh (kasus K, Blok IV.1 VSEN26.KP). /sigap/vanguard/kuesioner?kasus=K01&dari=PATH
// Tahap ini latihan saja: penilaian di server, tidak dicatat.

import { Suspense } from "react";
import KuesionerPenuh from "./KuesionerPenuh";

export const dynamic = "force-dynamic";

export default function HalamanKuesionerPenuh() {
  return (
    <Suspense fallback={null}>
      <KuesionerPenuh />
    </Suspense>
  );
}
