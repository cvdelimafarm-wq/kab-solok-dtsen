// app/sigap/vanguard/sertifikasi/page.tsx
//
// (1 Nov 2026) VANGUARD V7e: Ujian Sertifikasi kemampuan petugas. /sigap/vanguard/sertifikasi?dari=PATH
// 15 butir acak dan berimbang, angka tiap butir acak, dinilai di server; sertifikat 1–5 bintang hanya kepemilikan (belum berdampak ke mana pun).

import { Suspense } from "react";
import Sertifikasi from "./Sertifikasi";

export const dynamic = "force-dynamic";

export default function HalamanSertifikasi() {
  return (
    <Suspense fallback={null}>
      <Sertifikasi />
    </Suspense>
  );
}
