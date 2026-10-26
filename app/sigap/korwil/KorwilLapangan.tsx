"use client";

// app/sigap/korwil/KorwilLapangan.tsx
//
// (19 Okt 2026) Monitoring Korwil -- layar Progres Lapangan: satu kartu per tim PML (target, realisasi, sisa), wilayah (rekap per nagari atau
// daftar Sub SLS, bisa diganti) dan daftar petugas (PML + PPL). Sub SLS yang dipegang lebih dari satu tim diberi tanda ⇄ (target diproporsikan).

import { useState } from "react";
import { angkaId, namaSingkat } from "@/app/sigap/kegiatan/format";
import { namaTampil } from "@/lib/namaTampil";
import { persenKorwil, timCapaianTerendah, type LapanganKorwil, type TimProgres } from "@/lib/korwilMonitor";

const pct = (a: number, b: number) => String(persenKorwil(a, b)).replace(".", ",");

function Bilah({ nilai, target, warna = "#1F5FD1", tinggi = 9 }: { nilai: number; target: number; warna?: string; tinggi?: number }) {
  const lebar = target > 0 ? Math.min(100, (nilai / target) * 100) : 0;
  return (
    <div className="overflow-hidden rounded-full bg-[#E6EBF3]" style={{ height: tinggi }} role="img" aria-label={`${angkaId(nilai)} dari ${angkaId(target)} KK`}>
      <div className="h-full rounded-full" style={{ width: `${lebar}%`, background: warna }} />
    </div>
  );
}

function BarisWilayah({ judul, ket, target, realisasi, dibagi }: { judul: string; ket: string; target: number; realisasi: number; dibagi?: boolean }) {
  return (
    <li className="border-b border-dashed border-[#D9E3F2] py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[13px] font-bold text-[#0F2A52]">
            {judul}
            {dibagi && <span title="Sub SLS ini dipegang lebih dari satu tim; target dibagi" className="ml-1.5 rounded-md bg-[#FFF1CC] px-1.5 py-px text-[10px] font-extrabold text-[#8A6200]">⇄ dibagi</span>}
          </p>
          <p className="text-[11px] text-[#6B7A90]">{ket}</p>
        </div>
        <span className="flex-none whitespace-nowrap text-[13px] font-extrabold text-[#0F2A52]">
          {angkaId(realisasi)} <span className="font-semibold text-[#6B7A90]">/ {angkaId(target)}</span>
        </span>
      </div>
      <div className="mt-1.5">
        <Bilah nilai={realisasi} target={target} warna="#157A3E" tinggi={5} />
      </div>
    </li>
  );
}

