"use client";

// app/sigap/admin/Toast.tsx
//
// (2 Nov 2026) Pemberitahuan singkat di POJOK KANAN BAWAH layar untuk status yang tidak perlu menempel di baris/kartu: "Menyimpan…", "Tersimpan", atau galat.
// Pakai: const toast = useToast(); toast.tampil("simpan" | "ok" | "galat", "teks"); lalu <Toast isi={toast.isi} onTutup={toast.tutup} /> di mana saja (posisinya tetap).
// "ok" hilang sendiri; "simpan" menunggu hasil; "galat" bertahan sampai ditutup (agar tidak terlewat). Bukan modal (tidak menutupi layar), sehingga tombol Back HP tidak terpengaruh.

import { useCallback, useEffect, useRef, useState } from "react";

export type JenisToast = "simpan" | "ok" | "galat";
export type IsiToast = { jenis: JenisToast; teks: string };

export function useToast(lamaOkMs = 2500) {
  const [isi, setIsi] = useState<IsiToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hentikan = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const tampil = useCallback(
    (jenis: JenisToast, teks: string) => {
      hentikan();
      setIsi({ jenis, teks });
      if (jenis === "ok") timer.current = setTimeout(() => setIsi(null), lamaOkMs);
    },
    [hentikan, lamaOkMs],
  );
  const tutup = useCallback(() => {
    hentikan();
    setIsi(null);
  }, [hentikan]);
  useEffect(() => hentikan, [hentikan]);
  return { isi, tampil, tutup };
}

const GAYA: Record<JenisToast, string> = {
  simpan: "border-[#CBD6E6] bg-white text-[#1B2B4B]",
  ok: "border-[#A9D8B8] bg-[#EAF7EF] text-[#0B3A1F]",
  galat: "border-[#F0B4B4] bg-[#FDECEC] text-[#7A1A1A]",
};
const IKON: Record<JenisToast, string> = { simpan: "…", ok: "✓", galat: "✕" };

export function Toast({ isi, onTutup }: { isi: IsiToast | null; onTutup?: () => void }) {
  if (!isi) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] justify-end">
      <div
        role={isi.jenis === "galat" ? "alert" : "status"}
        aria-live={isi.jenis === "galat" ? "assertive" : "polite"}
        className={`pointer-events-auto flex max-w-[360px] items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold shadow-lg ${GAYA[isi.jenis]}`}
      >
        <span aria-hidden="true" className="mt-px">
          {IKON[isi.jenis]}
        </span>
        <span className="min-w-0 break-words">{isi.teks}</span>
        {isi.jenis === "galat" && onTutup && (
          <button type="button" onClick={onTutup} aria-label="Tutup pemberitahuan" className="ml-1 shrink-0 rounded px-1.5 text-[16px] leading-none text-[#7A1A1A] hover:bg-[#F7D4D4]">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
