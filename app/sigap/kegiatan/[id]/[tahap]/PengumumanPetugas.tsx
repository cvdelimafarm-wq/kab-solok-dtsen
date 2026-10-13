"use client";

// app/sigap/kegiatan/[id]/[tahap]/PengumumanPetugas.tsx
//
// (13 Okt 2026) Modal siaran dari admin untuk petugas pendataan (PML/PPL): muncul di halaman tahap, cukup SEKALI konfirmasi ("Saya mengerti"),
// lalu hilang untuk akun itu (dicatat di server per akun + cadangan di peramban). Antrian berurutan bila ada lebih dari satu.
// Gagal memuat = diam saja (jangan mengganggu halaman kerja).

import { useCallback, useEffect, useState } from "react";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import { ModalPengumuman } from "@/app/sigap/pelatihan/pengumumanUi";
import type { PengumumanPeserta } from "@/lib/sigapPengumuman";

const kunciLokal = (p: Pick<PengumumanPeserta, "id" | "versi">) => `sigap_siaran_${p.id}_${p.versi}`;
const sudahLokal = (p: PengumumanPeserta) => {
  try {
    return localStorage.getItem(kunciLokal(p)) === "1";
  } catch {
    return false;
  }
};

export default function PengumumanPetugas() {
  const [antrian, setAntrian] = useState<PengumumanPeserta[]>([]);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (!bacaSesi()) return;
    let batal = false;
    apiPortal<{ pengumuman?: PengumumanPeserta[] }>("/api/portal/siaran-petugas")
      .then((d) => {
        if (!batal) setAntrian((d.pengumuman ?? []).filter((p) => !sudahLokal(p)));
      })
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);

  const lanjut = useCallback(() => {
    const p = antrian[pos];
    if (p) {
      try {
        localStorage.setItem(kunciLokal(p), "1");
      } catch {
        /* peramban menolak penyimpanan: server tetap mencatat */
      }
      apiPortal("/api/portal/siaran-petugas", { method: "POST", body: JSON.stringify({ aksi: "baca", id: p.id, versi: p.versi }) }).catch(() => undefined);
    }
    setPos((x) => x + 1);
  }, [antrian, pos]);

  const sekarang = antrian[pos];
  if (!sekarang) return null;
  return <ModalPengumuman key={sekarang.id} d={sekarang} posisi={pos + 1} jumlah={antrian.length} lanjut={lanjut} />;
}
