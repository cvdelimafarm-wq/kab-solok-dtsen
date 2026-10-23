"use client";

// app/sigap/kelola/foto/page.tsx   ->  /sigap/kelola/foto
//
// (23 Okt 2026) Isi halaman dipindah ke app/sigap/kelola/pendataan/KelolaFoto.tsx supaya bisa disematkan di tab "5 · Pemeriksaan" Kelola Pendataan.
// Alamat lama tetap hidup (halaman penuh).

import KelolaFoto from "../pendataan/KelolaFoto";

export default function Halaman() {
  return <KelolaFoto />;
}
