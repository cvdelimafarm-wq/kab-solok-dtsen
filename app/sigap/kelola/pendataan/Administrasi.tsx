"use client";

// app/sigap/kelola/pendataan/Administrasi.tsx
//
// (23 Okt 2026, tahap 3) Isi tab "6 · Administrasi & SPJ": sub-pilihan Monitoring transport lokal · Verifikasi & Kunci · Kegiatan & Tarif (komponen Admin
// Transport Lokal tersemat untuk kegiatan Pendataan) "Pengadaan & kontrak" (tersemat, 23 Okt tahap 4) dan "Anggaran & lainnya" (pintu masuk Perencanaan + item "segera hadir").

import { SUB_ADMINISTRASI } from "@/lib/sigapPendataanTab";
import Pengadaan from "./Pengadaan";
import PintuMasuk from "./PintuMasuk";
import TransportLokal from "./TransportLokal";
import { SubPilih, useSubTab } from "./useSubTab";

// (29 Okt 2026) Prop `kegiatanId` (pemilih survei): transport lokal (monitoring, verifikasi, unduh, tarif) mengikuti survei; Pengadaan dan Anggaran bersifat lintas survei.
export default function Administrasi({ kegiatanId = 1 }: { kegiatanId?: number }) {
  const { sub, pilih } = useSubTab("administrasi", SUB_ADMINISTRASI);
  return (
    <div className="space-y-3">
      <SubPilih daftar={SUB_ADMINISTRASI} aktif={sub} onPilih={pilih} label="Administrasi dan SPJ" />
      {sub === "monitoring" && <TransportLokal bagian="monitoring" kegiatanId={kegiatanId} />}
      {sub === "verifikasi" && <TransportLokal bagian="verifikasi" kegiatanId={kegiatanId} />}
      {sub === "unduh" && <TransportLokal bagian="unduh" kegiatanId={kegiatanId} />}
      {sub === "tarif" && <TransportLokal bagian="kegiatan" kegiatanId={kegiatanId} />}
      {sub === "pengadaan" && <Pengadaan tertanam />}
      {sub === "anggaran" && <PintuMasuk tab="administrasi" />}
    </div>
  );
}
