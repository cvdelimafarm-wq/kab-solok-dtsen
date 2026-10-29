"use client";

// app/sigap/spdt/QcSpdt.tsx
//
// (29 Okt 2026) Tab "QC" untuk Supervisor SPDT NTP (BACA SAJA): hasil QC Pemahaman per hari -- ringkasan angka, lalu tiap PML berisi PPL-nya
// (status, skor) dan soal yang paling sering salah pada percobaan pertama. PPL yang KK-nya di dua PML tampil di kedua PML.
// Data: /api/portal/spdt-qc. Mengubah soal/pengaturan tetap di Kelola Pendataan. Warna selalu disertai teks.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { labelStatusPpl, type QcRekapTim } from "@/lib/sigapQc";
import { API_SPDT_QC, jamWib, judulKata, type HasilQcSpdt } from "@/lib/spdtNtp";
import Ik from "./Ik";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
function tglPendek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const h = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[h]}, ${d} ${BULAN[m - 1]}`;
}

type Saring = "semua" | "belum" | "belum_lulus";

export default function QcSpdt({ aktif }: { aktif: boolean }) {
  const [d, setD] = useState<HasilQcSpdt | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tanggal, setTanggal] = useState<string | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");
  const [muatUlang, setMuatUlang] = useState(false);

  const muat = useCallback(async (tgl: string | null) => {
    setMuatUlang(true);
    try {
      const h = await apiPortal<HasilQcSpdt>(tgl ? `${API_SPDT_QC}?tanggal=${tgl}` : API_SPDT_QC);
      setD(h);
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat hasil QC.");
    } finally {
      setMuatUlang(false);
    }
  }, []);
  useEffect(() => {
    if (aktif) void muat(tanggal);
  }, [aktif, tanggal, muat]);

  const tim = useMemo(() => {
    if (!d) return [];
    const lolos = (x: QcRekapTim["ppl"][number]) => (saring === "belum" ? x.percobaan === 0 : saring === "belum_lulus" ? !x.lulus : true);
    return d.rekap.map((t) => ({ ...t, ppl: t.ppl.filter(lolos) })).filter((t) => saring === "semua" || t.ppl.length > 0);
  }, [d, saring]);

  if (galat && !d) return <p className="m-2.5 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>;
  if (!d)
    return (
      <div className="m-2.5 rounded-[18px] bg-white p-4" aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-16 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    );

  // PPL unik (satu PPL di dua PML dihitung sekali)
  const pplUnik = new Map<number, QcRekapTim["ppl"][number]>();
  for (const t of d.rekap) for (const x of t.ppl) if (!pplUnik.has(x.akun_id)) pplUnik.set(x.akun_id, x);
  const semua = [...pplUnik.values()];
  const sudah = semua.filter((x) => x.percobaan > 0).length;
  const lulus = semua.filter((x) => x.lulus).length;
  const belum = semua.length - sudah;
  const KPI = [
    { n: `${sudah}/${semua.length}`, t: "PPL sudah mengisi", k: "" },
    { n: String(lulus), t: d.nilai_lulus >= 100 ? "PPL lulus (nilai 100)" : `PPL lulus (≥ ${d.nilai_lulus})`, k: "" },
    { n: String(belum), t: "PPL belum mengisi", k: belum > 0 ? "warn" : "" },
  ];
  const CHIP: [Saring, string][] = [
    ["semua", "Semua"],
    ["belum", `Belum mengisi ${belum}`],
    ["belum_lulus", `Belum lulus ${semua.length - lulus}`],
  ];

  return (
    <section className="flex flex-col gap-2.5 px-2.5 pb-24 pt-2.5">
      {d.hari_ada.length === 0 ? (
        <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] leading-snug text-[#55657D]">
          {d.aktif ? "Belum ada soal QC yang dirilis." : "QC Pemahaman SPDT NTP belum diaktifkan."}
        </p>
      ) : (
        <>
          <div className="-mx-2.5 flex gap-2 overflow-x-auto px-2.5 pb-0.5" role="tablist" aria-label="Pilih hari QC">
            {d.hari_ada.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={d.hari === t}
                onClick={() => setTanggal(t)}
                className={`h-11 flex-none whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${d.hari === t ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C9D6EC] bg-white text-[#0F2A52]"}`}
              >
                {tglPendek(t)}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {KPI.map((x) => (
              <div key={x.t} className={`flex-1 rounded-[14px] border px-3 py-2 ${x.k === "warn" ? "border-[#E3A33B] bg-[#FFF9ED]" : "border-[#D9E2F1] bg-white"}`}>
                <b className={`block text-[21px] font-extrabold leading-tight tabular-nums ${x.k === "warn" ? "text-[#8A4B08]" : "text-[#0F2A52]"}`}>{x.n}</b>
                <span className="text-[11.5px] font-semibold text-[#55657D]">{x.t}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="-mr-2.5 flex flex-1 gap-2 overflow-x-auto pb-0.5">
              {CHIP.map(([k, t]) => (
                <button key={k} type="button" onClick={() => setSaring(k)} aria-pressed={saring === k} className={`h-11 flex-none whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${saring === k ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C9D6EC] bg-white text-[#0F2A52]"}`}>
                  {t}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void muat(tanggal)} aria-label="Muat ulang hasil QC" className="grid h-11 w-11 flex-none place-items-center rounded-full border border-[#C9D6EC] bg-white text-[#1F5FD1] active:bg-[#F1F5FC]">
              <Ik n="segar" className={`h-[18px] w-[18px] ${muatUlang ? "animate-spin" : ""}`} />
            </button>
          </div>
          <p className="-mt-1 px-1 text-[11.5px] text-[#6B7A90]">
            {d.hari ? `${tglPendek(d.hari)} · ${d.jumlah_soal} soal` : "Belum ada hari QC"} · diperbarui {jamWib(d.sekarang)} WIB
            {d.peserta.ppl_tanpa_pml > 0 && ` · ${d.peserta.ppl_tanpa_pml} PPL belum punya PML`}
          </p>
          {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}

          {tim.length === 0 && <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] text-[#55657D]">{d.rekap.length === 0 ? "Belum ada soal yang dirilis pada hari ini." : "Tidak ada petugas yang cocok dengan penyaring ini."}</p>}

          {tim.map((t) => (
            <div key={t.pml_akun_id}>
              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <b className="min-w-0 truncate text-[14px] text-[#0F2A52]">{t.pml_akun_id === 0 ? "PPL tanpa PML" : `PML ${judulKata(t.pml_nama)}`}</b>
                <span className="flex-none text-[12px] font-semibold text-[#55657D]">
                  {t.sudah}/{t.jumlah_ppl} mengisi · rata-rata awal {t.rata_awal ?? "-"}
                </span>
              </div>
              <ul className="space-y-1.5">
                {t.ppl.map((x) => (
                  <li key={`${t.pml_akun_id}-${x.akun_id}`} className="flex items-center justify-between gap-2 rounded-[14px] border border-[#D9E2F1] bg-white px-3 py-2.5">
                    <b className="min-w-0 truncate text-[14px] text-[#0F2A52]">{judulKata(x.nama)}</b>
                    <span className={`flex-none text-right text-[12px] font-semibold ${x.percobaan === 0 ? "text-[#B42329]" : x.lulus ? "text-[#13794B]" : "text-[#8A4B08]"}`}>
                      {x.terlambat ? "Terlambat · " : ""}
                      {labelStatusPpl(x, d.maks_percobaan, d.nilai_lulus)}
                    </span>
                  </li>
                ))}
              </ul>
              {t.salah.length > 0 && (
                <details className="mt-1.5 rounded-[14px] bg-[#FFF8F7] px-3 py-2">
                  <summary className="cursor-pointer text-[12.5px] font-bold text-[#B42329]">Soal yang dijawab salah pada percobaan pertama ({t.salah.length})</summary>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] text-[#1B2B4B]">
                    {[...t.salah]
                      .sort((a, b) => b.jumlah - a.jumlah)
                      .map((s) => (
                        <li key={s.soal_id}>
                          {s.pertanyaan} <b>({s.jumlah})</b>
                          <span className="block text-[11.5px] text-[#55657D]">{s.nama.map(judulKata).join(", ")}</span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
          <p className="rounded-[14px] border border-dashed border-[#C9D6EC] bg-white/60 px-3 py-2.5 text-[12px] leading-snug text-[#55657D]">
            Tampilan ini hanya untuk melihat hasil. Soal dan jadwal QC diatur di Kelola Pendataan (QC Pemahaman).
          </p>
        </>
      )}
    </section>
  );
}
