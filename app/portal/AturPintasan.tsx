"use client";

// app/portal/AturPintasan.tsx
//
// (30 Okt 2026) Lembar bawah "Atur menu saya": petugas memilih menu apa saja yang tampil sebagai pintasan di Beranda dan urutannya (lib/sigapPintasan.ts).
// Menu yang tidak dipilih tetap bisa dibuka dari daftar "Menu lainnya" di sini. Back HP menutup lembar (useTutupDenganBack).

import Link from "next/link";
import { useState } from "react";
import { MAKS_PINTASAN, geserPintasan, ubahPintasan } from "@/lib/sigapPintasan";
import { useTutupDenganBack } from "./useTutupDenganBack";

export type MenuPintasan = { kode: string; judul: string; href: string | null; sso?: boolean };

export default function AturPintasan({
  semua,
  tampil,
  onSimpan,
  onPulihkan,
  onTutup,
}: {
  semua: readonly MenuPintasan[];
  /** kode yang sedang tampil di Beranda (urut) */
  tampil: readonly string[];
  onSimpan: (kode: string[]) => void;
  onPulihkan: () => void;
  onTutup: () => void;
}) {
  const [daftar, setDaftar] = useState<string[]>([...tampil]);
  const [pesan, setPesan] = useState("");
  useTutupDenganBack(true, onTutup);
  const peta = new Map(semua.map((m) => [m.kode, m]));
  const terpilih = daftar.flatMap((k) => (peta.has(k) ? [peta.get(k)!] : []));
  const lain = semua.filter((m) => !daftar.includes(m.kode));
  const judul = (m: MenuPintasan) => m.judul.replace(/^Transport Lokal — /, "Translok ");

  function tambah(kode: string) {
    const h = ubahPintasan(daftar, kode, true);
    if (!h) return setPesan(`Pintasan maksimal ${MAKS_PINTASAN}. Lepas satu dulu.`);
    setPesan("");
    setDaftar(h);
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end bg-black/45" role="dialog" aria-modal="true" aria-label="Atur menu saya" onClick={onTutup}>
      <div className="mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-[22px] bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none px-4 pb-2 pt-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6B7A90]">Atur menu saya</p>
          <p className="mt-0.5 text-[13px] leading-snug text-[#55657D]">Pilih menu yang tampil di Beranda dan urutannya. Tersimpan di HP ini untuk akun Anda.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-2">
          <h3 className="mt-1 text-[12.5px] font-extrabold text-[#0F2A52]">Pintasan di Beranda ({terpilih.length}/{MAKS_PINTASAN})</h3>
          {terpilih.length === 0 && <p className="mt-1 text-[12.5px] text-[#6B7A90]">Belum ada pintasan. Tambahkan dari daftar di bawah.</p>}
          <ul className="mt-1.5 space-y-1.5">
            {terpilih.map((m, i) => (
              <li key={m.kode} className="flex min-h-[48px] items-center gap-1.5 rounded-[12px] border border-[#DCE5F2] bg-white pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#0F2A52]">{judul(m)}</span>
                <button type="button" aria-label={`Naikkan ${judul(m)}`} disabled={i === 0} onClick={() => setDaftar((d) => geserPintasan(d, m.kode, -1))} className="grid h-11 w-10 place-items-center rounded-[10px] text-[16px] text-[#44546F] active:bg-[#EAF1FC] disabled:opacity-30">
                  ↑
                </button>
                <button type="button" aria-label={`Turunkan ${judul(m)}`} disabled={i === terpilih.length - 1} onClick={() => setDaftar((d) => geserPintasan(d, m.kode, 1))} className="grid h-11 w-10 place-items-center rounded-[10px] text-[16px] text-[#44546F] active:bg-[#EAF1FC] disabled:opacity-30">
                  ↓
                </button>
                <button type="button" aria-label={`Lepas ${judul(m)} dari pintasan`} onClick={() => setDaftar((d) => ubahPintasan(d, m.kode, false) ?? d)} className="grid h-11 w-10 place-items-center rounded-[10px] text-[15px] font-bold text-[#B42329] active:bg-[#FDE8E8]">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {lain.length > 0 && (
            <>
              <h3 className="mt-4 text-[12.5px] font-extrabold text-[#0F2A52]">Menu lainnya</h3>
              <ul className="mt-1.5 space-y-1.5">
                {lain.map((m) => (
                  <li key={m.kode} className="flex min-h-[48px] items-center gap-1.5 rounded-[12px] border border-[#EEF2F7] bg-[#F7FAFF] pl-3 pr-1">
                    {m.href && !m.sso ? (
                      <Link href={m.href} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#1B2B4B] underline-offset-2 active:underline">
                        {judul(m)}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#1B2B4B]">{judul(m)}</span>
                    )}
                    <button type="button" onClick={() => tambah(m.kode)} className="min-h-[40px] rounded-[10px] bg-[#EAF1FC] px-3 text-[12.5px] font-bold text-[#1F5FD1] active:bg-[#DCE8FB]">
                      + Pintasan
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {pesan && <p className="mt-2 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold text-[#8A6200]">{pesan}</p>}
        </div>
        <div className="flex flex-none gap-2 border-t border-[#EEF2F7] px-4 py-3">
          <button type="button" onClick={onPulihkan} className="min-h-[48px] flex-1 rounded-[12px] border border-[#CBD6E6] bg-white text-[13.5px] font-bold text-[#44546F] active:bg-[#F1F5FC]">
            Pulihkan bawaan
          </button>
          <button type="button" onClick={() => onSimpan(daftar)} className="min-h-[48px] flex-[1.3] rounded-[12px] bg-[#1F5FD1] text-[14px] font-extrabold text-white active:bg-[#1A4FB8]">
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
