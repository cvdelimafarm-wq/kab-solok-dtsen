"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/gap/useGap.ts
//
// (25 Okt 2026, tahap 32) Pengambil data laporan Gap tersimpan (versi berurutan) dan tanggapan atas temuannya, lewat gerbang baca (daftar putih lib/keu/tampilan.ts).
// Penyimpanan dan tanggapan ditulis lewat keu_gap_simpan dan keu_gap_tanggapi; hak ditegakkan basis data.

import { useCallback, useMemo } from "react";
import { urlBaca } from "@/lib/keu/ro";
import { useBacaKeu } from "@/app/sigap/ro/useKeu";
import { normalisasiTemuan, type JenisGap, type Temuan } from "@/lib/keu/gap";

type BarisGap = {
  id: number; ident_id: number; ver: number; jenis: JenisGap; temuan: unknown; ringkas: unknown; n_keras: number; n_sedang: number; n_info: number;
  lanjutan_ver: number | null; dibuat_oleh_nama: string | null; dibuat_at: string;
};
export type VersiGap = Omit<BarisGap, "temuan"> & { temuan: Temuan[] };
export type StatusTanggapan = "diterima" | "dijelaskan" | "ditindaklanjuti";
export type TanggapanGap = { id: number; gap_id: number; ident_id: number; kunci: string; status: StatusTanggapan; catatan: string; oleh_nama: string | null; at: string };

export function useGap(identId: number | null) {
  const versi = useBacaKeu<BarisGap>(identId ? urlBaca("keu_v_gap", { ident_id: identId }, { urut: "-ver", batas: 50 }) : null);
  const tanggapan = useBacaKeu<TanggapanGap>(identId ? urlBaca("keu_v_gap_tanggapan", { ident_id: identId }, { batas: 3000 }) : null);
  const daftar = useMemo<VersiGap[]>(() => (versi.baris ?? []).map((v) => ({ ...v, temuan: normalisasiTemuan(v.temuan) })), [versi.baris]);
  const muatSemua = useCallback(async () => { await Promise.all([versi.muat(), tanggapan.muat()]); }, [versi, tanggapan]);
  return { versi: daftar, tanggapan: tanggapan.baris ?? [], memuat: identId !== null && !versi.baris && !versi.galat, galat: versi.galat ?? tanggapan.galat, muatSemua };
}
