"use client";

// app/sigap/pelatihan/kelola/gabungTab.tsx
//
// (8 Nov 2026) Perekat tujuh tab Kelola Pelatihan: satu tab berisi beberapa bagian (sub) dengan pilihan di atasnya, ikut ?sub=.
// Setiap bagian tetap memakai komponen aslinya; berkas ini hanya menyusunnya. `isi` menerima `pilih` supaya satu bagian dapat mengarahkan ke bagian lain.

import type { ReactNode } from "react";
import { PilihSub, useSub, type ItemSub } from "./GrupTab";

export type Bagian = { kode: string; label: string; ket?: string; isi: (pilih: (kode: string) => void) => ReactNode };

export default function GabungTab({ bagian, label }: { bagian: Bagian[]; label: string }) {
  const daftar: ItemSub[] = bagian.map(({ kode, label: l, ket }) => ({ kode, label: l, ket }));
  const [sub, pilih] = useSub(daftar);
  const aktif = bagian.find((b) => b.kode === sub) ?? bagian[0];
  return (
    <div>
      <PilihSub daftar={daftar} aktif={aktif.kode} onPilih={pilih} label={label} />
      {aktif.isi(pilih)}
    </div>
  );
}
