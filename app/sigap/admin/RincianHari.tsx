"use client";

// app/sigap/admin/RincianHari.tsx
//
// (27 Okt 2026) Permintaan M. Iqbal Hadi: pada Tabel monitoring petugas (tab Administrasi & SPJ, Kelola Pendataan), bila tanggal hari kerja
// petugas diketuk, muncul laporan dan dokumentasi petugas hari itu; foto bisa diketuk untuk dilihat besar dan di-zoom.
//  - Jendela "Rincian hari": lembar dari bawah di HP, jendela tengah di layar lebar. Panah ‹ › pindah ke hari kerja petugas sebelum/sesudahnya
//    (tanpa menutup jendela). Isi: ringkasan kelengkapan, laporan (jumlah, lokasi, kendala), dokumentasi nomor 1..n.
//  - Penampil foto: layar penuh; cubit dua jari, ketuk dua kali, roda mouse, atau tombol +/− untuk zoom; geser untuk menggeser foto yang
//    diperbesar; geser ke samping (belum diperbesar) atau panah untuk pindah foto; deret mini di bawah.
//  - Data dari GET /api/sigap/admin?bagian=hari (hanya baca). Perhitungan murni: lib/sigapRincianHari.ts (ber-tes).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ambil, pesanGalat, SesiBerakhir, tglPanjang, waktuWib } from "./api";
import { BTN, BTN_O, Chip } from "./ui";
import { WARNA_NADA_PERIKSA, statusPemeriksaan, type Kepercayaan } from "@/lib/sigapFoto";
import {
  ZOOM_KETUK_DUA,
  ZOOM_MAKS,
  arahGeserFoto,
  batasiGeser,
  batasiZoom,
  hariTetangga,
  jamDariIso,
  jarakDuaTitik,
  kelengkapanHari,
  kelompokLokasi,
  susunSlotFoto,
  titikTengah,
  zoomKeTitik,
  type LokasiLaporan,
  type Titik,
} from "@/lib/sigapRincianHari";

export type PetugasRincian = { penugasan_id: number; nama: string; peran: string };

type FotoHari = {
  slot: number;
  url: string | null;
  foto_id: number | null;
  sumber: string | null;
  susulan: boolean;
  diunggah_at: string | null;
  kode: string | null;
  diambil_at: string | null;
  lokasi_teks: string | null;
  kepercayaan: string | null;
  status_periksa: string | null;
};
type Rincian = {
  penugasan_id: number;
  nama: string;
  peran: string;
  tanggal: string;
  hari_kerja: boolean;
  kegiatan: { nama: string; jenis: string | null; satuan: string; wajib_laporan: boolean; jumlah_foto: number };
  laporan: { lokasi: LokasiLaporan[]; jumlah: number; kendala: string | null; diperbarui_at: string | null } | null;
  foto: FotoHari[];
};

// ------------------------------------------------------------------ data (cache singkat supaya pindah hari terasa instan)
const SIMPAN = new Map<string, { t: number; d: Rincian }>();
const UMUR_SIMPAN_MS = 90_000; // singkat: isian petugas bisa berubah; URL foto berlaku 1 jam
async function ambilRincian(kegiatanId: number, penugasanId: number, tanggal: string, paksa = false): Promise<Rincian> {
  const kunci = `${kegiatanId}|${penugasanId}|${tanggal}`;
  const ada = SIMPAN.get(kunci);
  if (!paksa && ada && Date.now() - ada.t < UMUR_SIMPAN_MS) return ada.d;
  const d = await ambil<Rincian>("hari", { kegiatan_id: kegiatanId, penugasan_id: penugasanId, tanggal });
  SIMPAN.set(kunci, { t: Date.now(), d });
  return d;
}

const STATUS_HARI: Record<string, { teks: string; w: "ok" | "wait" | "bad" | "mut" }> = {
  lengkap: { teks: "Lengkap", w: "ok" },
  sebagian: { teks: "Belum lengkap", w: "wait" },
  terlewat: { teks: "Terlewat", w: "bad" },
  rencana: { teks: "Rencana", w: "mut" },
};

const KERANGKA_ANIMASI = `
@keyframes rincianMasuk{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.rincian-masuk{animation:rincianMasuk .26s ease-out both}
@media (prefers-reduced-motion:reduce){.rincian-masuk{animation:none}}
`;

function kunciGulir() {
  const lama = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = lama;
  };
}

