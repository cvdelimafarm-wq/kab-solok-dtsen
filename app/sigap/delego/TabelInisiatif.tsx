"use client";

// app/sigap/delego/TabelInisiatif.tsx
//
// (14 Nov 2026, Fase 4c) Hitungan inisiatif per pegawai di Monitoring Kepala. Judul kolom memakai standar tabel SIGAP
// (admin/KepalaKolom + lib/sigapTabelKolom: cari, urut, filter nilai di tiap kolom).

import { useMemo, useState } from "react";
import KepalaKolom from "../admin/KepalaKolom";
import { nilaiBeda, terapkanTabel, type NilaiSel, type Saring, type Urut } from "@/lib/sigapTabelKolom";
import type { RekapInisiatif } from "@/lib/delego/inisiatif";

type Baris = RekapInisiatif["pegawai"][number];
type K = "nama" | "diajukan" | "disetujui" | "ditolak" | "menunggu";
const KOLOM: { id: K; label: string }[] = [
  { id: "nama", label: "Pegawai" },
  { id: "diajukan", label: "Diajukan" },
  { id: "disetujui", label: "Disetujui" },
  { id: "ditolak", label: "Ditolak" },
  { id: "menunggu", label: "Menunggu" },
];
const nilai: NilaiSel<Baris, K> = (b, k) => b[k];

export default function TabelInisiatif({ baris }: { baris: Baris[] }) {
  const [saring, setSaring] = useState<Saring<K>>({});
  const [urut, setUrut] = useState<Urut<K>>(null);
  const tampil = useMemo(() => terapkanTabel(baris, saring, urut, nilai), [baris, saring, urut]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-[13px]">
        <thead>
          <tr className="border-b border-[#D5DDE3] text-[12px] text-[#3B4A57]">
            {KOLOM.map((k) => (
              <th key={k.id} className={`py-1.5 px-1 font-semibold ${k.id === "nama" ? "text-left" : "text-right"}`}>
                <KepalaKolom id={k.id} label={k.label} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(baris, k.id, nilai, k.id !== "nama")} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tampil.map((p) => (
            <tr key={p.akun} className="border-b border-[#EEF2F5]">
              <td className="px-1 py-1.5">{p.nama}</td>
              <td className="px-1 py-1.5 text-right">{p.diajukan}</td>
              <td className="px-1 py-1.5 text-right font-semibold text-[#0B524C]">{p.disetujui}</td>
              <td className="px-1 py-1.5 text-right">{p.ditolak}</td>
              <td className="px-1 py-1.5 text-right">{p.menunggu}</td>
            </tr>
          ))}
          {tampil.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-center text-[#3B4A57]">Tidak ada baris yang cocok dengan saringan.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