function KartuTim({ t, no, terendah }: { t: TimProgres; no: number; terendah: boolean }) {
  const [mode, setMode] = useState<"nagari" | "sub">("nagari");
  const [petugas, setPetugas] = useState(false);
  // (26 Okt 2026, C2) rincian wilayah dan petugas tertutup secara bawaan supaya halaman tidak sepanjang ±1700 px
  const [rinci, setRinci] = useState(false);
  const sisa = Math.max(0, t.target - t.realisasi);
  return (
    <section aria-label={`Tim ${namaSingkat(t.pml_nama)}`} className="rounded-[18px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <header className="flex items-center gap-2.5">
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-[#E3ECFB] text-[14px] font-extrabold text-[#1F5FD1]">{no}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-extrabold text-[#0F2A52]">
            Tim {namaSingkat(t.pml_nama)}
            {terendah && <span className="ml-1.5 rounded-md bg-[#FDE8E8] px-1.5 py-px align-[1px] text-[10px] font-extrabold text-[#B42329]">Capaian terendah</span>}
          </h2>
          <p className="text-[11.5px] text-[#6B7A90]">
            PML · {t.ppl.length} PPL · {t.sub.length} Sub SLS
          </p>
        </div>
        <span className="flex-none text-[17px] font-extrabold text-[#1F5FD1]">{pct(t.realisasi, t.target)}%</span>
      </header>

      <div className="mt-2.5">
        <Bilah nilai={t.realisasi} target={t.target} />
      </div>
      <div className="mt-1.5 flex justify-between text-[12.5px] text-[#52627A]">
        <span>
          Target <b className="text-[#0F2A52]">{angkaId(t.target)}</b> KK
        </span>
        <span>
          Berhasil didata <b className="text-[#0F2A52]">{angkaId(t.realisasi)}</b> KK
        </span>
        <span>
          Sisa <b className="text-[#0F2A52]">{angkaId(sisa)}</b>
        </span>
      </div>
      {t.tidak_ditemukan > 0 && <p className="mt-1 text-[11.5px] text-[#6B7A90]">{angkaId(t.tidak_ditemukan)} KK tidak ditemukan (tidak masuk "berhasil didata").</p>}

      <button type="button" aria-expanded={rinci} onClick={() => setRinci((x) => !x)} className="mt-2 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[12px] bg-[#F5F8FE] px-3 text-left text-[12.5px] font-extrabold text-[#1F5FD1]">
        <span>{rinci ? "Sembunyikan wilayah dan petugas" : "Lihat wilayah dan petugas"}</span>
        <span aria-hidden>{rinci ? "▲" : "▼"}</span>
      </button>
      {rinci && (
        <>
      <div className="mt-3 border-t border-[#D9E3F2] pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">Wilayah</h3>
          <div role="group" aria-label="Tampilan wilayah" className="inline-flex rounded-full bg-[#E6EBF3] p-0.5">
            {(
              [
                ["nagari", "Rekap nagari"],
                ["sub", "Daftar Sub SLS"],
              ] as ["nagari" | "sub", string][]
            ).map(([k, tx]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`min-h-[44px] rounded-full px-3 py-1 text-[11.5px] font-bold ${mode === k ? "bg-white text-[#1F5FD1] shadow-sm" : "text-[#52627A]"}`}>
                {tx}
              </button>
            ))}
          </div>
        </div>
        {t.sub.length === 0 ? (
          <p className="py-3 text-[12.5px] text-[#6B7A90]">Tim ini belum punya Sub SLS.</p>
        ) : (
          <ul className="mt-1">
            {mode === "nagari"
              ? t.nagari.map((n) => <BarisWilayah key={n.nagari} judul={`Nagari ${n.nagari}`} ket={`${n.sub} Sub SLS${n.target === 0 ? " · daftar KK belum ada" : ""}`} target={n.target} realisasi={n.realisasi} />)
              : t.sub.map((s) => <BarisWilayah key={s.idsubsls} judul={s.label} ket={`Nagari ${s.nagari}${s.kk_total === 0 ? " · daftar KK belum ada" : ""}${s.dibagi > 1 ? ` · total ${angkaId(s.kk_total)} KK dibagi ${s.dibagi} tim` : ""}`} target={s.target} realisasi={s.realisasi} dibagi={s.dibagi > 1} />)}
          </ul>
        )}
        {t.sub_dibagi > 0 && mode === "nagari" && <p className="mt-1 text-[11px] text-[#8A6200]">⇄ {t.sub_dibagi} Sub SLS tim ini juga dipegang tim lain, jadi targetnya dibagi. Lihat tanda "dibagi" di "Daftar Sub SLS".</p>}
      </div>

      <button type="button" aria-expanded={petugas} onClick={() => setPetugas((x) => !x)} className="mt-2 min-h-[44px] text-[12.5px] font-extrabold text-[#1F5FD1]">
        {petugas ? "Sembunyikan petugas ▲" : "Lihat petugas ▼"}
      </button>
      {petugas && (
        <div className="border-t border-[#D9E3F2] pt-2">
          <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">Daftar petugas</h3>
          <ul>
            <li className="flex items-center justify-between gap-2 border-b border-dashed border-[#D9E3F2] py-1.5 text-[13px]">
              <span className="min-w-0 break-words">
                <span className="mr-1.5 rounded-md bg-[#E3ECFB] px-1.5 py-px text-[10px] font-extrabold text-[#1F5FD1]">PML</span>
                {namaTampil(t.pml_nama)}
              </span>
              <span className="flex-none font-bold text-[#52627A]">{t.pml.didata > 0 ? `${angkaId(t.pml.didata)} KK` : ""}</span>
            </li>
            {t.ppl.map((p) => (
              <li key={p.petugas_id} className="flex items-center justify-between gap-2 border-b border-dashed border-[#D9E3F2] py-1.5 pl-3 text-[13px] last:border-b-0">
                <span className="min-w-0 break-words">
                  <span className="mr-1.5 rounded-md bg-[#E6EBF3] px-1.5 py-px text-[10px] font-extrabold text-[#52627A]">PPL</span>
                  {namaTampil(p.nama)}
                </span>
                <span className="flex-none font-bold text-[#0F2A52]">
                  {angkaId(p.didata)} KK{p.tidak_ditemukan > 0 && <span className="ml-1 text-[11px] font-semibold text-[#6B7A90]">(+{p.tidak_ditemukan} tidak ditemukan)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
        </>
      )}
    </section>
  );
}

export default function KorwilLapangan({ lap }: { lap: LapanganKorwil }) {
  if (lap.tim.length === 0) return <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13.5px] text-[#5B6B84] shadow-[0_8px_22px_rgba(15,42,82,.06)]">Kelompok ini belum punya tim PML.</p>;
  // (26 Okt 2026, C2) tim dengan capaian terendah ditandai; tidak ditandai bila hanya satu tim atau capaian semua tim sama
  const terendah = new Set(timCapaianTerendah(lap.tim));
  return (
    <div className="space-y-3">
      {lap.tim.map((t, i) => (
        <KartuTim key={t.pml_id} t={t} no={i + 1} terendah={terendah.has(t.pml_id)} />
      ))}
    </div>
  );
}
