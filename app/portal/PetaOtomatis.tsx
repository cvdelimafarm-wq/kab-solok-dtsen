"use client";

// app/portal/PetaOtomatis.tsx
//
// (10 Okt 2026) Memasang unduhan otomatis peta wilayah kerja (petaOffline.ts) di Beranda -- permintaan user: prefetch seluruh peta wilayah kerjanya
// saat sinyal bagus. Wilayah kerja = Sub SLS tim (PPL & PML) ditambah Sub SLS pembagian Lembar Identifikasi (PML). Tidak merender apa pun.

import { useMemo } from "react";
import { useData } from "./dataBersama";
import { daftarPetaDari, useUnduhPetaOtomatis } from "./petaOffline";
import type { Induk } from "@/lib/sigapTahap";
import type { WilayahTim } from "@/lib/portal/induk";
import type { DataIdentifikasi } from "@/app/sigap/identifikasi/useIdentifikasi";

export function useWilayahKerja(induk: Induk[] | null): string[] {
  const adaTim = !!induk?.some((i) => i.wilayah);
  const adaIdf = !!induk?.some((i) => i.identifikasi);
  const tim = useData<{ tim: WilayahTim | null }>("/api/portal/wilayah-tim", { aktif: adaTim || adaIdf });
  const idf = useData<DataIdentifikasi>("/api/portal/identifikasi", { aktif: adaIdf });
  return useMemo(() => {
    const id = new Set<string>();
    for (const s of tim.data?.tim?.sub_sls ?? []) id.add(s.idsubsls);
    for (const s of idf.data?.sub ?? []) id.add(s.idsubsls);
    return Array.from(id).sort();
  }, [tim.data, idf.data]);
}

export default function PetaOtomatis({ induk }: { induk: Induk[] | null }) {
  const ids = useWilayahKerja(induk);
  const daftar = useMemo(() => daftarPetaDari(ids), [ids]);
  useUnduhPetaOtomatis(daftar, ids.length > 0);
  return null;
}
