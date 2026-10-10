"use client";

// app/sigap/kegiatan/useInduk.ts
//
// (9 Okt 2026) Pengambil data bersama halaman tahapan (Layer 2) dan halaman tahap (Layer 3) sebuah kegiatan induk:
// definisi induk + tahap (/api/portal/induk), data pelatihan (/api/sigap/pelatihan) dan ringkasan Transport Lokal (/api/portal/kegiatan).
// Jam server dipakai untuk hitung mundur. Umur "segar" tiap jenis data diatur di PROFIL (app/portal/dataBersama.ts).
// (10 Okt 2026) Dipercepat -- permintaan user (pindah layer terlalu lama): ketiga API kini diambil BERSAMAAN lewat simpanan bersama
// (app/portal/dataBersama.ts), jadi pindah Beranda -> Layer 2 -> Layer 3 langsung tampil dari data yang sudah ada lalu diperbarui di belakang.
// Daftar induk diambil UTUH (tanpa ?kode=) supaya satu salinan dipakai Beranda dan semua layer.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/app/portal/dataBersama";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";
import { susunTahap, type Induk, type TahapHasil } from "@/lib/sigapTahap";
import type { HubTugas } from "@/lib/sigapTugasUtama";

type HubBeranda = HubTugas & { sekarang: string };

export function useInduk(kode: string) {
  const router = useRouter();
  const dInduk = useData<{ sekarang: string; induk: Induk[] }>("/api/portal/induk");
  const dHub = useData<HubBeranda>("/api/sigap/pelatihan");
  const dKeg = useData<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan");
  const [, setTik] = useState(0);

  const induk = dInduk.data?.induk.find((x) => x.kode === kode) ?? null;
  const hub = dHub.data;
  const hubMuat: "memuat" | "siap" | "gagal" = hub ? "siap" : dHub.galat ? "gagal" : "memuat";
  // Transport Lokal tidak tampil bila gagal dimuat; tahap lain tetap jalan
  const keg: RingkasKegiatan[] | null = dKeg.data?.kegiatan ?? (dKeg.galat ? [] : null);
  const offset = dInduk.data ? Date.parse(dInduk.data.sekarang) - dInduk.tiba : 0;

  // sesi habis -> login; kegiatan tidak ada / bukan untuk akun ini -> kembali ke Beranda (bukan halaman galat buntu)
  const sesiHabis = [dInduk.galat, dHub.galat, dKeg.galat].includes("SESI_BERAKHIR");
  const tidakAda = !!dInduk.data && !induk;
  useEffect(() => {
    if (sesiHabis || tidakAda) router.replace("/");
  }, [sesiHabis, tidakAda, router]);

  useEffect(() => {
    const b = setInterval(() => setTik((x) => x + 1), 30_000);
    return () => clearInterval(b);
  }, []);

  const nowMs = Date.now() + offset;
  const siap = !!induk && keg !== null && hubMuat !== "memuat";
  const tahap: TahapHasil[] = useMemo(
    () => (induk && siap ? susunTahap({ induk, hub, hubMuat, keg: keg ?? [], nowMs }) : []),
    // `nowMs` berubah tiap render; dihitung ulang saat data atau tik berubah
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [induk, hub, hubMuat, keg, siap, Math.floor(nowMs / 30_000)]
  );
  const galat = !dInduk.data && dInduk.galat && dInduk.galat !== "SESI_BERAKHIR" ? dInduk.galat : null;
  const muat = async () => {
    await Promise.all([dInduk.muat(), dHub.muat(), dKeg.muat()]);
  };
  return { induk, tahap, siap, galat, nowMs, muat, hub };
}
