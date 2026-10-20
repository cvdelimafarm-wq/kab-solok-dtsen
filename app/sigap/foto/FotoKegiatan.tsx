"use client";

// app/sigap/foto/FotoKegiatan.tsx
//
// (19 Okt 2026) GERBANG saklar untuk halaman foto kegiatan (mis. halaman Transport Lokal/Dokumentasi):
//   <FotoKegiatan kegiatanId={id} fallback={<UnggahFotoLama ... />} />
// Mode 'kamera' -> kartu tombol "Buka Kamera SIGAP"; mode 'unggah' (atau gagal membaca saklar) -> `fallback` = komponen unggah foto LAMA,
// tidak diubah sama sekali. Mematikan saklar otomatis mengembalikan tampilan lama.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ambilJson } from "./klien";

type Mode = { kegiatan: { kegiatan_id: number; mode: string }[] };

// (20 Okt 2026) `susulan` = tanggal yang sedang dibuka lewat izin susulan (hari lampau). Kamera hanya bisa memotret SEKARANG, jadi foto susulan
// tidak mungkin lewat kamera: tampilkan unggah foto lama (berkas dari galeri), walau kegiatan bermode kamera. Foto hari ini tetap lewat kamera.
export default function FotoKegiatan({ kegiatanId, fallback, susulan = false }: { kegiatanId: number; fallback: ReactNode; susulan?: boolean }) {
  const [mode, setMode] = useState<"kamera" | "unggah" | null>(null);
  useEffect(() => {
    let batal = false;
    ambilJson<Mode>("/api/sigap/foto/mode")
      .then((d) => !batal && setMode(d.kegiatan.find((k) => k.kegiatan_id === kegiatanId)?.mode === "kamera" ? "kamera" : "unggah"))
      .catch(() => !batal && setMode("unggah")); // gagal membaca saklar -> metode lama, tidak pernah memaksa kamera
    return () => { batal = true; };
  }, [kegiatanId]);

  if (susulan) return <>{fallback}</>;
  if (mode === null) return <div className="h-24 animate-pulse rounded-2xl bg-[#EEF2F7]" aria-label="Memuat" />;
  if (mode === "unggah") return <>{fallback}</>;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#C9D3E6] bg-white p-4">
      <div className="text-sm font-extrabold text-[#0F2A52]">Foto dokumentasi lewat Kamera SIGAP</div>
      <p className="text-xs leading-relaxed text-[#3C4C68]">Waktu dan lokasi tercetak otomatis di foto. Foto dari galeri tidak dipakai untuk kegiatan ini.</p>
      <Link href={`/sigap/foto?kegiatan=${kegiatanId}`} className="flex min-h-[52px] items-center justify-center rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white">Buka Kamera SIGAP</Link>
    </div>
  );
}
