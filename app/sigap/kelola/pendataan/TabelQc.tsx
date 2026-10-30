"use client";

// app/sigap/kelola/pendataan/TabelQc.tsx
//
// (29 Okt 2026) Hasil QC Pemahaman dalam bentuk TABEL: satu baris per petugas dengan kolom Nama · Peran · Nama PML · Jumlah percobaan · Nilai (P1..Pn).
// Standar kolom: klik judul = urut (naik, turun, tanpa urut), baris filter di bawah judul (teks / pilihan) untuk tiap kolom, dan saringan status cepat.
// "Fokus" datang dari luar (klik batang infografis, kartu "Tanpa notifikasi") dan membatasi baris yang tampil sampai dihapus.
// Ketuk nama = jendela rincian soal dan jawaban yang salah (Back HP menutupnya). Logika murni ada di lib/sigapQcTabel.ts (diuji).

import { useMemo, useState } from "react";
import { IsiRincianQc } from "@/app/portal/qc/RincianQc";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import type { RincianQc } from "@/lib/sigapQcMonitor";
import {
  FILTER_KOLOM_KOSONG,
  daftarJumlahPercobaan,
  daftarPmlBaris,
  hitungStatusQc,
  kolomAdaFilter,
  namaTakCocok,
  saringBarisQc,
  saringKolom,
  terapkanFokus,
  urutkanBaris,
  type ArahUrut,
  type BarisQc,
  type FilterKolom,
  type FilterNilai,
  type FokusQc,
  type KolomUrut,
  type StatusSaring,
} from "@/lib/sigapQcTabel";
import { Chip, INPUT } from "../../admin/ui";
import { Pergerakan, SelNilai } from "./BatangQc";

const SARING: { id: StatusSaring; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "belum", label: "Belum mengisi" },
  { id: "tidak_lulus", label: "Belum lulus" },
  { id: "lulus", label: "Lulus" },
];

const SEL = "min-h-[34px] w-full rounded-md border border-[#CBD5E3] bg-white px-1.5 text-[12px] font-normal normal-case tracking-normal text-[#1B2B4B]";

function statusBaris(b: BarisQc): { w: "ok" | "wait" | "bad"; label: string } {
  if (b.percobaan === 0) return { w: "bad", label: "Belum mengisi" };
  return b.lulus ? { w: "ok", label: "Lulus" } : { w: "wait", label: "Belum lulus" };
}

function JendelaRincian({ baris, rincian, onTutup }: { baris: BarisQc; rincian: RincianQc | undefined; onTutup: () => void }) {
  useTutupDenganBack(true, onTutup); // Back HP = tutup jendela
  const st = statusBaris(baris);
  const adaData = (rincian?.percobaan[baris.akun_id]?.length ?? 0) > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,42,82,.55)] sm:items-center sm:px-4" role="dialog" aria-modal="true" aria-label={`Rincian QC ${baris.nama}`} onClick={onTutup}>
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-t-[20px] bg-white shadow-[0_20px_50px_rgba(15,42,82,.35)] sm:rounded-[20px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#E3E8EE] px-4 py-3">
          <div className="min-w-0">
            <b className="block break-words text-[15px] leading-tight text-[#0F2A52]">{baris.nama}</b>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-[#55657D]">
              <Chip w={baris.peran === "PML" ? "vio" : "navy"}>{baris.peran}</Chip>
              {baris.pml && <span>PML: {baris.pml}</span>}
              <Chip w={st.w}>{st.label}</Chip>
              {baris.terlambat && <Chip w="wait">Terlambat</Chip>}
            </p>
          </div>
          <button type="button" onClick={onTutup} className="min-h-[40px] flex-none rounded-full bg-[#EEF2F8] px-3 text-[12.5px] font-extrabold text-[#0F2A52]">
            Tutup
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          {adaData ? <IsiRincianQc akunId={baris.akun_id} rincian={rincian} /> : <p className="text-[13px] text-[#55657D]">{baris.percobaan === 0 ? "Belum mengisi QC hari ini." : "Rincian soal belum tersedia untuk petugas ini."}</p>}
        </div>
      </div>
    </div>
  );
}

