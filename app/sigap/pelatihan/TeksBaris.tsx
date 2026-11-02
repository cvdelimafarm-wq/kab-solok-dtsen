"use client";

// app/sigap/pelatihan/TeksBaris.tsx
//
// (2 Nov 2026) Menampilkan satu butir/baris teks dengan gaya sederhana (tebal, miring, garis bawah, sorot, tautan https) sebagai elemen React (tanpa HTML mentah, jadi aman).
// Dipakai modal ketentuan pelatihan (peserta) dan pratinjau di Kelola. Penandanya sama dengan pengumuman: **tebal** __miring__ ++garis bawah++ ==sorot==.

import { uraiSebaris } from "@/lib/sigapPengumuman";
import { Potongan } from "./pengumumanUi";

export function TeksBaris({ teks }: { teks: string }) {
  return (
    <>
      {uraiSebaris(teks).map((s, i) => (
        <Potongan key={i} s={s} />
      ))}
    </>
  );
}
