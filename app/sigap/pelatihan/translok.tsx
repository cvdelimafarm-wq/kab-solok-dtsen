"use client";

// app/sigap/pelatihan/translok.tsx
//
// (9 Okt 2026) Transport Lokal PELATIHAN kini berada DI DALAM tahap Pelatihan (permintaan user: "transport lokal ada di dalam pelatihan"),
// bukan kartu terpisah di Beranda. Kartu ini membuka halaman Transport Lokal kegiatan pelatihan (hari kerja, foto dokumentasi, arsip SPJ)
// dan membawa ?dari=/sigap/pelatihan supaya tombol kembali pulang ke halaman ini.

import { useEffect, useState } from "react";
import Link from "next/link";
import IkonMenu from "@/app/portal/IkonMenu";
import { apiPortal } from "@/app/portal/sesi";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";

/** Kegiatan anggaran Transport Lokal untuk pelatihan (sama dengan modul `translok:3` pada tahap Pelatihan di sigap_tahap). */
const KEGIATAN_PELATIHAN = 3;

const CHIP: Record<RingkasKegiatan["nada"], { teks: string; kelas: string }> = {
  merah: { teks: "Mendesak", kelas: "bg-[#FDE8E8] text-[#B42329]" },
  emas: { teks: "Perlu dilengkapi", kelas: "bg-[#FFF4D6] text-[#8A6200]" },
  biru: { teks: "Berjalan", kelas: "bg-[#E6EEFC] text-[#1F5FD1]" },
  abu: { teks: "Belum mulai", kelas: "bg-[#E3E8F0] text-[#55657D]" },
  hijau: { teks: "Selesai", kelas: "bg-[#E3F6EC] text-[#13794B]" },
};

export default function KartuTranslokPelatihan() {
  const [k, setK] = useState<RingkasKegiatan | null>(null);

  useEffect(() => {
    let batal = false;
    const muat = () =>
      apiPortal<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan")
        .then((d) => !batal && setK(d.kegiatan.find((x) => x.kegiatan_id === KEGIATAN_PELATIHAN && x.href) ?? null))
        .catch(() => undefined); // gagal memuat -> kartu tidak tampil, halaman Pelatihan tetap jalan
    muat();
    const a = setInterval(() => document.visibilityState === "visible" && muat(), 60_000);
    return () => {
      batal = true;
      clearInterval(a);
    };
  }, []);

  if (!k?.href) return null;
  const c = CHIP[k.nada];
  return (
    <Link
      href={`${k.href}?dari=${encodeURIComponent("/sigap/pelatihan")}`}
      className="flex items-center gap-3 rounded-[16px] border border-[#DDE6F3] bg-white px-3.5 py-3 shadow-[0_6px_16px_rgba(15,42,82,.06)] transition active:bg-[#EAF1FC]"
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-[12px] bg-[#EAF1FC] text-[#1F5FD1]">
        <IkonMenu n="motor" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="flex flex-wrap items-center gap-1.5 text-[14.5px] text-[#0F2A52]">
          Transport Lokal pelatihan
          <span className={`rounded-full px-2 py-[2px] text-[10.5px] font-extrabold ${c.kelas}`}>{c.teks}</span>
        </b>
        <small className="mt-0.5 block text-[12px] leading-snug text-[#55657D]">{k.sub}</small>
        <small className="mt-0.5 block text-[11px] text-[#6B7A90]">Hari kerja · foto dokumentasi · arsip SPJ</small>
      </span>
      <IkonMenu n="panah" className="h-4 w-4 flex-none text-[#A5B3C7]" />
    </Link>
  );
}
