"use client";

// app/sigap/kelola/pendataan/useKinerja.ts
// (19 Okt 2026) Muatan data Fase 2-4 (transport, poin harian, anggaran) untuk tab Monitoring. Dimuat hanya saat variabelnya dipilih;
// segar otomatis tiap 60 dtk; bila masih ada jarak jalan yang menunggu dihitung (`tertunda`), dimuat ulang lebih cepat.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import type { DataKinerja } from "@/lib/monitorKinerja";

export function useKinerja(aktif: boolean) {
  const router = useRouter();
  const [data, setData] = useState<DataKinerja | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const berjalan = useRef(false);

  const muat = useCallback(
    async (segar = false) => {
      if (berjalan.current) return;
      if (!bacaSesi()) return router.replace("/");
      berjalan.current = true;
      setMemuat(true);
      try {
        setData(await apiPortal<DataKinerja>(`/api/portal/pendataan/monitoring/kinerja${segar ? "?segar=1" : ""}`));
        setGalat(null);
      } catch (e) {
        if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
        setGalat(e instanceof Error ? e.message : "Gagal memuat.");
      } finally {
        berjalan.current = false;
        setMemuat(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!aktif) return;
    void muat();
    const a = setInterval(() => document.visibilityState === "visible" && void muat(), 60_000);
    return () => clearInterval(a);
  }, [aktif, muat]);

  const tertunda = data?.tertunda ?? 0;
  useEffect(() => {
    if (!aktif || tertunda <= 0) return;
    const t = setTimeout(() => void muat(), 9_000);
    return () => clearTimeout(t);
  }, [aktif, tertunda, data?.sekarang, muat]);

  return { data, galat, memuat, muat };
}
