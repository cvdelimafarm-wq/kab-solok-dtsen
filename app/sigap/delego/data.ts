"use client";

// app/sigap/delego/data.ts
//
// (26 Okt 2026) Pengambil data Delego. Semua bacaan memanggil fungsi basis data lewat gerbang keu (aksiKeu -> POST /api/sigap/keu/panggil), sehingga
// hak ditegakkan basis data dan akun mitra pun dapat membaca tugasnya sendiri. Tulis memakai useKirim dari ro/useKeu.

import { useCallback, useEffect, useRef, useState } from "react";
import { aksiKeu } from "@/app/sigap/ro/useKeu";
import type { BahanSaya, BahanTim, Calon, HakDelegasi } from "@/lib/delego/tipe";

export { useKirim, aksiKeu } from "@/app/sigap/ro/useKeu";

export type HasilBaca<T> = { data: T | null; galat: string | null; memuat: boolean; muat: () => Promise<void> };

/** Memuat hasil fungsi baca `fungsi` dengan `args` (null = jangan memuat). Memuat ulang saat tab kembali aktif. */
export function useBacaFungsi<T>(fungsi: string, args: Record<string, unknown> | null): HasilBaca<T> {
  const kunci = args === null ? "" : JSON.stringify(args);
  const argsRef = useRef(args);
  argsRef.current = args;
  const [data, setData] = useState<T | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(args !== null);
  const urutan = useRef(0);

  const muat = useCallback(async () => {
    const a = argsRef.current;
    if (a === null) return;
    const saya = ++urutan.current;
    const r = await aksiKeu<T>(fungsi, a);
    if (saya !== urutan.current) return; // jawaban lama diabaikan
    if (r.ok) {
      setData(r.data);
      setGalat(null);
    } else setGalat(r.pesan);
    setMemuat(false);
  }, [fungsi]);

  useEffect(() => {
    if (kunci === "") {
      setMemuat(false);
      return;
    }
    setMemuat(true);
    void muat();
  }, [kunci, muat]);

  useEffect(() => {
    const kembali = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", kembali);
    return () => document.removeEventListener("visibilitychange", kembali);
  }, [muat]);

  return { data, galat, memuat, muat };
}

export const useHakDelegasi = () => useBacaFungsi<HakDelegasi>("keu_dlg_hak", {});
export const useSaya = () => useBacaFungsi<BahanSaya>("keu_dlg_saya", {});

/** Bahan tim (hanya untuk pemberi atau pelihat). `aktif` false = tidak memuat. */
export function useBahan(opsi: { ident?: number | null; ro?: string | null; aktif?: boolean } = {}) {
  const { ident = null, ro = null, aktif = true } = opsi;
  const args = aktif ? { ...(ident ? { p_ident: ident } : {}), ...(ro ? { p_ro: ro } : {}) } : null;
  return useBacaFungsi<BahanTim>("keu_dlg_bahan", args);
}

export function useCalon(ro: string | null, ident: number | null, q: string) {
  const args = ro ? { p_ro: ro, ...(ident ? { p_ident: ident } : {}), p_q: q } : null;
  return useBacaFungsi<Calon>("keu_dlg_calon", args);
}
