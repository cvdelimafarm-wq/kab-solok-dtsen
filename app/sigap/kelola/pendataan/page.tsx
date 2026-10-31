"use client";

// app/sigap/kelola/pendataan/page.tsx
//
// (31 Okt 2026) Tab 3 kini "Notifikasi" (Notifikasi.tsx): sub-tab Otomatis (pengingat Translok + alur FASIH, bawaan ketentuan umum), Manual (Siaran + KirimSatu dipindah apa adanya), Riwayat.
// (30 Okt 2026) PROFIL FITUR KEGIATAN: tab, sub-tab, dan isi Persiapan mengikuti strategi + centang fitur survei terpilih (lib/sigapFitur.ts, useFitur.ts, layar
// Fitur kegiatan di tab 1 · Persiapan). Menggantikan penanda "belum tersedia" per tab; fitur yang layarnya masih terikat data Pascabencana otomatis mati untuk survei lain.
// (29 Okt 2026, lanjutan) Tab 2 (Penugasan & ST), 3 (Siaran + kirim satu petugas) dan 7 (Administrasi: transport lokal) kini juga mengikuti survei terpilih.
// (29 Okt 2026) PEMILIH SURVEI di atas isi (PemilihSurvei.tsx, alamat ?k=): seluruh tab menyesuaikan survei terpilih. Tab 4 (QC) sudah penuh per survei; tab lain
// untuk survei selain Pendataan Pascabencana menampilkan keterangan "belum tersedia" (BelumUntukSurvei) dan akan disesuaikan bertahap.
// (27 Okt 2026) Tab 1 Persiapan ditambah "Pengaturan Lembar Pendataan" per kegiatan (PengaturanLembar.tsx): istilah/warna/bentuk/alasan tombol hasil + variabel radar.
// (23 Okt 2026) Kelola Pendataan dibingkai Shell SIGAP (sidebar + topbar + tab) seperti Kelola Pelatihan -- permintaan user: halaman tanpa sidebar,
// tombol "Beranda" salah arah, dan kelengkapan pendataan belum terpadu. Tab disusun RUNUT mengikuti alur kerja (lib/sigapPendataanTab.ts):
//   Ringkasan · 1 Persiapan · 2 Tim & Surat Tugas · 3 Siaran & Notifikasi · 4 QC Pemahaman (26 Okt) · 5 Monitoring · 6 Pemeriksaan · 7 Administrasi & SPJ · 8 Laporan (30 Okt: Laporan Sementara otomatis, Laporan.tsx).
// Isi lama dipindah APA ADANYA: Unggah daftar KK + Permintaan FASIH -> UnggahKk.tsx (tab 1), Siaran + KirimSatu (tab 3), Monitoring (tab 4).
// Pilihan tab ikut di alamat (?tab=...); alamat lama ?tab=monitoring tetap berlaku, ?tab=unggah -> Persiapan.
// Tab 5 (Pemeriksaan) MENYEMATKAN Identifikasi SLS, Lapangan, Foto (tahap 2); tab 2 (Tim.tsx) dan tab 6 (Administrasi.tsx) menyematkan komponen Admin Transport
// Lokal untuk kegiatan Pendataan (tahap 3) dan memberi pintu masuk (PintuMasuk.tsx) ke halaman yang masih terpisah (/bencana, pelatihan, perencanaan, pengadaan).
// Judul sidebar: item "Pendataan" di lib/sigapMenuV2.ts kini bertanda aktif (aktifKode "pendataan_kelola"); "Beranda" di sidebar = Beranda admin SIGAP.

import { useCallback, useEffect, useState } from "react";
import { ambilRingkas, bacaSesi, keMasuk, type KegiatanRingkas } from "../../admin/api";
import Bingkai from "../../kontrak/Bingkai";
import { KEGIATAN_PENDATAAN, TAB_PENDATAAN, bacaKegiatanPendataan, bacaTabPendataan, labelTabPendataan, urlKegiatanPendataan, urlTabPendataan, type KodeTabPendataan } from "@/lib/sigapPendataanTab";
import PemilihSurvei, { namaSurvei } from "./PemilihSurvei";
import FiturKegiatan from "./FiturKegiatan";
import { useFitur } from "./useFitur";
import { tabAktifKelola, tabTampilKelola } from "@/lib/sigapFitur";
import Monitoring from "./Monitoring";
import Administrasi from "./Administrasi";
import Pemeriksaan from "./Pemeriksaan";
import QcPemahaman from "./QcPemahaman";
import Laporan from "./Laporan";
import Ringkasan from "./Ringkasan";
import Notifikasi from "./Notifikasi";
import Tim from "./Tim";
import PengaturanLembar from "./PengaturanLembar";
import IsiLaporanSpj from "./IsiLaporanSpj";
import UnggahKk from "./UnggahKk";
import AlokasiSampel from "./AlokasiSampel";
import Seleksi from "./Seleksi";

