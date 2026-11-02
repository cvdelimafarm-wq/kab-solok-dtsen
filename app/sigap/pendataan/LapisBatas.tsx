"use client";

// app/sigap/pendataan/LapisBatas.tsx
//
// (2 Nov 2026) Garis batas Sub SLS di atas peta (digambar di kanvas SVG yang sama dengan titik KK, jadi proyeksi dan geser/cubit otomatis ikut)
// dan tombol hidup/mati-nya. Garis tidak menangkap sentuhan (pointer-events: none) sehingga titik KK tetap bisa diketuk.

import { useMemo } from "react";
import type { Proyeksi } from "@/lib/pendataan";
import { siapkanGambarBatas, type FiturBatas } from "@/lib/batasSubsls";
import type { StatusBatas } from "./useBatas";

// ungu: tidak sama dengan jalan OSM (oranye/kuning) dan tidak dengan warna PPL pada titik (lingkaran/bentuk, bukan garis)
const WARNA_TEPI = "#6D28D9";
const WARNA_AKTIF = "#5B21B6";

/**
 * Dipasang di dalam <svg> peta (sesudah latar, sebelum titik). Lebar garis dibagi zoom (`z`) seperti bentuk KK, jadi tetap tipis di layar.
 * Sengaja polos (tanpa garis putus-putus dan tanpa vector-effect) supaya ringan digeser/dicubit di HP lama.
 */
export function LapisBatas({ fitur, proj, aktifId, z = 1 }: { fitur: readonly FiturBatas[] | undefined; proj: Proyeksi | null; aktifId: string | null; z?: number }) {
  const gambar = useMemo(() => (fitur && fitur.length > 0 ? siapkanGambarBatas(fitur, proj, aktifId) : []), [fitur, proj, aktifId]);
  if (gambar.length === 0) return null;
  return (
    <g pointerEvents="none" fill="none" strokeLinejoin="round" aria-hidden="true">
      {gambar.map((f) =>
        f.id === aktifId ? (
          <path key={f.id} d={f.d} fill={WARNA_AKTIF} fillOpacity={0.08} stroke={WARNA_AKTIF} strokeWidth={2.4 / z} strokeOpacity={0.95} />
        ) : (
          <path key={f.id} d={f.d} stroke={WARNA_TEPI} strokeWidth={1.2 / z} strokeOpacity={0.6} />
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
        className={`relative grid ${ukuran} place-items-center rounded-[12px] shadow-[0_4px_12px_rgba(15,42,82,.15)] active:bg-[#F1F5FC] ${tampil ? "bg-[#EFE9FE] text-[#5B21B6]" : "bg-white text-[#0F2A52]"}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7l5-3 6 2 5 3v9l-5 2-6-2-5 2z" strokeDasharray={tampil ? undefined : "3 2.4"} />
        </svg>
        {tampil && status === "memuat" && <i className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-[#5B21B6]" />}
      </button>
      {catatan && (
        <span role="status" className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-[8px] bg-[#FEF3C7] px-2 py-1 text-[10.5px] font-bold text-[#92400E] shadow-[0_2px_8px_rgba(15,42,82,.18)]">
          {catatan}
        </span>
      )}
    </div>
  );
}
