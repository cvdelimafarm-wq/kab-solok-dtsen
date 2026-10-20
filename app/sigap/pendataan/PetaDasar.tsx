"use client";

// app/sigap/pendataan/PetaDasar.tsx
//
// (20 Okt 2026) LATAR peta jalan di bawah titik KK (tab Peta Lembar Pendataan). Hanya latar: tidak menerima sentuhan; PetaKk (SVG) tetap yang
// menggeser/mencubit/memilih titik, dan peta ini mengikuti kameranya (lib/petaDasar.ts kameraDariPandang). Dimuat lewat next/dynamic (tanpa SSR)
// supaya pustaka peta (maplibre-gl, pmtiles) tidak membebani halaman lain. Gagal apa pun (tanpa WebGL, berkas hilang, sinyal) -> onStatus("gagal")
// dan halaman kembali ke kanvas titik seperti sebelumnya.

import { useEffect, useRef } from "react";
import type { Map as PetaMl, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Proyeksi } from "@/lib/pendataan";
import { kameraDariPandang, type PandangPeta } from "@/lib/petaDasar";
import { SumberBlob, muatGlyph } from "@/app/portal/petaDasarOffline";

export type SumberDasar = { tipe: "blob"; blob: Blob; nama: string } | { tipe: "online"; url: string };
export type StatusDasar = "memuat" | "siap" | "gagal";

const FONT_BIASA = "Plus Jakarta Sans Regular";
const FONT_TEBAL = "Plus Jakarta Sans Bold";
const BATAS_MUAT_MS = 20_000;
/** Salinan dist/maplibre-gl-worker.mjs; nama memuat versi pustaka. Ganti keduanya bersama bila maplibre-gl dinaikkan (lib/__tests__/petaDasarWorker.test.ts menjaga ini). */
const URL_WORKER = "/peta/maplibre-gl-worker-6.15.0.mjs";

type Props = {
  proj: Proyeksi;
  pandang: PandangPeta;
  sumber: SumberDasar;
  /** alasan: keterangan singkat penyebab "gagal" (ditampilkan kecil di kartu peta supaya mudah dilacak dari tangkapan layar). */
  onStatus: (s: StatusDasar, alasan?: string) => void;
};

