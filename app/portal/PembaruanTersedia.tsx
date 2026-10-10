"use client";

// app/portal/PembaruanTersedia.tsx
//
// (10 Okt 2026) Banyak deploy kecil -> HP yang aplikasinya terbuka lama masih menjalankan kode lama. Server melaporkan id build-nya di header X-Build-Id
// (next.config.js); bila beda dengan build di HP, tampil ajakan memuat ulang. Saat Beranda dibuka kembali dari latar belakang, dimuat ulang otomatis
// (Beranda tidak sedang berisi isian). Data simpanan TIDAK dibuang karena deploy: hanya jenis data yang skemanya naik yang diambil ulang (dataBersama.ts).

import { useEffect, useState } from "react";
import { BUILD_ID_KLIEN, infoBuild, pendengarBuild } from "./sesi";

const beda = () => !!infoBuild.server && infoBuild.server !== BUILD_ID_KLIEN && BUILD_ID_KLIEN !== "dev";

export default function PembaruanTersedia({ bolehOtomatis = false }: { bolehOtomatis?: boolean }) {
  const [ada, setAda] = useState(false);
  useEffect(() => {
    const cek = () => setAda(beda());
    cek();
    pendengarBuild.add(cek);
    const kembali = () => {
      if (document.visibilityState === "visible" && bolehOtomatis && beda()) window.location.reload();
    };
    document.addEventListener("visibilitychange", kembali);
    return () => {
      pendengarBuild.delete(cek);
      document.removeEventListener("visibilitychange", kembali);
    };
  }, [bolehOtomatis]);
  if (!ada) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-[16px] border-l-4 border-[#1F5FD1] bg-[#E6EEFC] px-3.5 py-2.5 text-[12.5px] leading-snug text-[#0F2A52]">
      <span className="min-w-0 flex-1">
        <b className="block text-[13px]">Pembaruan aplikasi tersedia</b>
        Muat ulang agar memakai versi terbaru. Data Anda tetap tersimpan.
      </span>
      <button type="button" onClick={() => window.location.reload()} className="min-h-[40px] flex-none rounded-full bg-[#1F5FD1] px-3.5 text-[12px] font-extrabold text-white">
        Muat ulang
      </button>
    </div>
  );
}
