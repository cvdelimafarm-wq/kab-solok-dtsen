"use client";

// app/portal/qc/RincianQc.tsx
//
// (29 Okt 2026) Rincian QC Pemahaman per petugas: tiap percobaan (ke-1, ke-2, ...) dengan nilai dan jamnya, lalu soal apa yang dijawab salah pada
// percobaan itu beserta jawaban yang dipilih dan jawaban yang benar. Dipakai di tab QC Kelola Pendataan (admin) dan tab QC supervisor SPDT NTP.
// Murni tampilan: datanya (RincianQc) disusun server di lib/sigapQcMonitor.ts.

import type { RincianQc } from "@/lib/sigapQcMonitor";

function jamWib(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta", hour12: false }).replace(".", ":");
}

export default function RincianQcPetugas({ akunId, rincian, className = "" }: { akunId: number; rincian: RincianQc | undefined; className?: string }) {
  const daftar = rincian?.percobaan[akunId];
  if (!rincian || !daftar || daftar.length === 0) return null;
  const adaSalah = daftar.some((x) => x.salah.length > 0);
  return (
    <details className={`rounded-lg bg-[#F5F8FE] px-3 py-2 ${className}`}>
      <summary className="cursor-pointer text-[12.5px] font-bold text-[#1F4FA8]">
        Rincian {daftar.length} percobaan{adaSalah ? " dan soal yang salah" : ""}
      </summary>
      <ol className="mt-2 space-y-2.5">
        {daftar.map((x) => (
          <li key={x.ke} className="rounded-lg border border-[#DDE6F3] bg-white px-3 py-2">
            <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-[#1B2B4B]">
              <b>Percobaan ke-{x.ke}</b>
              <span className="tabular-nums">
                nilai <b className={x.salah.length === 0 ? "text-[#13794B]" : "text-[#8A4B08]"}>{x.skor}</b> ({x.benar}/{x.jumlah} benar)
              </span>
              {x.selesai_at && <span className="text-[#6B7A90]">{jamWib(x.selesai_at)} WIB</span>}
              {x.terlambat && <span className="rounded-full bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-bold text-[#6F5000]">Terlambat</span>}
            </p>
            {x.salah.length === 0 ? (
              <p className="mt-1 text-[12px] font-semibold text-[#13794B]">Semua soal benar.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {x.salah.map((s) => {
                  const soal = rincian.soal[s.soal_id];
                  const teksDipilih = s.dipilih && soal ? soal.opsi[s.dipilih] : undefined;
                  const teksKunci = soal ? soal.opsi[soal.kunci] : undefined;
                  return (
                    <li key={s.soal_id} className="rounded-md bg-[#FFF8F7] px-2.5 py-1.5 text-[12.5px] leading-snug text-[#1B2B4B]">
                      <span className="block font-semibold">{soal?.pertanyaan ?? s.soal_id}</span>
                      <span className="mt-0.5 block text-[#9B1C23]">
                        Dipilih: {s.dipilih ? <b>{s.dipilih}</b> : "tidak terjawab"}
                        {teksDipilih ? ` · ${teksDipilih}` : ""}
                      </span>
                      {soal && (
                        <span className="block text-[#13794B]">
                          Benar: <b>{soal.kunci}</b>
                          {teksKunci ? ` · ${teksKunci}` : ""}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
