"use client";

// app/sigap/KartuButirSaya.tsx
//
// (14 Nov 2026, Fase 2c) Kartu "Butir kerja saya" di tab Hari Ini (Translok) untuk MITRA: PPL mendata sampel, PML memeriksa dokumen.
// Keputusan Iqbal 13 Nov: mitra tidak masuk Delego; butir kerjanya tampil di Hari Ini. Server memutuskan apakah kartu tampil
// (GET /api/sigap/butir-saya?kegiatan=ID). Gagal memuat = tidak tampil apa pun. Hanya baca; capaian dari laporan harian.

import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { LABEL_STATUS_BUTIR, type ButirMitra } from "@/lib/butirMitra";

type Keadaan = { ada: false } | { ada: true; butir: ButirMitra };
const WARNA: Record<ButirMitra["status"], string> = {
  selesai: "bg-[#E3F5EC] text-[#0B6B45]", sesuai: "bg-[#EAF1FB] text-[#1A47A8]", tertinggal: "bg-[#FDECEC] text-[#9B2C2C]",
  belum_mulai: "bg-[#EEF1F5] text-[#3F4C5C]", tanpa_target: "bg-[#FFF6DD] text-[#5C3D00]",
};

export default function KartuButirSaya({ kegiatanId }: { kegiatanId: number }) {
  const [d, setD] = useState<Keadaan | null>(null);
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const r = await apiPortal<Keadaan>(`/api/sigap/butir-saya?kegiatan=${kegiatanId}`);
        if (!batal) setD(r);
      } catch { /* gagal memuat = kartu tidak tampil */ }
    })();
    return () => { batal = true; };
  }, [kegiatanId]);
  if (!d || !d.ada) return null;
  const b = d.butir;
  return (
    <section className="rounded-[18px] border border-[#CFE0F5] bg-white p-3.5 shadow-[0_4px_14px_rgba(18,49,95,.10)]" aria-label="Butir kerja saya">
      <div className="flex items-center gap-3">
        <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] bg-[#EAF1FB] text-[13px] font-extrabold text-[#12315F]" aria-hidden>{b.persen}%</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-extrabold leading-snug text-[#12315F]">Butir kerja saya: {b.judul.toLowerCase()}</b>
          <span className="block text-[12.5px] leading-snug text-[#55657D]">
            {b.realisasi} dari {b.target} {b.satuan}{b.peran === "ppl" && b.wilayah > 0 ? ` · ${b.wilayah} wilayah` : ""}
          </span>
        </span>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold ${WARNA[b.status]}`}>{LABEL_STATUS_BUTIR[b.status]}</span>
      </div>
      {b.target > 0 && (
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#EEF2F6]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={b.persen} aria-label="Capaian">
          <div className={`h-full rounded-full ${b.status === "tertinggal" ? "bg-[#C2362B]" : "bg-[#0F8A4F]"}`} style={{ width: `${b.persen}%` }} />
        </div>
      )}
      <p className="m-0 mt-2 text-[12.5px] leading-snug text-[#3B4A57]">
        {b.status === "selesai" ? "Target sudah tercapai. Terima kasih."
          : b.status === "tanpa_target" ? "Alokasi wilayah Anda belum diatur. Hubungi PML atau Ketua Tim."
          : b.perHari ? `Sisa ${b.sisa} ${b.satuan} dalam ${b.sisaHari} hari: sekitar ${b.perHari} ${b.satuan} per hari.` : `Sisa ${b.sisa} ${b.satuan}.`}
        {" "}Capaian dihitung dari laporan harian Anda.
      </p>
    </section>
  );
}
