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
import SusunFoto from "./SusunFoto";
import { kirimSemuaAntrean } from "./kirimAntrean";

type Mode = { kegiatan: { kegiatan_id: number; mode: string }[] };

// (20 Okt 2026) `susulan` = tanggal yang sedang dibuka lewat izin susulan (hari lampau). Kamera hanya bisa memotret SEKARANG, jadi foto susulan
// tidak mungkin lewat kamera: tampilkan unggah foto lama (berkas dari galeri), walau kegiatan bermode kamera. Foto hari ini tetap lewat kamera.
// (21 Okt 2026) `tanggal` + `onBerubah` + `jenis`: panel nomor foto (SusunFoto). Pada tanggal izin susulan foto Kamera SIGAP yang belum bernomor
// LANGSUNG disusun ke nomor kosong, lalu uploader lama tetap tersedia di bawahnya untuk nomor yang masih kosong. Foto yang tertahan di antrean HP
// (belum sempat terkirim) juga dikirim dari sini begitu halaman dibuka, jadi tidak harus kembali ke layar kamera.
// (23 Okt 2026) `lampau` = tanggal sudah lewat (terlewat, tanpa izin susulan): kamera tidak ditawarkan (hanya bisa memotret SEKARANG); yang tampil hanya
// panel nomor foto, yang sendiri menjelaskan bila perbaikan sudah tidak diizinkan.
export default function FotoKegiatan({ kegiatanId, fallback, susulan = false, lampau = false, tanggal, jenis = null, onBerubah }: { kegiatanId: number; fallback: ReactNode; susulan?: boolean; lampau?: boolean; tanggal?: string; jenis?: string | null; onBerubah?: () => void | Promise<void> }) {
  const [mode, setMode] = useState<"kamera" | "unggah" | null>(null);
  useEffect(() => {
    void kirimSemuaAntrean().then((n) => { if (n > 0) void Promise.resolve(onBerubah?.()).catch(() => undefined); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let batal = false;
    ambilJson<Mode>("/api/sigap/foto/mode")
      .then((d) => !batal && setMode(d.kegiatan.find((k) => k.kegiatan_id === kegiatanId)?.mode === "kamera" ? "kamera" : "unggah"))
      .catch(() => !batal && setMode("unggah")); // gagal membaca saklar -> metode lama, tidak pernah memaksa kamera
    return () => { batal = true; };
  }, [kegiatanId]);

  if (susulan) {
    return (
      <>
        {mode === "kamera" && tanggal && (
          <div className="mb-3">
            <SusunFoto kegiatanId={kegiatanId} tanggal={tanggal} jenis={jenis} otomatis onBerubah={onBerubah} />
          </div>
        )}
        {fallback}
      </>
    );
  }
  if (mode === null) return <div className="h-24 animate-pulse rounded-2xl bg-[#EEF2F7]" aria-label="Memuat" />;
  if (mode === "unggah") return <>{fallback}</>;
  if (lampau && tanggal)
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-[#C9D3E6] bg-white p-4">
        <div className="text-sm font-extrabold text-[#0F2A52]">Nomor foto tanggal ini</div>
        <p className="text-xs leading-relaxed text-[#3C4C68]">Kamera SIGAP hanya memotret pada hari kerjanya sendiri. Di sini Anda dapat memeriksa dan merapikan nomor foto bila masih diizinkan.</p>
        <SusunFoto kegiatanId={kegiatanId} tanggal={tanggal} jenis={jenis} onBerubah={onBerubah} />
      </div>
    );
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#C9D3E6] bg-white p-4">
      <div className="text-sm font-extrabold text-[#0F2A52]">Foto dokumentasi lewat Kamera SIGAP</div>
      <p className="text-xs leading-relaxed text-[#3C4C68]">Waktu dan lokasi tercetak otomatis di foto. Foto dari galeri tidak dipakai untuk kegiatan ini.</p>
      <Link href={`/sigap/foto?kegiatan=${kegiatanId}`} className="flex min-h-[52px] items-center justify-center rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white">Buka Kamera SIGAP</Link>
      {tanggal && <SusunFoto kegiatanId={kegiatanId} tanggal={tanggal} jenis={jenis} onBerubah={onBerubah} />}
    </div>
  );
}
