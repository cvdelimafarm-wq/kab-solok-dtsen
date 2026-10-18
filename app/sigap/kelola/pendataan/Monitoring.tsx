"use client";

// app/sigap/kelola/pendataan/Monitoring.tsx
//
// (18-19 Okt 2026) Tab "Monitoring" di Kelola Pendataan -- permintaan user (mockup: mockup-tab-monitoring-pendataan.html). Hanya-baca.
// Dropdown Variabel: Progres petugas (MonProgres) | Transport lokal (MonTransport) | Poin kinerja per hari (MonPoin) | Perkiraan kebutuhan anggaran (MonAnggaran).
// Tiga variabel terakhir memakai satu muatan data (useKinerja) yang baru dimuat saat dipilih. Pilihan variabel ikut di alamat (?tab=monitoring&v=...).

import { useEffect, useState } from "react";
import MonProgres from "./MonProgres";
import MonTransport from "./MonTransport";
import MonPoin from "./MonPoin";
import MonAnggaran from "./MonAnggaran";
import { useKinerja } from "./useKinerja";
import { Galat, jam, label, sel, tombol } from "./monUi";

type Variabel = "progres" | "transport" | "poin" | "anggaran";
const PILIHAN: [Variabel, string][] = [
  ["progres", "Progres petugas (KK terdampak / tidak)"],
  ["transport", "Transport lokal (lengkap / sebagian / kosong)"],
  ["poin", "Poin kinerja per hari"],
  ["anggaran", "Perkiraan kebutuhan anggaran"],
];

export default function Monitoring() {
  const [variabel, setVariabel] = useState<Variabel>("progres");
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("v");
    if (v === "transport" || v === "poin" || v === "anggaran") setVariabel(v);
  }, []);
  function pilih(v: Variabel) {
    setVariabel(v);
    const u = new URL(window.location.href);
    if (v === "progres") u.searchParams.delete("v");
    else u.searchParams.set("v", v);
    window.history.replaceState(null, "", u.toString());
  }

  const kinerja = variabel !== "progres";
  const { data, galat, memuat, muat } = useKinerja(kinerja);

  return (
    <section className="mt-5">
      <div className="rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-full sm:w-auto`}>
            Variabel
            <select value={variabel} onChange={(e) => pilih(e.target.value as Variabel)} className={`${sel} border-2 border-[#1F5FD1] font-extrabold normal-case tracking-normal text-[#0F2A52] sm:min-w-[300px]`}>
              {PILIHAN.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {kinerja && (
            <button type="button" onClick={() => void muat(true)} disabled={memuat} className={`${tombol} w-full sm:w-auto`}>
              {memuat ? "Memuat…" : "Segarkan"}
            </button>
          )}
        </div>
        <p className="mt-2 text-[12px] text-[#55657D]">
          Hanya-baca. Angka dari sumber yang sama dengan Lembar Pendataan dan Monitoring Lapangan. Segar otomatis tiap 1 menit
          {kinerja && data ? ` · data pukul ${jam(data.sekarang)} WIB` : ""}.
        </p>
      </div>

      {variabel === "progres" && <MonProgres />}
      {kinerja && galat && <Galat pesan={galat} />}
      {kinerja && !data && !galat && <p className="mt-4 text-[13px] text-[#55657D]">Memuat data{variabel === "transport" ? " transport lokal" : variabel === "poin" ? " poin harian (jarak jalan dihitung, bisa memakan beberapa detik)" : " anggaran"}…</p>}
      {kinerja && data && variabel === "transport" && <MonTransport data={data} />}
      {kinerja && data && variabel === "poin" && <MonPoin data={data} />}
      {kinerja && data && variabel === "anggaran" && <MonAnggaran data={data} />}
    </section>
  );
}
