"use client";

// app/sigap/kelola/pendataan/RekapRentangQc.tsx
//
// (30 Okt 2026) Rekap QC Pemahaman untuk RENTANG tanggal: ringkasan, grafik batang per hari (klik = buka hari itu), dan matriks petugas x hari
// (nilai terbaik per hari) dengan pencarian, saringan peran/tim/status, urutan, dan unduh CSV. Data dari /api/portal/qc/admin?dari=&sampai=.
// Logika murni ada di lib/sigapQcRentang.ts (diuji). Warna selalu disertai angka/teks.

import { useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan } from "../../admin/ui";
import {
  LABEL_STATUS_RENTANG,
  LABEL_URUT_RENTANG,
  SARINGAN_RENTANG_AWAL,
  daftarTimRentang,
  hitungStatusRentang,
  periksaRentang,
  saringBarisRentang,
  urutkanRentang,
  type BarisRentang,
  type DataRentang,
  type SaringanRentang,
  type StatusRentang,
  type UrutRentang,
} from "@/lib/sigapQcRentang";
import { tglPendekQc, type Rentang } from "./PeriodeQc";

const API = "/api/portal/qc/admin";
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const STATUS: StatusRentang[] = ["semua", "tidak_lengkap", "lengkap", "tidak_pernah", "terlambat"];

