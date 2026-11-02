"use client";

// app/sigap/pelatihan/dataPel.ts
//
// (3 Nov 2026) Data tab pelatihan lewat simpanan bersama (app/portal/dataBersama.ts) -- permintaan user: pindah antar tab (Hari ini, Instrumen, Pelatihan, Monitoring)
// memuat dari awal lagi. Kini: data terakhir langsung tampil (bahkan setelah aplikasi ditutup), lalu diperbarui diam-diam bila sudah lewat umur segarnya
// (profil per alamat ada di dataBersama.ts). Alamat otomatis disisipi ?kegiatan=ID seperti fetchJson. Kuis live, tes, kuis pra, dan pulsa TIDAK memakai berkas ini.

import { useEffect } from "react";
import { useData, type HasilData, type OpsiData } from "@/app/portal/dataBersama";
import { keMasuk, urlPelatihan } from "../admin/api";

/**
 * Seperti `useData`, tetapi untuk API pelatihan: ?kegiatan= disisipkan, dan sesi habis (SESI_BERAKHIR) mengarahkan ke halaman masuk
 * (galat itu tidak diteruskan sebagai pesan).
 */
export function useDataPel<T>(path: string, opsi: OpsiData = {}): HasilData<T> {
  const h = useData<T>(urlPelatihan(path), opsi);
  const habis = h.galat === "SESI_BERAKHIR";
  useEffect(() => {
    if (habis) keMasuk();
  }, [habis]);
  return habis ? { ...h, galat: null } : h;
}
