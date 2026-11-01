// app/sigap/vanguard/sertifikasi/admin/page.tsx
//
// (1 Nov 2026) VANGUARD V7i: dasbor Sertifikasi untuk BPS Kabupaten Solok (/sigap/vanguard/sertifikasi/admin). Hanya baca; izin dicek di api/sigap/vanguard/sertifikasi/admin.

import { Suspense } from "react";
import DasborSertifikasiHalaman from "./DasborSertifikasi";

export const dynamic = "force-dynamic";

export default function HalamanDasborSertifikasi() {
  return (
    <Suspense fallback={null}>
      <DasborSertifikasiHalaman />
    </Suspense>
  );
}
