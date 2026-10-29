"use client";

// app/sigap/kelola/pendataan/TabelQc.tsx
//
// (29 Okt 2026) Hasil QC Pemahaman dalam bentuk TABEL (menggantikan kartu per tim): satu baris per petugas dengan kolom
// Nama · Peran · Nama PML · Jumlah percobaan · Nilai (sub-kolom P1, P2, P3, P4, ...). Ketuk nama untuk melihat rincian soal dan jawaban yang salah.
// Tombol Back HP menutup jendela rincian (useTutupDenganBack). Logika susunan baris ada di lib/sigapQcTabel.ts (diuji).

import { useMemo, useState } from "react";
import { IsiRincianQc } from "@/app/portal/qc/RincianQc";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import type { QcRekapTim } from "@/lib/sigapQc";
import type { RincianQc } from "@/lib/sigapQcMonitor";
import { gabungSoalSalah, hitungStatusQc, jumlahKolomNilai, saringBarisQc, susunBarisQc, type BarisQc, type StatusSaring } from "@/lib/sigapQcTabel";
import { Chip, INPUT } from "../../admin/ui";

const SARING: { id: StatusSaring; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "belum", label: "Belum mengisi" },
  { id: "tidak_lulus", label: "Belum lulus" },
  { id: "lulus", label: "Lulus" },
];

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

export default function TabelQc({ rekap, rincian, maks, nilaiLulus }: { rekap: QcRekapTim[]; rincian: RincianQc | undefined; maks: number; nilaiLulus: number }) {
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState<StatusSaring>("semua");
  const [pilih, setPilih] = useState<BarisQc | null>(null);

  const kolom = useMemo(() => jumlahKolomNilai(maks, rincian), [maks, rincian]);
  const semua = useMemo(() => susunBarisQc(rekap, rincian, kolom), [rekap, rincian, kolom]);
  const jumlah = useMemo(() => hitungStatusQc(semua), [semua]);
  const tampil = useMemo(() => saringBarisQc(semua, cari, status), [semua, cari, status]);
  const soalSalah = useMemo(() => gabungSoalSalah(rekap), [rekap]);

  return (
    <section className="rounded-[16px] border border-[#DDE6F3] bg-white p-3.5 shadow-[0_2px_10px_rgba(15,42,82,.06)]" aria-label="Hasil QC Pemahaman per petugas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[15px] text-[#0F2A52]">Hasil per petugas</b>
        <span className="text-[12px] text-[#6B7A90]">Ketuk nama untuk melihat soal dan jawaban yang salah</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama petugas atau PML" className={`${INPUT} min-w-[200px] flex-1`} aria-label="Cari nama petugas atau PML" />
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
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-[#E3E8EE]">
        <table className="w-full min-w-[620px] border-collapse text-left text-[13px]">
          <thead className="bg-[#F2F5FA] text-[11.5px] uppercase tracking-wide text-[#55657D]">
            <tr>
              <th rowSpan={2} className="px-3 py-2 align-bottom font-extrabold">Nama</th>
              <th rowSpan={2} className="px-2 py-2 align-bottom font-extrabold">Peran</th>
              <th rowSpan={2} className="px-2 py-2 align-bottom font-extrabold">Nama PML</th>
              <th rowSpan={2} className="px-2 py-2 text-center align-bottom font-extrabold">Percobaan</th>
              <th colSpan={kolom} className="border-l border-[#E3E8EE] px-2 py-1.5 text-center font-extrabold">Nilai</th>
            </tr>
            <tr>
              {Array.from({ length: kolom }, (_, i) => (
                <th key={i} className={`px-2 py-1.5 text-center font-extrabold ${i === 0 ? "border-l border-[#E3E8EE]" : ""}`}>
                  P{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E8EE]">
            {tampil.length === 0 && (
              <tr>
                <td colSpan={4 + kolom} className="px-3 py-5 text-center text-[13px] text-[#55657D]">
                  Tidak ada petugas yang cocok.
                </td>
              </tr>
            )}
            {tampil.map((b) => (
              <tr key={`${b.peran}-${b.akun_id}`} className={b.peran === "PML" ? "bg-[#FAF7FD]" : ""}>
                <td className="px-3 py-1.5">
                  <button type="button" onClick={() => setPilih(b)} className="min-h-[36px] text-left font-bold text-[#1F4FA8] underline decoration-dotted underline-offset-2">
                    {b.nama}
                  </button>
                  {b.terlambat && <span className="ml-1.5 align-middle"><Chip w="wait">Terlambat</Chip></span>}
                </td>
                <td className="px-2 py-1.5">
                  <Chip w={b.peran === "PML" ? "vio" : "navy"}>{b.peran}</Chip>
                </td>
                <td className="px-2 py-1.5 text-[#1B2B4B]">{b.pml ?? "-"}</td>
                <td className="px-2 py-1.5 text-center font-bold tabular-nums">{b.percobaan}</td>
                {b.nilai.map((n, i) => (
                  <td key={i} className={`px-2 py-1.5 text-center tabular-nums ${i === 0 ? "border-l border-[#E3E8EE]" : ""}`}>
                    {n == null ? <span className="text-[#9AA7BA]">-</span> : <b className={n >= nilaiLulus ? "text-[#13794B]" : "text-[#8A4B08]"}>{n}</b>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11.5px] text-[#6B7A90]">
        Hijau = nilai {nilaiLulus >= 100 ? "100" : `${nilaiLulus} ke atas`} (lulus), oranye = di bawahnya, - = percobaan itu belum ada. Menampilkan {tampil.length} dari {semua.length} orang.
      </p>

      {soalSalah.length > 0 && (
        <details className="mt-3 rounded-lg bg-[#FFF8F7] px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-bold text-[#B42329]">Soal yang paling sering salah (percobaan pertama)</summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12.5px] text-[#1B2B4B]">
            {soalSalah.map((s) => (
              <li key={s.soal_id}>
                {s.pertanyaan} <b>({s.jumlah})</b>
              </li>
            ))}
          </ul>
        </details>
      )}

      {pilih && <JendelaRincian baris={pilih} rincian={rincian} onTutup={() => setPilih(null)} />}
    </section>
  );
}
