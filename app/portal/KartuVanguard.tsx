"use client";

// app/portal/KartuVanguard.tsx
//
// (1 Nov 2026) Kartu promosi VANGUARD di Beranda untuk SEMUA pengguna (permintaan Iqbal; nuansa ungu). Masuk lewat kartu ini = simulasi bebas:
// jawaban TIDAK dicatat (tanpa ?k=), hanya uji coba dan latihan mandiri. Kartu yang mencatat ada di tab Hari Ini kegiatan yang menyalakan Vanguard
// (app/sigap/KartuVanguardHariIni.tsx). Tidak memuat data apa pun, jadi tidak pernah menghambat Beranda. Tombol >= 44px.

import Link from "next/link";
import { Lambang } from "@/app/sigap/vanguard/Logo";
import { alamatVanguard } from "@/lib/vanguard/navigasi";

export default function KartuVanguard() {
  return (
    <Link
      href={alamatVanguard({ kegiatan: null, dari: "/" })}
      aria-label="Vanguard: simulasi pengisian kuesioner untuk latihan mandiri, jawaban tidak dicatat"
      className="block rounded-[20px] bg-gradient-to-br from-[#2A1763] to-[#5B34C9] p-3.5 text-white shadow-[0_8px_22px_rgba(42,23,99,.28)] active:opacity-95"
    >
      <span className="flex items-center gap-3">
        <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[13px] bg-white"><Lambang px={26} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-extrabold tracking-[0.14em] text-[#D9CFF8]">VANGUARD · UNTUK SEMUA PENGGUNA</span>
          <b className="block text-[16px] font-extrabold leading-snug">Coba isi kuesioner tanpa takut salah</b>
        </span>
      </span>
      <p className="mt-2 text-[13px] leading-snug text-[#D9CFF8]">
        Latihan mandiri Blok V–VII KP Susenas dengan penjelasan di setiap langkah. Ini simulasi bebas: jawaban Anda <b className="text-white">tidak dicatat</b> dan tidak menentukan apa pun.
      </p>
      <span className="mt-2.5 flex items-center gap-2.5">
        <span className="inline-flex min-h-[44px] flex-none items-center rounded-[12px] bg-[#FFC000] px-4 text-[13.5px] font-extrabold text-[#111]">Coba sekarang</span>
        <span className="text-[11.5px] text-[#D9CFF8]">Tidak dicatat · latihan mandiri</span>
      </span>
    </Link>
  );
}
