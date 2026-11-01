"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/pendataan/page.tsx
//
// (1 Nov 2026) Tahap 5 alur Identifikasi survei: Persiapan pendataan. Isi: ../Persiapan.tsx.

import { Suspense } from "react";
import Persiapan from "../Persiapan";

export default function Halaman() {
  return (
    <Suspense fallback={null}>
      <Persiapan jenis="pendataan" />
    </Suspense>
  );
}
