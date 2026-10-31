"use client";

// app/sigap/BarisPengawasan.tsx
//
// (31 Okt 2026) Baris pengingat di "Hari Ini" untuk PML (Pengawasan) dan Supervisor (Supervisi): sudah / belum membuka menunya hari ini, karena idealnya dibuka
// setiap hari. Status hanya terlihat oleh akun yang bersangkutan. Ditambah catatan bahwa laporan Translok terisi dari data menu (lib/sigapMenuBuka.ts).
// `useCatatBukaMenu` dipanggil halaman menunya (mis. /sigap/spdt?tab=pengawasan) untuk mencatat pembukaan.

import { useEffect } from "react";
import Link from "next/link";
import { useData } from "@/app/portal/dataBersama";
import { apiPortal } from "@/app/portal/sesi";
import { API_MENU_BUKA, CATATAN_LAPORAN_OTOMATIS, teksStatusBuka, type CatatanBuka, type MenuBuka } from "@/lib/sigapMenuBuka";

type DataBuka = { tersedia: boolean; tanggal: string; buka: Record<string, CatatanBuka | null> };

const sudahDicatat = new Set<string>();

/** Catat pembukaan menu (sekali per kegiatan/menu selama halaman terbuka; server menyatukan per hari). Gagal = diabaikan. */
export function useCatatBukaMenu(kode: string | null, menu: MenuBuka, aktif: boolean) {
  useEffect(() => {
    if (!aktif || !kode) return;
    const kunci = `${kode}:${menu}`;
    if (sudahDicatat.has(kunci)) return;
    sudahDicatat.add(kunci);
    apiPortal(API_MENU_BUKA, { method: "POST", body: JSON.stringify({ kode, menu }) }).catch(() => sudahDicatat.delete(kunci));
  }, [kode, menu, aktif]);
}

export default function BarisPengawasan({ kode, peran, label, href }: { kode: string; peran: "ppl" | "pml" | "supervisor" | null; label: string; href: string }) {
  const d = useData<DataBuka>(`${API_MENU_BUKA}?kode=${kode}`, { aktif: peran === "pml" || peran === "supervisor" });
  if (peran !== "pml" && peran !== "supervisor") return null;
  const st = d.data?.tersedia ? teksStatusBuka(d.data.buka.pengawasan?.pertama_at ?? null) : null;
  return (
    <section aria-label={`Pengingat ${label}`} className="rounded-[16px] bg-white p-3.5 shadow-[0_6px_18px_rgba(15,42,82,.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-extrabold text-[#0F2A52]">{label}</h2>
          {st ? (
            <p className={`mt-0.5 text-[12.5px] font-bold ${st.sudah ? "text-[#13794B]" : "text-[#8A6200]"}`}>{st.sudah ? "✓ " : "● "}{st.teks}</p>
          ) : (
            <p className="mt-0.5 text-[12.5px] text-[#55657D]">Buka setiap hari untuk memantau wilayah Anda.</p>
          )}
        </div>
        <Link href={href} className="inline-flex min-h-[40px] flex-none items-center rounded-[11px] bg-[#0F2A52] px-3.5 text-[13px] font-extrabold text-white">
          Buka
        </Link>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-[#6B7A90]">{CATATAN_LAPORAN_OTOMATIS}</p>
    </section>
  );
}
