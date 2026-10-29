"use client";

// app/sigap/pendataan/PetaWilayah.tsx
//
// (17 Okt 2026) Tab ke-4 "Wilayah" di Lembar Pendataan -- permintaan user (mockup disetujui): peta Sub SLS dan peta desa/nagari dari berkas peta jadi BPS
// (bucket Storage "peta-wilayah", yang sama dengan menu Identifikasi). Pilihan "Sub SLS" atau "Desa / Nagari" mengikuti Sub SLS yang dibuka di pemilih atas.
// Penampil gambar sendiri: geser 1 jari, cubit 2 jari, ketuk dua kali, tombol +/-, layar penuh.
// HEMAT Log Ingestion & kuota (permintaan user): hanya peta yang sedang dibuka yang ditanyakan ke server dan diunduh -- SEKALI per HP; sesudah itu dibuka dari
// Cache Storage tanpa permintaan jaringan apa pun (app/portal/petaOffline.ts). Tidak ada permintaan database baru; PML dan PPL melihat peta Sub SLS timnya saja
// (daftar Sub SLS berasal dari data tim yang sudah dimuat halaman).

import { useEffect, useRef, useState } from "react";
import { bacaPetaTersimpan, berkasDariManifest, catatManifestKode, tanyaPetaSatu, unduhSimpanPeta, type BerkasM } from "@/app/portal/petaOffline";
import { jagaBatas, ketukDua, kodePeta, zoomDi, type JenisPeta, type Transform } from "@/lib/petaTampil";
import type { SubTim } from "@/lib/pendataan";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";

const T0: Transform = { x: 0, y: 0, k: 1 };

