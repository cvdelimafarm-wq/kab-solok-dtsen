"use client";

// app/sigap/kelola/pendataan/PintuMasuk.tsx
//
// (23 Okt 2026) Isi tab yang berupa PINTU MASUK ke halaman lain (Tim & Surat Tugas, Pemeriksaan, Administrasi & SPJ): kartu tautan per kelompok,
// daftarnya dari lib/sigapPendataanTab.ts (PINTU_TAB). Item yang belum ada halamannya tampil "segera" tanpa tautan.

import Link from "next/link";
import { Chip, Kartu } from "../../admin/ui";
import { PINTU_TAB, type KodeTabPendataan } from "@/lib/sigapPendataanTab";

export default function PintuMasuk({ tab }: { tab: KodeTabPendataan }) {
  const kelompok = PINTU_TAB[tab] ?? [];
  return (
    <div className="space-y-3">
      {kelompok.map((g) => (
        <Kartu key={g.judul} judul={g.judul} ket={g.ket}>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.item.map((it) =>
              it.href ? (
                <li key={it.id}>
                  <Link href={it.href} className="block h-full rounded-lg border border-[#DDE6F3] p-3 transition hover:border-[#1F5FD1] hover:bg-[#F8FAFC]">
                    <span className="flex items-start justify-between gap-2">
                      <b className="text-[13.5px] text-[#0F2A52]">{it.judul}</b>
                      <span aria-hidden className="text-[#1F5FD1]">
                        ›
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-[#55657D]">{it.ket}</span>
                  </Link>
                </li>
              ) : (
                <li key={it.id} className="rounded-lg border border-dashed border-[#DDE6F3] bg-[#FAFBFD] p-3">
                  <span className="flex items-start justify-between gap-2">
                    <b className="text-[13.5px] text-[#6B7A90]">{it.judul}</b>
                    <Chip>segera</Chip>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-[#8794A6]">{it.ket}</span>
                </li>
              )
            )}
          </ul>
        </Kartu>
      ))}
    </div>
  );
}
