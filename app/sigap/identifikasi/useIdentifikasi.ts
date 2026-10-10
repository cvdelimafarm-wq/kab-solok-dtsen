"use client";

// app/sigap/identifikasi/useIdentifikasi.ts
//
// (10 Okt 2026) Pengambil data Lembar Identifikasi SLS (PML) bersama halaman daftar & halaman isian: /api/portal/identifikasi.
// `dariAman` = alamat induk dari ?dari= (hanya path internal), dipakai tombol kembali.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
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
  const [data, setData] = useState<DataIdentifikasi | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return router.replace("/");
    try {
      setData(await apiPortal<DataIdentifikasi>("/api/portal/identifikasi"));
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
      setGalat(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [router]);

  useEffect(() => {
    muat();
    const c = () => document.visibilityState === "visible" && muat();
    document.addEventListener("visibilitychange", c);
    return () => document.removeEventListener("visibilitychange", c);
  }, [muat]);

  return { data, galat, muat };
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
