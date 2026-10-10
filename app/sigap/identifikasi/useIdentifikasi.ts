"use client";

// app/sigap/identifikasi/useIdentifikasi.ts
//
// (10 Okt 2026) Pengambil data Lembar Identifikasi SLS (PML) bersama halaman daftar & halaman isian: /api/portal/identifikasi.
// `dariAman` = alamat induk dari ?dari= (hanya path internal), dipakai tombol kembali.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/app/portal/dataBersama";
import type { RingkasIdentifikasi, SubIdentifikasi } from "@/lib/identifikasi";

export type DataIdentifikasi = { sekarang: string; pml: { id: number; nama: string }; sub: SubIdentifikasi[]; ringkas: RingkasIdentifikasi };

export function dariAman(): string | null {
  try {
    const d = new URLSearchParams(window.location.search).get("dari");
    return d && d.startsWith("/") && !d.startsWith("//") ? d : null;
  } catch {
    return null;
  }
}

export function useIdentifikasi() {
  const router = useRouter();
  // (10 Okt 2026) Lewat simpanan bersama (app/portal/dataBersama.ts): daftar sudah diambil lebih dulu dari halaman tahap, jadi langsung tampil;
  // setelah menyimpan hasil (apiPortal POST) simpanan ditandai kedaluwarsa dan dimuat ulang di belakang.
  const d = useData<DataIdentifikasi>("/api/portal/identifikasi", { segarMs: 5_000, interval: 180_000 });
  useEffect(() => {
    if (d.galat === "SESI_BERAKHIR") router.replace("/");
  }, [d.galat, router]);
  const galat = d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null;
  return { data: d.data, galat, muat: d.muat };
}

/** "<1" untuk perkiraan di bawah satu KK, selain itu dibulatkan. */
export function tampilAwal(n: number): string {
  if (n > 0 && n < 1) return "<1";
  return String(Math.round(n));
}

export function tglJam(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const w = new Date(d.getTime() + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${w.getUTCDate()} ${b[w.getUTCMonth()]} ${p(w.getUTCHours())}.${p(w.getUTCMinutes())}`;
}