// ------------------------------------------------------------------ ikon kecil
function Ikon({ d, kelas = "h-4 w-4" }: { d: string; kelas?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={kelas} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
const IKON = {
  tutup: "M6 6l12 12M18 6L6 18",
  kiri: "M15 5l-7 7 7 7",
  kanan: "M9 5l7 7-7 7",
  tambah: "M12 5v14M5 12h14",
  kurang: "M5 12h14",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  kamera: "M4 8h3l1.6-2.4h6.8L17 8h3v11H4V8zM12 16.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z",
  catatan: "M6 3h9l4 4v14H6V3zM14 3v5h5M9 13h7M9 17h7",
  jam: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
};

// ------------------------------------------------------------------ penampil foto layar penuh
type ItemFoto = { slot: number; label: string; url: string; jam: string; f: FotoHari };

function PenampilFoto({ daftar, awal, judulBawah, onTutup }: { daftar: ItemFoto[]; awal: number; judulBawah: string; onTutup: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(0, awal), daftar.length - 1));
  const [skala, setSkala] = useState(1);
  const [geser, setGeser] = useState<Titik>({ x: 0, y: 0 });
  const [tarikX, setTarikX] = useState(0);
  const [aktif, setAktif] = useState(false);
  const [rusak, setRusak] = useState<Record<number, boolean>>({});
  const [petunjuk, setPetunjuk] = useState(true);
  const layarRef = useRef<HTMLDivElement>(null);
  const gambarRef = useRef<HTMLImageElement>(null);
  const ptr = useRef(new Map<number, Titik>());
  const cubit = useRef<{ jarak: number; skala: number; geser: Titik; tengah: Titik } | null>(null);
  const satu = useRef<{ x: number; y: number; gx: number; gy: number; t: number } | null>(null);
  const banyakJari = useRef(false);
  const ketukTerakhir = useRef<{ t: number; x: number; y: number } | null>(null);
  // nilai terkini untuk pendengar papan ketik
  const skalaRef = useRef(skala);
  skalaRef.current = skala;
  const geserRef = useRef(geser);
  geserRef.current = geser;

  const item = daftar[i];

  useEffect(kunciGulir, []);
  useEffect(() => {
    const id = setTimeout(() => setPetunjuk(false), 4500);
    return () => clearTimeout(id);
  }, []);

  const ukur = useCallback(() => {
    const l = layarRef.current;
    const g = gambarRef.current;
    return { foto: { w: g?.offsetWidth ?? 0, h: g?.offsetHeight ?? 0 }, layar: { w: l?.clientWidth ?? 0, h: l?.clientHeight ?? 0 } };
  }, []);
  const relatif = useCallback((cx: number, cy: number): Titik => {
    const r = layarRef.current?.getBoundingClientRect();
    return r ? { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) } : { x: 0, y: 0 };
  }, []);

  const setel = useCallback(
    (s: number, g: Titik) => {
      const sb = batasiZoom(s);
      const u = ukur();
      setSkala(sb);
      setGeser(sb <= 1.001 ? { x: 0, y: 0 } : batasiGeser(g, sb, u.foto, u.layar));
    },
    [ukur]
  );
  const ubahZoom = useCallback(
    (faktor: number, titik: Titik = { x: 0, y: 0 }) => {
      const lama = skalaRef.current;
      const baru = batasiZoom(lama * faktor);
      setel(baru, zoomKeTitik(lama, baru, titik, geserRef.current));
    },
    [setel]
  );
  const pulihkan = useCallback(() => {
    setSkala(1);
    setGeser({ x: 0, y: 0 });
    setTarikX(0);
  }, []);
  const pindah = useCallback(
    (arah: -1 | 1) => {
      setI((x) => {
        const n = Math.min(daftar.length - 1, Math.max(0, x + arah));
        return n;
      });
      pulihkan();
    },
    [daftar.length, pulihkan]
  );
  const lompat = useCallback(
    (n: number) => {
      setI(n);
      pulihkan();
    },
    [pulihkan]
  );

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
      else if (e.key === "ArrowLeft") pindah(-1);
      else if (e.key === "ArrowRight") pindah(1);
      else if (e.key === "+" || e.key === "=") ubahZoom(1.4);
      else if (e.key === "-" || e.key === "_") ubahZoom(1 / 1.4);
      else if (e.key === "0") pulihkan();
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [onTutup, pindah, ubahZoom, pulihkan]);

  function turun(e: React.PointerEvent) {
    // tombol panah di atas foto harus tetap bisa diketuk (jangan ditangkap sebagai gestur foto)
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ptr.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setPetunjuk(false);
    setAktif(true);
    if (ptr.current.size === 1) {
      banyakJari.current = false;
      satu.current = { x: e.clientX, y: e.clientY, gx: geserRef.current.x, gy: geserRef.current.y, t: Date.now() };
    } else if (ptr.current.size === 2) {
      banyakJari.current = true;
      satu.current = null;
      const [a, b] = Array.from(ptr.current.values());
      cubit.current = { jarak: Math.max(1, jarakDuaTitik(a, b)), skala: skalaRef.current, geser: geserRef.current, tengah: relatif(titikTengah(a, b).x, titikTengah(a, b).y) };
    }
  }
  function gerak(e: React.PointerEvent) {
    if (!ptr.current.has(e.pointerId)) return;
    ptr.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.current.size >= 2 && cubit.current) {
      const [a, b] = Array.from(ptr.current.values());
      const c = cubit.current;
      const baru = batasiZoom((c.skala * jarakDuaTitik(a, b)) / c.jarak);
      const t = titikTengah(a, b);
      const sekarang = relatif(t.x, t.y);
      const dasar = zoomKeTitik(c.skala, baru, c.tengah, c.geser);
      setel(baru, { x: dasar.x + (sekarang.x - c.tengah.x), y: dasar.y + (sekarang.y - c.tengah.y) });
      return;
    }
    const s = satu.current;
    if (!s || banyakJari.current) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (skalaRef.current > 1.001) setel(skalaRef.current, { x: s.gx + dx, y: s.gy + dy });
    else if (Math.abs(dx) > Math.abs(dy)) setTarikX(dx * 0.7);
  }
  function angkat(e: React.PointerEvent) {
    if (!ptr.current.has(e.pointerId)) return;
    const s = satu.current;
    ptr.current.delete(e.pointerId);
    if (ptr.current.size >= 1) {
      // dari dua jari tinggal satu: lanjut menggeser tanpa melompat
      if (ptr.current.size === 1 && cubit.current) {
        const sisa = Array.from(ptr.current.values())[0];
        cubit.current = null;
        satu.current = { x: sisa.x, y: sisa.y, gx: geserRef.current.x, gy: geserRef.current.y, t: Date.now() };
      }
      return;
    }
    setAktif(false);
    cubit.current = null;
    satu.current = null;
    if (skalaRef.current < 1.02) pulihkan();
    if (banyakJari.current || !s) {
      banyakJari.current = false;
      setTarikX(0);
      return;
    }
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const jauh = Math.hypot(dx, dy);
    if (jauh < 10 && Date.now() - s.t < 350) {
      setTarikX(0);
      const k = ketukTerakhir.current;
      const sekarang = Date.now();
      if (k && sekarang - k.t < 320 && Math.hypot(e.clientX - k.x, e.clientY - k.y) < 32) {
        ketukTerakhir.current = null;
        if (skalaRef.current > 1.05) pulihkan();
        else {
          const baru = ZOOM_KETUK_DUA;
          setel(baru, zoomKeTitik(1, baru, relatif(e.clientX, e.clientY), { x: 0, y: 0 }));
        }
      } else ketukTerakhir.current = { t: sekarang, x: e.clientX, y: e.clientY };
      return;
    }
    const arah = arahGeserFoto(dx, dy, skalaRef.current);
    setTarikX(0);
    if (arah !== 0) pindah(arah);
  }
  function roda(e: React.WheelEvent) {
    ubahZoom(Math.exp(-e.deltaY * 0.0022), relatif(e.clientX, e.clientY));
  }

  if (!item) return null;
  const f = item.f;
  const periksa = statusPemeriksaan(((f.kepercayaan as Kepercayaan | null) ?? "hijau") as Kepercayaan, f.status_periksa);
  const adaSebelum = i > 0;
  const adaSesudah = i < daftar.length - 1;
  const panah = "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 disabled:opacity-0 sm:flex";
  const tombolZoom = "flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:bg-white/30 disabled:opacity-35";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Foto ${item.slot}, ${item.label}`} className="fixed inset-0 z-[110] flex flex-col bg-black text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* bilah atas */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-8" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
        <button type="button" onClick={onTutup} aria-label="Tutup foto" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25">
          <Ikon d={IKON.tutup} kelas="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate text-[15px] font-extrabold">
            Foto {item.slot} · {item.label}
          </div>
          <div className="truncate text-[12px] text-white/70">{judulBawah}</div>
        </div>
        <span className="mt-1 shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-bold tabular-nums">
          {i + 1} / {daftar.length}
        </span>
      </div>

      {/* area foto */}
      <div
        ref={layarRef}
        className="relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden"
        onPointerDown={turun}
        onPointerMove={gerak}
        onPointerUp={angkat}
        onPointerCancel={angkat}
        onWheel={roda}
        style={{ cursor: skala > 1.001 ? (aktif ? "grabbing" : "grab") : "zoom-in" }}
      >
        {rusak[item.slot] ? (
          <div className="px-6 text-center text-[14px] text-white/80">Foto belum termuat. Tutup lalu buka lagi, atau muat ulang halaman.</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.url}
            ref={gambarRef}
            src={item.url}
            alt={`Foto ${item.slot} ${item.label}`}
            draggable={false}
            onError={() => setRusak((r) => ({ ...r, [item.slot]: true }))}
            className="pointer-events-none max-h-full max-w-full object-contain will-change-transform"
            style={{
              transform: `translate3d(${geser.x + (skala <= 1.001 ? tarikX : 0)}px, ${geser.y}px, 0) scale(${skala})`,
              transition: aktif || tarikX !== 0 ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)",
            }}
          />
        )}
        <button type="button" onClick={() => pindah(-1)} disabled={!adaSebelum} aria-label="Foto sebelumnya" className={`${panah} left-3`}>
          <Ikon d={IKON.kiri} kelas="h-5 w-5" />
        </button>
        <button type="button" onClick={() => pindah(1)} disabled={!adaSesudah} aria-label="Foto berikutnya" className={`${panah} right-3`}>
          <Ikon d={IKON.kanan} kelas="h-5 w-5" />
        </button>
        {petunjuk && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white/90 backdrop-blur">Cubit atau ketuk dua kali untuk memperbesar · geser untuk pindah foto</span>
          </div>
        )}
      </div>

      {/* bilah bawah: keterangan + kendali zoom + deret mini */}
      <div className="z-20 bg-gradient-to-t from-black via-black/90 to-black/60 px-3 pt-3" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
          <span className="inline-flex items-center gap-1 font-bold">
            <Ikon d={IKON.jam} kelas="h-3.5 w-3.5" /> {item.jam} WIB
          </span>
          <span className="inline-flex items-center gap-1 text-white/80">
            <Ikon d={IKON.kamera} kelas="h-3.5 w-3.5" /> {f.foto_id ? "Kamera SIGAP" : "Unggah manual"}
            {f.susulan ? " · susulan" : ""}
          </span>
          {f.foto_id && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${WARNA_NADA_PERIKSA[periksa.nada]}33`, color: "#fff", border: `1px solid ${WARNA_NADA_PERIKSA[periksa.nada]}` }}>
              {periksa.label}
            </span>
          )}
          {f.kode && <span className="font-mono text-[11px] text-white/55">{f.kode}</span>}
        </div>
        {f.lokasi_teks && (
          <div className="mt-1 flex items-start gap-1 text-[12px] leading-snug text-white/75">
            <Ikon d={IKON.pin} kelas="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-line">{f.lokasi_teks}</span>
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5" role="tablist" aria-label="Pilih foto">
            {daftar.map((d, n) => (
              <button
                key={d.slot}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={`Foto ${d.slot}, ${d.label}`}
                onClick={() => lompat(n)}
                className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${n === i ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.url} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                <span className="absolute bottom-0 left-0 rounded-tr-md bg-black/70 px-1 text-[10px] font-bold leading-4">{d.slot}</span>
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => ubahZoom(1 / 1.5)} disabled={skala <= 1.001} aria-label="Perkecil" className={tombolZoom}>
              <Ikon d={IKON.kurang} kelas="h-5 w-5" />
            </button>
            <button type="button" onClick={pulihkan} disabled={skala <= 1.001} aria-label="Ukuran asli" className="h-10 min-w-[3.4rem] rounded-full bg-white/15 px-2 text-[12px] font-bold tabular-nums transition hover:bg-white/25 disabled:opacity-60">
              {Math.round(skala * 100)}%
            </button>
            <button type="button" onClick={() => ubahZoom(1.5)} disabled={skala >= ZOOM_MAKS - 0.01} aria-label="Perbesar" className={tombolZoom}>
              <Ikon d={IKON.tambah} kelas="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ------------------------------------------------------------------ jendela rincian
function Kerangka() {
  return (
    <div className="space-y-3" aria-label="Memuat rincian" aria-busy="true">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-[62px] animate-pulse rounded-xl bg-[#E6ECF5]" />
        ))}
      </div>
      <div className="h-36 animate-pulse rounded-xl bg-[#E6ECF5]" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {[0, 1, 2].map((n) => (
          <div key={n} className="aspect-[4/3] animate-pulse rounded-xl bg-[#E6ECF5]" />
        ))}
      </div>
    </div>
  );
}

function Ringkasan({ judul, nilai, ket, nada }: { judul: string; nilai: React.ReactNode; ket?: React.ReactNode; nada: "ok" | "kurang" | "netral" }) {
  const warna = nada === "ok" ? "text-[#13794B]" : nada === "kurang" ? "text-[#B42329]" : "text-[#5B6B84]";
  const garis = nada === "ok" ? "border-t-[#13794B]" : nada === "kurang" ? "border-t-[#B42329]" : "border-t-[#CBD6E6]";
  return (
    <div className={`rounded-xl border border-[#DDE6F3] border-t-[3px] bg-white px-3 py-2 ${garis}`}>
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#7B8794]">{judul}</div>
      <div className={`mt-0.5 text-[15px] font-extrabold leading-tight ${warna}`}>{nilai}</div>
      {ket && <div className="text-[11px] leading-tight text-[#7B8794]">{ket}</div>}
    </div>
  );
}

function KartuBagian({ ikon, judul, kanan, children }: { ikon: string; judul: string; kanan?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#DDE6F3] bg-white">
      <header className="flex items-center gap-2 border-b border-[#EDF0F4] px-3.5 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E6EEFC] text-[#1F5FD1]">
          <Ikon d={ikon} kelas="h-4 w-4" />
        </span>
        <h3 className="flex-1 text-[13.5px] font-extrabold text-[#1B2B4B]">{judul}</h3>
        {kanan}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export default function RincianHari({
  kegiatanId,
  petugas,
  tanggal,
  daftarTanggal,
  status,
  izin,
  bolehIzin,
  onPindah,
  onIzin,
  onTutup,
}: {
  kegiatanId: number;
  petugas: PetugasRincian;
  tanggal: string;
  /** semua hari kerja petugas (untuk panah sebelum/sesudah) */
  daftarTanggal: string[];
  status: Record<string, string>;
  izin: string[];
  bolehIzin: boolean;
  onPindah: (t: string) => void;
  onIzin: (t: string) => void;
  onTutup: () => void;
}) {
  const [data, setData] = useState<Rincian | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tampil, setTampil] = useState(false);
  const [foto, setFoto] = useState<number | null>(null); // indeks di daftar foto bergambar
  const [rusak, setRusak] = useState<Record<string, boolean>>({});
  const fotoBuka = foto !== null;
  const tutupRef = useRef<HTMLButtonElement>(null);

  useEffect(kunciGulir, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => setTampil(true));
    tutupRef.current?.focus();
    return () => cancelAnimationFrame(id);
  }, []);

  const tutup = useCallback(() => {
    setTampil(false);
    setTimeout(onTutup, 170);
  }, [onTutup]);

  const tetangga = useMemo(() => hariTetangga(daftarTanggal, tanggal), [daftarTanggal, tanggal]);

  const muat = useCallback(
    async (paksa = false) => {
      setGalat(null);
      try {
        const d = await ambilRincian(kegiatanId, petugas.penugasan_id, tanggal, paksa);
        setData(d);
      } catch (e) {
        if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      }
    },
    [kegiatanId, petugas.penugasan_id, tanggal]
  );
  useEffect(() => {
    setData(null);
    setRusak({});
    setFoto(null);
    void muat();
  }, [muat]);
  // hangatkan hari tetangga supaya pindah hari terasa instan (gagal diam-diam)
  useEffect(() => {
    if (!data) return;
    for (const t of [tetangga.sebelum, tetangga.sesudah]) if (t) ambilRincian(kegiatanId, petugas.penugasan_id, t).catch(() => undefined);
  }, [data, tetangga.sebelum, tetangga.sesudah, kegiatanId, petugas.penugasan_id]);

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (fotoBuka) return; // penampil foto menangani papan ketik sendiri
      if (e.key === "Escape") tutup();
      else if (e.key === "ArrowLeft" && tetangga.sebelum) onPindah(tetangga.sebelum);
      else if (e.key === "ArrowRight" && tetangga.sesudah) onPindah(tetangga.sesudah);
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [fotoBuka, tutup, tetangga.sebelum, tetangga.sesudah, onPindah]);

  const slotFoto = useMemo(() => (data ? susunSlotFoto(data.foto, data.kegiatan.jumlah_foto, data.kegiatan.jenis) : []), [data]);
  const bergambar = useMemo<ItemFoto[]>(
    () =>
      slotFoto
        .filter((s) => s.foto?.url)
        .map((s) => ({ slot: s.slot, label: s.label, url: s.foto!.url!, jam: jamDariIso(s.foto!.diambil_at ?? s.foto!.diunggah_at), f: s.foto! })),
    [slotFoto]
  );
  const lengkap = data
    ? kelengkapanHari({ adaLaporan: !!data.laporan, wajibLaporan: data.kegiatan.wajib_laporan, nFoto: data.foto.length, wajibFoto: data.kegiatan.jumlah_foto })
    : null;
  const st = STATUS_HARI[status[tanggal] ?? ""];
  const adaIzin = izin.includes(tanggal);
  const lokasi = useMemo(() => kelompokLokasi(data?.laporan?.lokasi), [data]);
  const idJudul = "rincian-hari-judul";
  const terlewatTanpaIzin = status[tanggal] === "terlewat" && !adaIzin;

  return createPortal(
    <>
      <style>{KERANGKA_ANIMASI}</style>
      <div
        role="presentation"
        onClick={tutup}
        className={`fixed inset-0 z-[100] flex items-end justify-center bg-[#0B1B33]/60 backdrop-blur-[2px] transition-opacity duration-200 sm:items-center sm:p-4 ${tampil ? "opacity-100" : "opacity-0"}`}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={idJudul}
          onClick={(e) => e.stopPropagation()}
          className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#F5F8FE] shadow-2xl transition duration-300 ease-out sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl ${tampil ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
        >
          {/* kepala */}
          <div className="bg-gradient-to-br from-[#0E2A47] to-[#1B3F73] px-4 pb-3 pt-3 text-white">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#F2C46B]">Rincian hari kerja</div>
                <h2 id={idJudul} className="mt-0.5 truncate text-[18px] font-extrabold leading-tight">
                  {petugas.nama}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-white/80">
                  <span className="rounded-md bg-white/15 px-1.5 py-0.5 font-bold text-white">{petugas.peran.toUpperCase()}</span>
                  {data?.kegiatan.nama && <span className="truncate">{data.kegiatan.nama}</span>}
                </div>
              </div>
              <button ref={tutupRef} type="button" onClick={tutup} aria-label="Tutup rincian" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25">
                <Ikon d={IKON.tutup} kelas="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 p-1.5">
              <button
                type="button"
                onClick={() => tetangga.sebelum && onPindah(tetangga.sebelum)}
                disabled={!tetangga.sebelum}
                aria-label="Hari kerja sebelumnya"
                title={tetangga.sebelum ? tglPanjang(tetangga.sebelum) : undefined}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
              >
                <Ikon d={IKON.kiri} kelas="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <div className="truncate text-[14px] font-extrabold">{tglPanjang(tanggal)}</div>
                <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-white/75">
                  {tetangga.nomor > 0 && (
                    <span>
                      Hari kerja ke-{tetangga.nomor} dari {tetangga.total}
                    </span>
                  )}
                  {st && <Chip w={st.w}>{st.teks}</Chip>}
                  {adaIzin && <Chip w="vio">izin susulan</Chip>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => tetangga.sesudah && onPindah(tetangga.sesudah)}
                disabled={!tetangga.sesudah}
                aria-label="Hari kerja berikutnya"
                title={tetangga.sesudah ? tglPanjang(tetangga.sesudah) : undefined}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
              >
                <Ikon d={IKON.kanan} kelas="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* isi */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3.5" style={{ paddingBottom: terlewatTanpaIzin && bolehIzin ? undefined : "max(14px, env(safe-area-inset-bottom))" }}>
            {galat ? (
              <div role="alert" className="rounded-xl border border-[#F0C4BF] bg-white p-4 text-center">
                <p className="text-[13px] font-semibold text-[#7A1D22]">{galat}</p>
                <button type="button" onClick={() => void muat(true)} className={`${BTN} mt-3`}>
                  Coba lagi
                </button>
              </div>
            ) : !data || !lengkap ? (
              <Kerangka />
            ) : (
              <div key={`${data.penugasan_id}|${data.tanggal}`} className="rincian-masuk space-y-3">
                {!data.hari_kerja && (
                  <div className="rounded-lg border border-[#F4D58A] bg-[#FFF8E5] px-3 py-2 text-[12px] text-[#6B4C00]">Tanggal ini bukan (atau tidak lagi) hari kerja petugas, tetapi data yang tercatat tetap ditampilkan.</div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Ringkasan
                    judul="Laporan"
                    nilai={lengkap.laporan === "tidak_wajib" ? "Tidak wajib" : lengkap.laporan === "ok" ? "Ada" : "Belum ada"}
                    ket={lengkap.laporan === "ok" && data.laporan ? `${data.laporan.jumlah} ${data.kegiatan.satuan}`.trim() : undefined}
                    nada={lengkap.laporan === "ok" ? "ok" : lengkap.laporan === "kurang" ? "kurang" : "netral"}
                  />
                  <Ringkasan
                    judul="Foto"
                    nilai={`${lengkap.nFoto} / ${lengkap.wajibFoto}`}
                    ket={lengkap.foto === "ok" ? "cukup" : `kurang ${lengkap.kurangFoto}`}
                    nada={lengkap.foto === "ok" ? "ok" : "kurang"}
                  />
                  <Ringkasan
                    judul="Status"
                    nilai={st ? st.teks : "–"}
                    ket={adaIzin ? "izin susulan aktif" : undefined}
                    nada={status[tanggal] === "lengkap" ? "ok" : status[tanggal] === "terlewat" ? "kurang" : "netral"}
                  />
                </div>

                <KartuBagian ikon={IKON.catatan} judul="Laporan harian" kanan={data.laporan?.diperbarui_at ? <span className="text-[11px] text-[#7B8794]">diperbarui {waktuWib(data.laporan.diperbarui_at)}</span> : undefined}>
                  {!data.kegiatan.wajib_laporan && !data.laporan ? (
                    <p className="text-[12.5px] text-[#7B8794]">Kegiatan ini tidak memerlukan laporan harian; cukup dokumentasi foto.</p>
                  ) : !data.laporan ? (
                    <div className="flex items-center gap-3 rounded-lg border border-dashed border-[#CBD6E6] bg-[#F8FAFC] px-3 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2F7] text-[#7B8794]">
                        <Ikon d={IKON.catatan} kelas="h-[18px] w-[18px]" />
                      </span>
                      <div className="text-[12.5px] leading-snug text-[#4D5B6B]">
                        <b className="text-[#1B2B4B]">Belum ada laporan.</b> Petugas belum mengisi jumlah {data.kegiatan.satuan || "realisasi"}, lokasi, dan kendala untuk hari ini.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-end gap-2">
                        <span className="text-[34px] font-extrabold leading-none tabular-nums text-[#0E2A47]">{data.laporan.jumlah}</span>
                        <span className="pb-1 text-[12.5px] font-semibold text-[#5B6B84]">{data.kegiatan.satuan || "realisasi"}</span>
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[#7B8794]">
                          <Ikon d={IKON.pin} kelas="h-3.5 w-3.5" /> Lokasi ({lokasi.length} nagari/kecamatan)
                        </div>
                        {lokasi.length === 0 ? (
                          <p className="text-[12.5px] text-[#7B8794]">Lokasi tidak dicatat.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {lokasi.map((g) => (
                              <li key={`${g.kecamatan}|${g.nagari}`} className="rounded-lg bg-[#F5F8FE] px-2.5 py-2">
                                <div className="text-[12.5px] font-bold text-[#1B2B4B]">
                                  {g.nagari || "Nagari tidak dicatat"}
                                  {g.kecamatan && <span className="font-medium text-[#5B6B84]"> · Kec. {g.kecamatan}</span>}
                                </div>
                                {g.jorong.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {g.jorong.map((j) => (
                                      <span key={j} className="rounded-md border border-[#DDE6F3] bg-white px-1.5 py-0.5 text-[11.5px] text-[#2C3E5A]">
                                        {j}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-[#7B8794]">Kendala</div>
                        {data.laporan.kendala ? (
                          <blockquote className="whitespace-pre-line rounded-r-lg border-l-4 border-[#D9971F] bg-[#FFF8E5] px-3 py-2 text-[12.5px] leading-relaxed text-[#4A3600]">{data.laporan.kendala}</blockquote>
                        ) : (
                          <p className="text-[12.5px] text-[#7B8794]">Tidak ada kendala dicatat.</p>
                        )}
                      </div>
                    </div>
                  )}
                </KartuBagian>

                <KartuBagian
                  ikon={IKON.kamera}
                  judul="Dokumentasi foto"
                  kanan={
                    <span className="flex items-center gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#E6ECF5] sm:inline-block" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${lengkap.wajibFoto ? Math.min(100, (lengkap.nFoto / lengkap.wajibFoto) * 100) : 100}%`, background: lengkap.foto === "ok" ? "#059669" : "#F59E0B" }} />
                      </span>
                      <span className={`text-[12px] font-extrabold tabular-nums ${lengkap.foto === "ok" ? "text-[#13794B]" : "text-[#B42329]"}`}>
                        {lengkap.nFoto} / {lengkap.wajibFoto}
                      </span>
                    </span>
                  }
                >
                  {slotFoto.length === 0 ? (
                    <p className="text-[12.5px] text-[#7B8794]">Kegiatan ini tidak mewajibkan foto dan belum ada foto yang diunggah.</p>
                  ) : (
                    <>
                      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {slotFoto.map((s) => {
                          const f = s.foto;
                          if (!f) {
                            return (
                              <li key={s.slot} className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#CBD6E6] bg-[#F8FAFC] px-2 text-center">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF2F7] text-[12px] font-extrabold text-[#7B8794]">{s.slot}</span>
                                <span className="mt-1 text-[11.5px] font-bold text-[#5B6B84]">{s.label}</span>
                                <span className="text-[11px] text-[#9AA6B5]">Belum ada foto</span>
                              </li>
                            );
                          }
                          const idx = bergambar.findIndex((b) => b.slot === s.slot);
                          const perh = f.foto_id ? statusPemeriksaan(((f.kepercayaan as Kepercayaan | null) ?? "hijau") as Kepercayaan, f.status_periksa) : null;
                          const gagal = !f.url || rusak[`${data.tanggal}|${s.slot}`];
                          return (
                            <li key={s.slot}>
                              <button
                                type="button"
                                disabled={gagal || idx < 0}
                                onClick={() => setFoto(idx)}
                                aria-label={`Foto ${s.slot}, ${s.label}, pukul ${jamDariIso(f.diambil_at ?? f.diunggah_at)}. Buka layar penuh`}
                                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#E6ECF5] shadow-sm outline-none ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-[#1F5FD1] enabled:hover:shadow-md enabled:active:scale-[0.98]"
                              >
                                {gagal ? (
                                  <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] font-semibold text-[#55657D]">Foto belum termuat</span>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={f.url!}
                                    alt=""
                                    loading="lazy"
                                    draggable={false}
                                    onError={() => setRusak((r) => ({ ...r, [`${data.tanggal}|${s.slot}`]: true }))}
                                    className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                  />
                                )}
                                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-6 text-left text-white">
                                  <span className="flex items-center gap-1.5">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-[#0E2A47]">{s.slot}</span>
                                    <span className="truncate text-[11.5px] font-bold leading-tight">{s.label}</span>
                                  </span>
                                  <span className="mt-0.5 block text-[10.5px] text-white/80">
                                    {jamDariIso(f.diambil_at ?? f.diunggah_at)} WIB{f.susulan ? " · susulan" : ""}
                                  </span>
                                </span>
                                {perh?.perhatian && (
                                  <span className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow" style={{ background: WARNA_NADA_PERIKSA[perh.nada] }}>
                                    {perh.label}
                                  </span>
                                )}
                                {!gagal && (
                                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/45 p-1 text-white opacity-0 backdrop-blur transition group-hover:opacity-100" aria-hidden>
                                    <Ikon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" kelas="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {bergambar.length > 0 && <p className="mt-2 text-[11.5px] text-[#7B8794]">Ketuk foto untuk membuka ukuran besar; di sana foto bisa di-zoom dan digeser.</p>}
                    </>
                  )}
                </KartuBagian>
              </div>
            )}
          </div>

          {/* pita aksi: hanya untuk hari terlewat yang belum diberi izin */}
          {terlewatTanpaIzin && bolehIzin && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#DDE6F3] bg-white px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
              <p className="min-w-[200px] flex-1 text-[12px] leading-snug text-[#4D5B6B]">
                Hari ini <b className="text-[#B42329]">terlewat</b> dan belum ada izin susulan. Hari terlewat tidak masuk Kwitansi.
              </p>
              <button type="button" className={BTN_O} onClick={tutup}>
                Tutup
              </button>
              <button type="button" className={BTN} onClick={() => onIzin(tanggal)}>
                Beri izin susulan
              </button>
            </div>
          )}
        </div>
      </div>

      {foto !== null && bergambar.length > 0 && (
        <PenampilFoto daftar={bergambar} awal={foto} judulBawah={`${petugas.nama} · ${tglPanjang(tanggal)}`} onTutup={() => setFoto(null)} />
      )}
    </>,
    document.body
  );
}
