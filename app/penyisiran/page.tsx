"use client";

// app/penyisiran/page.tsx
//
// Halaman TERPISAH utk fitur penyisiran undercoverage usaha SE2026 --
// awalnya "Penyisiran Usaha" adalah tab di /seruti, dipindah ke sini (atas
// permintaan) supaya tidak mengganggu tab-tab utama Seruti Triwulan III
// (beda konteks: ini SE2026, bukan Susenas/Seruti).
//
// Ada 2 tab di sini, MASING-MASING dengan PIN sendiri (lihat
// lib/penyisiranAuth.ts):
//  - "Penyisiran Usaha": checklist petugas lapangan (PIN internal BPS,
//    env PENYISIRAN_PIN) -- nama+alamat+GPS+bukti DUTP/DTSEN/PNM. Kolom
//    Info PPL/Jorong/Tetangga di sini cuma bisa diubah lewat tombol
//    Edit/Edit Semua.
//  - "Identifikasi PPL": link+PIN INI yang dibagikan ke PPL/mantan
//    pendata SE2026 (env PENYISIRAN_IDENTIFIKASI_PIN) -- cuma nama+
//    alamat+wilayah, tanpa bukti/GPS, dan cuma bisa mengisi
//    Ada/Tidak Ada/Ragu. Hasilnya otomatis muncul sbg badge read-only di
//    tab Penyisiran Usaha.
//
// Komponen sesungguhnya utk tab Penyisiran Usaha (PIN gate, daftar, peta)
// TETAP di app/seruti/penyisiran-usaha.tsx + penyisiran-map.tsx -- file
// itu sendiri sudah lepas dari tab bar Seruti, cuma nama foldernya belum
// dipindah (aman direname/dipindah manual nanti kalau mau lebih rapi,
// tidak wajib).

import { useState } from "react";
import PenyisiranUsahaTab from "../seruti/penyisiran-usaha";
import IdentifikasiPplTab from "./identifikasi-ppl";

type TabKey = "usaha" | "identifikasi";

export default function PenyisiranPage() {
  // Default dibuka ke tab "Identifikasi PPL" -- link ini yang paling sering
  // dibagikan ke PPL/mantan pendata, jadi begitu link dibuka langsung
  // menuju halaman itu. Tab "Penyisiran Usaha" (internal BPS) ditaruh di
  // urutan terakhir.
  const [tab, setTab] = useState<TabKey>("identifikasi");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-6">
      <p className="font-sans text-[13px] font-black italic tracking-tight text-navy-900">
        BADAN PUSAT STATISTIK KABUPATEN SOLOK
      </p>
      <p className="mt-0.5 text-xs font-medium text-navy-400">
        Sensus Ekonomi 2026 &middot; Penyisiran Undercoverage Usaha
      </p>

      <div className="mt-4 flex gap-2 border-b border-line">
        <TabButton active={tab === "identifikasi"} onClick={() => setTab("identifikasi")}>
          Identifikasi PPL
        </TabButton>
        <TabButton active={tab === "usaha"} onClick={() => setTab("usaha")}>
          Penyisiran Usaha
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "usaha" && <PenyisiranUsahaTab />}
        {tab === "identifikasi" && <IdentifikasiPplTab />}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
        active ? "border-navy-700 text-navy-900" : "border-transparent text-ink/50 hover:text-navy-700"
      }`}
    >
      {children}
    </button>
  );
}
