"use client";

// app/sigap/pendataan/useDasar.ts
//
// (20 Okt 2026) Keadaan peta dasar untuk tim yang sedang dibuka: manifest (berkas mana), salinan di HP, sumber yang dipakai penampil
// (salinan di HP > berkas online), pilihan lapisan (diingat di HP ini), dan unduhan atas ketukan petugas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  alamatSupabase,
  ambilManifestDasar,
  bacaBlobDasar,
  infoSalinanDasar,
  unduhDasar,
  urlBerkasDasar,
  type InfoSalinan,
} from "@/app/portal/petaDasarOffline";
import { berkasUntukTim, namaBerkasTim, salinanBerlaku, type ManifestDasar, type PilihanLapisan } from "@/lib/petaDasar";
import type { SumberDasar } from "./PetaDasar";

const KUNCI_LAPISAN = "sigap_peta_lapisan_v1";

export type KeadaanUnduh = { fase: "diam" | "jalan" | "galat"; diterima: number; total: number; pesan: string | null };

function bacaLapisan(): PilihanLapisan {
  try {
    return localStorage.getItem(KUNCI_LAPISAN) === "titik" ? "titik" : "jalan";
  } catch {
    return "jalan";
  }
}

export function useDasarTim(pmlId: number | null, aktif: boolean) {
  const [manifest, setManifest] = useState<ManifestDasar | null>(null);
  const [info, setInfo] = useState<InfoSalinan | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [siapCek, setSiapCek] = useState(false);
  const [online, setOnline] = useState(true);
  const [lapisan, setLapisanState] = useState<PilihanLapisan>("jalan");
  const [unduh, setUnduh] = useState<KeadaanUnduh>({ fase: "diam", diterima: 0, total: 0, pesan: null });
  const batalUnduh = useRef<AbortController | null>(null);

  useEffect(() => {
    setLapisanState(bacaLapisan());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    const naik = () => setOnline(true);
    const turun = () => setOnline(false);
    window.addEventListener("online", naik);
    window.addEventListener("offline", turun);
    return () => {
      window.removeEventListener("online", naik);
      window.removeEventListener("offline", turun);
    };
  }, []);

  const berkas = berkasUntukTim(manifest, pmlId ?? -1);
  const nama = berkas?.berkas ?? (pmlId ? namaBerkasTim(pmlId) : null);

  const muatSalinan = useCallback(async (n: string) => {
    const inf = await infoSalinanDasar(n);
    setInfo(inf);
    setBlob(inf ? await bacaBlobDasar(n) : null);
  }, []);

  // cek sekali per tim (saat tab Peta dibuka): manifest dan salinan di HP
  useEffect(() => {
    if (!aktif || !pmlId) return;
    let batal = false;
    setSiapCek(false);
    (async () => {
      const { manifest: m } = await ambilManifestDasar();
      if (batal) return;
      setManifest(m);
      await muatSalinan(berkasUntukTim(m, pmlId)?.berkas ?? namaBerkasTim(pmlId));
      if (!batal) setSiapCek(true);
    })();
    return () => {
      batal = true;
    };
  }, [aktif, pmlId, muatSalinan]);

  useEffect(() => () => batalUnduh.current?.abort(), []);

  const berlaku = !!info && salinanBerlaku(info, berkas);
  const adaVersiBaru = !!info && !!berkas && !berlaku;

  const sumber: SumberDasar | null = useMemo(() => {
    if (!siapCek || !nama) return null;
    // salinan di HP dipakai bila versinya cocok, atau bila sedang luring / manifest tidak diketahui (lebih baik versi lama daripada kanvas kosong)
    if (blob && info && (berlaku || !online || !berkas)) return { tipe: "blob", blob, nama };
    if (online && berkas && alamatSupabase()) return { tipe: "online", url: urlBerkasDasar(berkas.berkas) };
    return null;
  }, [siapCek, nama, blob, info, berlaku, online, berkas]);

  const setLapisan = useCallback((l: PilihanLapisan) => {
    setLapisanState(l);
    try {
      localStorage.setItem(KUNCI_LAPISAN, l);
    } catch {
      /* abaikan */
    }
  }, []);

  const mulaiUnduh = useCallback(async () => {
    if (!berkas || unduh.fase === "jalan") return;
    const ac = new AbortController();
    batalUnduh.current = ac;
    setUnduh({ fase: "jalan", diterima: 0, total: berkas.ukuran, pesan: null });
    const h = await unduhDasar(berkas, (diterima, total) => setUnduh((s) => (s.fase === "jalan" ? { ...s, diterima, total } : s)), ac.signal);
    if (ac.signal.aborted) {
      setUnduh({ fase: "diam", diterima: 0, total: 0, pesan: null });
      return;
    }
    if (!h.ok) {
      setUnduh({ fase: "galat", diterima: 0, total: 0, pesan: h.pesan });
      return;
    }
    await muatSalinan(berkas.berkas);
    setUnduh({ fase: "diam", diterima: 0, total: 0, pesan: null });
  }, [berkas, unduh.fase, muatSalinan]);

  const batalkanUnduh = useCallback(() => batalUnduh.current?.abort(), []);

  return { siapCek, online, berkas, sumber, berlaku, adaVersiBaru, ada: !!info, lapisan, setLapisan, unduh, mulaiUnduh, batalkanUnduh };
}

export type DasarTim = ReturnType<typeof useDasarTim>;
