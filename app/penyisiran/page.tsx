"use client";

// app/penyisiran/page.tsx
//
// Halaman TERPISAH utk fitur penyisiran undercoverage usaha SE2026 --
// awalnya "Penyisiran Usaha" adalah tab di /seruti, dipindah ke sini (atas
// permintaan) supaya tidak mengganggu tab-tab utama Seruti Triwulan III
// (beda konteks: ini SE2026, bukan Susenas/Seruti).
//
// Ada 5 tab di sini (lihat lib/penyisiranAuth.ts utk skema sesi/PIN):
//  - "Penyisiran Usaha": checklist petugas lapangan -- login PERSONAL
//    (nama lengkap + tanggal lahir, dicocokkan ke tabel
//    petugas_penyisiran_akun -- TABEL SAMA dgn "Identifikasi Jorong" di
//    bawah, cuma role token beda: "penyisiran_petugas") --
//    MENGGANTIKAN PIN bersama yg dulu dipakai tab ini. Krn loginnya
//    personal, sistem otomatis tahu siapa yg mengisi (dipakai dasar
//    hitungan tab "Monitoring Petugas Penyisiran" & skor prioritas
//    berbasis jarak, lihat app/seruti/penyisiran-usaha.tsx) --
//    nama+alamat+GPS+bukti DUTP/DTSEN/PNM. Badge Info PPL/Jorong/Tetangga
//    + tombol Edit per-kartu sudah DIHAPUS dari kartu (field & skor
//    prioritas yg memakainya ttp ada di backend, cuma tdk bisa diubah lg
//    lewat tab ini) -- tombol "Edit Semua" (global) msh ada, skrg cuma
//    dipakai utk unlock "Tandai Pasti". Kolom
//    "Identifikasi PPL" (badge) DIBEKUKAN read-only di sini --
//    satu-satunya cara mengubahnya adalah lewat salah satu dari TIGA tab
//    Identifikasi di bawah (lihat app/api/penyisiran/identifikasi/route.ts,
//    role "penyisiran"/"penyisiran_petugas" SENGAJA tidak lagi diizinkan
//    menulis ke kolom itu). PIN admin lama ("penyisiran", env
//    PENYISIRAN_PIN) TETAP ADA tapi sekarang cuma dipakai DUA tab
//    Monitoring di bawah, bukan lagi tab ini.
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
//  - "Monitoring Petugas Penyisiran": rekap per petugas penyisiran (Nama |
//    Diidentifikasi Jorong | Diidentifikasi Tetangga/Lainnya | Didata |
//    Dikunjungi) -- pakai PIN/sesi yang sama jg. Ada fitur "Kelola Petugas
//    Penyisiran" (aktifkan/nonaktifkan akun) yang DEFAULT DISEMBUNYIKAN &
//    minta PIN lagi sebelum tombolnya aktif -- lihat
//    app/penyisiran/monitoring-petugas.tsx.
//  - "Alokasi Sampel": form rekomendasi wilayah tugas -- login PERSONAL
//    menumpang akun & role "penyisiran_petugas" YANG SAMA dgn tab
//    "Penyisiran Usaha" (token localStorage sama, jadi otomatis sudah
//    login kalau sudah login di tab itu). Isinya checklist maks 5 SLS/
//    Jorong, diurutkan skor prioritas akhir PERSONAL (beda tiap petugas,
//    krn faktor jarak dari lokasi rumah masing-masing) tertinggi ke
//    terendah -- rumus skor (Skor Sumber DUTP/DTSEN/PNM + Skor
//    Identifikasi Ada-PPL/Jorong/Keduanya + Bonus Volume potensi KK -
//    Penalti Jarak ke centroid SLS) SUDAH dikonfirmasi user, lihat migrasi
//    supabase/migrations/20260918_alokasi_sampel.sql. Sesudah submit,
//    matriks gabungan petugas x Jorong x Nagari x Kecamatan dimunculkan
//    (HANYA Jorong yg sudah dipilih min. 1 petugas -- lihat
//    app/penyisiran/alokasi-sampel.tsx).
//
// Tab "Penyisiran Usaha" jg punya tombol "📍 Tetapkan Lokasi Rumah Saya"
// (Geolocation API, disimpan ke petugas_penyisiran_akun.lat/lng lewat
// akun personal yg sedang login) utk skor prioritas berbasis jarak, dan
// tombol "🎯 Tandai Pasti" per kartu utk override manual skor prioritas
// jadi maksimal.
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
import MonitoringPetugasTab from "./monitoring-petugas";
import ManajemenTargetTab from "./manajemen-target";
import MasterPetugasTab from "./master-petugas";
import AdministrasiSpjTab from "./administrasi-spj";
import PerencanaanLapanganTab from "./perencanaan-lapangan";

type TabKey =
  | "usaha"
  | "identifikasi"
  | "jorong"
  | "tetangga"
  | "monitoring"
  | "monitoring_petugas"
  | "target"
  | "master_petugas"
  | "spj"
  | "perencanaan";

