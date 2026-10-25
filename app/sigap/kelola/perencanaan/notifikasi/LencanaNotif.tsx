"use client";

// app/sigap/kelola/perencanaan/notifikasi/LencanaNotif.tsx
//
// (25 Okt 2026, tahap 30) Tautan ke halaman Notifikasi beserta jumlah yang belum dibaca. Dipasang pada judul halaman Perencanaan
// (Identifikasi, Kebijakan, Lanjutan). Bila pemuatan gagal, tampil tanpa angka (tidak mengganggu halaman).

import Link from "next/link";
import { useNotifikasi } from "./useNotifikasi";

export default function LencanaNotif({ gelap = false }: { gelap?: boolean }) {
  const { data } = useNotifikasi(1);
  const n = data?.belum ?? 0;
  return (
    <Link
      href="/sigap/kelola/perencanaan/notifikasi"
      aria-label={n > 0 ? `Notifikasi, ${n} belum dibaca` : "Notifikasi"}
      className={`inline-flex min-h-[40px] items-center gap-2 rounded-md border px-3 text-[13px] font-semibold ${gelap ? "border-white/40 text-white hover:bg-white/10" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}
    >
      Notifikasi
      {n > 0 && <span className="rounded-full bg-[#B42329] px-2 py-[1px] text-[11.5px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
