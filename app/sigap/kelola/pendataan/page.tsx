"use client";

// app/sigap/kelola/pendataan/page.tsx
//
// (23 Okt 2026) Kelola Pendataan dibingkai Shell SIGAP (sidebar + topbar + tab) seperti Kelola Pelatihan -- permintaan user: halaman tanpa sidebar,
// tombol "Beranda" salah arah, dan kelengkapan pendataan belum terpadu. Tab disusun RUNUT mengikuti alur kerja (lib/sigapPendataanTab.ts):
//   Ringkasan · 1 Persiapan · 2 Tim & Surat Tugas · 3 Siaran & Notifikasi · 4 Monitoring · 5 Pemeriksaan · 6 Administrasi & SPJ.
// Isi lama dipindah APA ADANYA: Unggah daftar KK + Permintaan FASIH -> UnggahKk.tsx (tab 1), Siaran + KirimSatu (tab 3), Monitoring (tab 4).
// Pilihan tab ikut di alamat (?tab=...); alamat lama ?tab=monitoring tetap berlaku, ?tab=unggah -> Persiapan.
// Tab 5 (Pemeriksaan) MENYEMATKAN Identifikasi SLS, Lapangan, Foto (tahap 2); tab 2 (Tim.tsx) dan tab 6 (Administrasi.tsx) menyematkan komponen Admin Transport
// Lokal untuk kegiatan Pendataan (tahap 3) dan memberi pintu masuk (PintuMasuk.tsx) ke halaman yang masih terpisah (/bencana, pelatihan, perencanaan, pengadaan).
// Judul sidebar: item "Pendataan" di lib/sigapMenuV2.ts kini bertanda aktif (aktifKode "pendataan_kelola"); "Beranda" di sidebar = Beranda admin SIGAP.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, keMasuk } from "../../admin/api";
import Bingkai from "../../kontrak/Bingkai";
import { TAB_PENDATAAN, bacaTabPendataan, labelTabPendataan, urlTabPendataan, type KodeTabPendataan } from "@/lib/sigapPendataanTab";
import KirimSatu from "./KirimSatu";
import Monitoring from "./Monitoring";
import Administrasi from "./Administrasi";
import Pemeriksaan from "./Pemeriksaan";
import Ringkasan from "./Ringkasan";
import Siaran from "./Siaran";
import Tim from "./Tim";
import UnggahKk from "./UnggahKk";

export default function KelolaPendataan() {
  const [tab, setTab] = useState<KodeTabPendataan>("ringkasan");

  useEffect(() => {
    if (!bacaSesi()) {
      keMasuk();
      return;
    }
    const sinkron = () => setTab(bacaTabPendataan(new URLSearchParams(window.location.search).get("tab")));
    sinkron();
    window.addEventListener("popstate", sinkron);
    return () => window.removeEventListener("popstate", sinkron);
  }, []);

  const pilihTab = useCallback((t: KodeTabPendataan) => {
    setTab(t);
    window.history.replaceState(null, "", urlTabPendataan(window.location.pathname, window.location.search, t));
  }, []);

  return (
    <Bingkai<KodeTabPendataan>
      aktif="pendataan_kelola"
      kecil="SIGAP · Kelola Pendataan"
      jejak={["Pelaksanaan", "Pendataan", labelTabPendataan(tab)]}
      judul="Kelola Pendataan"
      sub="Pendataan Status Pemulihan (PSP) Pascabencana · dari daftar KK sampai pertanggungjawaban"
      tab={TAB_PENDATAAN.map(({ kode, label }) => ({ kode, label }))}
      aktifTab={tab}
      onTab={pilihTab}
    >
      {tab === "ringkasan" && <Ringkasan onBuka={pilihTab} />}
      {tab === "persiapan" && <UnggahKk />}
      {tab === "tim" && <Tim />}
      {tab === "siaran" && (
        <>
          <Siaran />
          <KirimSatu />
        </>
      )}
      {tab === "monitoring" && <Monitoring />}
      {tab === "pemeriksaan" && <Pemeriksaan />}
      {tab === "administrasi" && <Administrasi />}
    </Bingkai>
  );
}
