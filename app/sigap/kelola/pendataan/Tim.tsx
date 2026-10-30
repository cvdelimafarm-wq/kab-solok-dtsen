"use client";

// app/sigap/kelola/pendataan/Tim.tsx
//
// (23 Okt 2026, tahap 3) Isi tab "2 · Tim & Surat Tugas": sub-pilihan "Alokasi & pelatihan" (pintu masuk ke /bencana dan Kelola Pelatihan) dan
// "Penugasan & ST" (TabPenugasan tersemat untuk kegiatan Pendataan).

import { useMemo } from "react";
import { SUB_TIM } from "@/lib/sigapPendataanTab";
import type { PetaFitur } from "@/lib/sigapFitur";
import { Pesan } from "../../admin/ui";
import PintuMasuk from "./PintuMasuk";
import TransportLokal from "./TransportLokal";
import { SubPilih, useSubTab } from "./useSubTab";

// (29 Okt 2026) Prop `kegiatanId` (pemilih survei): "Penugasan & ST" mengikuti survei; "Alokasi & pelatihan" masih khusus Pascabencana (/bencana).
// (30 Okt 2026) Prop `fitur` (profil fitur kegiatan): sub yang fiturnya mati tidak ditampilkan.
export default function Tim({ kegiatanId = 1, fitur }: { kegiatanId?: number; fitur?: PetaFitur }) {
  const daftar = useMemo(() => (fitur ? SUB_TIM.filter((x) => (x.kode === "alokasi" ? fitur.tim_alokasi : fitur.tim_penugasan)) : SUB_TIM), [fitur]);
  const { sub, pilih } = useSubTab("tim", daftar.length > 0 ? daftar : SUB_TIM);
  return (
    <div className="space-y-3">
      <SubPilih daftar={daftar.length > 0 ? daftar : SUB_TIM} aktif={sub} onPilih={pilih} label="Tim dan Surat Tugas" />
      {sub === "alokasi" && (kegiatanId === 1 ? <PintuMasuk tab="tim" /> : <Pesan jenis="info">Alokasi PML/PPL per Sub SLS (peta Pascabencana) hanya untuk Pendataan Pascabencana. Untuk survei ini, atur petugas lewat sub Penugasan &amp; ST; pelatihan lewat Kelola Pelatihan.</Pesan>)}
      {sub === "penugasan" && <TransportLokal bagian="penugasan" kegiatanId={kegiatanId} />}
    </div>
  );
}
