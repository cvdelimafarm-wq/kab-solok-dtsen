"use client";

// app/sigap/kontrak/page.tsx
//
// (23 Okt 2026) Isi halaman dipindah ke app/sigap/kelola/pendataan/Pengadaan.tsx supaya bisa disematkan di tab "6 · Administrasi & SPJ" Kelola Pendataan.
// Alamat /sigap/kontrak (dan /sigap/kelola/pengadaan) tetap hidup sebagai halaman penuh.

import PortalKontrak from "../kelola/pendataan/Pengadaan";

export default function Halaman() {
  return <PortalKontrak />;
}
