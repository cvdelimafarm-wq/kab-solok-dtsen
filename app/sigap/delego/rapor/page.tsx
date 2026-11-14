"use client";

// app/sigap/delego/rapor/page.tsx
//
// (14 Nov 2026, Fase 5) Rapor terpadu per pegawai per bulan (keu_dlg_rapor) dan unduh rekap SKP (CSV). Pemutus dan pemberi delegasi melihat semua
// pegawai organik; pegawai lain hanya dirinya. Tidak ada skor gabungan: bobot rapor dan aturan 360 masih usul (360 tampil bila >= 3 penilai;
// >= 5 penilai: tertinggi dan terendah dibuang). Judul kolom memakai standar tabel SIGAP (KepalaKolom).

import { useMemo, useState } from "react";
import KepalaKolom from "../../admin/KepalaKolom";
import { angka } from "@/lib/delego/hitung";
import { capaian, csvRekap, geser, penuhiMinimal, rataHarian, awalBulanDari, type BahanRapor, type BarisRapor } from "@/lib/delego/rapor";
import { nilaiBeda, terapkanTabel, type NilaiSel, type Saring, type Urut } from "@/lib/sigapTabelKolom";
import { useBacaFungsi } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Kartu, Memuat, Statistik, fmt } from "../ui";

type K = "nama" | "hari" | "poin" | "diakui" | "capaian" | "rata" | "h60" | "faktor" | "lewat" | "inisiatif" | "n360";
const KOLOM: { id: K; label: string; angka: boolean }[] = [
  { id: "nama", label: "Pegawai", angka: false },
  { id: "hari", label: "Hari kerja", angka: true },
  { id: "poin", label: "Dilaporkan", angka: true },
  { id: "diakui", label: "Diakui", angka: true },
  { id: "capaian", label: "Capaian %", angka: true },
  { id: "rata", label: "Rata/hari", angka: true },
  { id: "h60", label: "Hari ≥60", angka: true },
  { id: "faktor", label: "Faktor mutu", angka: true },
  { id: "lewat", label: "Lewat tenggat", angka: true },
  { id: "inisiatif", label: "Inisiatif", angka: true },
  { id: "n360", label: "360", angka: true },
];
const nilai: NilaiSel<BarisRapor, K> = (b, k) => {
  switch (k) {
    case "nama": return b.nama;
    case "hari": return angka(b.hari_kerja);
    case "poin": return angka(b.poin);
    case "diakui": return angka(b.poin_diakui);
    case "capaian": return capaian(b) ?? -1;
    case "rata": return rataHarian(b) ?? -1;
    case "h60": return b.hari_60;
    case "faktor": return b.faktor === null ? -1 : angka(b.faktor);
    case "lewat": return b.lewat_tenggat;
    case "inisiatif": return b.inisiatif;
    case "n360": return b.nilai_360 === null ? -1 : angka(b.nilai_360);
  }
};
const namaBulan = (b: string) => new Date(`${b}T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

export default function Rapor() {
  const { hari } = useKonteksDelego();
  const [bulan, setBulan] = useState(awalBulanDari(hari));
  const r = useBacaFungsi<BahanRapor>("keu_dlg_rapor", { p_bulan: bulan });
  const d = r.data;
  const [saring, setSaring] = useState<Saring<K>>({});
  const [urut, setUrut] = useState<Urut<K>>(null);
  const tampil = useMemo(() => (d ? terapkanTabel(d.baris, saring, urut, nilai) : []), [d, saring, urut]);
  const unduh = () => {
    if (!d) return;
    const blob = new Blob(["﻿" + csvRekap(d)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rekap-skp-${bulan.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Halaman
      judul="Rapor terpadu"
      sub={`${namaBulan(bulan)}${d && d.sampai < `${bulan.slice(0, 7)}-31` ? ` (sampai ${d.sampai})` : ""}. Poin, mutu, tenggat, inisiatif, penilaian Ketua Tim, dan 360 dalam satu baris per pegawai.`}
      kanan={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={KELAS.tombolKecil} onClick={() => setBulan(geser(bulan, -1))}>‹ Bulan lalu</button>
          <button type="button" className={KELAS.tombolKecil} disabled={bulan >= awalBulanDari(hari)} onClick={() => setBulan(geser(bulan, 1))}>Bulan depan ›</button>
          <button type="button" className={KELAS.tombolKecilUtama} disabled={!d} onClick={unduh}>Unduh rekap SKP</button>
        </div>
      }
    >
      {r.memuat && !d && <Memuat />}
      {r.galat && !d && <Galat>{r.galat}</Galat>}
      {d && (
        <>
          {d.semua && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Statistik label="Pekerjaan tercatat" nilai={`${d.ringkas.tercatat}/${d.ringkas.pegawai}`} ket="pegawai yang melapor bulan ini" nada={d.ringkas.tercatat < d.ringkas.pegawai ? "amber" : "biasa"} />
              <Statistik label="Rata ≥60 per hari" nilai={`${d.ringkas.min60}/${d.ringkas.pegawai}`} ket="poin dilaporkan per hari kerja" nada={d.ringkas.min60 < d.ringkas.pegawai ? "amber" : "biasa"} />
              <Statistik label="Bobot tervalidasi" nilai={`${d.ringkas.bobot_tervalidasi}/${d.ringkas.bobot_total}`} ket="poin dari riwayat atau usul pegawai" nada={d.ringkas.bobot_tervalidasi === 0 ? "amber" : "biasa"} />
              <Statistik label="Hari kerja" nilai={d.baris[0] ? fmt(angka(d.baris[0].hari_kerja), 0) : "-"} ket="Senin–Jumat dikurangi libur" />
            </div>
          )}
          <Info>
            Capaian = poin diakui ÷ (hari kerja × 100). Minimal 60 poin per hari berlaku bagi pegawai yang sudah punya delegasi atau daftar pekerjaan. Nilai 360 tampil bila dinilai sedikitnya 3 orang; dengan 5 penilai atau lebih, nilai tertinggi dan terendah dibuang. Aturan ini masih usulan.
          </Info>
          <Kartu judul={`Per pegawai (${tampil.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#D5DDE3] text-[#3B4A57]">
                    {KOLOM.map((c) => (
                      <th key={c.id} className={`px-1 py-1.5 font-semibold ${c.angka ? "text-right" : "text-left"}`}>
                        <KepalaKolom id={c.id} label={c.label} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(d.baris, c.id, nilai, c.angka)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((b) => {
                    const cp = capaian(b);
                    return (
                      <tr key={b.akun} className="border-b border-[#EEF2F5]">
                        <td className="px-1 py-1.5">{b.nama}</td>
                        <td className="px-1 py-1.5 text-right">{fmt(angka(b.hari_kerja), 0)}</td>
                        <td className="px-1 py-1.5 text-right">{fmt(angka(b.poin), 1)}</td>
                        <td className="px-1 py-1.5 text-right">{fmt(angka(b.poin_diakui), 1)}{angka(b.poin_menunggu) > 0 ? <span className="text-[#3B4A57]"> (+{fmt(angka(b.poin_menunggu), 0)})</span> : null}</td>
                        <td className="px-1 py-1.5 text-right font-semibold">{cp === null ? "-" : `${cp}%`}</td>
                        <td className={`px-1 py-1.5 text-right ${b.laporan > 0 && !penuhiMinimal(b) ? "text-[#8A4605]" : ""}`}>{rataHarian(b) ?? "-"}</td>
                        <td className="px-1 py-1.5 text-right">{b.hari_60}</td>
                        <td className="px-1 py-1.5 text-right">{b.faktor === null ? "-" : fmt(angka(b.faktor), 2)}</td>
                        <td className={`px-1 py-1.5 text-right ${b.lewat_tenggat > 0 ? "text-[#8A4605]" : ""}`}>{b.lewat_tenggat}</td>
                        <td className="px-1 py-1.5 text-right">{b.inisiatif}</td>
                        <td className="px-1 py-1.5 text-right" title={b.penilai_360 ? `${b.penilai_360} penilai` : undefined}>{b.nilai_360 === null ? (b.penilai_360 ? `(${b.penilai_360} penilai)` : "-") : fmt(angka(b.nilai_360), 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Kartu>
        </>
      )}
    </Halaman>
  );
}
