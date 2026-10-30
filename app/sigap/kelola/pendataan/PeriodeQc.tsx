"use client";

// app/sigap/kelola/pendataan/PeriodeQc.tsx
//
// (30 Okt 2026) Filter tanggal QC Pemahaman (Kelola Pendataan > QC > Pemahaman · Hari ini). Dua mode:
//  - "Per tanggal": pilih satu hari (kolom tanggal, ‹ sebelumnya / berikutnya › di antara hari yang punya soal, tombol "Hari ini", dan deretan hari ber-soal);
//  - "Rentang tanggal": dari-sampai + pilihan cepat; hasilnya matriks petugas x hari (RekapRentangQc.tsx).
// Logika murni ada di lib/sigapQcRentang.ts (diuji).

import { Kartu } from "../../admin/ui";
import { geserTanggal, hariTetangga, periksaRentang, rentangTerakhir, MAKS_HARI_RENTANG } from "@/lib/sigapQcRentang";

export type ModePeriode = "hari" | "rentang";
export type Rentang = { dari: string; sampai: string };

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-10-30" -> "30 Okt" */
export const tglPendekQc = (t: string): string => {
  const [, m, d] = t.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1] ?? m}`;
};

/** Tanggal hari ini menurut WIB dari penanda waktu server. */
export const hariIniWib = (sekarangIso: string): string => new Date(Date.parse(sekarangIso) + 7 * 3600 * 1000).toISOString().slice(0, 10);

const KOTAK = "min-h-[40px] rounded-lg border border-[#DDE6F3] bg-white px-2.5 text-[13px] text-[#1B2B4B] outline-none focus:border-[#1F5FD1] focus:ring-2 focus:ring-[#1F5FD1]/15";
const TOMBOL = "inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[#CBD6E6] bg-white px-3 text-[12.5px] font-semibold text-[#1B2B4B] hover:bg-[#F5F8FE] disabled:cursor-not-allowed disabled:opacity-40";
const CHIP_ON = "border-[#0F2A52] bg-[#0F2A52] text-white";
const CHIP_OFF = "border-[#DDE6F3] bg-white text-[#1B2B4B] hover:bg-[#F5F8FE]";

export default function PeriodeQc({
  mode,
  onMode,
  hari,
  hariAda,
  hariBerlaku,
  sekarang,
  sibuk,
  onHari,
  rentang,
  onRentang,
}: {
  mode: ModePeriode;
  onMode: (m: ModePeriode) => void;
  /** Hari yang sedang ditampilkan pada mode per tanggal. */
  hari: string | null;
  /** Hari yang punya soal (urutan bebas). */
  hariAda: string[];
  hariBerlaku: string | null;
  sekarang: string;
  sibuk: boolean;
  /** Pilih hari; null = kembali ke hari berlaku. */
  onHari: (t: string | null) => void;
  rentang: Rentang;
  onRentang: (r: Rentang) => void;
}) {
  const hariIni = hariBerlaku ?? hariIniWib(sekarang);
  const sebelum = hariTetangga(hariAda, hari, -1);
  const sesudah = hariTetangga(hariAda, hari, 1);
  const terurut = [...new Set(hariAda)].sort().reverse();
  const chipHari = terurut.slice(0, 14);
  const cek = periksaRentang(rentang.dari, rentang.sampai);
  const awalSemua = terurut.length ? terurut[terurut.length - 1] : null;
  const akhirSemua = terurut.length ? terurut[0] : null;
  const semuaHari = awalSemua && akhirSemua ? { dari: awalSemua, sampai: akhirSemua } : null;
  const semuaMuat = semuaHari ? periksaRentang(semuaHari.dari, semuaHari.sampai).ok : false;

  return (
    <Kartu
      judul="Periode"
      ket={mode === "hari" ? "Pilih tanggal yang ingin dilihat." : `Rekap beberapa hari sekaligus (maksimal ${MAKS_HARI_RENTANG} hari).`}
      kanan={
        <div role="tablist" aria-label="Mode periode" className="flex gap-[3px] rounded-[10px] bg-[#EEF2F8] p-[3px]">
          {(["hari", "rentang"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => onMode(m)}
              className={`min-h-[34px] rounded-[8px] px-3 text-[12.5px] font-bold ${mode === m ? "bg-white text-[#0F2A52] shadow-sm" : "text-[#55657D]"}`}
            >
              {m === "hari" ? "Per tanggal" : "Rentang tanggal"}
            </button>
          ))}
        </div>
      }
    >
      {mode === "hari" ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={TOMBOL} disabled={!sebelum || sibuk} onClick={() => sebelum && onHari(sebelum)} aria-label="Hari ber-soal sebelumnya">
              ‹ Sebelumnya
            </button>
            <label className="flex items-center gap-1.5 text-[12px] font-bold text-[#0F2A52]">
              <span className="sr-only">Tanggal</span>
              <input
                type="date"
                value={hari ?? ""}
                max={geserTanggal(hariIni, 1)}
                onChange={(e) => e.target.value && onHari(e.target.value)}
                className={KOTAK}
              />
            </label>
            <button type="button" className={TOMBOL} disabled={!sesudah || sibuk} onClick={() => sesudah && onHari(sesudah)} aria-label="Hari ber-soal berikutnya">
              Berikutnya ›
            </button>
            <button type="button" className={TOMBOL} disabled={sibuk || hari === hariIni} onClick={() => onHari(null)}>
              Hari ini
            </button>
          </div>
          {chipHari.length > 0 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Hari yang punya soal">
              {chipHari.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onHari(t)}
                  aria-pressed={hari === t}
                  disabled={sibuk}
                  className={`min-h-[36px] flex-none whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${hari === t ? CHIP_ON : CHIP_OFF}`}
                >
                  {tglPendekQc(t)}
                  {t === hariIni ? " · hari ini" : ""}
                </button>
              ))}
            </div>
          )}
          {hariAda.length === 0 && <p className="text-[12.5px] text-[#6B7A90]">Belum ada hari yang punya soal QC.</p>}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1 text-[12px] font-bold text-[#0F2A52]">
              Dari
              <input type="date" value={rentang.dari} max={rentang.sampai || undefined} onChange={(e) => e.target.value && onRentang({ ...rentang, dari: e.target.value })} className={KOTAK} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-bold text-[#0F2A52]">
              Sampai
              <input type="date" value={rentang.sampai} min={rentang.dari || undefined} onChange={(e) => e.target.value && onRentang({ ...rentang, sampai: e.target.value })} className={KOTAK} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pilihan cepat">
            {[7, 14, 30].map((n) => {
              const r = rentangTerakhir(hariIni, n);
              const aktif = rentang.dari === r.dari && rentang.sampai === r.sampai;
              return (
                <button key={n} type="button" onClick={() => onRentang(r)} aria-pressed={aktif} className={`min-h-[36px] rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${aktif ? CHIP_ON : CHIP_OFF}`}>
                  {n} hari terakhir
                </button>
              );
            })}
            <button
              type="button"
              disabled={!semuaHari || !semuaMuat}
              onClick={() => semuaHari && onRentang(semuaHari)}
              aria-pressed={!!semuaHari && rentang.dari === semuaHari.dari && rentang.sampai === semuaHari.sampai}
              className={`min-h-[36px] rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold disabled:opacity-40 ${semuaHari && rentang.dari === semuaHari.dari && rentang.sampai === semuaHari.sampai ? CHIP_ON : CHIP_OFF}`}
              title={semuaHari && !semuaMuat ? `Lebih dari ${MAKS_HARI_RENTANG} hari: pilih rentangnya sendiri` : undefined}
            >
              Semua hari ber-soal
            </button>
          </div>
          {!cek.ok && <p role="alert" className="text-[12.5px] font-semibold text-[#B42329]">{cek.pesan}</p>}
        </div>
      )}
    </Kartu>
  );
}
