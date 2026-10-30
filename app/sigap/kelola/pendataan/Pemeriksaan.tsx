"use client";

// app/sigap/kelola/pendataan/Pemeriksaan.tsx
//
// (23 Okt 2026) Isi tab "5 · Pemeriksaan" Kelola Pendataan: tiga halaman pemeriksaan yang dulu hanya berupa tautan kini DISEMATKAN sebagai sub-pilihan
// (Identifikasi SLS · Lapangan per petugas · Foto & dokumentasi). Pilihan ikut di alamat (?tab=pemeriksaan&sub=...). Item "segera hadir" tetap
// ditampilkan di bawahnya lewat PintuMasuk. Tiap isi memakai komponen yang sama dengan halaman lamanya (alamat lama tetap hidup).

import { useCallback, useEffect, useMemo, useState } from "react";
import { SUB_PEMERIKSAAN, bacaSubPemeriksaan, urlSubPemeriksaan, type KodeSubPemeriksaan } from "@/lib/sigapPendataanTab";
import type { PetaFitur } from "@/lib/sigapFitur";
import KelolaFoto from "./KelolaFoto";
import MonIdentifikasi from "./MonIdentifikasi";
import MonLapangan from "./MonLapangan";
import PintuMasuk from "./PintuMasuk";

// (30 Okt 2026) Prop `fitur` (profil fitur kegiatan): sub yang fiturnya mati tidak ditampilkan; ?sub= ke sub yang mati jatuh ke sub tampil pertama.
export default function Pemeriksaan({ fitur }: { fitur?: PetaFitur }) {
  const daftar = useMemo(() => {
    const hidup = fitur ? SUB_PEMERIKSAAN.filter((x) => fitur[`pemeriksaan_${x.kode}` as const]) : SUB_PEMERIKSAAN;
    return hidup.length > 0 ? hidup : SUB_PEMERIKSAAN;
  }, [fitur]);
  const [sub, setSub] = useState<KodeSubPemeriksaan>("identifikasi");

  useEffect(() => {
    const sinkron = () => {
      const k = bacaSubPemeriksaan(new URLSearchParams(window.location.search).get("sub"));
      setSub(daftar.some((x) => x.kode === k) ? k : daftar[0].kode);
    };
    sinkron();
    window.addEventListener("popstate", sinkron);
    return () => window.removeEventListener("popstate", sinkron);
  }, [daftar]);

  const pilih = useCallback((k: KodeSubPemeriksaan) => {
    setSub(k);
    window.history.replaceState(null, "", urlSubPemeriksaan(window.location.pathname, window.location.search, k));
  }, []);

  const info = daftar.find((x) => x.kode === sub);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Pemeriksaan" className="flex flex-wrap gap-2">
        {daftar.map((x) => (
          <button
            key={x.kode}
            type="button"
            role="tab"
            aria-selected={sub === x.kode}
            onClick={() => pilih(x.kode)}
            className={`min-h-[40px] rounded-full px-4 text-[13px] font-bold ${sub === x.kode ? "bg-[#0F2A52] text-white" : "border border-[#DDE6F3] bg-white text-[#55657D] hover:bg-[#F8FAFC]"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {info && <p className="text-[12.5px] text-[#6B7A90]">{info.ket}</p>}
      {sub === "identifikasi" && <MonIdentifikasi tertanam />}
      {sub === "lapangan" && <MonLapangan tertanam />}
      {sub === "foto" && <KelolaFoto tertanam />}
      <PintuMasuk tab="pemeriksaan" />
    </div>
  );
}
