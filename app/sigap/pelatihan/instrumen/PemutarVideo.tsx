"use client";

// app/sigap/pelatihan/instrumen/PemutarVideo.tsx
//
// (2 Nov 2026) Tahap C: pemutar video YouTube di tab Instrumen dengan pelacakan sebaik mungkin (lib/pelacakVideo.ts + lib/sigapMateri.ts).
// Yang dihitung hanya detik yang benar-benar DIPUTAR (tab terlihat, kecepatan <= 1,25x, geser/lompat tidak dihitung). Progres dikirim tiap ~5 detik dan saat jeda / selesai /
// tab disembunyikan; kiriman gagal dikembalikan ke antrean (tahan koneksi putus). Cadangan: "Saya sudah menonton" (diberi tanda manual di Monitoring).
// Batas yang jujur: ini membuktikan video DIPUTAR, bukan dilihat. Pengelola (bukan peserta) hanya menonton, tanpa pelacakan.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN_O } from "../../admin/ui";
import { ambilLaporan, kembalikan, pelacakBaru, tikPelacak, type Pelacak } from "@/lib/pelacakVideo";
import { LAJU_MAKS } from "@/lib/sigapMateri";

const URL_MATERI = "/api/sigap/pelatihan/materi";
const KIRIM_TIAP_TIK = 5;
const MANUAL_SETELAH_MS = 60_000;

