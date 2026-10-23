"use client";

// app/sigap/kelola/pendataan/Tim.tsx
//
// (23 Okt 2026, tahap 3) Isi tab "2 · Tim & Surat Tugas": sub-pilihan "Alokasi & pelatihan" (pintu masuk ke /bencana dan Kelola Pelatihan) dan
// "Penugasan & ST" (TabPenugasan tersemat untuk kegiatan Pendataan).

import { SUB_TIM } from "@/lib/sigapPendataanTab";
import PintuMasuk from "./PintuMasuk";
import TransportLokal from "./TransportLokal";
import { SubPilih, useSubTab } from "./useSubTab";

export default function Tim() {
  const { sub, pilih } = useSubTab("tim", SUB_TIM);
  return (
    <div className="space-y-3">
      <SubPilih daftar={SUB_TIM} aktif={sub} onPilih={pilih} label="Tim dan Surat Tugas" />
      {sub === "alokasi" && <PintuMasuk tab="tim" />}
      {sub === "penugasan" && <TransportLokal bagian="penugasan" />}
    </div>
  );
}
