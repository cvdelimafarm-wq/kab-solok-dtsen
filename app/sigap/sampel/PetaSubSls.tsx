"use client";

// app/sigap/sampel/PetaSubSls.tsx
//
// (7 Nov 2026) A1b: peta mini satu sub SLS pada kartu "Wilayah saya": garis batas sub SLS (berkas batas kecamatan di /peta/batas, bila ada) dan titik KK master
// (biru = sampel utama, oranye = cadangan, abu = lainnya). Tanpa basemap dan tanpa pustaka peta: SVG ringan yang aman di HP. Bila berkas batas belum ada atau gagal dimuat,
// titik KK tetap digambar dan keterangan singkat ditampilkan. Tidak pernah melempar galat ke kartu induk.
// (8 Nov 2026, E3) Bila berkas peta jalan tim ada (prop kunciDasar), peta jalan menjadi LATAR di bawah SVG yang sama (kamera tetap, tanpa geser/zoom) dan kontrol "Offline"
// seperti di Lembar Pendataan muncul; tanpa berkas, tampilan persis seperti sebelumnya. Hanya satu kartu pada satu waktu yang memegang latar (latarSubSls.ts).

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { JALUR_BATAS, NAMA_MANIFEST_BATAS, bacaBerkasBatas, bacaManifestBatas, type FiturBatas, type ManifestBatas } from "@/lib/batasSubsls";
import { batangSkala, berkasUntukSub, siapkanPetaSub } from "@/lib/petaWilayah";
import type { KkMaster } from "@/lib/alokasiWilayah";
import type { GambarPeta } from "@/lib/petaWilayah";
import type { Proyeksi } from "@/lib/pendataan";
import type { PandangPeta } from "@/lib/petaDasar";
import KontrolPetaDasar from "../pendataan/KontrolPetaDasar";
import { useDasarTim } from "../pendataan/useDasar";
import type { StatusDasar } from "../pendataan/PetaDasar";
import { useGiliranLatar } from "./latarSubSls";

// (8 Nov 2026, E3) latar peta jalan (berkas PMTiles per tim, lib/petaKegiatan.ts); pustaka petanya dimuat hanya bila dipakai
const PetaDasar = dynamic(() => import("../pendataan/PetaDasar"), { ssr: false });

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

