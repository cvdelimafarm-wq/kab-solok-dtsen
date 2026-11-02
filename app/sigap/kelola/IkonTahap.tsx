// app/sigap/kelola/IkonTahap.tsx
//
// (1 Nov 2026) Ikon tahap untuk lajur ikon di atas halaman beralur (AlurKelola.tsx). Gambar garis 24x24, tanpa pustaka ikon.
// Dipetakan per KODE tahap (kode tab Kelola Pendataan, tahap Identifikasi survei, dan langkah pelatihan peserta); kode lain memakai titik bundar.
// (2 Nov 2026) + ikon buku, pena, kuis, kamera untuk langkah pelatihan di HP (lib/alurPelatihan.ts).
// Hiasan saja: selalu aria-hidden, arti tahap tetap ada pada teks.

import type { ReactNode } from "react";

// Fungsi (bukan nilai) supaya JSX baru dibuat saat dirender, bukan saat modul dimuat.
const G = {
  ringkasan: () => (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.2" />
      <rect x="14" y="3" width="7" height="5" rx="1.2" />
      <rect x="14" y="12" width="7" height="9" rx="1.2" />
      <rect x="3" y="16" width="7" height="5" rx="1.2" />
    </>
  ),
  unggah: () => (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 17v-6" />
      <path d="m9.5 13.5 2.5-2.5 2.5 2.5" />
    </>
  ),
  tim: () => (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M17 14.2c2.7.2 4.5 2 4.5 5" />
    </>
  ),
  siaran: () => (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  cek: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 5-5" />
    </>
  ),
  pantau: () => <path d="M3 12h4l3-8 4 16 3-8h4" />,
  periksa: () => (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  uang: () => (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </>
  ),
  laporan: () => (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </>
  ),
  formulir: () => (
    <>
      <path d="M9 3h6v3H9z" />
      <path d="M7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </>
  ),
  ulang: () => (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-14 5.3L4 15" />
      <path d="M4 20v-5h5" />
    </>
  ),
  rekrut: () => (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </>
  ),
  latih: () => (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
    </>
  ),
  lokasi: () => (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  selisih: () => (
    <>
      <path d="M5 20v-6" />
      <path d="M12 20V5" />
      <path d="M19 20v-9" />
      <path d="M3 20h18" />
    </>
  ),
  daftar: () => (
    <>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="m3.5 6 1 1 2-2" />
      <path d="m3.5 12 1 1 2-2" />
      <path d="m3.5 18 1 1 2-2" />
    </>
  ),
  unduh: () => (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5L16.5 11" />
      <path d="M4 20h16" />
    </>
  ),
  peta: () => (
    <>
      <path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </>
  ),
  surat: () => (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 17c1.2-2 2-2 2.4-.6.3 1 .9 1 1.6-.4" />
    </>
  ),
  buku: () => (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20" />
      <path d="M9 8h7" />
    </>
  ),
  pena: () => (
    <>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14.5 7.5 3 3" />
    </>
  ),
  kuis: () => <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />,
  kamera: () => (
    <>
      <path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  titik: () => <circle cx="12" cy="12" r="3" />,
} satisfies Record<string, () => ReactNode>;

type NamaIkon = keyof typeof G;

/** Kode tahap -> ikon. Kode di luar daftar -> titik. */
const PETA: Record<string, NamaIkon> = {
  // Kelola Pendataan
  ringkasan: "ringkasan",
  persiapan: "unggah",
  tim: "tim",
  siaran: "siaran",
  qc: "cek",
  monitoring: "pantau",
  pemeriksaan: "periksa",
  administrasi: "uang",
  laporan: "laporan",
  // Identifikasi survei
  awal: "formulir",
  lanjutan: "ulang",
  kebutuhan: "rekrut",
  pelatihan: "latih",
  pendataan: "lokasi",
  gap: "selisih",
  // Langkah pelatihan peserta (HP)
  undangan: "surat",
  instrumen: "buku",
  pretest: "pena",
  posttest: "pena",
  hadir: "lokasi",
  sesi: "cek", // (3 Nov 2026) absen sesi pelatihan
  foto_awal: "kamera",
  foto_akhir: "kamera",
};

export const adaIkonTahap = (kode: string): boolean => kode in PETA;

export function IkonTahap({ kode, ukuran = 18 }: { kode: string; ukuran?: number }) {
  // `kode` boleh berupa nama ikon langsung (mis. "daftar", "unduh") atau kode tahap.
  return (
    <svg
      aria-hidden
      focusable="false"
      width={ukuran}
      height={ukuran}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {G[PETA[kode] ?? (kode in G ? (kode as NamaIkon) : "titik")]()}
    </svg>
  );
}
