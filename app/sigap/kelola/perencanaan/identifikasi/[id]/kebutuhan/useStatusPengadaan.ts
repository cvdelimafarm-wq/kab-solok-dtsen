"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/kebutuhan/useStatusPengadaan.ts
//
// (26 Okt 2026, tahap 35) Status pelacakan pengadaan: dibaca dari tampilan keu_v_ident_pengadaan (gerbang baca) dan dicatat lewat fungsi keu_pengadaan_catat (gerbang panggil).
// Hak ditegakkan basis data. Bila berkas SQL 20261026b belum dijalankan, tampilan tidak ada: `tersedia` = false dan halaman tetap jalan tanpa kolom pelacakan.

import { useCallback, useMemo } from "react";
import { urlBaca } from "@/lib/keu/ro";
import { aksiKeu, useBacaKeu, useKirim } from "@/app/sigap/ro/useKeu";
import type { ItemPengadaan } from "@/lib/keu/pengadaan";
import { argumenCatat, petaStatus, type BarisStatusPengadaan, type StatusPengadaan } from "@/lib/keu/statusPengadaan";

export function useStatusPengadaan(identId: number | null) {
  const baca = useBacaKeu<BarisStatusPengadaan>(identId ? urlBaca("keu_v_ident_pengadaan", { ident_id: identId }, { batas: 500 }) : null);
  const peta = useMemo(() => petaStatus(baca.baris), [baca.baris]);
  const kirim = useKirim(baca.muat);
  const catat = useCallback(
    (it: Pick<ItemPengadaan, "id" | "uraian">, status: StatusPengadaan, rujukan: string, catatan: string): Promise<boolean> =>
      identId === null ? Promise.resolve(false) : kirim.jalankan(() => aksiKeu("keu_pengadaan_catat", argumenCatat(identId, it, status, rujukan, catatan))),
    [identId, kirim],
  );
  return {
    peta, baris: baca.baris ?? [], catat,
    /** false bila tampilan belum ada di basis data (SQL belum dijalankan) atau gagal dibaca. */
    tersedia: identId !== null && baca.baris !== null && !baca.galat,
    memuat: baca.memuat, galatBaca: baca.galat,
    mengirim: kirim.mengirim, galat: kirim.galat, hapusGalat: kirim.hapusGalat,
  };
}
