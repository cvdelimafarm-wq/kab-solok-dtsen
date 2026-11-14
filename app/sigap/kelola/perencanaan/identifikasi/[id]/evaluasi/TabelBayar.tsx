"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/evaluasi/TabelBayar.tsx
//
// (14 Nov 2026, Fase 6) Daftar bayar satu kegiatan: hari kerja yang SAH (laporan + foto sesuai aturan kegiatan, hari lampau) dibatasi batas hari,
// dikali tarif kegiatan per peran (keu_daftar_bayar). Judul kolom memakai standar tabel SIGAP (KepalaKolom: cari, urut, saring).

import { useMemo, useState } from "react";
import KepalaKolom from "@/app/sigap/admin/KepalaKolom";
import { nilaiBeda, terapkanTabel, type NilaiSel, type Saring, type Urut } from "@/lib/sigapTabelKolom";
import { csvBayar, type BarisBayar, type KegiatanBayar } from "@/lib/keu/bayarEvaluasi";

type K = "nama" | "peran" | "jenis" | "hari" | "sah" | "batas" | "dibayar" | "nominal" | "verif";
const KOLOM: { id: K; label: string; angka: boolean }[] = [
  { id: "nama", label: "Nama", angka: false },
  { id: "peran", label: "Peran", angka: false },
  { id: "jenis", label: "Jenis", angka: false },
  { id: "hari", label: "Terjadwal", angka: true },
  { id: "sah", label: "Sah", angka: true },
  { id: "batas", label: "Batas", angka: true },
  { id: "dibayar", label: "Dibayar", angka: true },
  { id: "nominal", label: "Nominal", angka: true },
  { id: "verif", label: "SPJ", angka: false },
];
const nilai: NilaiSel<BarisBayar, K> = (b, k) => {
  switch (k) {
    case "nama": return b.nama;
    case "peran": return b.peran.toUpperCase();
    case "jenis": return b.jenis;
    case "hari": return b.n_hari;
    case "sah": return b.n_sah;
    case "batas": return b.maks_hari ?? "-";
    case "dibayar": return b.n_dibayar;
    case "nominal": return Number(b.nominal);
    case "verif": return b.terverifikasi ? "Terverifikasi" : "Belum";
  }
};
const rp = (x: number | string) => `Rp${Number(x).toLocaleString("id-ID")}`;

export default function TabelBayar({ k }: { k: KegiatanBayar }) {
  const [saring, setSaring] = useState<Saring<K>>({});
  const [urut, setUrut] = useState<Urut<K>>(null);
  const tampil = useMemo(() => terapkanTabel(k.baris, saring, urut, nilai), [k.baris, saring, urut]);
  const unduh = () => {
    const blob = new Blob(["﻿" + csvBayar(k)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `daftar-bayar-${k.kegiatan_id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-[#0F2A52]">{k.nama}</div>
          <div className="text-[12px] text-[#5B6B84]">
            {k.fungsi} · hari sah = hari lampau dengan {k.wajib_laporan ? "laporan dan " : ""}{k.jumlah_foto} foto · total {rp(k.total)} dari rencana {rp(k.total_rencana)}
            {k.tanpa_tarif > 0 ? ` · ${k.tanpa_tarif} orang belum punya tarif` : ""}
          </div>
        </div>
        <button type="button" onClick={unduh} className="min-h-[36px] rounded-md border border-[#C5D0E2] bg-white px-3 text-[12.5px] font-semibold text-[#1B2B4B]">Unduh CSV</button>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-[#DCE3EE] text-[#5B6B84]">
              {KOLOM.map((c) => (
                <th key={c.id} className={`px-1 py-1.5 font-semibold ${c.angka ? "text-right" : ""}`}>
                  <KepalaKolom id={c.id} label={c.label} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(k.baris, c.id, nilai, c.angka)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => (
              <tr key={b.penugasan_id} className="border-b border-[#EEF2F7]">
                <td className="px-1 py-1">{b.nama}</td>
                <td className="px-1 py-1">{b.peran.toUpperCase()}</td>
                <td className="px-1 py-1">{b.jenis}</td>
                <td className="px-1 py-1 text-right">{b.n_hari}</td>
                <td className={`px-1 py-1 text-right ${b.n_sah < b.n_lampau ? "font-semibold text-[#8A6200]" : ""}`} title={b.n_sah < b.n_lampau ? `${b.n_lampau - b.n_sah} hari lampau belum sah` : undefined}>{b.n_sah}</td>
                <td className="px-1 py-1 text-right">{b.maks_hari ?? "-"}</td>
                <td className="px-1 py-1 text-right font-semibold">{b.n_dibayar}</td>
                <td className="px-1 py-1 text-right">{rp(b.nominal)}</td>
                <td className="px-1 py-1">{b.terverifikasi ? "Terverifikasi" : "Belum"}</td>
              </tr>
            ))}
            {tampil.length === 0 && (
              <tr><td colSpan={9} className="py-2 text-center text-[#5B6B84]">Tidak ada baris yang cocok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
