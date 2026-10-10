"use client";

// app/sigap/pelatihan/kelola/daftar.tsx
//
// (10 Okt 2026) Halaman awal Kelola Pelatihan: daftar pelatihan per kegiatan induk -- permintaan user.
// Memakai komponen bersama app/sigap/kelola/DaftarKegiatan (dipakai juga Transport Lokal & proses bisnis lain).

import DaftarKegiatan, { type KegiatanDaftar } from "../../kelola/DaftarKegiatan";

export type PelatihanDaftar = KegiatanDaftar;

export default function DaftarPelatihan({ onPilih }: { onPilih: (p: PelatihanDaftar) => void }) {
  return <DaftarKegiatan modul="pelatihan" onPilih={onPilih} kosong="Belum ada pelatihan yang bisa Anda kelola. Hubungi admin anggaran bila Anda panitia atau instruktur." />;
}
