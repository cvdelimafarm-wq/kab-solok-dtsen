"use client";

// app/sigap/pendataan/LapisBatas.tsx
//
// (2 Nov 2026) Garis batas Sub SLS di atas peta (digambar di kanvas SVG yang sama dengan titik KK, jadi proyeksi dan geser/cubit otomatis ikut)
// dan tombol hidup/mati-nya. Garis tidak menangkap sentuhan (pointer-events: none) sehingga titik KK tetap bisa diketuk.

import { useMemo } from "react";
import type { Proyeksi } from "@/lib/pendataan";
import { siapkanGambarBatas, type FiturBatas } from "@/lib/batasSubsls";
import type { StatusBatas } from "./useBatas";

const WARNA_TEPI = "#B45309";
const WARNA_AKTIF = "#C2410C";

/** Dipasang di dalam <svg> peta (sesudah latar, sebelum titik). Ketebalan garis tetap dalam piksel layar berapa pun zoom-nya. */
export function LapisBatas({ fitur, proj, aktifId }: { fitur: readonly FiturBatas[] | undefined; proj: Proyeksi | null; aktifId: string | null }) {
  const gambar = useMemo(() => (fitur && fitur.length > 0 ? siapkanGambarBatas(fitur, proj, aktifId) : []), [fitur, proj, aktifId]);
  if (gambar.length === 0) return null;
  return (
    <g pointerEvents="none" fill="none" strokeLinejoin="round" aria-hidden="true">
      {gambar.map((f) =>
        f.id === aktifId ? (
          <path key={f.id} d={f.d} fill={WARNA_AKTIF} fillOpacity={0.07} stroke={WARNA_AKTIF} strokeWidth={2.4} strokeOpacity={0.95} vectorEffect="non-scaling-stroke" />
        ) : (
          <path key={f.id} d={f.d} stroke={WARNA_TEPI} strokeWidth={1.2} strokeOpacity={0.75} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
        )
      )}
    </g>
  );
}

const PESAN: Partial<Record<StatusBatas, string>> = {
  gagal: "Batas belum bisa dimuat",
  kosong: "Tidak ada batas di area ini",
};

/** Tombol hidup/mati batas, berdiri sendiri di sisi kanan peta (di luar pil +/-/semua yang memotong isinya). `posisi` = kelas penempatan (mis. "right-2.5 top-[140px]"), `ukuran` = kelas ukuran tombol. */
export function TombolBatas({ tampil, status, onUbah, posisi, ukuran }: { tampil: boolean; status: StatusBatas; onUbah: (v: boolean) => void; posisi: string; ukuran: string }) {
  const catatan = tampil ? PESAN[status] : undefined;
  return (
    <div className={`absolute z-[2] ${posisi}`}>
      <button
        type="button"
        aria-label={tampil ? "Sembunyikan batas Sub SLS" : "Tampilkan batas Sub SLS"}
        aria-pressed={tampil}
        onClick={() => onUbah(!tampil)}
        className={`relative grid ${ukuran} place-items-center rounded-[12px] shadow-[0_4px_12px_rgba(15,42,82,.15)] active:bg-[#F1F5FC] ${tampil ? "bg-[#FFF4E5] text-[#C2410C]" : "bg-white text-[#0F2A52]"}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7l5-3 6 2 5 3v9l-5 2-6-2-5 2z" strokeDasharray={tampil ? undefined : "3 2.4"} />
        </svg>
        {tampil && status === "memuat" && <i className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-[#C2410C]" />}
      </button>
      {catatan && (
        <span role="status" className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-[8px] bg-[#FEF3C7] px-2 py-1 text-[10.5px] font-bold text-[#92400E] shadow-[0_2px_8px_rgba(15,42,82,.18)]">
          {catatan}
        </span>
      )}
    </div>
  );
}
