"use client";

// app/sigap/pelatihan/IsiKuis.tsx
//
// (3 Nov 2026) Isi langkah Kuis Live / Adu Sigap, dipindah dari page.tsx supaya dipakai bersama tab Hari ini dan tab Pelatihan
// (berkas page.tsx tidak boleh mengekspor komponen lain). Perilaku tidak berubah. Kuis TIDAK di-cache: status ruang dipantau tiap ~5 detik.

import { useEffect, useRef } from "react";
import { useState } from "react";
import Link from "next/link";
import { fetchJson } from "../admin/api";
import type { Hub } from "./komponen";

const TOMBOL = "mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-[13px] px-4 py-2.5 text-[14px] font-extrabold transition sm:w-auto";

/** (7 Okt 2026) Isi langkah Kuis Live (tambahan). Memantau status ruang tiap ~5 dtk supaya tombol Gabung muncul begitu admin membuka ruang. */
export function IsiKuis({ k, segarkan }: { k: NonNullable<Hub["kuis"]>; segarkan: () => void }) {
  const [live, setLive] = useState<{ aktif: boolean; status: string | null; ruangId: number | null; judul: string | null } | null>(null);
  const tandaHub = useRef(`${k.ada_ruang_aktif}`);
  tandaHub.current = `${k.ada_ruang_aktif}`;
  const tandaLive = useRef("");
  useEffect(() => {
    let batal = false;
    let timer: ReturnType<typeof setTimeout>;
    async function putar() {
      try {
        if (!document.hidden) {
          const d = await fetchJson<{ ada: boolean; ruang?: { id: number; status: string; judul: string } }>(`/api/sigap/pelatihan/kuis?kelas=${k.kelas ?? 1}`);
          if (batal) return;
          const aktif = !!d.ada && !!d.ruang && d.ruang.status !== "selesai";
          setLive({ aktif, status: d.ruang?.status ?? null, ruangId: d.ruang?.id ?? null, judul: d.ruang?.judul ?? null });
          // ruang dibuka/ditutup di server -> segarkan hub sekali (sudah_gabung, pernah_ikut, dst.)
          const tanda = `${aktif}:${d.ruang?.id ?? ""}`;
          if (tanda !== tandaLive.current) {
            const pertama = tandaLive.current === "";
            tandaLive.current = tanda;
            if (!pertama || `${aktif}` !== tandaHub.current) segarkan();
          }
        }
      } catch {
        /* abaikan: dicoba lagi */
      }
      if (!batal) timer = setTimeout(putar, 5000);
    }
    putar();
    return () => {
      batal = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const aktif = live ? live.aktif : k.ada_ruang_aktif;
  const status = live ? live.status : k.status;
  const judul = live?.judul ?? k.judul;
  const ket = "text-[13px] text-[#5B6B84]";
  if (aktif)
    return (
      <>
        <p className="text-[13px] font-semibold text-[#13794B]">{status === "lobi" ? "Adu Sigap dibuka — ayo bergabung!" : "Adu Sigap sedang berlangsung."}{judul ? ` · ${judul}` : ""}</p>
        <Link href={`/sigap/pelatihan/kuis?kelas=${k.kelas ?? 1}&gabung=1`} className={`${TOMBOL} w-full bg-[#0F2A52] text-white hover:bg-[#0A1E3D]`}>
          {k.sudah_gabung ? "🎮 Masuk kembali ke kuis →" : "🎮 Gabung kuis →"}
        </Link>
      </>
    );
  if (k.pernah_ikut)
    return (
      <>
        <p className={ket}>Anda sudah ikut kuis. Skor dicatat sebagai nilai tambahan.</p>
        <Link href={`/sigap/pelatihan/kuis?kelas=${k.kelas ?? 1}`} className="mt-1 inline-block text-[12px] font-semibold text-[#1F5FD1] underline">Lihat hasil</Link>
      </>
    );
  if (k.ada_ruang_selesai) return <p className={ket}>Kuis sudah selesai dan Anda belum tercatat ikut.</p>;
  return <p className={ket}>Kuis dibuka oleh pemandu saat sesi pelatihan. Tombol Gabung muncul otomatis di sini.</p>;
}
