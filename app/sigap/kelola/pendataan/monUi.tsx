"use client";

// app/sigap/kelola/pendataan/monUi.tsx
// (19 Okt 2026) Bagian tampilan bersama tab Monitoring (angka, kartu, KPI, bilah persen) -- dipakai semua variabel.

import type { ReactNode } from "react";

export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const fmt1 = (n: number) => (Number.isInteger(n) ? fmt(n) : n.toFixed(1).replace(".", ","));
export const fmt2 = (n: number) => {
  const t = Math.abs(n) < 0.005 ? "0" : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const [bulat, desimal] = t.split(".");
  return `${bulat.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${desimal ? `,${desimal}` : ""}`;
};
export const jam = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":");
export const sel = "min-h-[44px] w-full rounded-[10px] border border-[#D9E3F2] bg-white px-2.5 text-[13px] text-[#1B2B4B] sm:min-h-[40px]";
export const th = "whitespace-nowrap bg-[#0F2A52] px-3 py-2 text-left text-[11.5px] font-bold text-white";
export const td = "whitespace-nowrap border-t border-[#E8EDF5] px-3 py-2 text-[13px]";
export const tdAngka = `${td} text-right tabular-nums`;
export const kartuLuar = "rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4";
export const label = "flex flex-col gap-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7A90]";
export const tombol = "min-h-[44px] rounded-[10px] bg-[#E4ECFA] px-4 text-[13px] font-extrabold text-[#0F2A52] disabled:opacity-50 sm:min-h-[40px]";

export function Persen({ nilai }: { nilai: number }) {
  const warna = nilai >= 100 ? "bg-[#19A463]" : nilai >= 50 ? "bg-[#1F5FD1]" : "bg-[#B7791F]";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[#EEF2F7]">
        <span className={`block h-full rounded-full ${warna}`} style={{ width: `${Math.min(100, nilai)}%` }} />
      </span>
      <b className="w-9 text-right tabular-nums">{nilai}%</b>
    </span>
  );
}

export function Kpi({ judul, nilai, catatan, lebar, gaya }: { judul: string; nilai: string; catatan?: string; lebar?: boolean; gaya?: "bahaya" | "baik" }) {
  const latar = gaya === "bahaya" ? "bg-[#FDE8E8]" : gaya === "baik" ? "bg-[#E8F6EE]" : "bg-[#F5F8FE]";
  const teks = gaya === "bahaya" ? "text-[#9B1C23]" : "text-[#0F2A52]";
  return (
    <div className={`rounded-[14px] p-3 ${latar} ${lebar ? "col-span-2 sm:col-span-1" : ""}`}>
      <span className="text-[11.5px] text-[#55657D]">{judul}</span>
      <b className={`mt-0.5 block text-[22px] ${teks}`}>{nilai}</b>
      {catatan && <span className="text-[11px] text-[#6B7A90]">{catatan}</span>}
    </div>
  );
}

export function Kartu({ judul, sub, nilai, utama, lain, etiket, anak }: { judul: string; sub: string; nilai: number | null; utama: [string, string][]; lain: [string, string][]; etiket?: string; anak?: ReactNode }) {
  return (
    <article className="rounded-[14px] border border-[#E8EDF5] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-[14.5px] font-extrabold leading-tight text-[#0F2A52]">{judul}</h3>
          <p className="mt-0.5 text-[12px] text-[#55657D]">{sub}</p>
        </div>
        {nilai != null && <b className={`shrink-0 text-[20px] tabular-nums ${nilai >= 100 ? "text-[#0B6B3F]" : nilai >= 50 ? "text-[#1F5FD1]" : "text-[#8A6200]"}`}>{nilai}%</b>}
      </div>
      {nilai != null && (
        <div className="mt-2">
          {etiket && <span className="text-[11px] text-[#6B7A90]">{etiket}</span>}
          <span className="block h-2 overflow-hidden rounded-full bg-[#EEF2F7]">
            <span className={`block h-full rounded-full ${nilai >= 100 ? "bg-[#19A463]" : nilai >= 50 ? "bg-[#1F5FD1]" : "bg-[#B7791F]"}`} style={{ width: `${Math.min(100, nilai)}%` }} />
          </span>
        </div>
      )}
      <dl className={`mt-2.5 grid gap-2 ${utama.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {utama.map(([k, v]) => (
          <div key={k} className="rounded-[10px] bg-[#F5F8FE] px-2 py-1.5">
            <dt className="text-[10.5px] leading-tight text-[#6B7A90]">{k}</dt>
            <dd className="text-[16px] font-extrabold tabular-nums text-[#0F2A52]">{v}</dd>
          </div>
        ))}
      </dl>
      {lain.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[#55657D]">
          {lain.map(([k, v]) => (
            <span key={k}>
              {k} <b className="tabular-nums text-[#1B2B4B]">{v}</b>
            </span>
          ))}
        </p>
      )}
      {anak}
    </article>
  );
}

export function Catatan({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <details className="mt-3 text-[12px] leading-snug text-[#55657D]">
      <summary className="cursor-pointer text-[12.5px] font-extrabold text-[#1F5FD1]">{judul}</summary>
      <div className="mt-2 space-y-1.5">{children}</div>
    </details>
  );
}

export function Galat({ pesan }: { pesan: string }) {
  return <p className="mt-4 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{pesan}</p>;
}
