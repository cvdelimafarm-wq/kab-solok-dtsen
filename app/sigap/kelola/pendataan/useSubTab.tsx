"use client";

// app/sigap/kelola/pendataan/useSubTab.tsx
//
// (23 Okt 2026, tahap 3) Sub-pilihan di dalam tab Kelola Pendataan (Tim & Surat Tugas, Administrasi & SPJ): status ikut di alamat (?sub=...),
// logika alamat ada di lib/sigapPendataanTab.ts (bacaSubDari, urlSubDari). Tombol pilihan digambar oleh SubPilih.

import { useCallback, useEffect, useState } from "react";
import { bacaSubDari, urlSubDari, type KodeTabPendataan, type SubItem } from "@/lib/sigapPendataanTab";

export function useSubTab(tab: KodeTabPendataan, daftar: SubItem[]) {
  const [sub, setSub] = useState<string>(daftar[0].kode);

  useEffect(() => {
    const sinkron = () => setSub(bacaSubDari(daftar, new URLSearchParams(window.location.search).get("sub")));
    sinkron();
    window.addEventListener("popstate", sinkron);
    return () => window.removeEventListener("popstate", sinkron);
  }, [daftar]);

  const pilih = useCallback(
    (k: string) => {
      setSub(k);
      window.history.replaceState(null, "", urlSubDari(daftar, tab, window.location.pathname, window.location.search, k));
    },
    [daftar, tab]
  );
  return { sub, pilih };
}

export function SubPilih({ daftar, aktif, onPilih, label }: { daftar: SubItem[]; aktif: string; onPilih: (k: string) => void; label: string }) {
  const info = daftar.find((x) => x.kode === aktif);
  return (
    <>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
        {daftar.map((x) => (
          <button
            key={x.kode}
            type="button"
            role="tab"
            aria-selected={aktif === x.kode}
            onClick={() => onPilih(x.kode)}
            className={`min-h-[40px] rounded-full px-4 text-[13px] font-bold ${aktif === x.kode ? "bg-[#0F2A52] text-white" : "border border-[#DDE6F3] bg-white text-[#55657D] hover:bg-[#F8FAFC]"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {info && <p className="text-[12.5px] text-[#6B7A90]">{info.ket}</p>}
    </>
  );
}
