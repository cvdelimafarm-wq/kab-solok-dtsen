"use client";

// app/sigap/kelola/lapangan/page.tsx
//
// (23 Okt 2026) Isi halaman dipindah ke app/sigap/kelola/pendataan/MonLapangan.tsx supaya bisa disematkan di tab "5 · Pemeriksaan" Kelola Pendataan.
// Alamat lama /sigap/kelola/lapangan tetap hidup (halaman penuh dengan tautan balik ke Kelola Pendataan).

import MonLapangan from "../pendataan/MonLapangan";

export default function MonitoringLapangan() {
  return <MonLapangan />;
}
