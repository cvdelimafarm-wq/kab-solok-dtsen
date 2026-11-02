"use client";

// app/sigap/pelatihan/infoPelatihan.ts
//
// (1 Nov 2026) Hook bersama: info pelatihan yang sedang dilayani (nama, induk) untuk header, kartu pulsa, judul tes, dan tombol kembali.
// (3 Nov 2026) Lewat simpanan bersama (dataPel.ts): judul langsung tampil saat pindah tab (tanpa berkedip dari "Pelatihan"), diperbarui di belakang tiap 10 menit.
// Gagal / belum ada -> null (layar memakai teks netral "Pelatihan").

import { useDataPel } from "./dataPel";
import type { InfoPelatihan } from "@/lib/sigapPelatihanNama";

export function useInfoPelatihan(): InfoPelatihan | null {
  const { data } = useDataPel<InfoPelatihan>("/api/sigap/pelatihan/info");
  return data && data.kegiatan_id !== null ? data : null;
}
