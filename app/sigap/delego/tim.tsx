"use client";

// app/sigap/delego/tim.tsx
//
// (26 Okt 2026) Pembantu halaman tim: pengalih RO, pengirim yang dijaga hak, dan penyaring bahan tim.

import { useMemo, useState } from "react";
import type { BahanTim, Delegasi } from "@/lib/delego/tipe";
import { useKonteksDelego } from "./konteks";
import { KELAS } from "./merek";

/** Pilihan RO (kosong = semua RO yang boleh dilihat). */
export function useFilterRo() {
  const { hak } = useKonteksDelego();
  const [ro, setRo] = useState("");
  const daftar = useMemo(() => hak.lihat_ro, [hak.lihat_ro]);
  return { ro, setRo, daftar };
}

export function PilihRo({ ro, setRo, daftar, label = "Semua RO" }: { ro: string; setRo: (r: string) => void; daftar: string[]; label?: string }) {
  if (daftar.length <= 1 && !ro) return null;
  return (
    <select aria-label="Saring RO" className={`${KELAS.isian} !w-auto min-w-[150px]`} value={ro} onChange={(e) => setRo(e.target.value)}>
      <option value="">{label}</option>
      {daftar.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  );
}

export const saringRo = (b: BahanTim | null, ro: string): Delegasi[] => (b ? b.delegasi.filter((d) => !ro || d.ro_kode === ro) : []);