export default function KelolaPendataan() {
  const [tab, setTab] = useState<KodeTabPendataan>("ringkasan");
  const [kegId, setKegId] = useState<number>(KEGIATAN_PENDATAAN);
  const [daftar, setDaftar] = useState<KegiatanRingkas[]>([]);

  useEffect(() => {
    if (!bacaSesi()) {
      keMasuk();
      return;
    }
    const sinkron = () => {
      const q = new URLSearchParams(window.location.search);
      setTab(bacaTabPendataan(q.get("tab")));
      setKegId(bacaKegiatanPendataan(q.get("k")));
    };
    sinkron();
    window.addEventListener("popstate", sinkron);
    return () => window.removeEventListener("popstate", sinkron);
  }, []);

  // daftar survei untuk pemilih; gagal memuat = pemilih hanya menampilkan survei yang sedang dipilih (halaman tetap bisa dipakai)
  useEffect(() => {
    let batal = false;
    ambilRingkas()
      .then((r) => !batal && setDaftar(r.kegiatan))
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);

  const pilihTab = useCallback((t: KodeTabPendataan) => {
    setTab(t);
    window.history.replaceState(null, "", urlTabPendataan(window.location.pathname, window.location.search, t));
  }, []);

  const pilihKegiatan = useCallback((id: number) => {
    setKegId(id);
    window.history.replaceState(null, "", urlKegiatanPendataan(window.location.pathname, window.location.search, id));
  }, []);

  const pasca = kegId === KEGIATAN_PENDATAAN;
  const nama = namaSurvei(daftar, kegId);
  const profil = useFitur(kegId);
  const f = profil.fitur;
  const tampil = tabTampilKelola(f);
  /** Tab yang dipakai: pilihan bila fiturnya menyala, selain itu tab tampil pertama (alamat lama ke tab yang dimatikan). */
  const tabIni = tabAktifKelola(tab, tampil) as KodeTabPendataan;

  return (
    <Bingkai<KodeTabPendataan>
      aktif="pendataan_kelola"
      kecil="SIGAP · Kelola Pendataan"
      jejak={["Pelaksanaan", "Pendataan", labelTabPendataan(tabIni)]}
      judul="Kelola Pendataan"
      sub={pasca ? "Pendataan Status Pemulihan (PSP) Pascabencana · dari daftar KK sampai pertanggungjawaban" : `${nama} · penugasan, siaran, QC Pemahaman, dan administrasi`}
      tab={TAB_PENDATAAN.filter((t) => (tampil as string[]).includes(t.kode)).map(({ kode, label }) => ({ kode, label }))}
      aktifTab={tabIni}
      onTab={pilihTab}
    >
      <PemilihSurvei daftar={daftar} aktif={kegId} onPilih={pilihKegiatan} />
      {tabIni === "qc" && <QcPemahaman key={kegId} kegiatanId={kegId} fitur={f} />}
      {tabIni === "ringkasan" && f.ringkasan && <Ringkasan onBuka={pilihTab} />}
      {tabIni === "persiapan" && (
        <>
          {f.persiapan_sasaran && <UnggahKk />}
          {f.persiapan_lembar && <PengaturanLembar />}
          {f.persiapan_sampel && <AlokasiSampel key={kegId} kegiatanId={kegId} nama={nama} />}
          {f.persiapan_laporan_spj && <IsiLaporanSpj />}
          <Seleksi key={kegId} kegiatanId={kegId} nama={nama} />
          <FiturKegiatan
            kegiatanId={kegId}
            nama={nama}
            strategi={profil.strategi}
            fitur={f}
            siap={profil.siap}
            dimuat={profil.dimuat}
            galatMuat={profil.galat}
            onSimpan={profil.simpan}
          />
        </>
      )}
      {tabIni === "tim" && <Tim key={kegId} kegiatanId={kegId} fitur={f} />}
      {tabIni === "siaran" && <Notifikasi key={kegId} kegiatanId={kegId} namaKegiatan={nama} adaQc={f.qc_pemahaman} onBukaTab={pilihTab} />}
      {tabIni === "monitoring" && f.monitoring && <Monitoring />}
      {tabIni === "pemeriksaan" && <Pemeriksaan fitur={f} />}
      {tabIni === "administrasi" && <Administrasi key={kegId} kegiatanId={kegId} />}
      {tabIni === "laporan" && f.laporan && <Laporan key={kegId} kegiatanId={kegId} />}
    </Bingkai>
  );
}
