"use client";

// app/sigap/kelola/perencanaan/notifikasi/useNotifikasi.ts
//
// (25 Okt 2026, tahap 30) Pengambil notifikasi akun yang masuk: fungsi keu_notifikasi_saya (baca, lewat gerbang) dan keu_notifikasi_tandai (tulis).
// Basis data hanya mengembalikan notifikasi milik akun sesi, tidak pernah milik akun lain.

import { useCallback, useEffect, useState } from "react";
import { aksiKeu } from "@/app/sigap/ro/useKeu";
import { normalisasiDaftar, type DaftarNotif } from "@/lib/keu/notifikasi";

export function useNotifikasi(batas = 100) {
  const [data, setData] = useState<DaftarNotif | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(async () => {
    const r = await aksiKeu("keu_notifikasi_saya", { p_batas: batas });
    if (r.ok) { setData(normalisasiDaftar(r.data)); setGalat(null); } else setGalat(r.pesan);
  }, [batas]);
  useEffect(() => {
    let hidup = true;
    void aksiKeu("keu_notifikasi_saya", { p_batas: batas }).then((r) => {
      if (!hidup) return;
      if (r.ok) { setData(normalisasiDaftar(r.data)); setGalat(null); } else setGalat(r.pesan);
    });
    return () => { hidup = false; };
  }, [batas]);
  const tandai = useCallback(async (id: number | null) => {
    const r = await aksiKeu("keu_notifikasi_tandai", id === null ? {} : { p_id: id });
    if (!r.ok) { setGalat(r.pesan); return false; }
    await muat();
    return true;
  }, [muat]);
  return { data, galat, muat, tandai };
}