const csvSel = (x: string | number) => {
  const s = String(x);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function buatCsv(d: DataRentang, baris: BarisRentang[]): string {
  const kepala = ["Nama", "Peran", "PML", ...d.hari, "Hari terisi", "Hari lulus", "Total percobaan", "Rata-rata nilai terbaik"];
  const isi = baris.map((b) => [b.nama, b.peran, b.pml ?? "", ...b.sel.map((s) => (s ? s.terbaik : "")), b.hari_terisi, b.hari_lulus, b.total_percobaan, b.rata_terbaik ?? ""]);
  return "﻿" + [kepala, ...isi].map((r) => r.map(csvSel).join(",")).join("\r\n");
}

export default function RekapRentangQc({ kegiatanId, rentang, onBukaHari }: { kegiatanId: number; rentang: Rentang; onBukaHari: (t: string) => void }) {
  const [d, setD] = useState<DataRentang | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [saring, setSaring] = useState<SaringanRentang>(SARINGAN_RENTANG_AWAL);
  const [urut, setUrut] = useState<UrutRentang>("nama");
  const nomor = useRef(0);

  const cek = periksaRentang(rentang.dari, rentang.sampai);
  const muat = useMemo(
    () => async () => {
      if (!cek.ok) return;
      const n = ++nomor.current;
      setMemuat(true);
      try {
        const r = await apiPortal<{ rentang: DataRentang }>(`${API}?k=${kegiatanId}&dari=${rentang.dari}&sampai=${rentang.sampai}`);
        if (n !== nomor.current) return; // permintaan lebih baru sudah berjalan
        setD(r.rentang);
        setGalat(null);
      } catch (e) {
        if (n === nomor.current) setGalat(pesanGalat(e));
      } finally {
        if (n === nomor.current) setMemuat(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kegiatanId, rentang.dari, rentang.sampai, cek.ok]
  );
  useEffect(() => {
    void muat();
  }, [muat]);

  const jumlahHari = d?.hari.length ?? 0;
  const tampil = useMemo(() => (d ? urutkanRentang(saringBarisRentang(d.baris, saring, jumlahHari), urut) : []), [d, saring, urut, jumlahHari]);
  const hitung = useMemo(() => (d ? hitungStatusRentang(d.baris, jumlahHari) : null), [d, jumlahHari]);
  const tim = useMemo(() => (d ? daftarTimRentang(d.baris) : []), [d]);

  if (!cek.ok) return <Pesan jenis="info">{cek.pesan}</Pesan>;
  if (!d && !galat) return <Memuat />;

  const unduh = () => {
    if (!d) return;
    const url = URL.createObjectURL(new Blob([buatCsv(d, tampil)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `qc-pemahaman-${d.dari}_sampai_${d.sampai}.csv`;
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
            judul={`Rekap ${tglPendekQc(d.dari)} – ${tglPendekQc(d.sampai)}`}
            ket={d.hari.length === 0 ? "Tidak ada hari ber-soal pada rentang ini." : `${d.hari.length} hari ber-soal · nilai lulus ${d.nilai_lulus >= 100 ? "100" : `${d.nilai_lulus} ke atas`}`}
            kanan={<button type="button" className={BTN_O} disabled={memuat} onClick={() => void muat()}>{memuat ? "Memuat…" : "Segarkan"}</button>}
          >
            {d.hari.length === 0 ? (
              <p className="text-[13px] text-[#55657D]">Belum ada soal QC yang dirilis pada tanggal-tanggal ini. Ubah rentang di atas.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-4">
                <KartuAngka label="Hari ber-soal" nilai={String(d.hari.length)} ket="dalam rentang terpilih" />
                <KartuAngka label="Peserta" nilai={String(d.peserta)} ket="PML dan PPL" />
                <KartuAngka label="Tingkat mengisi" nilai={d.kepatuhan_persen == null ? "-" : `${d.kepatuhan_persen}%`} ket="petugas x hari yang terisi" warna={d.kepatuhan_persen != null && d.kepatuhan_persen < 80 ? "#8A6200" : "#13794B"} />
                <button
                  type="button"
                  className="block w-full rounded-[18px] text-left active:opacity-80"
                  aria-label={`Tidak pernah mengisi: ${d.tidak_pernah} petugas. Ketuk untuk menyaring tabel`}
                  onClick={() => setSaring((s) => ({ ...s, status: "tidak_pernah" }))}
                >
                  <KartuAngka label="Tidak pernah mengisi" nilai={String(d.tidak_pernah)} ket="ketuk untuk lihat nama" warna={d.tidak_pernah > 0 ? "#B42329" : undefined} />
                </button>
              </div>
            )}
          </Kartu>

          {d.hari.length > 0 && (
            <Kartu judul="Mengisi per hari" ket="Ketuk satu hari untuk membukanya di tampilan Per tanggal.">
              <div className="-mx-1 flex items-end gap-2 overflow-x-auto px-1 pb-1" role="list">
                {d.per_hari.map((h) => {
                  const p = h.peserta > 0 ? h.sudah / h.peserta : 0;
                  return (
                    <button key={h.tanggal} type="button" role="listitem" onClick={() => onBukaHari(h.tanggal)} className="flex w-[54px] flex-none flex-col items-center gap-1 rounded-lg px-1 py-1 hover:bg-[#F5F8FE]" aria-label={`${tglPendekQc(h.tanggal)}: ${h.sudah} dari ${h.peserta} sudah mengisi, ${h.lulus} lulus`}>
                      <span className="text-[11px] font-bold tabular-nums text-[#0F2A52]">{h.sudah}/{h.peserta}</span>
                      <span className="flex h-[84px] w-7 items-end overflow-hidden rounded-md bg-[#EEF2F8]" aria-hidden>
                        <span className="relative block w-full bg-[#CFE0FA]" style={{ height: `${Math.round(p * 100)}%` }}>
                          <span className="absolute bottom-0 left-0 block w-full bg-[#1F5FD1]" style={{ height: h.sudah > 0 ? `${Math.round((h.lulus / h.sudah) * 100)}%` : 0 }} />
                        </span>
                      </span>
                      <span className="text-[10.5px] font-semibold text-[#55657D]">{tglPendekQc(h.tanggal)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11.5px] text-[#6B7A90]">Tinggi batang = persen yang sudah mengisi; bagian biru tua = yang lulus di antara mereka.</p>
            </Kartu>
          )}

          {d.hari.length > 0 && hitung && (
            <Kartu
              judul="Petugas per hari"
              ket={`${tampil.length} dari ${d.baris.length} petugas tampil`}
              kanan={<button type="button" className={BTN_O} onClick={unduh} disabled={tampil.length === 0}>Unduh CSV</button>}
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input className={`${INPUT} min-w-[180px] flex-1`} placeholder="Cari nama petugas atau PML" aria-label="Cari petugas" value={saring.cari} onChange={(e) => setSaring((s) => ({ ...s, cari: e.target.value }))} />
                  <select className={INPUT} aria-label="Saring peran" value={saring.peran} onChange={(e) => setSaring((s) => ({ ...s, peran: e.target.value as SaringanRentang["peran"] }))}>
                    <option value="semua">Semua peran</option>
                    <option value="PML">PML</option>
                    <option value="PPL">PPL</option>
                  </select>
                  <select className={INPUT} aria-label="Saring tim" value={saring.pml} onChange={(e) => setSaring((s) => ({ ...s, pml: e.target.value }))}>
                    <option value="">Semua tim</option>
                    {tim.map((t) => <option key={t} value={t}>Tim {t}</option>)}
                  </select>
                  <select className={INPUT} aria-label="Urutkan" value={urut} onChange={(e) => setUrut(e.target.value as UrutRentang)}>
                    {(Object.keys(LABEL_URUT_RENTANG) as UrutRentang[]).map((k) => <option key={k} value={k}>Urut: {LABEL_URUT_RENTANG[k]}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring status">
                  {STATUS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={saring.status === k}
                      onClick={() => setSaring((s) => ({ ...s, status: k }))}
                      className={`min-h-[34px] rounded-full border-[1.5px] px-3 text-[12px] font-semibold ${saring.status === k ? "border-[#0F2A52] bg-[#0F2A52] text-white" : "border-[#DDE6F3] bg-white text-[#1B2B4B] hover:bg-[#F5F8FE]"}`}
                    >
                      {LABEL_STATUS_RENTANG[k]} ({hitung[k]})
                    </button>
                  ))}
                  {(saring.status !== "semua" || saring.peran !== "semua" || saring.pml || saring.cari) && (
                    <button type="button" className="min-h-[34px] rounded-full px-3 text-[12px] font-bold text-[#1F5FD1] underline" onClick={() => setSaring(SARINGAN_RENTANG_AWAL)}>Hapus saringan</button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-[#E1E8F4]">
                  <table className="w-full min-w-max border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F5F8FE] text-left text-[11.5px] text-[#44546F]">
                        <th className="sticky left-0 z-10 bg-[#F5F8FE] px-3 py-2 font-bold">Petugas</th>
                        {d.hari.map((t) => (
                          <th key={t} className="px-1.5 py-2 text-center font-bold">
                            <button type="button" className="rounded px-1 underline decoration-dotted underline-offset-2 hover:text-[#1F5FD1]" onClick={() => onBukaHari(t)} title="Buka hari ini">{tglPendekQc(t)}</button>
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-bold">Terisi</th>
                        <th className="px-2 py-2 text-center font-bold">Lulus</th>
                        <th className="px-2 py-2 text-center font-bold">Rata-rata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tampil.length === 0 && (
                        <tr><td colSpan={d.hari.length + 4} className="px-3 py-6 text-center text-[#55657D]">Tidak ada petugas yang cocok dengan saringan.</td></tr>
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
                          {b.sel.map((s, i) => (
                            <td key={d.hari[i]} className="px-1 py-1 text-center">
                              {s ? (
                                <span
                                  className={`inline-flex min-w-[40px] flex-col items-center rounded-md px-1.5 py-0.5 font-bold tabular-nums ${s.lulus ? "bg-[#E3F6EC] text-[#0F5C39]" : "bg-[#FFF3D6] text-[#8A5A00]"}`}
                                  title={`${tglPendekQc(d.hari[i])}: nilai terbaik ${s.terbaik} (awal ${s.awal}), ${s.percobaan} percobaan${s.terlambat ? ", terlambat" : ""}`}
                                >
                                  <span>{s.terbaik}{s.terlambat && <sup className="ml-0.5 text-[9px]" aria-label="terlambat">T</sup>}</span>
                                  {s.percobaan > 1 && <span className="text-[9.5px] font-semibold opacity-80">{s.percobaan}×</span>}
                                </span>
                              ) : (
                                <span className="inline-block min-w-[40px] rounded-md bg-[#FBECEC] px-1.5 py-0.5 font-bold text-[#B42329]" title={`${tglPendekQc(d.hari[i])}: tidak mengisi`}>–</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-center font-semibold tabular-nums text-[#1B2B4B]">{b.hari_terisi}/{d.hari.length}</td>
                          <td className="px-2 py-1 text-center font-semibold tabular-nums text-[#1B2B4B]">{b.hari_lulus}</td>
                          <td className="px-2 py-1 text-center font-bold tabular-nums text-[#0F2A52]">{b.rata_terbaik ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11.5px] leading-snug text-[#6B7A90]">
                  Angka = nilai terbaik pada hari itu. Hijau = lulus, kuning = di bawah nilai lulus, merah "–" = tidak mengisi. Huruf kecil <b>T</b> = terlambat, "2×" = jumlah percobaan. Peserta dihitung dari daftar saat ini, jadi petugas yang baru bergabung tampil kosong di hari sebelum bergabung.
                </p>
              </div>
            </Kartu>
          )}
        </>
      )}
    </div>
  );
}
