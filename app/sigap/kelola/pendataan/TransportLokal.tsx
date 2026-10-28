"use client";

// app/sigap/kelola/pendataan/TransportLokal.tsx
//
// (23 Okt 2026, tahap 3) Menyematkan komponen tab Admin Transport Lokal (app/sigap/admin/Tab*.tsx) untuk kegiatan Pendataan (id 1) di dalam
// Kelola Pendataan. Komponen yang sama dipakai halaman /sigap/admin (alamat lama /sigap/kelola/translok tetap hidup). Hak akses tidak berubah:
// tab hanya digambar bila izin menu translok.* untuk kegiatan itu ada (server tetap memeriksa tiap panggilan).

import { useEffect, useState } from "react";
import { KEGIATAN_PENDATAAN } from "@/lib/sigapPendataanTab";
import { ambilRingkas, bolehKlien, pesanGalat, SesiBerakhir, type Ringkas } from "../../admin/api";
import { Memuat, Pesan } from "../../admin/ui";
import TabKegiatan from "../../admin/TabKegiatan";
import TabMonitoring from "../../admin/TabMonitoring";
import TabPenugasan from "../../admin/TabPenugasan";
import TabVerifikasi from "../../admin/TabVerifikasi";
import TabUnduhSpj from "../../admin/TabUnduhSpj";

export type BagianTranslok = "monitoring" | "penugasan" | "kegiatan" | "verifikasi" | "unduh";
const MENU: Record<BagianTranslok, string> = { monitoring: "translok.monitoring", penugasan: "translok.penugasan", kegiatan: "translok.kegiatan", verifikasi: "translok.verifikasi", unduh: "translok.verifikasi" }; // (28 Okt 2026) Unduh SPJ memakai izin Verifikasi (lihat)

export default function TransportLokal({ bagian }: { bagian: BagianTranslok }) {
  const [r, setR] = useState<Ringkas | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    ambilRingkas()
      .then((d) => !batal && setR((lama) => (lama && JSON.stringify(lama) === JSON.stringify(d) ? lama : d)))
      .catch((e) => {
        if (!batal && !(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      });
    return () => {
      batal = true;
    };
  }, []);

  if (galat) return <Pesan>{galat}</Pesan>;
  if (!r) return <Memuat />;
  const keg = r.kegiatan.find((k) => k.id === KEGIATAN_PENDATAAN) ?? null;
  if (!keg || !bolehKlien(r.izin, MENU[bagian], "lihat", KEGIATAN_PENDATAAN))
    return <Pesan jenis="info">Akun Anda belum punya izin untuk menu ini pada kegiatan Pendataan. Minta admin anggaran menambahkannya lewat Kelola Peran &amp; Akses.</Pesan>;

  return bagian === "monitoring" ? (
    <TabMonitoring key={KEGIATAN_PENDATAAN} kegiatanId={KEGIATAN_PENDATAAN} kegiatan={keg} hariIni={r.hari_ini} />
  ) : bagian === "penugasan" ? (
    <TabPenugasan key={KEGIATAN_PENDATAAN} kegiatanId={KEGIATAN_PENDATAAN} />
  ) : bagian === "unduh" ? (
    <TabUnduhSpj key={KEGIATAN_PENDATAAN} kegiatanId={KEGIATAN_PENDATAAN} />
  ) : bagian === "verifikasi" ? (
    <TabVerifikasi key={KEGIATAN_PENDATAAN} kegiatanId={KEGIATAN_PENDATAAN} />
  ) : (
    <TabKegiatan key={KEGIATAN_PENDATAAN} kegiatanId={KEGIATAN_PENDATAAN} bolehBuat={false} onTersimpan={() => undefined} />
  );
}