export default function PetaDasar({ proj, pandang, sumber, onStatus }: Props) {
  const wadah = useRef<HTMLDivElement>(null);
  const peta = useRef<PetaMl | null>(null);
  const terbaru = useRef({ proj, pandang });
  terbaru.current = { proj, pandang };
  const kabar = useRef(onStatus);
  kabar.current = onStatus;
  const kunciSumber = sumber.tipe === "blob" ? `b:${sumber.nama}:${sumber.blob.size}` : `o:${sumber.url}`;

  function sinkron() {
    const m = peta.current;
    const el = wadah.current;
    if (!m || !el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const k = kameraDariPandang(terbaru.current.proj, terbaru.current.pandang, w, h);
    if (k) m.jumpTo({ center: [k.lng, k.lat], zoom: k.zoom });
  }

  // membuat peta (sekali per sumber)
  useEffect(() => {
    let batal = false;
    let selesai = false;
    let pengamat: ResizeObserver | null = null;
    let penjaga: ReturnType<typeof setTimeout> | null = null;
    let lepas: (() => void) | null = null;
    kabar.current("memuat");

    (async () => {
      try {
        const [modMl, pm, dasar] = await Promise.all([import("maplibre-gl"), import("pmtiles"), import("@protomaps/basemaps")]);
        if (batal || !wadah.current) return;
        // pustaka CommonJS/UMD: bergantung pada pemaket, anggotanya ada di modul itu sendiri atau di .default
        const ml = ((modMl as unknown as { Map?: unknown }).Map ? modMl : (modMl as unknown as { default: typeof modMl }).default) as typeof modMl;
        // (20 Okt 2026) PERBAIKAN peta jalan tidak muncul: maplibre-gl 6 mencari berkas worker-nya dari alamat modulnya sendiri (import.meta.url) dan hanya
        // menerimanya bila berawalan http(s). Setelah dipaketkan Next.js alamat itu bukan http(s), worker tidak ditemukan ("Worker failed to load") dan peta
        // tidak pernah selesai dimuat (20 dtk lalu kembali ke titik). Alamat worker diberikan eksplisit dari /public (salinan persis dist/maplibre-gl-worker.mjs).
        ml.setWorkerUrl(URL_WORKER);

        const protokol = new pm.Protocol();
        ml.addProtocol("pmtiles", protokol.tile);
        ml.addProtocol("sigapg", async (p) => {
          const m = /^sigapg:\/\/(.+)\/(\d+-\d+)\.pbf$/.exec(p.url);
          if (!m) throw new Error("glyph tidak dikenal");
          return { data: await muatGlyph(decodeURIComponent(m[1]), m[2]) };
        });
        const arsip = sumber.tipe === "blob" ? new pm.PMTiles(new SumberBlob(sumber.blob, sumber.nama)) : new pm.PMTiles(sumber.url);
        protokol.add(arsip);
        lepas = () => {
          try {
            ml.removeProtocol("pmtiles");
            ml.removeProtocol("sigapg");
          } catch {
            /* sudah dilepas */
          }
        };

        const flavor = { ...dasar.namedFlavor("light"), regular: FONT_BIASA, bold: FONT_TEBAL, italic: FONT_BIASA };
        const gaya: StyleSpecification = {
          version: 8,
          glyphs: "sigapg://{fontstack}/{range}.pbf",
          sources: { protomaps: { type: "vector", url: `pmtiles://${arsip.source.getKey()}`, attribution: "© OpenStreetMap · Protomaps" } },
          layers: dasar.layers("protomaps", flavor, { lang: "id" }) as StyleSpecification["layers"],
        };

        const k = kameraDariPandang(terbaru.current.proj, terbaru.current.pandang, wadah.current.clientWidth || 360, wadah.current.clientHeight || 440);
        const m = new ml.Map({
          container: wadah.current,
          style: gaya,
          center: k ? [k.lng, k.lat] : [100.6, -0.8],
          zoom: k ? k.zoom : 12,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
          renderWorldCopies: false,
          pixelRatio: Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2),
        });
        peta.current = m;

        // ikon (panah jalan, POI) tidak tersedia tanpa sprite: beri gambar kosong agar teksnya tetap tampil dan tidak ada galat
        m.on("styleimagemissing", (e) => {
          if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
        });
        m.on("error", (e) => {
          // hanya galat sumber ubin sebelum peta siap yang dianggap gagal; huruf/ubin sesekali hilang dibiarkan
          const sid = (e as unknown as { sourceId?: string }).sourceId;
          const pesan = String((e as unknown as { error?: { name?: string; message?: string } }).error?.message ?? "");
          const nama = String((e as unknown as { error?: { name?: string } }).error?.name ?? "");
          if (nama === "AbortError" || /abort/i.test(pesan)) return; // permintaan ubin dibatalkan karena kamera bergeser: bukan kegagalan
          if (/worker/i.test(pesan) && !selesai && !batal) {
            // worker tidak termuat: peta tidak akan pernah siap, jangan menunggu 20 dtk
            selesai = true;
            kabar.current("gagal", `worker: ${pesan}`.slice(0, 90));
            return;
          }
          if (!selesai && sid === "protomaps" && !batal) {
            selesai = true;
            kabar.current("gagal", `ubin: ${pesan || nama || "tak dikenal"}`.slice(0, 90));
          }
        });
        m.once("load", () => {
          if (batal || selesai) return;
          selesai = true;
          if (penjaga) clearTimeout(penjaga);
          sinkron();
          kabar.current("siap");
        });
        penjaga = setTimeout(() => {
          if (!selesai && !batal) {
            selesai = true;
            kabar.current("gagal", `waktu habis ${BATAS_MUAT_MS / 1000} dtk`);
          }
        }, BATAS_MUAT_MS);

        pengamat = new ResizeObserver(() => {
          m.resize();
          sinkron();
        });
        pengamat.observe(wadah.current);
      } catch (err) {
        if (!batal && !selesai) {
          selesai = true;
          kabar.current("gagal", `mulai: ${err instanceof Error ? err.message : String(err)}`.slice(0, 90));
        }
      }
    })();

    return () => {
      batal = true;
      if (penjaga) clearTimeout(penjaga);
      pengamat?.disconnect();
      try {
        peta.current?.remove();
      } catch {
        /* sudah dibuang */
      }
      peta.current = null;
      lepas?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciSumber]);

  // mengikuti kamera SVG
  useEffect(() => {
    sinkron();
  }, [pandang.cx, pandang.cy, pandang.z, proj]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div ref={wadah} className="absolute inset-0" />
      <span className="absolute bottom-1 right-1.5 rounded bg-white/80 px-1 text-[8.5px] font-semibold text-[#3B4558]">© OpenStreetMap · Protomaps</span>
    </div>
  );
}
