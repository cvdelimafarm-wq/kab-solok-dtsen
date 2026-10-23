"use client";

// app/sigap/korwil/page.tsx
//
// (19 Okt 2026) Monitoring Korwil di HP (permintaan user, mockup disetujui): halaman kerja tahap Pendataan bagi kortim (korwil) kelompok.
// Dua tampilan: Lapangan (progres tim PML: target, realisasi, wilayah, petugas) dan Administrasi (PPL/PML x tanggal).
// HANYA-BACA. Akun dengan izin bencana.admin (lihat) boleh memilih kelompok lain. Data: /api/portal/korwil/monitoring (lib/portal/korwilMonitor.ts).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/app/portal/dataBersama";
import TombolKembali from "@/app/components/TombolKembali";
import { alamatMasukKembali } from "@/app/portal/sesi";
import { angkaId, judulKata } from "@/app/sigap/kegiatan/format";
import { persenKorwil, type DataKorwil } from "@/lib/korwilMonitor";
import KorwilLapangan from "./KorwilLapangan";
import KorwilAdministrasi from "./KorwilAdministrasi";

type Tab = "lapangan" | "administrasi";

function jamWib(iso: string): string {
  const w = new Date(Date.parse(iso) + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(w.getUTCHours())}.${p(w.getUTCMinutes())}`;
}

export default function MonitoringKorwil() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("lapangan");
  const [pilih, setPilih] = useState<number | null>(null);

  const d = useData<DataKorwil>(`/api/portal/korwil/monitoring${pilih ? `?kelompok=${pilih}` : ""}`);
  useEffect(() => {
    if (d.galat === "SESI_BERAKHIR") router.replace(alamatMasukKembali());
  }, [d.galat, router]);
  const data = d.data;
  const galat = !data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null;
  const L = data?.lapangan.total;
  const persen = L ? persenKorwil(L.realisasi, L.target) : 0;

  return (
    <main className="min-h-screen bg-[#F2F6FC] pb-16 text-[#1B2B4B]">
      <header className="sticky top-0 z-20 bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-3 pb-0 pt-2 text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <TombolKembali tema="gelap" className="max-w-[40%] flex-none" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[16.5px] font-extrabold leading-[1.15]">Monitoring Korwil</h1>
              <p className="truncate text-[11.5px] text-[#A9BCD8]">{data ? `Kelompok ${data.kelompok} · ${data.korwil.map((x) => judulKata(x.split(",")[0]).split(" ").slice(0, 2).join(" ")).join(" & ")}` : "Pendataan Pascabencana"}</p>
            </div>
            {L && (
              <div className="flex-none text-right">
                <div className="text-[15px] font-extrabold leading-[1.1]">{String(persen).replace(".", ",")}%</div>
                <div className="text-[10.5px] text-[#A9BCD8]">KK didata</div>
              </div>
            )}
          </div>

          {data && data.pilihan.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Pilih kelompok">
              {data.pilihan.map((p) => (
                <button
                  key={p.kelompok}
                  type="button"
                  aria-pressed={p.kelompok === data.kelompok}
                  onClick={() => setPilih(p.kelompok)}
                  className={`h-[30px] flex-none rounded-full px-3 text-[12px] font-extrabold ${p.kelompok === data.kelompok ? "bg-white text-[#0F2A52]" : "bg-white/[.14] text-white active:bg-white/25"}`}
                >
                  Kelompok {p.kelompok}
                </button>
              ))}
            </div>
          )}

          <div role="tablist" aria-label="Tampilan monitoring" className="grid grid-cols-2">
            {(
              [
                ["lapangan", "Lapangan"],
                ["administrasi", "Administrasi"],
              ] as [Tab, string][]
            ).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-[42px] border-b-[3px] text-[13.5px] font-extrabold ${tab === k ? "border-[#F4B400] text-white" : "border-transparent text-[#A9BCD8]"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-3 px-3 pt-3">
        {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!data && !galat && (
          <div className="rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 h-24 animate-pulse rounded bg-[#EEF2F7]" />
          </div>
        )}
        {data && L && (
          <>
            {tab === "lapangan" && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[14px] bg-white px-1 py-2.5 shadow-[0_2px_8px_rgba(15,42,82,.08)]">
                  <b className="block text-[19px] text-[#0F2A52]">{angkaId(L.target)}</b>
                  <small className="text-[11px] text-[#6B7A90]">Target KK</small>
                </div>
                <div className="rounded-[14px] bg-white px-1 py-2.5 shadow-[0_2px_8px_rgba(15,42,82,.08)]">
                  <b className="block text-[19px] text-[#0F2A52]">{angkaId(L.realisasi)}</b>
                  <small className="text-[11px] text-[#6B7A90]">Sudah didata</small>
                </div>
                <div className="rounded-[14px] bg-white px-1 py-2.5 shadow-[0_2px_8px_rgba(15,42,82,.08)]">
                  <b className="block text-[19px] text-[#1F5FD1]">{String(persen).replace(".", ",")}%</b>
                  <small className="text-[11px] text-[#6B7A90]">{L.sub} Sub SLS</small>
                </div>
              </div>
            )}
            {tab === "lapangan" ? <KorwilLapangan lap={data.lapangan} /> : <KorwilAdministrasi adm={data.administrasi} />}
            <p className="px-1 text-[11.5px] text-[#6B7A90]">
              Diperbarui {jamWib(data.sekarang)} WIB · {L.tim} tim PML · {L.ppl} PPL. Data disegarkan otomatis tiap menit.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
