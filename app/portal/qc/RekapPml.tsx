"use client";

// app/portal/qc/RekapPml.tsx
//
// (26 Okt 2026) Isi modal rekap QC kemarin untuk PML: nilai tiap PPL di timnya, soal yang masih dijawab salah (urut terbanyak), dan ajakan
// briefing ulang SEGERA. Tombol tutup baru aktif setelah PML mencentang bahwa ia akan membriefing ulang tim hari ini.

import { useState } from "react";
import { daftarBriefing, kalimatBriefing, labelStatusPpl, type QcRekapTim } from "@/lib/sigapQc";
import { tglPanjang } from "@/app/sigap/admin/api";

export default function RekapPml({ tanggal, tim, maks, menutup, galat, onTutup }: { tanggal: string; tim: QcRekapTim; maks: number; menutup: boolean; galat: string | null; onTutup: () => void }) {
  const [setuju, setSetuju] = useState(false);
  const briefing = daftarBriefing(tim);
  const perlu = briefing.length > 0 || tim.belum_mengisi > 0;
  const ppl = [...tim.ppl].sort((a, b) => (a.percobaan === 0 ? 0 : 1) - (b.percobaan === 0 ? 0 : 1) || a.nama.localeCompare(b.nama));

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-[#0B1530]/70 p-0 sm:items-center sm:p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="judul-rekap-qc" className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className={`${perlu ? "bg-[#B42329]" : "bg-[#13794B]"} px-5 pb-4 pt-4 text-white`}>
          <p className="text-[11.5px] font-extrabold tracking-wide text-white/85">REKAP QC PEMAHAMAN · {tglPanjang(tanggal).toUpperCase()}</p>
          <h2 id="judul-rekap-qc" className="mt-1.5 text-[18px] font-extrabold leading-snug">
            {perlu ? "Briefing kembali tim Anda sekarang" : "Tim Anda memahami materi dengan baik"}
          </h2>
          <p className="mt-1 text-[13.5px] leading-snug text-white/90">{kalimatBriefing(tim)}</p>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#EEF3FB] px-2 py-2.5">
              <p className="text-[20px] font-extrabold text-[#0F2A52]">
                {tim.sudah}/{tim.jumlah_ppl}
              </p>
              <p className="text-[11.5px] font-bold text-[#55657D]">sudah mengisi</p>
            </div>
            <div className="rounded-xl bg-[#EEF3FB] px-2 py-2.5">
              <p className="text-[20px] font-extrabold text-[#0F2A52]">{tim.rata_awal ?? "-"}</p>
              <p className="text-[11.5px] font-bold text-[#55657D]">rata-rata nilai awal</p>
            </div>
            <div className="rounded-xl bg-[#EEF3FB] px-2 py-2.5">
              <p className="text-[20px] font-extrabold text-[#0F2A52]">{tim.lulus}</p>
              <p className="text-[11.5px] font-bold text-[#55657D]">sudah nilai 100</p>
            </div>
          </div>

          {briefing.length > 0 && (
            <section aria-label="Soal yang dijawab salah">
              <h3 className="text-[14.5px] font-extrabold text-[#0F2A52]">Soal yang dijawab salah (percobaan pertama)</h3>
              <ol className="mt-2 space-y-2.5">
                {briefing.map((b, i) => (
                  <li key={b.soalId} className="rounded-xl border border-[#F0C4BF] bg-[#FFF8F7] p-3">
                    <p className="text-[13.5px] font-bold leading-snug text-[#1B2B4B]">
                      {i + 1}. {b.pertanyaan}
                    </p>
                    <p className="mt-1 text-[12.5px] font-bold text-[#B42329]">
                      {b.jumlah} petugas salah: {b.nama.join(", ")}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-snug text-[#1B2B4B]">
                      <b>Jawaban benar:</b> {b.kunciTeks}
                    </p>
                    {b.penjelasan && <p className="mt-1 text-[12.5px] leading-snug text-[#55657D]">{b.penjelasan}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-label="Nilai per petugas">
            <h3 className="text-[14.5px] font-extrabold text-[#0F2A52]">Nilai per petugas</h3>
            <ul className="mt-2 divide-y divide-[#E3E8EE] rounded-xl border border-[#E3E8EE]">
              {ppl.map((p) => (
                <li key={p.akun_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-[13.5px] font-bold text-[#1B2B4B]">{p.nama}</span>
                  <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${p.percobaan === 0 ? "bg-[#FDE8E8] text-[#B42329]" : p.lulus ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>
                    {labelStatusPpl(p, maks)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-2 border-t border-[#E3E8EE] px-5 py-3.5">
          {perlu && (
            <label className="flex items-start gap-2.5 text-[13.5px] font-bold leading-snug text-[#1B2B4B]">
              <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[#1F5FD1]" />
              Saya akan membriefing ulang petugas di tim saya hari ini.
            </label>
          )}
          {galat && <p className="text-[12.5px] font-bold text-[#B42329]">{galat}</p>}
          <button
            type="button"
            disabled={(perlu && !setuju) || menutup}
            onClick={onTutup}
            className="min-h-[48px] w-full rounded-xl bg-[#1F5FD1] px-4 text-[15px] font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {menutup ? "Menyimpan…" : perlu ? "Lanjut" : "Tutup"}
          </button>
        </div>
      </div>
    </div>
  );
}
