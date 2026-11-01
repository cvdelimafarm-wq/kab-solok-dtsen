// app/sigap/vanguard/dasbor/page.tsx
//
// (1 Nov 2026) VANGUARD V3a: dasbor BPS Kabupaten Solok (/sigap/vanguard/dasbor?kegiatan=ID). Hanya baca; izin dicek di api/sigap/vanguard/admin.
// Sementara berdiri sendiri; tab "Vanguard" di Kelola Pelatihan dan Kelola Pendataan menyusul (berkas panas).

import { Suspense } from "react";
import Dasbor from "./Dasbor";

export const dynamic = "force-dynamic";

export default function HalamanDasborVanguard() {
  return (
    <Suspense fallback={null}>
      <Dasbor />
    </Suspense>
  );
}