export default function PenyisiranPage() {
  // Default dibuka ke tab "Identifikasi PPL" -- link ini yang paling sering
  // dibagikan ke PPL/mantan pendata, jadi begitu link dibuka langsung
  // menuju halaman itu. Tab "Penyisiran Usaha" (internal BPS) ditaruh di
  // urutan terakhir.
  const [tab, setTab] = useState<TabKey>("identifikasi");

  return (
    <main className="mx-auto min-h-screen max-w-6xl overflow-x-hidden px-5 py-6">
      <p className="font-sans text-[13px] font-black italic tracking-tight text-navy-900">
        BADAN PUSAT STATISTIK KABUPATEN SOLOK
      </p>
      <p className="mt-0.5 text-xs font-medium text-navy-400">
        Sensus Ekonomi 2026 &middot; Penyisiran Undercoverage Usaha
      </p>

      {/* overflow-x-auto + flex-nowrap (bukan flex-wrap) SENGAJA dipakai --
          dgn 6 tab & beberapa labelnya panjang ("Monitoring Petugas
          Penyisiran"), kalau dibiarkan flex biasa baris tab ini melebar
          menembus lebar layar & mendorong SELURUH halaman jadi lebih lebar
          dari layar HP (dilaporkan user: tampilan berantakan/tidak
          otomatis ikut lebar layar di HP). Dengan overflow-x-auto,
          kelebihan lebarnya digulir SENDIRI di baris tab ini saja (bisa
          digeser ke samping), tidak lagi memaksa seluruh halaman ikut
          melebar. shrink-0+whitespace-nowrap di TabButton mencegah label
          tab terpotong/mengecil. */}
      <div className="mt-4 flex gap-2 overflow-x-auto border-b border-line">
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
        <TabButton active={tab === "monitoring_petugas"} onClick={() => setTab("monitoring_petugas")}>
          Monitoring Petugas Penyisiran
        </TabButton>
        {/* "Manajemen Target" -- tab BARU, ditaruh paling akhir (sama spt
            "Penyisiran Usaha" & 2 tab Monitoring, area internal BPS bukan
            utk PPL/tetangga). Tombolnya tampil ke SEMUA orang (sama spt
            tab lain), tapi ISINYA dibatasi ke 4 nama tertentu -- lihat
            komentar akses di app/penyisiran/manajemen-target.tsx. */}
        <TabButton active={tab === "target"} onClick={() => setTab("target")}>
          Manajemen Target
        </TabButton>
        {/* "Master Petugas" -- tab BARU, perluasan data petugas yg sudah
            ada (email/alamat/status kepegawaian/pengawas) -- lihat
            komentar akses & isi lengkap di app/penyisiran/master-petugas.tsx.
            Akses dibatasi ke 4 nama yg sama dgn "Manajemen Target". */}
        <TabButton active={tab === "master_petugas"} onClick={() => setTab("master_petugas")}>
          Master Petugas
        </TabButton>
        {/* "Administrasi" -- tab BARU, SPJ Translok (Kwitansi/Surat Tugas/
            Visum/Laporan/Dokumentasi/Surat Keterangan). Login menumpang
            akun Identifikasi Jorong ATAU Tetangga (PPL tidak ikut), lihat
            komentar lengkap di administrasi-spj.tsx & lib/spjAuth.ts. */}
        <TabButton active={tab === "spj"} onClick={() => setTab("spj")}>
          Administrasi
        </TabButton>
        {/* "Perencanaan Lapangan" (dulu "Alokasi Sampel") -- tab BARU,
            2 bagian: (1) Identifikasi Hari Tugas (checklist hari dalam
            seminggu yg bisa turun bertugas) & (2) Identifikasi Wilayah
            Sampel SLS (checklist SLS/Jorong per petugas Penyisiran
            berdasarkan skor prioritas personal, jarak dari lokasi rumah
            petugas). Login menumpang akun & role "penyisiran_petugas" yg
            SAMA dgn tab "Penyisiran Usaha" (lihat komentar lengkap di
            perencanaan-lapangan.tsx). */}
        <TabButton active={tab === "perencanaan"} onClick={() => setTab("perencanaan")}>
          Perencanaan Lapangan
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "usaha" && <PenyisiranUsahaTab />}
        {tab === "identifikasi" && <IdentifikasiPplTab />}
        {tab === "jorong" && <IdentifikasiJorongTab />}
        {tab === "tetangga" && <IdentifikasiTetanggaTab />}
        {tab === "monitoring" && <MonitoringPplTab />}
        {tab === "monitoring_petugas" && <MonitoringPetugasTab />}
        {tab === "target" && <ManajemenTargetTab />}
        {tab === "master_petugas" && <MasterPetugasTab />}
        {tab === "spj" && <AdministrasiSpjTab />}
        {tab === "perencanaan" && <PerencanaanLapanganTab />}
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
      className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition ${
        active ? "border-navy-700 text-navy-900" : "border-transparent text-ink/50 hover:text-navy-700"
      }`}
    >
      {children}
    </button>
  );
}
