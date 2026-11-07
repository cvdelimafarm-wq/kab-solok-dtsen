"use client";

// app/sigap/sampel/PetaSubSls.tsx
//
// (7 Nov 2026) A1b: peta mini satu sub SLS pada kartu "Wilayah saya": garis batas sub SLS (berkas batas kecamatan di /peta/batas, bila ada) dan titik KK master
// (biru = sampel utama, oranye = cadangan, abu = lainnya). Tanpa basemap dan tanpa pustaka peta: SVG ringan yang aman di HP. Bila berkas batas belum ada atau gagal dimuat,
// titik KK tetap digambar dan keterangan singkat ditampilkan. Tidak pernah melempar galat ke kartu induk.

import { useEffect, useMemo, useState } from "react";
import { JALUR_BATAS, NAMA_MANIFEST_BATAS, bacaBerkasBatas, bacaManifestBatas, type FiturBatas, type ManifestBatas } from "@/lib/batasSubsls";
import { batangSkala, berkasUntukSub, siapkanPetaSub } from "@/lib/petaWilayah";
import type { KkMaster } from "@/lib/alokasiWilayah";

type Muat = { status: "memuat" } | { status: "ada"; fitur: FiturBatas } | { status: "tiada"; alasan: string };

// cache selama halaman hidup supaya membuka-tutup peta tidak mengunduh ulang
let cacheManifest: Promise<ManifestBatas | null> | null = null;
const cacheBerkas = new Map<string, Promise<FiturBatas[] | null>>();

// (7 Nov 2026, C2) Batas bisa diperbarui dari Master: manifest selalu diperiksa ulang (no-cache; 304 murah), berkas kecamatan diminta dengan ?v=<versi manifest>
// sehingga alamatnya unik per versi dan boleh disimpan lama oleh peramban.
async function ambilJson(url: string, cache: RequestCache = "force-cache"): Promise<unknown> {
  const r = await fetch(url, { cache });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function muatManifest(): Promise<ManifestBatas | null> {
  if (!cacheManifest) {
    cacheManifest = ambilJson(`${JALUR_BATAS}/${NAMA_MANIFEST_BATAS}`, "no-cache").then(bacaManifestBatas).catch(() => null);
    cacheManifest.then((m) => {
      if (!m) cacheManifest = null; // gagal/tak ada: boleh dicoba lagi lain kali
    });
  }
  return cacheManifest;
}

function muatBerkas(berkas: string, versi: string): Promise<FiturBatas[] | null> {
  const kunci = `${versi}/${berkas}`;
  let p = cacheBerkas.get(kunci);
  if (!p) {
    p = ambilJson(`${JALUR_BATAS}/${encodeURIComponent(berkas)}?v=${encodeURIComponent(versi)}`)
      .then((j) => bacaBerkasBatas(j)?.fitur ?? null)
      .catch(() => null);
    cacheBerkas.set(kunci, p);
    p.then((f) => {
      if (!f) cacheBerkas.delete(kunci);
    });
  }
  return p;
}

function useBatasSub(idsubsls: string): Muat {
  const [s, setS] = useState<Muat>({ status: "memuat" });
  useEffect(() => {
    let batal = false;
    setS({ status: "memuat" });
    (async () => {
      const m = await muatManifest();
      if (batal) return;
      if (!m) return setS({ status: "tiada", alasan: "Batas wilayah belum tersedia di server." });
      const berkas = berkasUntukSub(m, idsubsls);
      if (!berkas) return setS({ status: "tiada", alasan: "Batas sub SLS ini belum ada di berkas peta." });
      const daftar = await muatBerkas(berkas, m.versi);
      if (batal) return;
      const f = daftar?.find((x) => x.id === idsubsls);
      setS(f ? { status: "ada", fitur: f } : { status: "tiada", alasan: "Batas sub SLS ini belum ada di berkas peta." });
    })().catch(() => {
      if (!batal) setS({ status: "tiada", alasan: "Batas wilayah belum bisa dimuat." });
    });
    return () => {
      batal = true;
    };
  }, [idsubsls]);
  return s;
}

const WARNA = { utama: "#1F5FD1", cadangan: "#E08A00", lain: "#8896AB" } as const;

export default function PetaSubSls({ idsubsls, kk, peran }: { idsubsls: string; kk: readonly KkMaster[]; peran: ReadonlyMap<number, "utama" | "cadangan"> }) {
  const batas = useBatasSub(idsubsls);
  const gambar = useMemo(() => siapkanPetaSub(batas.status === "ada" ? batas.fitur : null, kk, peran), [batas, kk, peran]);
  const skala = gambar ? batangSkala(gambar.meterPerSatuan) : null;

  if (batas.status === "memuat") return <p className="px-3.5 py-3 text-[12.5px] text-[#55657D]" aria-busy="true">Memuat peta…</p>;
  if (!gambar) return <p className="px-3.5 py-3 text-[12.5px] text-[#55657D]">Belum ada batas wilayah maupun koordinat KK untuk digambar.{batas.status === "tiada" ? ` ${batas.alasan}` : ""}</p>;

  const nUtama = gambar.titik.filter((t) => t.peran === "utama").length;
  const nCad = gambar.titik.filter((t) => t.peran === "cadangan").length;
  return (
    <figure className="px-3 pb-2 pt-2" aria-label="Peta sub SLS">
      <svg viewBox={`0 0 ${gambar.lebar} ${gambar.tinggi}`} className="w-full rounded-[12px] border border-[#DCE5F2] bg-[#F4F8FD]" role="img" aria-label={`Peta ${gambar.titik.length} KK`}>
        {gambar.adaBatas && <path d={gambar.jalur} fill="#1F5FD1" fillOpacity="0.07" stroke="#1F5FD1" strokeWidth="1.6" strokeLinejoin="round" fillRule="evenodd" />}
        {gambar.titik.map((t) => (
          <circle key={t.id} cx={t.x} cy={t.y} r={t.peran === "lain" ? 3.2 : 5.5} fill={WARNA[t.peran]} stroke="#fff" strokeWidth="1.2">
            <title>{t.nama}</title>
          </circle>
        ))}
        {skala && skala.lebar > 0 && (
          <g transform={`translate(12 ${gambar.tinggi - 14})`}>
            <line x1="0" y1="0" x2={skala.lebar} y2="0" stroke="#44546F" strokeWidth="2" />
            <text x="0" y="-4" fontSize="10" fill="#44546F">{skala.meter >= 1000 ? `${skala.meter / 1000} km` : `${skala.meter} m`}</text>
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] font-semibold text-[#55657D]">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.utama }} />Utama {nUtama}</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.cadangan }} />Cadangan {nCad}</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.lain }} />Lainnya</span>
        {gambar.tanpaKoordinat > 0 && <span>{gambar.tanpaKoordinat} KK tanpa koordinat</span>}
        {!gambar.adaBatas && batas.status === "tiada" && <span>{batas.alasan}</span>}
      </figcaption>
    </figure>
  );
}
