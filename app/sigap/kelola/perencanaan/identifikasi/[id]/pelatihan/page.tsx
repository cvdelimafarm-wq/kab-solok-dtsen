"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/pelatihan/page.tsx
//
// (1 Nov 2026) Tahap 4 alur Identifikasi survei: Persiapan pelatihan. Isi: ../Persiapan.tsx.

import { Suspense } from "react";
import Persiapan from "../Persiapan";

export default function Halaman() {
  return (
    <Suspense fallback={null}>
      <Persiapan jenis="pelatihan" />
    </Suspense>
  );
}
