"use client";

// app/portal/KartuAnomali.tsx
//
// (31 Okt 2026) Kartu "Temuan anomali" di Beranda petugas: tampil hanya bila ada temuan yang menunggu konfirmasi akun ini (impor admin -> ditugaskan otomatis).
// Data dari GET /api/sigap/anomali?mode=saya. Gagal memuat atau tidak ada temuan = tidak tampil apa pun (Beranda tidak terganggu). Tombol >= 44px.

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiPortal } from "./sesi";

export default function KartuAnomali() {
  const [menunggu, setMenunggu] = useState(0);

  useEffect(() => {
    let batal = false;
    apiPortal<{ ringkas?: { menunggu?: number } }>("/api/sigap/anomali?mode=saya")
      .then((d) => {
        if (!batal) setMenunggu(Number(d.ringkas?.menunggu) || 0);
      })
      .catch(() => {
        /* diam: kartu anomali hanya tambahan */
      });
    return () => {
      batal = true;
    };
  }, []);

  if (menunggu <= 0) return null;
  return (
    <section aria-label="Temuan anomali" className="space-y-3">
      <article aria-label="Temuan anomali perlu dikonfirmasi" className="rounded-[20px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
        <span className="text-[10.5px] font-extrabold tracking-[0.14em] text-[#6B7A90]">TEMUAN ANOMALI</span>
        <b className="mt-0.5 block text-[16px] font-extrabold leading-snug text-[#0F2A52]">{menunggu} temuan perlu Anda konfirmasi</b>
        <div className="mt-2 flex items-center gap-3 rounded-[14px] border-l-4 border-[#F4B400] bg-[#F7FAFF] py-2.5 pl-3 pr-2.5">
          <span className="min-w-0 flex-1 text-[13px] leading-snug text-[#33445C]">Pilih penyebab tiap temuan agar kesalahan yang sama tidak terulang di pendataan berikutnya.</span>
          <Link href="/sigap/anomali" aria-label={`Buka ${menunggu} temuan anomali`} className="inline-flex min-h-[44px] flex-none items-center rounded-[12px] bg-[#0F2A52] px-4 text-[13px] font-extrabold text-white">
            Buka
          </Link>
        </div>
      </article>
    </section>
  );
}
