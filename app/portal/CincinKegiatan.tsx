"use client";

// app/portal/CincinKegiatan.tsx
//
// (8 Okt 2026) Layer 1 struktur 3 layer: ikon bulat dengan cincin progres (mockup disetujui user). Warna mengikuti keadaan:
// merah = mendesak (isi emas, tanda seru merah), emas = perlu dilengkapi, biru = berjalan, abu = belum mulai, hijau = selesai.
// Cincin berisi bagian selesai; progres tak terukur memakai cincin putus-putus.

import Link from "next/link";
import IkonMenu from "./IkonMenu";
import type { NadaKegiatan, RingkasKegiatan } from "@/lib/sigapKegiatan";

const WARNA: Record<NadaKegiatan, { cincin: string; isi: string; ikon: string; sub: string; bayang: string }> = {
  merah: { cincin: "#D43A3A", isi: "#F4B400", ikon: "#0F2A52", sub: "#B42329", bayang: "0 6px 14px rgba(244,180,0,.35)" },
  emas: { cincin: "#F4B400", isi: "#FFF4D6", ikon: "#8A6200", sub: "#8A6200", bayang: "none" },
  biru: { cincin: "#1F5FD1", isi: "#EAF1FC", ikon: "#1F5FD1", sub: "#1F5FD1", bayang: "none" },
  abu: { cincin: "#C5D0E2", isi: "#EEF2F7", ikon: "#5B6B84", sub: "#6B7A90", bayang: "none" },
  hijau: { cincin: "#19A463", isi: "#E3F6EC", ikon: "#13794B", sub: "#13794B", bayang: "none" },
};

/** Cincin + ikon. `gelap` = di atas latar navy (header Layer 2). */
export function Cincin({ k, ukuran = 64, gelap = false }: { k: Pick<RingkasKegiatan, "ikon" | "nada" | "pecahan" | "peringatan">; ukuran?: number; gelap?: boolean }) {
  const w = WARNA[k.nada];
  const r = ukuran / 2 - 4;
  const keliling = 2 * Math.PI * r;
  const isi = Math.round(ukuran * 0.69);
  const terukur = k.pecahan != null;
  const jalan = terukur ? Math.max(0, Math.min(1, k.pecahan!)) : 1;
  return (
    <span className="relative grid flex-none place-items-center" style={{ width: ukuran, height: ukuran }}>
      <svg width={ukuran} height={ukuran} viewBox={`0 0 ${ukuran} ${ukuran}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={ukuran / 2} cy={ukuran / 2} r={r} fill="none" stroke={gelap ? "rgba(255,255,255,.18)" : "#E1E9F6"} strokeWidth={5} />
        {(terukur ? jalan > 0 : k.nada !== "abu") && (
          <circle
            cx={ukuran / 2}
            cy={ukuran / 2}
            r={r}
            fill="none"
            stroke={gelap && k.nada === "biru" ? "#F4B400" : w.cincin}
            strokeWidth={5}
            strokeLinecap={terukur ? "round" : "butt"}
            strokeDasharray={terukur ? `${keliling.toFixed(1)}` : "3 6"}
            strokeDashoffset={terukur ? (keliling * (1 - jalan)).toFixed(1) : 0}
          />
        )}
      </svg>
      <span className="grid place-items-center rounded-full" style={{ width: isi, height: isi, background: w.isi, color: w.ikon, boxShadow: w.bayang }}>
        <IkonMenu n={k.ikon} className="h-6 w-6" />
      </span>
      {k.nada === "hijau" ? (
        <span aria-hidden className="absolute -right-[3px] -top-[3px] grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-[#19A463] text-white">
          <IkonMenu n="tanda" className="h-3 w-3" />
        </span>
      ) : k.peringatan ? (
        <span
          aria-hidden
          className="absolute -right-[3px] -top-[3px] grid h-5 w-5 place-items-center rounded-full border-2 border-white text-[11px] font-extrabold leading-none"
          style={{ background: k.nada === "merah" ? "#D43A3A" : "#F4B400", color: k.nada === "merah" ? "#FFFFFF" : "#0F2A52" }}
        >
          !
        </span>
      ) : null}
    </span>
  );
}

export function IkonKegiatan({ k, sibuk, onSso }: { k: RingkasKegiatan; sibuk?: boolean; onSso?: () => void }) {
  const w = WARNA[k.nada];
  const isi = (
    <span className={`flex flex-col items-center gap-[5px] ${sibuk ? "animate-pulse" : ""}`}>
      <Cincin k={k} />
      <span className="line-clamp-2 min-h-[2.4em] text-center text-[11.5px] font-bold leading-[1.2] text-[#0F2A52]">{sibuk ? "Membuka…" : k.pendek}</span>
      <span className="line-clamp-2 text-center text-[10.5px] font-bold leading-[1.15]" style={{ color: w.sub }}>
        {k.sub}
      </span>
      {k.peringatan && <span className="sr-only">perlu perhatian</span>}
    </span>
  );
  const kelas = "block w-full rounded-[14px] px-0.5 py-1 outline-none transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1F5FD1]/50";
  if (k.sso) {
    return (
      <button type="button" onClick={onSso} disabled={sibuk} className={kelas}>
        {isi}
      </button>
    );
  }
  if (k.href) {
    return k.href.startsWith("http") ? (
      <a href={k.href} target="_blank" rel="noopener noreferrer" className={kelas}>
        {isi}
      </a>
    ) : (
      <Link href={k.href} className={kelas}>
        {isi}
      </Link>
    );
  }
  return <span className="block cursor-default">{isi}</span>;
}
