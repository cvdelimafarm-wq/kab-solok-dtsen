"use client";

// app/penyisiran/page.tsx
//
// Halaman TERPISAH utk fitur penyisiran undercoverage usaha SE2026 --
// awalnya "Penyisiran Usaha" adalah tab di /seruti, dipindah ke sini (atas
// permintaan) supaya tidak mengganggu tab-tab utama Seruti Triwulan III
// (beda konteks: ini SE2026, bukan Susenas/Seruti).
//
// Ada 5 tab di sini (lihat lib/penyisiranAuth.ts utk skema sesi/PIN):
//  - "Penyisiran Usaha": checklist petugas lapangan (PIN internal BPS,
//    env PENYISIRAN_PIN, role "penyisiran") -- nama+alamat+GPS+bukti
//    DUTP/DTSEN/PNM. Kolom Info PPL/Jorong/Tetangga di sini cuma bisa
//    diubah lewat tombol Edit/Edit Semua. Kolom "Identifikasi PPL"
//    (badge) DIBEKUKAN read-only di sini -- satu-satunya cara mengubahnya
//    adalah lewat salah satu dari TIGA tab Identifikasi di bawah (lihat
//    app/api/penyisiran/identifikasi/route.ts, role "penyisiran" SENGAJA
//    tidak lagi diizinkan menulis ke kolom itu).
//  - "Identifikasi PPL": dibagikan ke PPL/mantan pendata SE2026, login
//    PERSONAL (nama lengkap + tanggal lahir, dicocokkan ke tabel
//    ppl_akun, role "identifikasi_ppl") -- cuma nama+alamat+wilayah,
//    tanpa bukti/GPS, dan cuma bisa mengisi Ada/Tidak Ada/Ragu utk
//    wilayah yang dialokasikan ke PPL itu saja.
//  - "Identifikasi Jorong": SAMA BENTUK dgn Identifikasi PPL di atas,
//    tapi login pakai akun "petugas penyisiran" (tabel
//    petugas_penyisiran_akun, TERPISAH dari ppl_akun, role
//    "identifikasi_jorong") & filter kartu MANUAL per Kecamatan/Nagari/
//    Sub SLS (bukan auto-scope per petugas) -- krn tugasnya menyisir per
//    Jorong, bukan per wilayah alokasi pribadi.
//  - "Identifikasi Tetangga/Lainnya": SAMA PERSIS cara kerjanya dgn
//    Identifikasi Jorong (login personal, filter manual), tapi akun
//    SENDIRI lagi (tabel tetangga_akun, role "identifikasi_tetangga") --
//    sumber informasinya tetangga/pihak lain, bukan petugas penyisiran.
//
//    KETIGA tab Identifikasi di atas menulis ke kolom yang SAMA
//    (penyisiran_usaha.identifikasi_ppl + identifikasi_ppl_oleh utk
//    menandai siapa yang mengisi), jadi otomatis ter-update/sync juga di
//    tab Penyisiran Usaha tanpa sinkronisasi tambahan apa pun.
//  - "Monitoring Identifikasi PPL": rekap progres pengisian tab
//    Identifikasi PPL DI ATAS, per PPL -- pakai PIN & sesi yang SAMA
//    dengan tab Penyisiran Usaha (role "penyisiran", internal staf saja,
//    BUKAN utk dibagikan ke PPL).
//
// Komponen sesungguhnya utk tab Penyisiran Usaha (PIN gate, daftar, peta)
// TETAP di app/seruti/penyisiran-usaha.tsx + penyisiran-map.tsx -- file
// itu sendiri sudah lepas dari tab bar Seruti, cuma nama foldernya belum
// dipindah (aman direname/dipindah manual nanti kalau mau lebih rapi,
// tidak wajib).

import { useState } from "react";
import PenyisiranUsahaTab from "../seruti/penyisiran-usaha";
import IdentifikasiPplTab from "./identifikasi-ppl";
import IdentifikasiJorongTab from "./identifikasi-jorong";
import IdentifikasiTetanggaTab from "./identifikasi-tetangga";
import MonitoringPplTab from "./monitoring-ppl";

type TabKey = "usaha" | "identifikasi" | "jorong" | "tetangga" | "monitoring";

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
        <TabButton active={tab === "jorong"} onClick={() => setTab("jorong")}>
          Identifikasi Jorong
        </TabButton>
        <TabButton active={tab === "tetangga"} onClick={() => setTab("tetangga")}>
          Identifikasi Tetangga/Lainnya
        </TabButton>
        <TabButton active={tab === "usaha"} onClick={() => setTab("usaha")}>
          Penyisiran Usaha
        </TabButton>
        <TabButton active={tab === "monitoring"} onClick={() => setTab("monitoring")}>
          Monitoring Identifikasi PPL
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "usaha" && <PenyisiranUsahaTab />}
        {tab === "identifikasi" && <IdentifikasiPplTab />}
        {tab === "jorong" && <IdentifikasiJorongTab />}
        {tab === "tetangga" && <IdentifikasiTetanggaTab />}
        {tab === "monitoring" && <MonitoringPplTab />}
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