export function useBatasSub(idsubsls: string): Muat {
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

/** Kamera tetap: seluruh kanvas (tanpa geser/zoom) */
const pandangTetap = (p: Pick<Proyeksi, "lebar" | "tinggi">): PandangPeta => ({ cx: p.lebar / 2, cy: p.tinggi / 2, z: 1 });

/** Latar peta jalan + kontrolnya; `anak(siap)` menggambar SVG di atasnya (siap = peta jalan sudah tampil, SVG dibuat bening). */
export function LatarSubSls({ kunci, aktif, proj, anak }: { kunci: number; aktif: boolean; proj: Proyeksi; anak: (siap: boolean) => ReactNode }) {
  const dasar = useDasarTim(kunci, aktif);
  const [status, setStatus] = useState<StatusDasar | null>(null);
  const [alasan, setAlasan] = useState<string | null>(null);
  const pandang = useMemo(() => pandangTetap(proj), [proj]);
  const pakai = aktif && dasar.lapisan === "jalan" && !!dasar.sumber && status !== "gagal";
  // sumber berganti (selesai diunduh / sinyal kembali): coba lagi dari awal, jangan terjebak status "gagal" lama
  const kunciSumber = !dasar.sumber ? "" : dasar.sumber.tipe === "blob" ? `b:${dasar.sumber.nama}:${dasar.sumber.blob.size}` : `o:${dasar.sumber.url}`;
  useEffect(() => {
    setStatus(null);
  }, [kunciSumber]);
  return (
    <>
      {pakai && dasar.sumber && <PetaDasar proj={proj} pandang={pandang} sumber={dasar.sumber} onStatus={(s, a) => { setStatus(s); setAlasan(a ?? null); }} />}
      {anak(pakai && status === "siap")}
      {aktif && <KontrolPetaDasar dasar={dasar} status={status} alasan={alasan} />}
    </>
  );
}

/** Peta yang sudah siap digambar (dipisah dari pemuatan batas supaya bisa diuji). */
export function FigurPetaSub({ gambar, keterangan, kunciDasar, idsubsls }: { gambar: GambarPeta; keterangan: string | null; kunciDasar?: number | null; idsubsls: string }) {
  const giliran = useGiliranLatar(idsubsls, kunciDasar != null);
  const skala = batangSkala(gambar.meterPerSatuan);
  const nUtama = gambar.titik.filter((t) => t.peran === "utama").length;
  const nCad = gambar.titik.filter((t) => t.peran === "cadangan").length;
  const svg = (siap: boolean) => (
    <svg viewBox={`0 0 ${gambar.lebar} ${gambar.tinggi}`} className={`absolute inset-0 h-full w-full ${siap ? "bg-transparent" : "bg-[#F4F8FD]"}`} role="img" aria-label={`Peta ${gambar.titik.length} KK`}>
      {gambar.adaBatas && <path d={gambar.jalur} fill="#1F5FD1" fillOpacity="0.07" stroke="#1F5FD1" strokeWidth="1.6" strokeLinejoin="round" fillRule="evenodd" />}
      {gambar.titik.map((t) => (
        <circle key={t.id} cx={t.x} cy={t.y} r={t.peran === "lain" ? 3.2 : 5.5} fill={WARNA[t.peran]} stroke="#fff" strokeWidth="1.2">
          <title>{t.nama}</title>
        </circle>
      ))}
      {skala && skala.lebar > 0 && (
        <g transform={`translate(12 ${gambar.tinggi - 14})`}>
          <line x1="0" y1="0" x2={skala.lebar} y2="0" stroke="#44546F" strokeWidth="2" />
          <text x="0" y="-4" fontSize="10" fill="#44546F" stroke={siap ? "#fff" : "none"} strokeWidth={siap ? 2.5 : 0} paintOrder="stroke">{skala.meter >= 1000 ? `${skala.meter / 1000} km` : `${skala.meter} m`}</text>
        </g>
      )}
    </svg>
  );
  return (
    <figure className="px-3 pb-2 pt-2" aria-label="Peta sub SLS">
      <div className="relative w-full overflow-hidden rounded-[12px] border border-[#DCE5F2] bg-[#F4F8FD]" style={{ aspectRatio: `${gambar.lebar} / ${gambar.tinggi}` }}>
        {kunciDasar != null ? (
          <LatarSubSls kunci={kunciDasar} aktif={giliran.punya} proj={gambar.proyeksi} anak={svg} />
        ) : (
          svg(false)
        )}
        {kunciDasar != null && !giliran.punya && (
          <button type="button" onClick={giliran.ambil} className="absolute left-2 top-2 z-[2] min-h-[32px] rounded-[9px] bg-white px-2.5 text-[11.5px] font-extrabold text-[#1F5FD1] shadow-[0_4px_12px_rgba(15,42,82,.15)] active:bg-[#F1F5FC]">
            Peta jalan di sini
          </button>
        )}
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] font-semibold text-[#55657D]">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.utama }} />Utama {nUtama}</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.cadangan }} />Cadangan {nCad}</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.lain }} />Lainnya</span>
        {gambar.tanpaKoordinat > 0 && <span>{gambar.tanpaKoordinat} KK tanpa koordinat</span>}
        {keterangan && <span>{keterangan}</span>}
      </figcaption>
    </figure>
  );
}

export default function PetaSubSls({ idsubsls, kk, peran, kunciDasar = null }: { idsubsls: string; kk: readonly KkMaster[]; peran: ReadonlyMap<number, "utama" | "cadangan">; /** kunci berkas peta jalan tim ini (lib/petaKegiatan.ts kunciPetaSaya); null = tanpa latar */ kunciDasar?: number | null }) {
  const batas = useBatasSub(idsubsls);
  const gambar = useMemo(() => siapkanPetaSub(batas.status === "ada" ? batas.fitur : null, kk, peran), [batas, kk, peran]);

  if (batas.status === "memuat") return <p className="px-3.5 py-3 text-[12.5px] text-[#55657D]" aria-busy="true">Memuat peta…</p>;
  if (!gambar) return <p className="px-3.5 py-3 text-[12.5px] text-[#55657D]">Belum ada batas wilayah maupun koordinat KK untuk digambar.{batas.status === "tiada" ? ` ${batas.alasan}` : ""}</p>;
  return <FigurPetaSub gambar={gambar} keterangan={!gambar.adaBatas && batas.status === "tiada" ? batas.alasan : null} kunciDasar={kunciDasar} idsubsls={idsubsls} />;
}
