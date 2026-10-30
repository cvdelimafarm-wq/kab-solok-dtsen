"use client";

// app/sigap/kelola/pendataan/useFitur.ts
//
// (30 Okt 2026) Memuat profil fitur survei terpilih (/api/portal/pendataan/fitur). Selama memuat atau bila gagal, dipakai paket bawaan menurut kegiatan
// (Pascabencana = semua fitur, selain itu fitur umum) sehingga layar berperilaku seperti sebelum profil fitur ada dan tidak pernah kosong.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { bacaProfilFitur, fiturEfektif, strategiBawaanKegiatan, type CentangFitur, type PetaFitur, type StrategiKegiatan } from "@/lib/sigapFitur";

export const API_FITUR = "/api/portal/pendataan/fitur";

export type ProfilKlien = { strategi: StrategiKegiatan; centang: CentangFitur; siap: boolean };

export function useFitur(kegiatanId: number) {
  const [profil, setProfil] = useState<(ProfilKlien & { kegiatanId: number }) | null>(null);
  const [galat, setGalat] = useState("");

  const terapkan = useCallback((mentah: unknown, id: number) => {
    const p = bacaProfilFitur(mentah, id);
    const siap = typeof mentah === "object" && mentah !== null && (mentah as { siap?: unknown }).siap === true;
    setProfil({ ...p, siap, kegiatanId: id });
  }, []);

  const muat = useCallback(async () => {
    setGalat("");
    try {
      terapkan(await apiPortal<unknown>(`${API_FITUR}?k=${kegiatanId}`), kegiatanId);
    } catch (e) {
      setProfil(null);
      setGalat(e instanceof Error ? e.message : "Profil fitur belum bisa dimuat.");
    }
  }, [kegiatanId, terapkan]);

  useEffect(() => {
    setProfil(null);
    void muat();
  }, [muat]);

  const simpan = useCallback(
    async (strategi: StrategiKegiatan, fitur: PetaFitur) => {
      const r = await apiPortal<unknown>(API_FITUR, { method: "PUT", body: JSON.stringify({ kegiatan_id: kegiatanId, strategi, fitur }) });
      terapkan(r, kegiatanId);
    },
    [kegiatanId, terapkan],
  );

  const aktif = profil && profil.kegiatanId === kegiatanId ? profil : null;
  const strategi = aktif?.strategi ?? strategiBawaanKegiatan(kegiatanId);
  const fitur = useMemo(() => fiturEfektif(strategi, aktif?.centang ?? {}, kegiatanId), [strategi, aktif, kegiatanId]);
  return { strategi, fitur, centang: aktif?.centang ?? {}, siap: aktif?.siap ?? false, dimuat: aktif !== null, galat, muat, simpan };
}
