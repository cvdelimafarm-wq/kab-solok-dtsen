// app/portal/IkonMenu.tsx
//
// (8 Okt 2026) Ikon garis gaya mockup identitas SIGAP (24 px, stroke 1.8, ujung bulat) untuk beranda HP. Tanpa emoji.

import type { IkonKode } from "@/lib/sigapTugasUtama";

const BENTUK: Record<IkonKode | "lonceng" | "centang" | "awas" | "panah" | "kembali" | "kunci" | "kamera" | "tanda", React.ReactNode> = {
  motor: (
    <>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M9 17h6l2-6h2" />
      <path d="M14 6h3l1 5" />
      <path d="M4 12h6l2 5" />
    </>
  ),
  pedia: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
      <path d="M9 7h7M9 11h5" />
    </>
  ),
  surat: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  langkah: (
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="m3.5 6 1.5 1.5L7.5 5" />
      <path d="m3.5 12 1.5 1.5L7.5 11" />
      <circle cx="5" cy="18" r="1.6" />
    </>
  ),
  tes: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="m9 11 2 2 4-4" />
      <path d="M9 17h6" />
    </>
  ),
  kuis: (
    <>
      <rect x="2" y="7" width="20" height="11" rx="5" />
      <path d="M7 10.5v4M5 12.5h4" />
      <circle cx="15.5" cy="11.5" r=".9" />
      <circle cx="18" cy="14" r=".9" />
    </>
  ),
  hadir: (
    <>
      <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  arsip: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 13h6" />
    </>
  ),
  kelola: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  akses: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5a5 5 0 0 1 5 5" />
    </>
  ),
  kontrak: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </>
  ),
  peta: (
    <>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  grafik: <path d="M4 20V10M10 20V4M16 20v-7M2 20h20" />,
  periode: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  dtsen: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  bencana: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v5M12 17.5h.01" />
    </>
  ),
  lonceng: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  centang: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </>
  ),
  awas: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v5M12 17.5h.01" />
    </>
  ),
  panah: <path d="m9 6 6 6-6 6" />,
  kembali: <path d="m15 6-6 6 6 6" />,
  kunci: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  kamera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  tanda: <path d="m5 12 5 5 9-10" />,
};

export type NamaIkon = IkonKode | "lonceng" | "centang" | "awas" | "panah" | "kembali" | "kunci" | "kamera" | "tanda";

export default function IkonMenu({ n, className = "h-[22px] w-[22px]" }: { n: NamaIkon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`} aria-hidden>
      {BENTUK[n]}
    </svg>
  );
}
