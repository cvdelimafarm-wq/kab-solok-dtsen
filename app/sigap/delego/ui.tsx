"use client";

// app/sigap/delego/ui.tsx
//
// (26 Okt 2026) Komponen kecil bersama untuk halaman Delego (palet di merek.ts).

import type { ReactNode } from "react";
import { KELAS, KELAS_NADA, type Nada } from "./merek";
import type { StatusDelegasi } from "@/lib/delego/tipe";

export function Halaman({ judul, sub, kanan, children }: { judul: string; sub?: ReactNode; kanan?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.2px] text-[#14212B]">{judul}</h1>
          {sub && <p className="mt-0.5 text-[13.5px] text-[#3B4A57]">{sub}</p>}
        </div>
        {kanan && <div className="flex flex-wrap items-center gap-2">{kanan}</div>}
      </div>
      {children}
    </section>
  );
}

export function Kartu({ judul, kanan, children, className = "" }: { judul?: ReactNode; kanan?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`${KELAS.kartu} ${className}`}>
      {(judul || kanan) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {judul && <h2 className="m-0 text-[15px] font-bold text-[#14212B]">{judul}</h2>}
          {kanan}
        </div>
      )}
      {children}
    </div>
  );
}

export function Lencana({ nada = "abu", children }: { nada?: Nada; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[2px] text-[12px] font-semibold ${KELAS_NADA[nada]}`}>{children}</span>;
}

export const NADA_STATUS: Record<StatusDelegasi, Nada> = { baru: "abu", berjalan: "biru", selesai: "hijau", ditunda: "amber", batal: "merah" };

export function Batang({ persen, nada = "hijau", tinggi = 8 }: { persen: number; nada?: "hijau" | "amber" | "merah"; tinggi?: number }) {
  const lebar = Math.max(0, Math.min(100, persen));
  const warna = nada === "hijau" ? "bg-[#0F6B63]" : nada === "amber" ? "bg-[#B86A12]" : "bg-[#B33A3A]";
  return (
    <div className="overflow-hidden rounded-full bg-[#E1E6EA]" style={{ height: tinggi }} role="progressbar" aria-valuenow={Math.round(lebar)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${warna}`} style={{ width: `${lebar}%` }} />
    </div>
  );
}

export function Medan({ label, bantu, children }: { label: string; bantu?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[13px] font-semibold text-[#14212B]">{label}</span>
      {children}
      {bantu && <span className="block text-[12.5px] leading-snug text-[#3B4A57]">{bantu}</span>}
    </label>
  );
}

export function Kosong({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#BCC6CE] bg-white px-4 py-8 text-center text-[14px] text-[#3B4A57]">{children}</div>;
}

export function Memuat({ teks = "Memuat..." }: { teks?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-[14px] text-[#3B4A57]" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#9CC5BF] border-t-[#0F6B63]" aria-hidden />
      {teks}
    </div>
  );
}

export function Galat({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#E3A9A9] bg-[#FBE9E9] px-3 py-2 text-[13.5px] text-[#9B2C2C]" role="alert">
      {children}
    </div>
  );
}

export function Peringatan({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-[#E5B77E] bg-[#FCEFDD] px-3 py-2 text-[13.5px] leading-snug text-[#6B3A04]">{children}</div>;
}

export function Info({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-[#9CC5BF] bg-[#F1F7F6] px-3 py-2 text-[13.5px] leading-snug text-[#0B524C]">{children}</div>;
}

export function Statistik({ label, nilai, ket, nada }: { label: string; nilai: ReactNode; ket?: ReactNode; nada?: "biasa" | "amber" | "merah" }) {
  const warna = nada === "merah" ? "text-[#9B2C2C]" : nada === "amber" ? "text-[#8A4605]" : "text-[#0B524C]";
  return (
    <div className={KELAS.kartu}>
      <div className="text-[12.5px] font-semibold text-[#3B4A57]">{label}</div>
      <div className={`mt-1 text-[28px] font-bold leading-none ${warna}`}>{nilai}</div>
      {ket && <div className="mt-1.5 text-[12.5px] text-[#3B4A57]">{ket}</div>}
    </div>
  );
}

export const fmt = (n: number, desimal = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: desimal }).format(n);
