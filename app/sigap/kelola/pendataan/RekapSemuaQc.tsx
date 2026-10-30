"use client";

// app/sigap/kelola/pendataan/RekapSemuaQc.tsx
//
// (30 Okt 2026) Rekap QC Pemahaman untuk SEMUA PERIODE (seluruh hari ber-soal, tanpa batas 62 hari): nilai tiap petugas dirata-rata per urutan
// percobaan (P1..Pn), lengkap dengan batang untuk melihat pergerakannya: (1) rata-rata per percobaan, (2) rata-rata nilai awal dan terbaik per hari,
// (3) tabel per petugas dengan batang nilai dan batang pergerakan. Data dari /api/portal/qc/admin?semua=1. Logika murni: lib/sigapQcSemua.ts (diuji).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan } from "../../admin/ui";
import {
  LABEL_URUT_SEMUA,
  SARINGAN_SEMUA_AWAL,
  daftarTimSemua,
  saringBarisSemua,
  urutkanSemua,
  type BarisSemua,
  type DataSemua,
  type SaringanSemua,
  type UrutSemua,
} from "@/lib/sigapQcSemua";
import { BatangMendatar, Pergerakan, SelNilai, warnaNilai } from "./BatangQc";
import { tglPendekQc } from "./PeriodeQc";

const API = "/api/portal/qc/admin";
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const csvSel = (x: string | number) => {
  const s = String(x);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fmt = (n: number | null) => (n == null ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: 1 }));

function buatCsv(d: DataSemua, baris: BarisSemua[]): string {
  const p = Array.from({ length: d.kolom }, (_, i) => `Rata-rata P${i + 1}`);
  const kepala = ["Nama", "Peran", "PML", "Hari terisi", "Hari lulus", "Total percobaan", ...p, "Rata-rata nilai awal", "Rata-rata nilai terbaik", "Kenaikan"];
  const isi = baris.map((b) => [b.nama, b.peran, b.pml ?? "", b.hari_terisi, b.hari_lulus, b.total_percobaan, ...b.rata_p.map((x) => x ?? ""), b.rata_awal ?? "", b.rata_terbaik ?? "", b.naik ?? ""]);
  return "﻿" + [kepala, ...isi].map((r) => r.map(csvSel).join(",")).join("\r\n");
}

