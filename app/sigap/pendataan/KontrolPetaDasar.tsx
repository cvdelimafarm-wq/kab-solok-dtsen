"use client";

// app/sigap/pendataan/KontrolPetaDasar.tsx
//
// (20 Okt 2026) Pilihan lapisan peta (Jalan / Titik saja) dan kartu "Peta untuk offline" di pojok kiri atas tab Peta.
// Mockup yang disetujui: https://claude.ai/artifact/XjnvEs48YBefH6FBEBXgGq (satelit TIDAK ikut: hanya online dan belum ada penyedia yang disetujui).

import { useState } from "react";
import { labelUkuran } from "@/lib/petaDasar";
import type { StatusDasar } from "./PetaDasar";
import type { DasarTim } from "./useDasar";

export default function KontrolPetaDasar({ dasar, status }: { dasar: DasarTim; status: StatusDasar | null }) {
  const [buka, setBuka] = useState(false);
  const { berkas, lapisan, setLapisan, unduh, berlaku, adaVersiBaru, ada, online, siapCek } = dasar;
  const persen = unduh.total > 0 ? Math.min(100, Math.round((unduh.diterima / unduh.total) * 100)) : 0;
  const hemat = typeof navigator !== "undefined" && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

  // tidak ada berkas untuk tim ini dan tidak ada salinan: jangan tampilkan apa pun (peta tetap titik di kanvas seperti biasa)
  if (siapCek && !berkas && !ada) return null;
  if (!siapCek) return null;

  const chip = (aktif: boolean, mati = false) =>
    `min-h-[32px] rounded-[9px] px-2.5 text-[11.5px] font-extrabold ${aktif ? "bg-[#0F2A52] text-white" : "text-[#5B6B84] active:bg-[#F1F5FC]"} ${mati ? "opacity-40" : ""}`;

  return (
    <div className="absolute left-2.5 top-2.5 z-[2] flex max-w-[calc(100%-70px)] flex-col items-start gap-1.5">
      <div className="flex items-center gap-1 rounded-[12px] bg-white p-[3px] shadow-[0_4px_12px_rgba(15,42,82,.15)]" role="group" aria-label="Lapisan peta">
        <button type="button" aria-pressed={lapisan === "jalan"} onClick={() => setLapisan("jalan")} className={chip(lapisan === "jalan")}>
          Jalan
        </button>
        <button type="button" aria-pressed={lapisan === "titik"} onClick={() => setLapisan("titik")} className={chip(lapisan === "titik")}>
          Titik saja
        </button>
        {berkas && (
          <button type="button" aria-expanded={buka} onClick={() => setBuka((b) => !b)} className={`${chip(buka)} ml-0.5 border-l border-[#E3E8F2] pl-2`}>
            {berlaku ? "Offline ✓" : "Offline"}
          </button>
        )}
      </div>

      {lapisan === "jalan" && status === "gagal" && (
        <p className="rounded-[10px] bg-[#FEF3C7] px-2.5 py-1 text-[10.5px] font-bold text-[#92400E]">
          {online ? "Peta jalan tidak bisa dimuat, tampil titik saja." : "Tanpa sinyal dan peta belum diunduh, tampil titik saja."}
        </p>
      )}

      {buka && berkas && (
        <div className="flex w-[min(300px,100%)] flex-col gap-2 rounded-[16px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.28)]">
          <b className="text-[13px] text-[#0F2A52]">Peta jalan wilayah tim</b>
          {berlaku ? (
            <>
              <p className="text-[11px] leading-snug text-[#5B6B84]">Tersimpan di HP dan dipakai otomatis saat tanpa sinyal. Ukuran {labelUkuran(berkas.ukuran)}.</p>
              <span className="text-[11px] font-bold text-[#166534]">Siap dipakai tanpa sinyal</span>
            </>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-[#5B6B84]">
                {adaVersiBaru ? "Ada versi peta yang lebih baru. " : "Simpan peta jalan wilayah tim di HP supaya tetap tampil tanpa sinyal. "}
                Unduh saat sinyal bagus atau di Wi-Fi. Ukuran {labelUkuran(berkas.ukuran)}.
                {hemat ? " Mode hemat data aktif di HP ini." : ""}
              </p>
              {unduh.fase === "jalan" && (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-[#E3E8F2]" role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100}>
                    <i className="block h-full rounded-full bg-[#1D4ED8]" style={{ width: `${persen}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-[#0F2A52]">Mengunduh {persen}%</span>
                </>
              )}
              {unduh.fase === "galat" && unduh.pesan && <p className="text-[11px] font-bold text-[#B91C1C]">{unduh.pesan}</p>}
              {unduh.fase === "jalan" ? (
                <button type="button" onClick={dasar.batalkanUnduh} className="min-h-[44px] rounded-[12px] bg-[#EEF2F7] text-[12.5px] font-extrabold text-[#0F2A52]">
                  Batalkan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={dasar.mulaiUnduh}
                  disabled={!online}
                  className="min-h-[44px] rounded-[12px] bg-[#0F2A52] text-[12.5px] font-extrabold text-white disabled:opacity-40"
                >
                  {!online ? "Menunggu sinyal" : adaVersiBaru ? "Perbarui peta" : "Unduh sekarang"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