type YTPlayer = { getCurrentTime(): number; getPlayerState(): number; getPlaybackRate(): number; setPlaybackRate(n: number): void; getDuration(): number; destroy(): void };
type YTNamespace = { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let janjiYT: Promise<YTNamespace> | null = null;
function muatYT(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("tanpa jendela"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (janjiYT) return janjiYT;
  janjiYT = new Promise<YTNamespace>((ok, gagal) => {
    const lama = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      lama?.();
      if (window.YT?.Player) ok(window.YT);
      else gagal(new Error("Pemutar YouTube tidak tersedia."));
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      janjiYT = null;
      gagal(new Error("Pemutar YouTube gagal dimuat (periksa koneksi atau pemblokir iklan)."));
    };
    document.head.appendChild(s);
  });
  return janjiYT;
}

export type ProgresVideo = { detik_unik: number; selesai: boolean; manual: boolean };

export default function PemutarVideo({
  materiId, youtubeId, durasi, bisaLapor, selesai, onProgres,
}: {
  materiId: number;
  youtubeId: string;
  durasi: number | null;
  bisaLapor: boolean;
  selesai: boolean;
  onProgres: (p: ProgresVideo, selesaiBaru: boolean) => void;
}) {
  const wadah = useRef<HTMLDivElement>(null);
  const pemutar = useRef<YTPlayer | null>(null);
  const pelacak = useRef<Pelacak>(pelacakBaru());
  const durasiPemutar = useRef<number | null>(durasi);
  const sibuk = useRef(false);
  const tik = useRef(0);
  const onProgresRef = useRef(onProgres);
  onProgresRef.current = onProgres; // supaya pemutar tidak dibuat ulang bila induk menggambar ulang
  const lacak = bisaLapor && !selesai;
  const lacakRef = useRef(lacak);
  lacakRef.current = lacak;
  const [galatPemutar, setGalatPemutar] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  const [boleh, setBoleh] = useState(false); // tombol cadangan tampil
  const [info, setInfo] = useState<string | null>(null);
  const [sibukManual, setSibukManual] = useState(false);

  const kirim = useCallback(
    async (paksa: boolean) => {
      if (!lacakRef.current || sibuk.current) return;
      const { kirim: bagian, sisa } = ambilLaporan(pelacak.current, paksa);
      if (bagian.length === 0) return;
      pelacak.current = sisa;
      sibuk.current = true;
      try {
        const r = await fetchJson<{ progres: ProgresVideo; selesai_baru: boolean }>(URL_MATERI, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aksi: "lapor", materi_id: materiId, segmen: bagian, durasi: durasiPemutar.current ?? undefined }),
        });
        onProgresRef.current(r.progres, !!r.selesai_baru);
      } catch (e) {
        if (!(e instanceof SesiBerakhir)) pelacak.current = kembalikan(pelacak.current, bagian); // kirim ulang pada tik berikutnya
      } finally {
        sibuk.current = false;
      }
    },
    [materiId]
  );

  useEffect(() => {
    let batal = false;
    let waktu: ReturnType<typeof setInterval> | null = null;
    const mulai = Date.now();
    muatYT()
      .then((YT) => {
        if (batal || !wadah.current) return;
        const el = document.createElement("div");
        wadah.current.appendChild(el);
        pemutar.current = new YT.Player(el, {
          videoId: youtubeId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: () => {
              const d = Math.round(pemutar.current?.getDuration() ?? 0);
              if (d >= 5) durasiPemutar.current = durasiPemutar.current ?? d;
              setSiap(true);
            },
            onStateChange: (e: { data: number }) => {
              // 0 = selesai, 2 = jeda
              if (e.data === 0 || e.data === 2) {
                if (pemutar.current) pelacak.current = tikPelacak(pelacak.current, pemutar.current.getCurrentTime(), false, true, 1);
                void kirim(true);
              }
            },
            onError: () => {
              setGalatPemutar("Video tidak dapat diputar di sini (mungkin dihapus, pribadi, atau diblokir).");
              setBoleh(true);
            },
          },
        });
        waktu = setInterval(() => {
          const p = pemutar.current;
          if (!p || !lacakRef.current) return;
          let laju = 1;
          try {
            laju = p.getPlaybackRate();
            if (laju > LAJU_MAKS + 0.001) p.setPlaybackRate(LAJU_MAKS); // kecepatan dibatasi; sampai berubah, bagian ini tidak dihitung
            pelacak.current = tikPelacak(pelacak.current, p.getCurrentTime(), p.getPlayerState() === 1, document.visibilityState === "visible", laju);
          } catch {
            return;
          }
          tik.current += 1;
          if (Date.now() - mulai > MANUAL_SETELAH_MS) setBoleh(true);
          if (tik.current % KIRIM_TIAP_TIK === 0 || pelacak.current.tunda.length > 0) void kirim(false);
        }, 1000);
      })
      .catch((e) => {
        if (!batal) {
          setGalatPemutar(e instanceof Error ? e.message : "Pemutar gagal dimuat.");
          setBoleh(true);
        }
      });
    const saatTersembunyi = () => {
      if (document.visibilityState !== "hidden") return;
      if (pemutar.current) pelacak.current = tikPelacak(pelacak.current, pemutar.current.getCurrentTime(), false, false, 1);
      void kirim(true);
    };
    document.addEventListener("visibilitychange", saatTersembunyi);
    return () => {
      batal = true;
      if (waktu) clearInterval(waktu);
      document.removeEventListener("visibilitychange", saatTersembunyi);
      if (pemutar.current) pelacak.current = tikPelacak(pelacak.current, pemutar.current.getCurrentTime(), false, true, 1);
      void kirim(true);
      try {
        pemutar.current?.destroy();
      } catch {
        /* abaikan */
      }
      pemutar.current = null;
    };
  }, [youtubeId, kirim]);

  async function tandaiManual() {
    if (!window.confirm("Tandai video ini sudah ditonton? Ini TIDAK terbukti oleh sistem dan akan diberi tanda manual di Monitoring.")) return;
    setSibukManual(true);
    setInfo(null);
    try {
      const r = await fetchJson<{ progres: ProgresVideo }>(URL_MATERI, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "manual", materi_id: materiId }) });
      onProgresRef.current(r.progres, true);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setInfo(pesanGalat(e));
    } finally {
      setSibukManual(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full" ref={wadah} />
      {!siap && !galatPemutar && <p className="mt-1 text-[12px] text-[#6B7A90]">Memuat pemutar…</p>}
      {galatPemutar && <p className="mt-1 text-[12px] text-[#B42318]">{galatPemutar}</p>}
      {lacak && !galatPemutar && <p className="mt-1 text-[11.5px] leading-snug text-[#6B7A90]">Tonton sampai habis dengan kecepatan normal. Bagian yang dilompati tidak dihitung; berpindah aplikasi menghentikan hitungan.</p>}
      {lacak && boleh && (
        <div className="mt-2">
          <button type="button" className={BTN_O} disabled={sibukManual} onClick={tandaiManual}>
            {sibukManual ? "Menyimpan…" : "Pemutar bermasalah? Saya sudah menonton"}
          </button>
        </div>
      )}
      {info && <p className="mt-1 text-[12px] text-[#B42318]">{info}</p>}
    </div>
  );
}
