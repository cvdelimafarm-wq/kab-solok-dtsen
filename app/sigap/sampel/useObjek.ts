"use client";

// app/sigap/sampel/useObjek.ts
//
// (8 Nov 2026, D3) Pengambil data "Sampel saya" untuk kegiatan MODEL 2/3 (daftar objek sampel dari pusat). Salinan terakhir disimpan di perangkat (daftar tetap terbuka tanpa
// sinyal setelah pernah dimuat). Kegiatan model 1 dijawab server dengan "tidak memakai daftar sampel model 2/3": itu BUKAN galat, data tetap null dan halaman memakai
// tampilan model 1. Mencatat hasil butuh sinyal (ditegakkan server); sesudah berhasil, salinan lokal diperbarui langsung lalu dimuat ulang di latar.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPortal, pemilikSesi } from "@/app/portal/sesi";
import { API_OBJEK, perbaruiHasilLokal, type DataObjekSaya, type HasilObjek } from "@/lib/sampelObjek";

const kunciData = (k: number) => `sigap_objek_${pemilikSesi() ?? 0}_${k}`;

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
function hapus(kunci: string) {
  try {
    window.localStorage.removeItem(kunci);
  } catch {
    /* abaikan */
  }
}

/** Jawaban server yang berarti "kegiatan ini bukan model 2/3" atau "bukan petugas": bukan galat bagi halaman ini. */
const BUKAN_UNTUK_SAYA = /tidak memakai daftar sampel model 2\/3|khusus PPL dan PML|belum aktif di basis data/i;

export function useObjekSaya(kegiatanId: number | null) {
  const [data, setData] = useState<DataObjekSaya | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [luring, setLuring] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const permintaan = useRef(0);

  const muat = useCallback(async () => {
    if (kegiatanId == null) return;
    const no = ++permintaan.current;
    setMemuat(true);
    try {
      const d = await apiPortal<DataObjekSaya>(`${API_OBJEK}?k=${kegiatanId}`);
      if (no !== permintaan.current) return;
      setData(d);
      setGalat(null);
      setLuring(false);
      tulis(kunciData(kegiatanId), d);
    } catch (e) {
      if (no !== permintaan.current) return;
      const pesan = e instanceof Error ? e.message : "Sampel belum bisa dimuat.";
      if (BUKAN_UNTUK_SAYA.test(pesan)) {
        setData(null);
        setGalat(null);
        setLuring(false);
        hapus(kunciData(kegiatanId));
      } else {
        setLuring(true);
        setGalat(pesan);
      }
    } finally {
      if (no === permintaan.current) setMemuat(false);
    }
  }, [kegiatanId]);

  useEffect(() => {
    if (kegiatanId == null) return;
    const simpan = baca<DataObjekSaya>(kunciData(kegiatanId));
    setData(simpan && simpan.kegiatan?.id === kegiatanId && Array.isArray(simpan.objek) ? simpan : null);
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

  /** Catat hasil satu objek (PPL pemilik). hasil null = hapus catatan. Melempar Error berisi penolakan server. */
  const catat = useCallback(
    async (objekId: number, hasil: HasilObjek | null, jumlahDidata: number | null): Promise<void> => {
      if (kegiatanId == null) return;
      const r = await apiPortal<{ ok: boolean; hasil: HasilObjek | null; jumlah_didata: number | null }>(API_OBJEK, {
        method: "POST",
        body: JSON.stringify({ aksi: "hasil", k: kegiatanId, objek: objekId, hasil, ...(jumlahDidata != null ? { jumlah_didata: jumlahDidata } : {}) }),
      });
      setData((d) => {
        if (!d) return d;
        const baru = perbaruiHasilLokal(d, objekId, r.hasil, r.jumlah_didata);
        tulis(kunciData(kegiatanId), baru);
        return baru;
      });
      void muat();
    },
    [kegiatanId, muat],
  );

  return { data, galat: !data ? galat : null, luring: luring && !!data, memuat, muat, catat };
}
