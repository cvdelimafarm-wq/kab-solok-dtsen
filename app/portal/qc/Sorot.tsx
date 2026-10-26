"use client";

// app/portal/qc/Sorot.tsx
//
// (26 Okt 2026) Teks dengan kata kunci disorot (kuning) -- dipakai di soal, pilihan jawaban, dan pembahasan QC Pemahaman.
// Pemecahan teks ada di lib/sigapQc.ts#sorotKata (murni, diuji); di sini hanya digambar sebagai teks biasa (tanpa HTML mentah).

import { Fragment } from "react";
import { sorotKata } from "@/lib/sigapQc";

export default function Sorot({ teks, kata }: { teks: string; kata?: readonly string[] | null }) {
  return (
    <>
      {sorotKata(teks, kata).map((s, i) =>
        s.sorot ? (
          <mark key={i} className="rounded px-0.5 font-bold" style={{ background: "#FFE680", color: "#1B2B4B" }}>
            {s.teks}
          </mark>
        ) : (
          <Fragment key={i}>{s.teks}</Fragment>
        )
      )}
    </>
  );
}