function Penampil({ src, alt }: { src: string; alt: string }) {
  const wadah = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>(T0);
  const tRef = useRef(t);
  tRef.current = t;
  const ptr = useRef(new Map<number, { x: number; y: number }>());
  const cubit = useRef<{ jarak: number; t: Transform; cx: number; cy: number; mx: number; my: number } | null>(null);
  const ketuk = useRef<{ x: number; y: number; at: number; tanpaGeser: boolean } | null>(null);
  const ketukTerakhir = useRef(0);

  useEffect(() => setT(T0), [src]);

  const ukuran = () => {
    const r = wadah.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1, l: r?.left ?? 0, tp: r?.top ?? 0 };
  };

  function turun(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    ptr.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.current.size === 1) ketuk.current = { x: e.clientX, y: e.clientY, at: Date.now(), tanpaGeser: true };
    else ketuk.current = null;
    if (ptr.current.size === 2) {
      const [a, b] = Array.from(ptr.current.values());
      const u = ukuran();
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      cubit.current = { jarak: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), t: tRef.current, cx: mx - u.l, cy: my - u.tp, mx, my };
    }
  }

  function geser(e: React.PointerEvent) {
    const sebelum = ptr.current.get(e.pointerId);
    if (!sebelum) return;
    ptr.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const u = ukuran();
    if (ptr.current.size === 1) {
      if (ketuk.current && Math.hypot(e.clientX - ketuk.current.x, e.clientY - ketuk.current.y) > 8) ketuk.current.tanpaGeser = false;
      setT((s) => jagaBatas({ ...s, x: s.x + (e.clientX - sebelum.x), y: s.y + (e.clientY - sebelum.y) }, u.w, u.h));
    } else if (ptr.current.size === 2 && cubit.current) {
      const [a, b] = Array.from(ptr.current.values());
      const c = cubit.current;
      const jarak = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dasar = zoomDi(c.t, c.t.k * (jarak / c.jarak), c.cx, c.cy, u.w, u.h);
      setT(jagaBatas({ ...dasar, x: dasar.x + (mx - c.mx), y: dasar.y + (my - c.my) }, u.w, u.h));
    }
  }

  function naik(e: React.PointerEvent) {
    ptr.current.delete(e.pointerId);
    if (ptr.current.size < 2) cubit.current = null;
    const k = ketuk.current;
    if (k && k.tanpaGeser && ptr.current.size === 0 && Date.now() - k.at < 280) {
      const u = ukuran();
      if (Date.now() - ketukTerakhir.current < 320) {
        setT((s) => ketukDua(s, e.clientX - u.l, e.clientY - u.tp, u.w, u.h));
        ketukTerakhir.current = 0;
      } else ketukTerakhir.current = Date.now();
    }
    ketuk.current = null;
  }

  function roda(e: React.WheelEvent) {
    const u = ukuran();
    setT((s) => zoomDi(s, s.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX - u.l, e.clientY - u.tp, u.w, u.h));
  }

  function tombol(faktor: number) {
    const u = ukuran();
    setT((s) => zoomDi(s, s.k * faktor, u.w / 2, u.h / 2, u.w, u.h));
  }

  const btn = "grid h-[40px] w-[40px] place-items-center text-[#0F2A52] active:bg-[#F1F5FC]";
  return (
    <div ref={wadah} className="absolute inset-0 touch-none select-none overflow-hidden" onPointerDown={turun} onPointerMove={geser} onPointerUp={naik} onPointerCancel={naik} onWheel={roda}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="h-full w-full select-none object-contain" style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.k})`, transformOrigin: "0 0", willChange: "transform" }} />
      <div className="absolute right-2.5 top-2.5 flex flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_4px_12px_rgba(15,42,82,.15)]" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Perbesar" onClick={() => tombol(1.6)} className={`${btn} border-b border-[#EEF2F7] text-[20px] font-bold`}>
          +
        </button>
        <button type="button" aria-label="Perkecil" onClick={() => tombol(1 / 1.6)} className={`${btn} border-b border-[#EEF2F7] text-[20px] font-bold`}>
          −
        </button>
        <button type="button" aria-label="Tampilkan seluruh peta" onClick={() => setT(T0)} className={btn}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function PetaWilayah({ sub, judulSub, judulNagari, onKePeta, onSubLain }: { sub: SubTim; judulSub: string; judulNagari: string; onKePeta: () => void; onSubLain: () => void }) {
  const [jenis, setJenis] = useState<JenisPeta>("sls");
  const [daftar, setDaftar] = useState<BerkasM[] | null>(null);
  const [lembar, setLembar] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ulang, setUlang] = useState(0);
  const [penuh, setPenuh] = useState(false);
  useTutupDenganBack(penuh, () => setPenuh(false)); // (29 Okt 2026) Back HP menutup layar penuh
  const urlSegar = useRef(new Map<string, string>());
  const kode = kodePeta(jenis, sub.idsubsls);

  // 1) daftar berkas untuk kode ini: dari HP bila sudah pernah dicek, selain itu SATU permintaan ke server
  useEffect(() => {
    let batal = false;
    setDaftar(null);
    setSrc(null);
    setPdfUrl(null);
    setGalat(null);
    setLembar(0);
    urlSegar.current = new Map();
    const dariHp = berkasDariManifest(jenis, kode);
    if (dariHp) {
      setDaftar(dariHp);
      return;
    }
    (async () => {
      try {
        const arr = await tanyaPetaSatu(jenis, kode);
        if (batal) return;
        catatManifestKode(jenis, kode, arr);
        urlSegar.current = new Map(arr.map((b) => [b.nama, b.url]));
        setDaftar(arr);
      } catch (e) {
        if (batal) return;
        const luring = typeof navigator !== "undefined" && navigator.onLine === false;
        setGalat(luring ? "Tidak ada sinyal, dan peta ini belum tersimpan di HP." : e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Peta belum bisa dimuat. Coba lagi.");
      }
    })();
    return () => {
      batal = true;
    };
  }, [jenis, kode, ulang]);

  // 2) isi berkas yang sedang dilihat: dari Cache Storage; bila belum ada, unduh sekali lalu simpan
  useEffect(() => {
    const b = daftar?.[lembar];
    if (!b) return;
    let batal = false;
    let url: string | null = null;
    setSrc(null);
    setPdfUrl(null);
    setGalat(null);
    // tautan bertanda tangan berlaku 1 jam: bila belum ada di memori, tanya server sekali; bila daftar berkasnya sudah berubah (admin mengganti nama berkas), sinkronkan
    const tautan = async (): Promise<string | null | "berubah"> => {
      const ada = urlSegar.current.get(b.nama);
      if (ada) return ada;
      const arr = await tanyaPetaSatu(jenis, kode);
      if (batal) return null;
      catatManifestKode(jenis, kode, arr);
      urlSegar.current = new Map(arr.map((x) => [x.nama, x.url]));
      const baru = arr.find((x) => x.nama === b.nama)?.url;
      if (baru) return baru;
      setDaftar(arr);
      return "berubah";
    };
    (async () => {
      try {
        if (b.tipe === "pdf") {
          const u = await tautan();
          if (!batal && u && u !== "berubah") setPdfUrl(u);
          return;
        }
        let blob = await bacaPetaTersimpan(jenis, b.nama); // null bila belum tersimpan atau sudah lewat 20 hari
        if (!blob) {
          const u = await tautan();
          if (u === "berubah" || batal) return;
          if (u) blob = await unduhSimpanPeta(jenis, { nama: b.nama, url: u });
        }
        if (batal) return;
        if (!blob) {
          setGalat(typeof navigator !== "undefined" && navigator.onLine === false ? "Tidak ada sinyal, dan peta ini belum tersimpan di HP." : "Peta belum bisa diunduh. Coba lagi.");
          return;
        }
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch (e) {
        if (!batal) setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Peta belum bisa dimuat. Coba lagi.");
      }
    })();
    return () => {
      batal = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [daftar, lembar, jenis, kode, ulang]);

  const judul = jenis === "sls" ? `Peta ${judulSub}` : `Peta Nagari ${judulNagari}`;
  const kosong = daftar !== null && daftar.length === 0;
  const memuat = !galat && !kosong && !src && !pdfUrl;
  const seg = (j: JenisPeta, t: string) => (
    <button key={j} type="button" role="tab" aria-selected={jenis === j} onClick={() => setJenis(j)} className={`h-[38px] flex-1 rounded-[9px] text-[13px] font-extrabold ${jenis === j ? "bg-[#0F2A52] text-white" : "text-[#5B6B84]"}`}>
      {t}
    </button>
  );

  return (
    <section className="mx-2.5 mb-3 mt-2.5 flex min-h-[460px] flex-1 flex-col gap-2" aria-label="Peta wilayah">
      <div role="tablist" aria-label="Jenis peta" className="flex gap-[3px] rounded-[12px] bg-white p-[3px] shadow-[0_2px_10px_rgba(15,42,82,.06)]">
        {seg("sls", "Sub SLS")}
        {seg("wa", "Desa / Nagari")}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5">
        <b className="min-w-0 truncate text-[13.5px] text-[#0F2A52]">{judul}</b>
        {daftar && daftar.length > 1 && (
          <span className="ml-auto flex gap-1">
            {daftar.map((b, i) => (
              <button key={b.nama} type="button" onClick={() => setLembar(i)} aria-pressed={lembar === i} className={`h-[28px] rounded-full px-2.5 text-[11.5px] font-extrabold ${lembar === i ? "bg-[#1F5FD1] text-white" : "bg-white text-[#55657D]"}`}>
                Lembar {b.halaman}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className={penuh ? "fixed inset-0 z-[70] bg-white" : "relative min-h-[320px] flex-1 overflow-hidden rounded-[16px] border border-[#DCE5F2] bg-white"}>
        {src && <Penampil src={src} alt={judul} />}
        {memuat && <div className="absolute inset-0 animate-pulse bg-[#EEF2F7]" aria-busy="true" />}
        {kosong && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-[#55657D]">
            <div>
              <b className="mb-1 block text-[14.5px] text-[#0F2A52]">{jenis === "sls" ? "Peta Sub SLS ini belum tersedia" : "Peta nagari ini belum tersedia"}</b>
              Admin belum mengunggah berkasnya. Peta titik KK di tab Peta tetap bisa dipakai.
            </div>
          </div>
        )}
        {pdfUrl && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-full bg-[#E6EEFC] px-5 text-[13.5px] font-extrabold text-[#1F5FD1]">
              Buka peta (PDF)
            </a>
          </div>
        )}
        {galat && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-[#7A1D22]">
            <div>
              <p className="mb-2">{galat}</p>
              <button type="button" onClick={() => setUlang((n) => n + 1)} className="min-h-[40px] rounded-full bg-[#0F2A52] px-4 text-[12.5px] font-extrabold text-white">
                Coba lagi
              </button>
            </div>
          </div>
        )}
        {penuh && (
          <button type="button" onClick={() => setPenuh(false)} className="absolute left-3 top-[max(12px,env(safe-area-inset-top))] z-10 inline-flex min-h-[40px] items-center rounded-full bg-[#0F2A52] px-4 text-[13px] font-extrabold text-white shadow-[0_4px_12px_rgba(15,42,82,.3)]">
            ← Tutup layar penuh
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        <button type="button" disabled={!src} onClick={() => setPenuh(true)} className="min-h-[40px] flex-1 rounded-[11px] bg-white px-2 text-[12px] font-extrabold text-[#1F5FD1] shadow-[0_1px_4px_rgba(15,42,82,.08)] disabled:opacity-45">
          Layar penuh
        </button>
        <button type="button" onClick={onKePeta} className="min-h-[40px] flex-1 rounded-[11px] bg-white px-2 text-[12px] font-extrabold text-[#1F5FD1] shadow-[0_1px_4px_rgba(15,42,82,.08)]">
          Titik KK di Peta
        </button>
        <button type="button" onClick={onSubLain} className="min-h-[40px] flex-1 rounded-[11px] bg-white px-2 text-[12px] font-extrabold text-[#1F5FD1] shadow-[0_1px_4px_rgba(15,42,82,.08)]">
          Sub SLS lain
        </button>
      </div>
    </section>
  );
}
