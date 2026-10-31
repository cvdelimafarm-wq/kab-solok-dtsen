"use client";

// app/portal/KartuSeleksi.tsx
//
// (31 Okt 2026) Kartu ajakan seleksi petugas di Beranda Mitra: seleksi yang sedang dibuka tampil tanpa menunggu push atau tautan WhatsApp.
// Data dari GET /api/sigap/seleksi-saya (tanpa id); aturan tampil di lib/seleksiBeranda.ts. Gagal memuat = tidak tampil apa pun (Beranda tidak terganggu).
// Tombol >= 44px.

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiPortal } from "./sesi";
import type { KartuSeleksi as Kartu, NadaKartuSeleksi } from "@/lib/seleksiBeranda";

const GARIS: Record<NadaKartuSeleksi, string> = { biru: "border-[#3B78E0]", emas: "border-[#F4B400]", hijau: "border-[#19A463]" };
const TOMBOL: Record<NadaKartuSeleksi, string> = { biru: "bg-[#1F5FD1] text-white", emas: "bg-[#0F2A52] text-white", hijau: "bg-[#E3F6EC] text-[#13794B]" };

export default function KartuSeleksi() {
  const [kartu, setKartu] = useState<Kartu[]>([]);

  useEffect(() => {
    let batal = false;
    apiPortal<{ kartu?: Kartu[] }>("/api/sigap/seleksi-saya")
      .then((d) => {
        if (!batal) setKartu(Array.isArray(d.kartu) ? d.kartu : []);
      })
      .catch(() => {
        /* diam: kartu seleksi hanya tambahan */
      });
    return () => {
      batal = true;
    };
  }, []);

  if (kartu.length === 0) return null;
  return (
    <section aria-label="Seleksi petugas" className="space-y-3">
      {kartu.map((k) => (
        <article key={k.id} aria-label={k.judul} className="rounded-[20px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
          <span className="text-[10.5px] font-extrabold tracking-[0.14em] text-[#6B7A90]">SELEKSI PETUGAS</span>
          <b className="mt-0.5 block text-[16px] font-extrabold leading-snug text-[#0F2A52]">{k.judul}</b>
          {k.kegiatan && <span className="block text-[12.5px] text-[#55657D]">{k.kegiatan}</span>}
          <div className={`mt-2 flex items-center gap-3 rounded-[14px] border-l-4 bg-[#F7FAFF] py-2.5 pl-3 pr-2.5 ${GARIS[k.nada]}`}>
            <span className="min-w-0 flex-1 text-[13px] leading-snug text-[#33445C]">{k.pesan}</span>
            <Link href={k.href} aria-label={`${k.aksi}: ${k.judul}`} className={`inline-flex min-h-[44px] flex-none items-center rounded-[12px] px-4 text-[13px] font-extrabold ${TOMBOL[k.nada]}`}>
              {k.aksi}
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}
