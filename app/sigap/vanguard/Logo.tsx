// app/sigap/vanguard/Logo.tsx
//
// (1 Nov 2026) VANGUARD V2b: logo kiriman Iqbal (perisai + huruf V + tiga titik sinyal; gradasi sian #39D5E8 ke biru #1769D2; huruf tinta #101E36) dipakai apa adanya.
// `LogoPenuh` = lambang + nama + keterangan; `Lambang` = lambang saja (dipasang di lencana putih pada latar ungu agar warna aslinya terbaca).

import { useId } from "react";

export function LogoPenuh({ lebar = 350 }: { lebar?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" width={lebar} height={Math.round((lebar * 180) / 600)} role="img" aria-label="VANGUARD, Survey Intelligence Platform" style={{ maxWidth: "100%", height: "auto" }}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#39D5E8" /><stop offset="100%" stopColor="#1769D2" /></linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1769D2" /><stop offset="100%" stopColor="#39D5E8" /></linearGradient>
      </defs>
      <path d="M90 12 L158 37 V83 C158 124 129 150 90 169 C51 150 22 124 22 83 V37 Z" fill="none" stroke={`url(#${id}s)`} strokeWidth="9" strokeLinejoin="round" />
      <path d="M47 55 L78 119 Q90 143 102 119 L133 55" fill="none" stroke={`url(#${id}l)`} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="90" cy="12" r="6" fill="#39D5E8" /><circle cx="47" cy="55" r="4" fill="#39D5E8" /><circle cx="133" cy="55" r="4" fill="#39D5E8" />
      <text x="190" y="94" fontFamily="Arial, Helvetica, sans-serif" fontSize="54" fontWeight="800" letterSpacing="2" fill="#101E36">VANGUARD</text>
      <text x="193" y="123" fontFamily="Arial, Helvetica, sans-serif" fontSize="14" fontWeight="600" letterSpacing="3" fill="#52708F">SURVEY INTELLIGENCE PLATFORM</text>
    </svg>
  );
}

export function Lambang({ px = 22 }: { px?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="14 4 152 172" width={px} height={Math.round((px * 172) / 152)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#39D5E8" /><stop offset="100%" stopColor="#1769D2" /></linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1769D2" /><stop offset="100%" stopColor="#39D5E8" /></linearGradient>
      </defs>
      <path d="M90 12 L158 37 V83 C158 124 129 150 90 169 C51 150 22 124 22 83 V37 Z" fill="none" stroke={`url(#${id}s)`} strokeWidth="9" strokeLinejoin="round" />
      <path d="M47 55 L78 119 Q90 143 102 119 L133 55" fill="none" stroke={`url(#${id}l)`} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="90" cy="12" r="6" fill="#39D5E8" /><circle cx="47" cy="55" r="4" fill="#39D5E8" /><circle cx="133" cy="55" r="4" fill="#39D5E8" />
    </svg>
  );
}
