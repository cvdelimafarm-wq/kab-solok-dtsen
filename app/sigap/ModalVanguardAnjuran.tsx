"use client";

// app/sigap/ModalVanguardAnjuran.tsx
//
// (3 Nov 2026) Pop-up ringan Vanguard (mode TIDAK wajib) di tab Hari ini: sekali sehari, hanya selama peserta belum pernah berlatih (lib/vanguardAnjuran.ts).
// Modal wajib N hari berturut-turut ada di ModalVanguardWajib.tsx. Catatan tampil disimpan di HP (localStorage, try/catch); tanpa penyimpanan: sekali per pemuatan halaman.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { alamatVanguard } from "@/lib/vanguard/navigasi";
import { bacaCatatanAnjuran, hariWib, putuskanAnjuran } from "@/lib/vanguardAnjuran";

const kunciSimpan = (kegiatanId: number): string => `sigap-vg-anjuran-${kegiatanId}`;

export default function ModalVanguardAnjuran({ kegiatanId, benar }: { kegiatanId: number; benar: number }) {
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    const sekarang = Date.now();
    let catatan = null;
    try { catatan = bacaCatatanAnjuran(JSON.parse(window.localStorage.getItem(kunciSimpan(kegiatanId)) ?? "null")); } catch { /* tanpa penyimpanan */ }
    if (!putuskanAnjuran({ wajib: false, benar }, catatan, sekarang)) return;
    try { window.localStorage.setItem(kunciSimpan(kegiatanId), JSON.stringify({ hari: hariWib(sekarang) })); } catch { /* tampil sekali per pemuatan */ }
    setTampil(true);
  }, [kegiatanId, benar]);

  const tutup = () => setTampil(false);
  useTutupDenganBack(tampil, tutup);
  if (!tampil) return null;

  const href = alamatVanguard({ kegiatan: kegiatanId, dari: `${window.location.pathname}${window.location.search}` });
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="vg-anjuran-judul" onClick={tutup}>
      <div className="w-full max-w-[420px] rounded-[20px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <b id="vg-anjuran-judul" className="block text-[17px] font-extrabold leading-snug text-[#2A1763]">Coba Vanguard dulu</b>
        <p className="mt-1.5 text-[14px] leading-snug text-[#333]">
          Latihan mengisi kuesioner dengan kasus nyata. Hasil Anda dicatat dan membantu Anda siap sebelum Pretest. Cukup beberapa menit.
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={tutup} className="min-h-[44px] flex-1 rounded-[12px] border border-[#D6D0E8] bg-white text-[14px] font-bold text-[#2A1763]">Nanti</button>
          <Link href={href} className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] bg-[#FFC000] text-[14px] font-extrabold text-[#111]">Mulai latihan</Link>
        </div>
      </div>
    </div>
  );
}
