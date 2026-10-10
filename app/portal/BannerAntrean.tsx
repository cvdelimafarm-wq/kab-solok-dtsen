"use client";

// app/portal/BannerAntrean.tsx
//
// (10 Okt 2026) Pemberitahuan antrean kirim (app/portal/antreanKirim.ts): hasil yang tersimpan di HP tetapi belum sampai ke server (sinyal lemah),
// dan hasil yang ditolak server. Tidak tampil bila antrean kosong.

import { useState } from "react";
import { useAntrean, usePengirimAntrean } from "./antreanKirim";

export default function BannerAntrean({ satuan = "hasil" }: { satuan?: string }) {
  usePengirimAntrean();
  const { menunggu, ditolak, kirimSekarang, buangDitolak } = useAntrean();
  const [sibuk, setSibuk] = useState(false);
  if (menunggu.length === 0 && ditolak.length === 0) return null;
  return (
    <div className="space-y-2">
      {menunggu.length > 0 && (
        <div role="status" className="flex items-center gap-3 rounded-[16px] border-l-4 border-[#F4B400] bg-[#FFF4D6] px-3.5 py-2.5 text-[12.5px] leading-snug text-[#6B4A00]">
          <span className="min-w-0 flex-1">
            <b className="block text-[13px]">{menunggu.length} {satuan} belum terkirim ke server</b>
            Sudah tersimpan di HP ini dan akan dikirim otomatis saat sinyal baik. Jangan keluar dari akun sebelum terkirim.
          </span>
          <button
            type="button"
            disabled={sibuk}
            onClick={async () => {
              setSibuk(true);
              await kirimSekarang();
              setSibuk(false);
            }}
            className="min-h-[40px] flex-none rounded-full bg-[#0F2A52] px-3.5 text-[12px] font-extrabold text-white disabled:opacity-60"
          >
            {sibuk ? "Mengirim…" : "Kirim sekarang"}
          </button>
        </div>
      )}
      {ditolak.length > 0 && (
        <div role="alert" className="rounded-[16px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3.5 py-2.5 text-[12.5px] leading-snug text-[#7A1D22]">
          <b className="block text-[13px]">{ditolak.length} {satuan} ditolak server</b>
          {ditolak.map((d) => (
            <span key={d.id} className="block">
              • {d.galat ?? "Ditolak."}
            </span>
          ))}
          <button type="button" onClick={() => buangDitolak()} className="mt-1.5 min-h-[36px] rounded-full bg-white px-3 text-[12px] font-extrabold text-[#7A1D22]">
            Mengerti, tutup
          </button>
        </div>
      )}
    </div>
  );
}
