"use client";

// app/sigap/sampel/useAlokasi.ts
//
// (7 Nov 2026) Pengambil data "Wilayah saya" (alokasi sub SLS) untuk HP petugas. Salinan terakhir disimpan di perangkat (daftar tetap bisa dibuka tanpa sinyal
// setelah pernah dimuat), lalu diperbarui dari server. Daftar KK master dimuat per sub SLS saat dibuka dan juga disimpan di perangkat.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPortal, pemilikSesi } from "@/app/portal/sesi";
import { API_ALOKASI, type DataAlokasiSaya, type KkMaster } from "@/lib/alokasiWilayah";

const kunciData = (k: number) => `sigap_alokasi_${pemilikSesi() ?? 0}_${k}`;
const kunciKk = (k: number, s: string) => `sigap_alokasi_kk_${pemilikSesi() ?? 0}_${k}_${s}`;

function baca<T>(kunci: string): T | null {
  try {
    const m = window.localStorage.getItem(kunci);
    return m ? (JSON.parse(m) as T) : null;
  } catch {
    return null;
  }
}
function tulis(kunci: string, nilai: unknown) {
  try {
    window.localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    /* penyimpanan penuh/tertutup: abaikan */
  }
}

export function useAlokasiSaya(kegiatanId: number | null) {
  const [data, setData] = useState<DataAlokasiSaya | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [luring, setLuring] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const permintaan = useRef(0);

  const muat = useCallback(async () => {
    if (kegiatanId == null) return;
    const no = ++permintaan.current;
    setMemuat(true);
    try {
      const d = await apiPortal<DataAlokasiSaya>(`${API_ALOKASI}?k=${kegiatanId}`);
      if (no !== permintaan.current) return;
      setData(d);
      setGalat(null);
      setLuring(false);
      tulis(kunciData(kegiatanId), d);
    } catch (e) {
      if (no !== permintaan.current) return;
      setLuring(true);
      setGalat(e instanceof Error ? e.message : "Wilayah belum bisa dimuat.");
    } finally {
      if (no === permintaan.current) setMemuat(false);
    }
  }, [kegiatanId]);

  useEffect(() => {
    if (kegiatanId == null) return;
    const simpan = baca<DataAlokasiSaya>(kunciData(kegiatanId));
    setData(simpan && simpan.kegiatan?.id === kegiatanId && Array.isArray(simpan.wilayah) ? simpan : null);
    setGalat(null);
    void muat();
  }, [kegiatanId, muat]);

  useEffect(() => {
    const saatKembali = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", saatKembali);
    return () => document.removeEventListener("visibilitychange", saatKembali);
  }, [muat]);

  /** Daftar KK satu sub SLS: server bila ada sinyal, salinan perangkat bila tidak. `salinan` = true bila dari perangkat. */
  const muatKk = useCallback(
    async (idsubsls: string): Promise<{ kk: KkMaster[]; salinan: boolean }> => {
      if (kegiatanId == null) return { kk: [], salinan: false };
      try {
        const r = await apiPortal<{ kk: KkMaster[] }>(`${API_ALOKASI}?k=${kegiatanId}&s=${idsubsls}`);
        tulis(kunciKk(kegiatanId, idsubsls), r.kk);
        return { kk: r.kk, salinan: false };
      } catch (e) {
        const simpan = baca<KkMaster[]>(kunciKk(kegiatanId, idsubsls));
        if (simpan) return { kk: simpan, salinan: true };
        throw e;
      }
    },
    [kegiatanId],
  );

  return { data, galat: !data ? galat : null, luring: luring && !!data, memuat, muat, muatKk };
}
