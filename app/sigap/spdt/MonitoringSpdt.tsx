"use client";

// app/sigap/spdt/MonitoringSpdt.tsx
//
// (16 Okt 2026) Tab Monitoring (Supervisor & PML) -- mockup disetujui: ringkasan angka, penyaring, lalu per PML berisi PPL-nya:
// status login hari ini, jumlah koordinat yang dibuka hari ini. Status translok per hari (Hari 1, 2, ...) dan kelengkapan menyusul di Fase 2.
// Warna selalu disertai teks (bukan warna saja). Disegarkan otomatis tiap 2 menit selagi layar terlihat.

import { useMemo, useState } from "react";
import Ik from "./Ik";
import { useMonitoringSpdt } from "./useSpdt";
import { jamWib, judulKata, type OrangMon } from "@/lib/spdtNtp";

type Saring = "semua" | "belum_login" | "belum_buka";

function Login({ o }: { o: OrangMon }) {
  return o.login ? (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#13794B]">
      <span aria-hidden className="h-2 w-2 rounded-full bg-[#13794B]" />
      login {jamWib(o.login)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#B42329]">
      <span aria-hidden className="h-2 w-2 rounded-full bg-[#B42329]" />
      belum login
    </span>
  );
}

function BilahBuka({ o }: { o: OrangMon }) {
  const p = o.kk > 0 ? Math.min(1, o.dibuka / o.kk) : 0;
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[12px] text-[#55657D]">
        <span>Koordinat dibuka hari ini</span>
        <b className={`tabular-nums ${o.dibuka === 0 ? "text-[#B42329]" : "text-[#0F2A52]"}`}>
          {o.dibuka}
          <span className="font-semibold text-[#6B7A90]"> dari {o.kk} KK</span>
        </b>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E8F0]" role="img" aria-label={`${o.dibuka} dari ${o.kk} KK dibuka`}>
        <div className="h-full rounded-full bg-[#1F5FD1]" style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
    </div>
  );
}

export default function MonitoringSpdt({ aktif }: { aktif: boolean }) {
  const { data, galat, memuat, muat } = useMonitoringSpdt(aktif);
  const [saring, setSaring] = useState<Saring>("semua");
  const [memuatUlang, setMemuatUlang] = useState(false);

  const grup = useMemo(() => {
    if (!data) return [];
    const lolos = (o: OrangMon) => (saring === "belum_login" ? !o.login : saring === "belum_buka" ? o.dibuka === 0 : true);
    return data.grup
      .map((g) => ({ ...g, ppl: g.ppl.filter(lolos) }))
      .filter((g) => g.ppl.length > 0 || (saring === "semua"));
  }, [data, saring]);

  async function segar() {
    setMemuatUlang(true);
    try {
      await muat();
    } finally {
      setMemuatUlang(false);
    }
  }

  if (galat) return <p className="m-2.5 rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>;
  if (!data || memuat)
    return (
      <div className="m-2.5 rounded-[18px] bg-white p-4" aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-16 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    );

  const r = data.ringkas;
  const KPI = [
    { n: `${r.login}/${r.ppl}`, t: "PPL login hari ini", k: "" },
    { n: String(r.kk_dibuka), t: "koordinat dibuka", k: "" },
    { n: String(r.belum_login), t: "PPL belum login", k: r.belum_login > 0 ? "warn" : "" },
  ];
  const CHIP: [Saring, string][] = [
    ["semua", "Semua"],
    ["belum_login", `Belum login ${r.belum_login}`],
    ["belum_buka", `Belum buka koordinat ${r.belum_buka}`],
  ];

  return (
    <section className="flex flex-col gap-2.5 px-2.5 pb-24 pt-2.5">
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
        <button type="button" onClick={segar} aria-label="Muat ulang monitoring" className="grid h-11 w-11 flex-none place-items-center rounded-full border border-[#C9D6EC] bg-white text-[#1F5FD1] active:bg-[#F1F5FC]">
          <Ik n="segar" className={`h-[18px] w-[18px] ${memuatUlang ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="-mt-1 px-1 text-[11.5px] text-[#6B7A90]">Diperbarui {jamWib(data.sekarang)} WIB · login dihitung dari aktivitas di SIGAP hari ini</p>

      {grup.length === 0 && <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] text-[#55657D]">Tidak ada petugas yang cocok dengan penyaring ini.</p>}

      {grup.map((g) => (
        <div key={g.pml.akun_id}>
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="min-w-0 truncate text-[14px]">
              <b className="text-[#0F2A52]">PML {judulKata(g.pml.nama)}</b>
            </span>
            <Login o={g.pml} />
          </div>
          <ul className="space-y-1.5">
            {g.ppl.map((p) => (
              <li key={`${g.pml.akun_id}-${p.akun_id}`} className="rounded-[14px] border border-[#D9E2F1] bg-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <b className="min-w-0 truncate text-[14px] text-[#0F2A52]">{judulKata(p.nama)}</b>
                  <Login o={p} />
                </div>
                <BilahBuka o={p} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="rounded-[14px] border border-dashed border-[#C9D6EC] bg-white/60 px-3 py-2.5 text-[12px] leading-snug text-[#55657D]">
        Status translok per hari (Hari 1, Hari 2, …) dan kelengkapan laporan akan tampil di bawah tiap petugas setelah fitur Translok baru diaktifkan.
      </p>
    </section>
  );
}
