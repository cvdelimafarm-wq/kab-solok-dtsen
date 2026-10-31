"use client";

// app/sigap/BarisLangkah.tsx
//
// (31 Okt 2026, Fase 4) Langkah SEKALI JALAN (konfirmasi kesediaan, identifikasi SLS) pada kegiatan bermenu: bukan tab dan bukan "tahap" bernomor, melainkan kartu
// "Selesaikan dulu" di Hari Ini yang hilang sendiri begitu langkahnya selesai. Daftarnya dari useBarKegiatan().langkah (lib/sigapMenuKegiatan.ts: langkahSekali).

import Link from "next/link";
import IkonMenu from "@/app/portal/IkonMenu";
import type { LangkahSekali } from "@/lib/sigapMenuKegiatan";

export default function BarisLangkah({ langkah }: { langkah: LangkahSekali[] }) {
  if (langkah.length === 0) return null;
  return (
    <section aria-label="Langkah yang perlu diselesaikan" className="space-y-2">
      {langkah.map((l) => (
        <Link
          key={l.kode}
          href={l.href}
          className={`flex items-center gap-3 rounded-[16px] border-2 bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)] active:bg-[#FFFBEF] ${l.mendesak ? "border-[#F4B400]" : "border-[#C9D9F2]"}`}
        >
          <span className="min-w-0 flex-1">
            <span className={`block text-[10.5px] font-black tracking-[0.12em] ${l.mendesak ? "text-[#8A6200]" : "text-[#1F5FD1]"}`}>SELESAIKAN DULU</span>
            <b className="mt-0.5 block text-[14.5px] font-extrabold leading-tight text-[#0F2A52]">{l.judul}</b>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-[#55657D]">{l.ket}</span>
          </span>
          <span className="inline-flex min-h-[44px] flex-none items-center gap-1.5 rounded-[12px] bg-[#0F2A52] px-3.5 text-[13px] font-extrabold text-white">
            {l.aksi}
            <IkonMenu n="panah" className="h-4 w-4" />
          </span>
        </Link>
      ))}
    </section>
  );
}