export default function RekapSemuaQc({ kegiatanId, onBukaHari }: { kegiatanId: number; onBukaHari: (t: string) => void }) {
  const [d, setD] = useState<DataSemua | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [saring, setSaring] = useState<SaringanSemua>(SARINGAN_SEMUA_AWAL);
  const [urut, setUrut] = useState<UrutSemua>("nama");
  const nomor = useRef(0);

  const muat = useCallback(async () => {
    const n = ++nomor.current;
    setMemuat(true);
    try {
      const r = await apiPortal<{ semua: DataSemua }>(`${API}?k=${kegiatanId}&semua=1`);
      if (n !== nomor.current) return;
      setD(r.semua);
      setGalat(null);
    } catch (e) {
      if (n === nomor.current) setGalat(pesanGalat(e));
    } finally {
      if (n === nomor.current) setMemuat(false);
    }
  }, [kegiatanId]);
  useEffect(() => {
    setD(null);
    void muat();
  }, [muat]);

  const tampil = useMemo(() => (d ? urutkanSemua(saringBarisSemua(d.baris, saring), urut) : []), [d, saring, urut]);
  const tim = useMemo(() => (d ? daftarTimSemua(d.baris) : []), [d]);
  const rataTerbaikSemua = useMemo(() => {
    const a = (d?.baris ?? []).map((b) => b.rata_terbaik).filter((x): x is number => x != null);
    return a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null;
  }, [d]);

  if (!d && !galat) return <Memuat />;

  const unduh = () => {
    if (!d) return;
    const url = URL.createObjectURL(new Blob([buatCsv(d, tampil)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `qc-pemahaman-semua-periode${d.dari ? `-${d.dari}_sampai_${d.sampai}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {d && (
        <>
          <Kartu
            judul="Rekap semua periode"
            ket={d.hari.length === 0 ? "Belum ada hari ber-soal." : `${d.hari.length} hari ber-soal · ${tglPendekQc(d.dari ?? "")} – ${tglPendekQc(d.sampai ?? "")} · nilai lulus ${d.nilai_lulus >= 100 ? "100" : `${d.nilai_lulus} ke atas`}`}
            kanan={<button type="button" className={BTN_O} disabled={memuat} onClick={() => void muat()}>{memuat ? "Memuat…" : "Segarkan"}</button>}
          >
            {d.hari.length === 0 ? (
              <p className="text-[13px] text-[#55657D]">Belum ada soal QC yang dirilis, jadi belum ada yang bisa direkap.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-4">
                <KartuAngka label="Hari ber-soal" nilai={String(d.hari.length)} ket="seluruh periode" />
                <KartuAngka label="Peserta" nilai={String(d.peserta)} ket="PML dan PPL" />
                <KartuAngka label="Tingkat mengisi" nilai={d.kepatuhan_persen == null ? "-" : `${d.kepatuhan_persen}%`} ket="petugas x hari yang terisi" warna={d.kepatuhan_persen != null && d.kepatuhan_persen < 80 ? "#8A6200" : "#13794B"} />
                <KartuAngka label="Rata-rata nilai terbaik" nilai={fmt(rataTerbaikSemua)} ket={`tidak pernah mengisi: ${d.tidak_pernah} petugas`} warna={rataTerbaikSemua != null && rataTerbaikSemua < d.nilai_lulus ? "#8A6200" : "#13794B"} />
              </div>
            )}
          </Kartu>

          {d.hari.length > 0 && (
            <Kartu judul="Rata-rata nilai per percobaan" ket={`Seluruh petugas dan seluruh hari · garis tegak = batas lulus ${d.nilai_lulus}`}>
              <div className="space-y-1.5">
                {d.rata_p_semua.map((n, i) => (
                  <BatangMendatar key={i} label={`P${i + 1}`} nilai={n} nilaiLulus={d.nilai_lulus} ket={`(${d.jumlah_p_semua[i]}×)`} />
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-[#6B7A90]">Jika P2, P3, dan seterusnya lebih tinggi dari P1, ulangan membantu petugas memahami. (n×) = banyaknya percobaan yang dirata-ratakan.</p>
            </Kartu>
          )}

          {d.per_hari.length > 0 && (
            <Kartu judul="Pergerakan nilai per hari" ket="Batang terang = rata-rata nilai awal (percobaan pertama), batang tua = rata-rata nilai terbaik · ketuk hari untuk membukanya">
              <div className="-mx-1 flex items-end gap-1.5 overflow-x-auto px-1 pb-1" role="list">
                {d.per_hari.map((h) => (
                  <button key={h.tanggal} type="button" role="listitem" onClick={() => onBukaHari(h.tanggal)} className="flex w-[48px] flex-none flex-col items-center gap-1 rounded-lg px-0.5 py-1 hover:bg-[#F5F8FE]" aria-label={`${tglPendekQc(h.tanggal)}: rata-rata nilai awal ${fmt(h.rata_awal)}, terbaik ${fmt(h.rata_terbaik)}, ${h.sudah} dari ${h.peserta} mengisi`}>
                    <span className="text-[11px] font-bold tabular-nums text-[#0F2A52]">{fmt(h.rata_terbaik)}</span>
                    <span className="flex h-[96px] items-end gap-[3px]" aria-hidden>
                      <span className="block w-3 rounded-t bg-[#BFD3F5]" style={{ height: `${Math.max(2, h.rata_awal ?? 0)}%` }} />
                      <span className={`block w-3 rounded-t ${h.rata_terbaik != null && h.rata_terbaik >= d.nilai_lulus ? "bg-[#1F8A5B]" : "bg-[#1F5FD1]"}`} style={{ height: `${Math.max(2, h.rata_terbaik ?? 0)}%` }} />
                    </span>
                    <span className="text-[10.5px] font-semibold text-[#55657D]">{tglPendekQc(h.tanggal)}</span>
                    <span className="text-[10px] tabular-nums text-[#6B7A90]">{h.sudah}/{h.peserta}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-[#6B7A90]">Angka di atas batang = rata-rata nilai terbaik hari itu; di bawah tanggal = jumlah yang mengisi. Batang tua hijau = rata-rata sudah mencapai nilai lulus.</p>
            </Kartu>
          )}

          {d.hari.length > 0 && (
            <Kartu judul="Rekap per petugas" ket={`${tampil.length} dari ${d.baris.length} petugas tampil · rata-rata nilai tiap percobaan di seluruh hari`} kanan={<button type="button" className={BTN_O} onClick={unduh} disabled={tampil.length === 0}>Unduh CSV</button>}>
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input className={`${INPUT} min-w-[180px] flex-1`} placeholder="Cari nama petugas atau PML" aria-label="Cari petugas" value={saring.cari} onChange={(e) => setSaring((s) => ({ ...s, cari: e.target.value }))} />
                  <select className={INPUT} aria-label="Saring peran" value={saring.peran} onChange={(e) => setSaring((s) => ({ ...s, peran: e.target.value as SaringanSemua["peran"] }))}>
                    <option value="semua">Semua peran</option>
                    <option value="PML">PML</option>
                    <option value="PPL">PPL</option>
                  </select>
                  <select className={INPUT} aria-label="Saring tim" value={saring.pml} onChange={(e) => setSaring((s) => ({ ...s, pml: e.target.value }))}>
                    <option value="">Semua tim</option>
                    {tim.map((t) => <option key={t} value={t}>Tim {t}</option>)}
                  </select>
                  <select className={INPUT} aria-label="Urutkan" value={urut} onChange={(e) => setUrut(e.target.value as UrutSemua)}>
                    {(Object.keys(LABEL_URUT_SEMUA) as UrutSemua[]).map((k) => <option key={k} value={k}>Urut: {LABEL_URUT_SEMUA[k]}</option>)}
                  </select>
                  {(saring.peran !== "semua" || saring.pml || saring.cari) && (
                    <button type="button" className="min-h-[34px] rounded-full px-3 text-[12px] font-bold text-[#1F5FD1] underline" onClick={() => setSaring(SARINGAN_SEMUA_AWAL)}>Hapus saringan</button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-[#E1E8F4]">
                  <table className="w-full min-w-max border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F5F8FE] text-left text-[11.5px] text-[#44546F]">
                        <th className="sticky left-0 z-10 bg-[#F5F8FE] px-3 py-2 font-bold">Petugas</th>
                        <th className="px-2 py-2 text-center font-bold">Hari terisi</th>
                        {Array.from({ length: d.kolom }, (_, i) => (
                          <th key={i} className="px-2 py-2 text-center font-bold">P{i + 1}</th>
                        ))}
                        <th className="px-2 py-2 text-center font-bold">Awal → terbaik</th>
                        <th className="px-3 py-2 text-center font-bold">Pergerakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tampil.length === 0 && (
                        <tr><td colSpan={d.kolom + 4} className="px-3 py-6 text-center text-[#55657D]">Tidak ada petugas yang cocok dengan saringan.</td></tr>
                      )}
                      {tampil.map((b) => (
                        <tr key={b.akun_id} className="border-t border-[#EEF2F8]">
                          <th scope="row" className="sticky left-0 z-10 max-w-[190px] bg-white px-3 py-1.5 text-left font-semibold text-[#0F2A52]">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate">{b.nama}</span>
                              <Chip w={b.peran === "PML" ? "navy" : "mut"}>{b.peran}</Chip>
                            </span>
                            {b.pml && <span className="block truncate text-[11px] font-normal text-[#6B7A90]">Tim {b.pml}</span>}
                          </th>
                          <td className="px-2 py-1 text-center font-semibold tabular-nums text-[#1B2B4B]" title={`${b.hari_lulus} hari lulus · ${b.total_percobaan} percobaan`}>
                            {b.hari_terisi}/{d.hari.length}
                            {b.pernah_terlambat && <sup className="ml-0.5 text-[9px]" aria-label="pernah terlambat">T</sup>}
                          </td>
                          {b.rata_p.map((n, i) => (
                            <td key={i} className="px-2 py-1 text-center" title={n == null ? "belum pernah sampai percobaan ini" : `rata-rata dari ${b.hari_p[i]} hari`}>
                              {n == null ? <span className="text-[#9AA7BA]">-</span> : <SelNilai nilai={n} nilaiLulus={d.nilai_lulus} desimal />}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-center tabular-nums">
                            {b.rata_awal == null || b.rata_terbaik == null ? (
                              <span className="text-[#9AA7BA]">-</span>
                            ) : (
                              <span className="whitespace-nowrap">
                                <span className="text-[#55657D]">{fmt(b.rata_awal)}</span> → <b className={warnaNilai(b.rata_terbaik, d.nilai_lulus).teks}>{fmt(b.rata_terbaik)}</b>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1 text-center">
                            <Pergerakan nilai={b.rata_p} nilaiLulus={d.nilai_lulus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11.5px] leading-snug text-[#6B7A90]">
                  Angka P1, P2, … = rata-rata nilai percobaan ke-1, ke-2, … pada hari-hari yang petugas isi (hijau = mencapai nilai lulus, oranye = di bawahnya, - = tidak pernah sampai percobaan itu). Hari terisi = dari seluruh hari ber-soal; <b>T</b> = pernah terlambat. Peserta dihitung dari daftar saat ini.
                </p>
              </div>
            </Kartu>
          )}
        </>
      )}
    </div>
  );
}
