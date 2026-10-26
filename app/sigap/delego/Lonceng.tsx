"use client";

// app/sigap/delego/Lonceng.tsx
//
// (26 Okt 2026) Lonceng notifikasi Delego: hanya pesan berjenis delegasi_* dari keu_notifikasi_saya (notifikasi SIGAP yang sama). Menandai terbaca saat dibuka.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { aksiKeu } from "@/app/sigap/ro/useKeu";
import { normalisasiDaftar, tautanAman, type DaftarNotif } from "@/lib/keu/notifikasi";
import { tglPendek } from "@/lib/delego/hitung";

export default function Lonceng() {
  const [data, setData] = useState<DaftarNotif | null>(null);
  const [buka, setBuka] = useState(false);
  const kotak = useRef<HTMLDivElement>(null);

  const muat = useCallback(async () => {
    const r = await aksiKeu("keu_notifikasi_saya", { p_batas: 40 });
    if (r.ok) setData(normalisasiDaftar(r.data));
  }, []);
  useEffect(() => {
    void muat();
    const t = window.setInterval(() => void muat(), 120_000);
    return () => window.clearInterval(t);
  }, [muat]);
  useEffect(() => {
    if (!buka) return;
    const luar = (e: MouseEvent) => {
      if (kotak.current && !kotak.current.contains(e.target as Node)) setBuka(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    document.addEventListener("mousedown", luar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", luar);
      document.removeEventListener("keydown", esc);
    };
  }, [buka]);

  const daftar = (data?.daftar ?? []).filter((n) => String(n.jenis).startsWith("delegasi_"));
  const belum = daftar.filter((n) => !n.dibaca_at).length;

  const tandaiSemua = async () => {
    await aksiKeu("keu_notifikasi_tandai", {});
    await muat();
  };
  const tandaiSatu = async (id: number) => {
    await aksiKeu("keu_notifikasi_tandai", { p_id: id });
    await muat();
  };

  return (
    <div className="relative" ref={kotak}>
      <button
        type="button"
        onClick={() => setBuka((b) => !b)}
        aria-label={belum > 0 ? `Notifikasi Delego, ${belum} belum dibaca` : "Notifikasi Delego"}
        aria-expanded={buka}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/30 text-white hover:bg-white/10 lg:border-[#D5DCE2] lg:text-[#0B3B38] lg:hover:bg-[#F1F7F6]"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0" />
        </svg>
        {belum > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#B42329] px-1 text-center text-[11px] font-bold leading-[18px] text-white">{belum > 99 ? "99+" : belum}</span>}
      </button>
      {buka && (
        <div className="absolute right-0 z-50 mt-2 w-[min(340px,calc(100vw-32px))] rounded-xl border border-[#D5DCE2] bg-white shadow-lg" role="dialog" aria-label="Notifikasi Delego">
          <div className="flex items-center justify-between border-b border-[#E3E8EE] px-3 py-2">
            <span className="text-[14px] font-bold text-[#14212B]">Notifikasi Delego</span>
            {belum > 0 && (
              <button type="button" onClick={() => void tandaiSemua()} className="text-[12.5px] font-semibold text-[#0F6B63] hover:underline">
                Tandai semua terbaca
              </button>
            )}
          </div>
          <ul className="max-h-[360px] divide-y divide-[#EEF1F4] overflow-y-auto">
            {daftar.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-[#3B4A57]">Belum ada notifikasi.</li>}
            {daftar.map((n) => {
              // hasil kerja yang diserahkan dibaca pemberi di Papan (tautan basis data menuju Delegasi saya, halaman penerima)
              const tujuan = n.jenis === "delegasi_hasil" ? "/sigap/delego/papan" : tautanAman(n.tautan);
              const isi = (
                <>
                  <span className="flex items-start justify-between gap-2">
                    <span className={`text-[13.5px] ${n.dibaca_at ? "font-medium text-[#33404B]" : "font-bold text-[#14212B]"}`}>{n.judul}</span>
                    {!n.dibaca_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0F6B63]" aria-label="Belum dibaca" />}
                  </span>
                  {n.isi && <span className="mt-0.5 block text-[12.5px] leading-snug text-[#3B4A57]">{n.isi}</span>}
                  <span className="mt-0.5 block text-[11.5px] text-[#6B7783]">{tglPendek(n.dibuat_at.slice(0, 10))}</span>
                </>
              );
              return (
                <li key={n.id}>
                  {tujuan ? (
                    <Link href={tujuan} onClick={() => { void tandaiSatu(n.id); setBuka(false); }} className="block px-3 py-2.5 hover:bg-[#F1F7F6]">
                      {isi}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => void tandaiSatu(n.id)} className="block w-full px-3 py-2.5 text-left hover:bg-[#F1F7F6]">
                      {isi}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
