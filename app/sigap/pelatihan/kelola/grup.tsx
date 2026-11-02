"use client";

// app/sigap/pelatihan/kelola/grup.tsx
//
// (2 Nov 2026) Tab Kelola Pelatihan yang digabung (dari 10 tab menjadi 7): "Kuis & Rapat" (Adu Sigap, Kuis Pra, Rapat Zoom) dan "Notifikasi" (notifikasi push + modal pengumuman).
// Setiap bagian tetap memakai komponen aslinya; berkas ini hanya menyusunnya di bawah satu tab dengan pilihan bagian (ikut ?sub=).

import KuisPraKelola from "./kuisPra";
import KuisLive from "./kuis";
import RapatKelola from "./rapat";
import NotifikasiKelola from "./notifikasi";
import PengumumanKelola from "./pengumuman";
import { PilihSub, useSub, type ItemSub } from "./GrupTab";

export const SUB_KUIS: ItemSub[] = [
  { kode: "adusigap", label: "🎮 Adu Sigap", ket: "Kuis live bersama saat pelatihan berlangsung." },
  { kode: "kuispra", label: "🧠 Kuis Pra", ket: "Kuis sebelum pelatihan." },
  { kode: "rapat", label: "🎥 Rapat Zoom", ket: "Rapat daring dan presensinya." },
];
export const SUB_KOMUNIKASI: ItemSub[] = [
  { kode: "notifikasi", label: "🔔 Notifikasi", ket: "Pengingat push ke HP peserta." },
  { kode: "pengumuman", label: "📢 Pengumuman", ket: "Modal pengumuman di aplikasi peserta." },
];

export function KuisRapatKelola({ kegiatanId, bisaKelola }: { kegiatanId: number | null; bisaKelola: boolean }) {
  const [sub, pilih] = useSub(SUB_KUIS);
  return (
    <div>
      <PilihSub daftar={SUB_KUIS} aktif={sub} onPilih={pilih} label="Bagian Kuis & Rapat" />
      {sub === "adusigap" && <KuisLive bisaKelolaAwal={bisaKelola} />}
      {sub === "kuispra" && <KuisPraKelola />}
      {sub === "rapat" && <RapatKelola kegiatanId={kegiatanId} />}
    </div>
  );
}

export function KomunikasiKelola() {
  const [sub, pilih] = useSub(SUB_KOMUNIKASI);
  return (
    <div>
      <PilihSub daftar={SUB_KOMUNIKASI} aktif={sub} onPilih={pilih} label="Bagian Notifikasi" />
      {sub === "notifikasi" && <NotifikasiKelola />}
      {sub === "pengumuman" && <PengumumanKelola />}
    </div>
  );
}