function JudulUrut({ teks, kolom, urut, onUrut, kelas = "" }: { teks: string; kolom: KolomUrut; urut: { kolom: KolomUrut; arah: ArahUrut } | null; onUrut: (k: KolomUrut) => void; kelas?: string }) {
  const aktif = urut?.kolom === kolom;
  return (
    <button type="button" onClick={() => onUrut(kolom)} className={`inline-flex min-h-[32px] items-center gap-1 font-extrabold uppercase tracking-wide ${aktif ? "text-[#0F2A52]" : "text-[#55657D]"} ${kelas}`} title={`Urutkan menurut ${teks}`}>
      {teks}
      <span aria-hidden className={`text-[10px] ${aktif ? "" : "opacity-40"}`}>
        {aktif ? (urut!.arah === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

export default function TabelQc({
  baris,
  kolom,
  rincian,
  nilaiLulus,
  fokus,
  onHapusFokus,
}: {
  baris: BarisQc[];
  kolom: number;
  rincian: RincianQc | undefined;
  nilaiLulus: number;
  fokus: FokusQc | null;
  onHapusFokus: () => void;
}) {
  const [status, setStatus] = useState<StatusSaring>("semua");
  const [filter, setFilter] = useState<FilterKolom>(FILTER_KOLOM_KOSONG);
  const [urut, setUrut] = useState<{ kolom: KolomUrut; arah: ArahUrut } | null>(null);
  const [pilih, setPilih] = useState<BarisQc | null>(null);

  const dasar = useMemo(() => terapkanFokus(baris, fokus), [baris, fokus]);
  const jumlah = useMemo(() => hitungStatusQc(dasar), [dasar]);
  const pmlList = useMemo(() => daftarPmlBaris(baris), [baris]);
  const percobaanList = useMemo(() => daftarJumlahPercobaan(baris), [baris]);
  const tampil = useMemo(() => {
    const a = saringBarisQc(dasar, "", status);
    const b = saringKolom(a, filter, nilaiLulus);
    return urutkanBaris(b, urut?.kolom ?? null, urut?.arah ?? "asc");
  }, [dasar, status, filter, nilaiLulus, urut]);
  const takCocok = useMemo(() => namaTakCocok(baris, fokus), [baris, fokus]);
  const adaFilter = kolomAdaFilter(filter) || status !== "semua";

  const klikUrut = (k: KolomUrut) =>
    setUrut((u) => {
      if (!u || u.kolom !== k) return { kolom: k, arah: "asc" };
      if (u.arah === "asc") return { kolom: k, arah: "desc" };
      return null;
    });
  const ariaSort = (k: KolomUrut): "ascending" | "descending" | "none" => (urut?.kolom === k ? (urut.arah === "asc" ? "ascending" : "descending") : "none");
  const aturNilai = (i: number, v: FilterNilai) => setFilter((f) => ({ ...f, nilai: { ...f.nilai, [i]: v } }));

  return (
    <section id="tabel-qc" className="scroll-mt-24 rounded-[16px] border border-[#DDE6F3] bg-white p-3.5 shadow-[0_2px_10px_rgba(15,42,82,.06)]" aria-label="Hasil QC Pemahaman per petugas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[15px] text-[#0F2A52]">Hasil per petugas</b>
        <span className="text-[12px] text-[#6B7A90]">Klik judul kolom untuk mengurutkan · ketuk nama untuk melihat soal dan jawaban yang salah</span>
      </div>

      {fokus && (
        <div className="mt-2.5 rounded-[12px] border border-[#BFD0EE] bg-[#F1F6FE] px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-[#0F2A52]">
              Fokus: {fokus.judul} <span className="font-normal text-[#55657D]">· {dasar.length} orang</span>
            </p>
            <button type="button" onClick={onHapusFokus} className="min-h-[34px] rounded-full bg-white px-3 text-[12px] font-extrabold text-[#1F4FA8] shadow-sm active:bg-[#E6EEFB]">
              Tampilkan semua ✕
            </button>
          </div>
          {fokus.catatan && <p className="mt-1 text-[12px] leading-snug text-[#55657D]">{fokus.catatan}</p>}
          {takCocok.length > 0 && <p className="mt-1 text-[12px] leading-snug text-[#8A4B08]">Tidak ditemukan di tabel (nama berbeda atau bukan peserta tim): {takCocok.join(", ")}.</p>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring status">
          {SARING.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={status === s.id}
              onClick={() => setStatus(s.id)}
              className={`min-h-[36px] rounded-full px-3 text-[12px] font-extrabold ${status === s.id ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}
            >
              {s.label} <span className="tabular-nums opacity-80">{jumlah[s.id]}</span>
            </button>
          ))}
        </div>
        {(adaFilter || urut) && (
          <button
            type="button"
            onClick={() => {
              setFilter(FILTER_KOLOM_KOSONG);
              setStatus("semua");
              setUrut(null);
            }}
            className="min-h-[36px] rounded-full bg-[#EEF2F8] px-3 text-[12px] font-extrabold text-[#1F4FA8]"
          >
            Atur ulang filter dan urutan
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-[#E3E8EE]">
        <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
          <thead className="bg-[#F2F5FA] text-[11.5px]">
            <tr>
              <th rowSpan={2} aria-sort={ariaSort("nama")} className="min-w-[150px] px-3 pb-1 pt-2 align-bottom">
                <JudulUrut teks="Nama" kolom="nama" urut={urut} onUrut={klikUrut} />
              </th>
              <th rowSpan={2} aria-sort={ariaSort("peran")} className="px-2 pb-1 pt-2 align-bottom">
                <JudulUrut teks="Peran" kolom="peran" urut={urut} onUrut={klikUrut} />
              </th>
              <th rowSpan={2} aria-sort={ariaSort("pml")} className="min-w-[120px] px-2 pb-1 pt-2 align-bottom">
                <JudulUrut teks="Nama PML" kolom="pml" urut={urut} onUrut={klikUrut} />
              </th>
              <th rowSpan={2} aria-sort={ariaSort("percobaan")} className="px-2 pb-1 pt-2 text-center align-bottom">
                <JudulUrut teks="Jumlah percobaan" kolom="percobaan" urut={urut} onUrut={klikUrut} />
              </th>
              <th colSpan={kolom} className="border-l border-[#E3E8EE] px-2 py-1.5 text-center font-extrabold uppercase tracking-wide text-[#55657D]">
                Nilai
              </th>
              <th rowSpan={3} className="border-l border-[#E3E8EE] px-3 pb-1 pt-2 text-center align-top font-extrabold uppercase tracking-wide text-[#55657D]">
                Pergerakan
              </th>
            </tr>
            <tr>
              {Array.from({ length: kolom }, (_, i) => {
                const k = `p${i + 1}` as KolomUrut;
                return (
                  <th key={i} aria-sort={ariaSort(k)} className={`px-1 py-1 text-center ${i === 0 ? "border-l border-[#E3E8EE]" : ""}`}>
                    <JudulUrut teks={`P${i + 1}`} kolom={k} urut={urut} onUrut={klikUrut} />
                  </th>
                );
              })}
            </tr>
            <tr className="border-t border-[#E3E8EE] bg-white align-top">
              <th className="px-3 py-1.5">
                <input type="search" value={filter.nama} onChange={(e) => setFilter((f) => ({ ...f, nama: e.target.value }))} placeholder="Cari nama" className={`${INPUT} !min-h-[34px] !py-1 text-[12px] font-normal normal-case`} aria-label="Filter nama" />
              </th>
              <th className="px-1.5 py-1.5">
                <select value={filter.peran} onChange={(e) => setFilter((f) => ({ ...f, peran: e.target.value as FilterKolom["peran"] }))} className={SEL} aria-label="Filter peran">
                  <option value="">Semua</option>
                  <option value="PML">PML</option>
                  <option value="PPL">PPL</option>
                </select>
              </th>
              <th className="px-1.5 py-1.5">
                <select value={filter.pml} onChange={(e) => setFilter((f) => ({ ...f, pml: e.target.value }))} className={SEL} aria-label="Filter nama PML">
                  <option value="">Semua</option>
                  <option value="-">(tanpa PML)</option>
                  {pmlList.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-1.5 py-1.5">
                <select value={filter.percobaan} onChange={(e) => setFilter((f) => ({ ...f, percobaan: e.target.value }))} className={SEL} aria-label="Filter jumlah percobaan">
                  <option value="">Semua</option>
                  {percobaanList.map((n) => (
                    <option key={n} value={String(n)}>
                      {n === 0 ? "0 (belum)" : n}
                    </option>
                  ))}
                </select>
              </th>
              {Array.from({ length: kolom }, (_, i) => (
                <th key={i} className={`px-1 py-1.5 ${i === 0 ? "border-l border-[#E3E8EE]" : ""}`}>
                  <select value={filter.nilai[i] ?? "semua"} onChange={(e) => aturNilai(i, e.target.value as FilterNilai)} className={`${SEL} min-w-[64px]`} aria-label={`Filter nilai P${i + 1}`}>
                    <option value="semua">Semua</option>
                    <option value="terisi">Terisi</option>
                    <option value="kosong">Kosong</option>
                    <option value="lulus">Lulus</option>
                    <option value="belum_lulus">Belum lulus</option>
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E8EE]">
            {tampil.length === 0 && (
              <tr>
                <td colSpan={5 + kolom} className="px-3 py-5 text-center text-[13px] text-[#55657D]">
                  Tidak ada petugas yang cocok dengan filter.
                </td>
              </tr>
            )}
            {tampil.map((b) => (
              <tr key={`${b.peran}-${b.akun_id}`} className={b.peran === "PML" ? "bg-[#FAF7FD]" : ""}>
                <td className="px-3 py-1.5">
                  <button type="button" onClick={() => setPilih(b)} className="min-h-[36px] text-left font-bold text-[#1F4FA8] underline decoration-dotted underline-offset-2">
                    {b.nama}
                  </button>
                  {b.terlambat && (
                    <span className="ml-1.5 align-middle">
                      <Chip w="wait">Terlambat</Chip>
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Chip w={b.peran === "PML" ? "vio" : "navy"}>{b.peran}</Chip>
                </td>
                <td className="px-2 py-1.5 text-[#1B2B4B]">{b.pml ?? "-"}</td>
                <td className="px-2 py-1.5 text-center font-bold tabular-nums">{b.percobaan}</td>
                {b.nilai.map((n, i) => (
                  <td key={i} className={`px-2 py-1.5 text-center tabular-nums ${i === 0 ? "border-l border-[#E3E8EE]" : ""}`}>
                    {n == null ? <span className="text-[#9AA7BA]">-</span> : <SelNilai nilai={n} nilaiLulus={nilaiLulus} />}
                  </td>
                ))}
                <td className="border-l border-[#E3E8EE] px-3 py-1.5 text-center">
                  <Pergerakan nilai={b.nilai} nilaiLulus={nilaiLulus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11.5px] text-[#6B7A90]">
        Hijau = nilai {nilaiLulus >= 100 ? "100" : `${nilaiLulus} ke atas`} (lulus), oranye = di bawahnya, - = percobaan itu belum ada. Batang di bawah angka = besar nilai; kolom Pergerakan = batang P1 sampai terakhir, ▲ naik / ▼ turun dibanding P1. Menampilkan {tampil.length} dari {baris.length} orang.
      </p>

      {pilih && <JendelaRincian baris={pilih} rincian={rincian} onTutup={() => setPilih(null)} />}
    </section>
  );
}
