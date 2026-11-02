"use client";

// app/sigap/pendataan/useBatas.ts
//
// (2 Nov 2026) Keadaan lapisan batas Sub SLS pada peta: tombol hidup/mati (diingat di HP ini), kecamatan yang beririsan dengan area KK,
// pemuatan (salinan HP > jaringan) dan penyiapan salinan kecamatan lain milik tim untuk dipakai tanpa sinyal.
// Dipakai bersama oleh Lembar Pendataan bencana dan Lembar SPDT NTP.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ambilManifestBatas, muatBatasKecamatan, siapkanSalinanBatas } from "@/app/portal/batasOffline";
import { gabungFitur, kecamatanUntukKotak, kunciKotak, type FiturBatas, type KotakGeo, type ManifestBatas } from "@/lib/batasSubsls";

const KUNCI_TAMPIL = "sigap_peta_batas_v1";

/** diam = belum perlu | memuat | siap | kosong = tak ada batas di area ini | gagal = tak bisa dimuat (tanpa sinyal dan belum tersimpan, atau berkas rusak) */
export type StatusBatas = "diam" | "memuat" | "siap" | "kosong" | "gagal";

function bacaTampil(): boolean {
  try {
    return localStorage.getItem(KUNCI_TAMPIL) !== "0";
  } catch {
    return true;
  }
}

export function useBatasSubsls(aktif: boolean, kotak: KotakGeo | null, kecamatanTim: readonly string[] = []) {
  const [tampil, setTampilState] = useState(true);
  const [status, setStatus] = useState<StatusBatas>("diam");
  const [fitur, setFitur] = useState<FiturBatas[]>([]);
  const [manifest, setManifest] = useState<ManifestBatas | null>(null);
  const manifestMuat = useRef<Promise<ManifestBatas | null> | null>(null);

  useEffect(() => {
    setTampilState(bacaTampil());
  }, []);

  const setTampil = useCallback((v: boolean) => {
    setTampilState(v);
    try {
      localStorage.setItem(KUNCI_TAMPIL, v ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }, []);

  const kunci = kunciKotak(kotak);
  const kunciTim = useMemo(() => Array.from(new Set(kecamatanTim)).sort().join(","), [kecamatanTim]);

  // manifest sekali per sesi halaman
  const dapatManifest = useCallback(async () => {
    if (!manifestMuat.current) {
      manifestMuat.current = ambilManifestBatas().then((r) => {
        setManifest(r.manifest);
        return r.manifest;
      });
    }
    return manifestMuat.current;
  }, []);

  useEffect(() => {
    if (!aktif || !tampil || !kotak) {
      setStatus("diam");
      return;
    }
    let batal = false;
    setStatus("memuat");
    (async () => {
      const m = await dapatManifest();
      if (batal) return;
      if (!m) {
        setFitur([]);
        setStatus("gagal");
        return;
      }
      const kode = kecamatanUntukKotak(m, kotak);
      if (kode.length === 0) {
        setFitur([]);
        setStatus("kosong");
        return;
      }
      const hasil = await Promise.all(kode.map((k) => muatBatasKecamatan(m.kecamatan[k], m.versi)));
      if (batal) return;
      const berhasil = hasil.flatMap((h) => (h.ok ? [h.isi.fitur] : []));
      setFitur(gabungFitur(berhasil));
      setStatus(berhasil.length === 0 ? "gagal" : "siap");
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktif, tampil, kunci, dapatManifest]);

  // siapkan salinan kecamatan milik tim (saat sinyal ada) supaya tersedia tanpa sinyal di jorong lain; tak mengubah tampilan
  useEffect(() => {
    if (!aktif || !tampil || !kunciTim) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let batal = false;
    const mulai = setTimeout(async () => {
      const m = await dapatManifest();
      if (batal || !m) return;
      for (const k of kunciTim.split(",")) {
        if (batal) return;
        const kec = m.kecamatan[k];
        if (kec) await siapkanSalinanBatas(kec, m.versi);
      }
    }, 2500);
    return () => {
      batal = true;
      clearTimeout(mulai);
    };
  }, [aktif, tampil, kunciTim, dapatManifest]);

  return { tampil, setTampil, status, fitur, manifest };
}

export type BatasSubsls = ReturnType<typeof useBatasSubsls>;
