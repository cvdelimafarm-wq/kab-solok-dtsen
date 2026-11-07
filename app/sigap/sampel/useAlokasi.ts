"use client";

// app/sigap/sampel/useAlokasi.ts
//
// (7 Nov 2026) Pengambil data "Wilayah saya" (alokasi sub SLS) untuk HP petugas. Salinan terakhir disimpan di perangkat (daftar tetap bisa dibuka tanpa sinyal
// setelah pernah dimuat), lalu diperbarui dari server. Daftar KK master dimuat per sub SLS saat dibuka dan juga disimpan di perangkat.
// A2: respons per sub SLS memuat juga jendela rilis dan tag sampel (selalu dari server bila ada sinyal); penandaan/pelepasan/hasil dikirim lewat `aksiTag`
// dan butuh sinyal (aturan jendela 24 jam ditegakkan di server, jadi tidak ada antrean luring).

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPortal, pemilikSesi } from "@/app/portal/sesi";
import { API_ALOKASI, type DataAlokasiSaya, type KkMaster } from "@/lib/alokasiWilayah";
import { selisihJam, type DataTagSub } from "@/lib/tagSampel";

const kunciData = (k: number) => `sigap_alokasi_${pemilikSesi() ?? 0}_${k}`;
const kunciKk = (k: number, s: string) => `sigap_alokasi_kk_${pemilikSesi() ?? 0}_${k}_${s}`;

function baca<T>(kunci: string): T | null {
  try {
    const m = window.localStorage.getItem(kunci);
    return m ? (JSON.parse(m) as T) : null;
  } catch {
    return null;
  }
}
function tulis(kunci: string, nilai: unknown) {
  try {
    window.localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    /* penyimpanan penuh/tertutup: abaikan */
  }
}

/** Hasil memuat satu sub SLS. `tag` null = server belum punya fitur tag (atau salinan lama di perangkat). */
export type HasilMuatKk = { kk: KkMaster[]; salinan: boolean; tag?: DataTagSub | null };
type RespKk = { kk: KkMaster[] } & Partial<DataTagSub>;

/** Aksi penandaan ke server. Melempar Error berisi pesan penolakan aturan. */
export type AksiTag =
  | { aksi: "tag"; s: string; kk: number; peran: "utama" | "cadangan" }
  | { aksi: "lepas"; kk: number }
  | { aksi: "hasil"; kk: number; hasil: "didata" | "menolak" | "tidak_ditemukan" | null };

export function useAlokasiSaya(kegiatanId: number | null) {
  const [data, setData] = useState<DataAlokasiSaya | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [luring, setLuring] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const [selisihMs, setSelisihMs] = useState(0);
  const permintaan = useRef(0);

  const muat = useCallback(async () => {
    if (kegiatanId == null) return;
    const no = ++permintaan.current;
    setMemuat(true);
    try {
      const d = await apiPortal<DataAlokasiSaya>(`${API_ALOKASI}?k=${kegiatanId}`);
      if (no !== permintaan.current) return;
      setData(d);
      setSelisihMs(d.jendela ? selisihJam(d.jendela.sekarang) : 0);
      setGalat(null);
      setLuring(false);
      tulis(kunciData(kegiatanId), d);
    } catch (e) {
      if (no !== permintaan.current) return;
      setLuring(true);
      setGalat(e instanceof Error ? e.message : "Wilayah belum bisa dimuat.");
    } finally {
      if (no === permintaan.current) setMemuat(false);
    }
  }, [kegiatanId]);

  useEffect(() => {
    if (kegiatanId == null) return;
    const simpan = baca<DataAlokasiSaya>(kunciData(kegiatanId));
    setData(simpan && simpan.kegiatan?.id === kegiatanId && Array.isArray(simpan.wilayah) ? simpan : null);
    setGalat(null);
    void muat();
  }, [kegiatanId, muat]);

  useEffect(() => {
    const saatKembali = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", saatKembali);
    return () => document.removeEventListener("visibilitychange", saatKembali);
  }, [muat]);

  /** Daftar KK + tag satu sub SLS: server bila ada sinyal, salinan perangkat bila tidak. `salinan` = true bila dari perangkat. */
  const muatKk = useCallback(
    async (idsubsls: string): Promise<HasilMuatKk> => {
      if (kegiatanId == null) return { kk: [], salinan: false };
      try {
        const r = await apiPortal<RespKk>(`${API_ALOKASI}?k=${kegiatanId}&s=${idsubsls}`);
        tulis(kunciKk(kegiatanId, idsubsls), r);
        return { kk: r.kk, salinan: false, tag: r.jendela ? { jendela: r.jendela, target: r.target ?? 0, cadangan: r.cadangan ?? 0, tag: r.tag ?? [] } : null };
      } catch (e) {
        const simpan = baca<RespKk | KkMaster[]>(kunciKk(kegiatanId, idsubsls));
        if (simpan) {
          const kk = Array.isArray(simpan) ? simpan : simpan.kk;
          const tag = !Array.isArray(simpan) && simpan.jendela ? { jendela: simpan.jendela, target: simpan.target ?? 0, cadangan: simpan.cadangan ?? 0, tag: simpan.tag ?? [] } : null;
          return { kk, salinan: true, tag };
        }
        throw e;
      }
    },
    [kegiatanId],
  );

  /** Kirim aksi tag/lepas/hasil. Sesudah berhasil, ringkasan wilayah dimuat ulang di latar. */
  const aksiTag = useCallback(
    async (a: AksiTag): Promise<void> => {
      if (kegiatanId == null) return;
      await apiPortal(API_ALOKASI, { method: "POST", body: JSON.stringify({ k: kegiatanId, ...a }) });
      void muat();
    },
    [kegiatanId, muat],
  );

  return { data, galat: !data ? galat : null, luring: luring && !!data, memuat, muat, muatKk, aksiTag, selisihMs };
}
