"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/pelaksanaan/usePelaksanaan.ts
//
// (25 Okt 2026, tahap 31) Pengambil data halaman Pelaksanaan: kegiatan tertaut dan calon (tampilan lewat gerbang baca), serta bahan pelaksanaan dan usulan
// penugasan (fungsi baca-saja keu_pelaksanaan_bahan dan keu_usulan_penugasan lewat gerbang panggil). Hak ditegakkan basis data.

import { useCallback, useEffect, useState } from "react";
import { urlBaca } from "@/lib/keu/ro";
import { aksiKeu, useBacaKeu } from "@/app/sigap/ro/useKeu";
import { normalisasiBahan, normalisasiUsulan, type BahanPelaksanaan, type ButirUsulan, type CalonKegiatan, type KegiatanTertaut } from "@/lib/keu/pelaksanaan";

export function usePelaksanaan(identId: number | null) {
  const tertaut = useBacaKeu<KegiatanTertaut>(identId ? urlBaca("keu_v_ident_kegiatan", { ident_id: identId }, { urut: "mulai", batas: 200 }) : null);
  const calon = useBacaKeu<CalonKegiatan>(identId ? urlBaca("keu_v_kegiatan_calon", { ident_id: identId }, { batas: 500 }) : null);
  const [bahan, setBahan] = useState<BahanPelaksanaan | null>(null);
  const [galatBahan, setGalatBahan] = useState<string | null>(null);
  const [bahanSiap, setBahanSiap] = useState(false);

  const muatBahan = useCallback(async () => {
    if (!identId) return;
    const r = await aksiKeu<unknown>("keu_pelaksanaan_bahan", { p_ident: identId });
    if (r.ok) { setBahan(normalisasiBahan(r.data)); setGalatBahan(null); } else setGalatBahan(r.pesan);
    setBahanSiap(true);
  }, [identId]);
  useEffect(() => { void muatBahan(); }, [muatBahan]);

  const muatSemua = useCallback(async () => { await Promise.all([tertaut.muat(), calon.muat(), muatBahan()]); }, [tertaut, calon, muatBahan]);
  return {
    tertaut: tertaut.baris ?? [], calon: calon.baris ?? [], bahan,
    memuat: identId !== null && (!tertaut.baris || !calon.baris || !bahanSiap) && !tertaut.galat && !calon.galat && !galatBahan,
    galat: tertaut.galat ?? calon.galat ?? galatBahan, muatSemua,
  };
}

/** Usulan penugasan untuk satu kegiatan tertaut; dimuat ulang saat `versi` berubah (mis. sesudah menerapkan). */
export function useUsulan(identId: number | null, kegiatanId: number | null, versi: number) {
  const [butir, setButir] = useState<ButirUsulan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    let hidup = true;
    if (!identId || !kegiatanId) { setButir(null); setGalat(null); return; }
    void aksiKeu<unknown>("keu_usulan_penugasan", { p_ident: identId, p_kegiatan: kegiatanId }).then((r) => {
      if (!hidup) return;
      if (r.ok) { setButir(normalisasiUsulan(r.data)); setGalat(null); } else { setButir(null); setGalat(r.pesan); }
    });
    return () => { hidup = false; };
  }, [identId, kegiatanId, versi]);
  return { butir, galat, memuat: !!identId && !!kegiatanId && butir === null && galat === null };
}
