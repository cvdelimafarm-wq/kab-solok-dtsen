"use client";

// app/sigap/sampel/useSampel.ts
//
// (30 Okt 2026) Pengambil data "Sampel per SLS" untuk HP petugas. Menampilkan salinan terakhir yang tersimpan di perangkat lebih dulu (daftar tetap bisa dibuka tanpa
// sinyal setelah pernah dimuat), lalu memperbarui dari server. Penggantian sampel dikirim langsung (butuh sinyal) dan data dimuat ulang sesudahnya.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { alamatMasukKembali, apiPortal, pemilikSesi } from "@/app/portal/sesi";
import { API_SAMPEL, type DataSampelSaya } from "@/lib/sampelSls";

const kunciSimpan = (k: number) => `sigap_sampel_${pemilikSesi() ?? 0}_${k}`;

function bacaSimpan(k: number): DataSampelSaya | null {
  try {
    const m = window.localStorage.getItem(kunciSimpan(k));
    if (!m) return null;
    const d = JSON.parse(m) as DataSampelSaya;
    return d && Array.isArray(d.sampel) && d.kegiatan?.id === k ? d : null;
  } catch {
    return null;
  }
}
function tulisSimpan(k: number, d: DataSampelSaya) {
  try {
    window.localStorage.setItem(kunciSimpan(k), JSON.stringify(d));
  } catch {
    /* penyimpanan penuh/tertutup: abaikan */
  }
}

export function useSampelSaya(kegiatanId: number | null) {
  const router = useRouter();
  const [data, setData] = useState<DataSampelSaya | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [daring, setDaring] = useState(true);
  const permintaan = useRef(0);

  const muat = useCallback(async () => {
    if (kegiatanId == null) return;
    const no = ++permintaan.current;
    setMemuat(true);
    try {
      const d = await apiPortal<DataSampelSaya>(`${API_SAMPEL}?k=${kegiatanId}`);
      if (no !== permintaan.current) return;
      setData(d);
      setGalat(null);
      setDaring(true);
      tulisSimpan(kegiatanId, d);
    } catch (e) {
      if (no !== permintaan.current) return;
      const pesan = e instanceof Error ? e.message : "Sampel belum bisa dimuat.";
      if (pesan === "SESI_BERAKHIR") {
        router.replace(alamatMasukKembali());
        return;
      }
      setDaring(false);
      setGalat(pesan);
    } finally {
      if (no === permintaan.current) setMemuat(false);
    }
  }, [kegiatanId, router]);

  useEffect(() => {
    if (kegiatanId == null) return;
    setData(bacaSimpan(kegiatanId));
    setGalat(null);
    void muat();
  }, [kegiatanId, muat]);

  // kembali ke aplikasi/tab -> perbarui
  useEffect(() => {
    const saatKembali = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", saatKembali);
    return () => document.removeEventListener("visibilitychange", saatKembali);
  }, [muat]);

  async function kirim(aksi: "ganti" | "batal", isi: Record<string, unknown>): Promise<void> {
    if (kegiatanId == null) return;
    await apiPortal(API_SAMPEL, { method: "POST", body: JSON.stringify({ aksi, k: kegiatanId, ...isi }) });
    await muat();
  }

  return {
    data,
    /** galat hanya ditampilkan bila belum ada data sama sekali; selain itu dianggap "sedang luring" */
    galat: !data ? galat : null,
    luring: !daring && !!data,
    memuat,
    muat,
    ganti: (utama_id: number, cadangan_id: number, alasan: string) => kirim("ganti", { utama_id, cadangan_id, alasan }),
    batal: (cadangan_id: number) => kirim("batal", { cadangan_id }),
  };
}
