"use client";

// app/sigap/kelola/identifikasi/page.tsx
//
// (23 Okt 2026) Isi halaman dipindah ke app/sigap/kelola/pendataan/MonIdentifikasi.tsx supaya bisa disematkan di tab "5 · Pemeriksaan" Kelola Pendataan.
// Alamat lama /sigap/kelola/identifikasi tetap hidup (halaman penuh dengan tautan balik ke Kelola Pendataan).

import MonIdentifikasi from "../pendataan/MonIdentifikasi";

export default function MonitoringIdentifikasi() {
  return <MonIdentifikasi />;
}
