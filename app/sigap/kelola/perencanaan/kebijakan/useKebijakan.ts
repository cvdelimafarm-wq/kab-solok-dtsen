"use client";

// app/sigap/kelola/perencanaan/kebijakan/useKebijakan.ts
//
// (25 Okt 2026, tahap 28) Pengambil data Lembar kebijakan manajemen tim: semua baca lewat GET /api/sigap/keu/baca (daftar putih lib/keu/tampilan.ts),
// semua tulis lewat fungsi keu_kebijakan_* di gerbang POST /api/sigap/keu/panggil (aksiKeu). Hak ditegakkan basis data.

import { useCallback, useEffect, useState } from "react";
import { urlBaca } from "@/lib/keu/ro";
import { HAK_KOSONG, type BarisLembar, type BarisPengesah, type HakKebijakan, type RiwayatLembar } from "@/lib/keu/kebijakan";
import { aksiKeu, useBacaKeu } from "@/app/sigap/ro/useKeu";

/** Kolom daftar versi (tanpa isi lengkap, supaya ringan). */
export type BarisVersi = Pick<BarisLembar, "id" | "tahun" | "ver" | "status" | "predefined" | "tanggal_rapat" | "nomor_notulen" | "berlaku_at" | "diubah_at">;
const KOLOM_VERSI = ["id", "tahun", "ver", "status", "predefined", "tanggal_rapat", "nomor_notulen", "berlaku_at", "diubah_at"];

export function useDaftarVersi() {
  return useBacaKeu<BarisVersi>(urlBaca("keu_v_kebijakan", {}, { urut: "-ver", batas: 200, kolom: KOLOM_VERSI }));
}

/** Hak akun yang masuk (hanya untuk menampilkan tombol; yang memutuskan basis data). */
export function useHakKebijakan() {
  const [hak, setHak] = useState<HakKebijakan>(HAK_KOSONG);
  const [siap, setSiap] = useState(false);
  useEffect(() => {
    let hidup = true;
    void aksiKeu<HakKebijakan>("keu_kebijakan_hak", {}).then((r) => {
      if (!hidup) return;
      setHak(r.ok ? { ...HAK_KOSONG, ...r.data } : HAK_KOSONG);
      setSiap(true);
    });
    return () => { hidup = false; };
  }, []);
  return { hak, siap };
}

/** Satu lembar lengkap: baris (dengan isi), pengesah, dan riwayat. */
export function useLembar(id: number | null) {
  const baris = useBacaKeu<BarisLembar>(id ? urlBaca("keu_v_kebijakan", { id }, { batas: 1 }) : null);
  const pengesah = useBacaKeu<BarisPengesah>(id ? urlBaca("keu_v_kebijakan_pengesah", { lembar_id: id }, { batas: 500 }) : null);
  const riwayat = useBacaKeu<RiwayatLembar>(id ? urlBaca("keu_v_kebijakan_riwayat", { lembar_id: id }, { urut: "-id", batas: 100 }) : null);
  const muatSemua = useCallback(async () => {
    await Promise.all([baris.muat(), pengesah.muat(), riwayat.muat()]);
  }, [baris, pengesah, riwayat]);
  return {
    row: baris.baris?.[0] ?? null,
    pengesah: pengesah.baris ?? [],
    riwayat: riwayat.baris ?? [],
    memuat: id !== null && !baris.baris && !baris.galat,
    galat: baris.galat ?? pengesah.galat ?? riwayat.galat,
    muatSemua,
  };
}
