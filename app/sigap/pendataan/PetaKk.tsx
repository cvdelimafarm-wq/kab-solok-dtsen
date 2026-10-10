"use client";

// app/sigap/pendataan/PetaKk.tsx
//
// (11 Okt 2026) Sebaran titik KK pada Lembar Pendataan -- pewarnaan "A" yang dipilih user: WARNA = PPL yang mendata, BENTUK = hasil.
//   lingkaran penuh = didata, terdampak  |  lingkaran kosong (bertepi warna PPL) = didata, tidak terdampak  |  belah ketupat = tidak ditemukan
//   titik abu kecil = belum didata. Inisial PPL muncul saat diperbesar (>= 2,2x) karena warna saja kurang aman (biru dan ungu mirip pada titik tersebar).
// Tahap 1: kanvas titik tanpa peta dasar (nol unduhan, langsung tampil walau tanpa sinyal). Peta jalan vektor offline menyusul di tahap 2.
// Geser 1 jari, cubit 2 jari (tombol +/- ada di halaman); ketuk titik untuk membuka kartu KK.

import { useRef } from "react";
import { WARNA_BELUM, WARNA_PML, warnaIndeks, type Anggota, type KkLembar, type Proyeksi } from "@/lib/pendataan";
import { inisial } from "./usePendataan";

export type Pandang = { cx: number; cy: number; z: number };
export const PANDANG_AWAL: Pandang = { cx: 180, cy: 220, z: 1 };
const L = 360;
const T = 440;
const Z_MAKS = 8;

export function warnaPelaku(a: Anggota | undefined): string {
  if (!a) return WARNA_PML;
  return a.peran === "pml" ? WARNA_PML : warnaIndeks(a.indeks);
}

/** Bentuk hasil untuk daftar/legenda (ukuran px). */
export function IkonHasil({ hasil, warna, ukuran = 22 }: { hasil: KkLembar["hasil"]; warna: string; ukuran?: number }) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 22 22" aria-hidden="true" className="flex-none">
      <Bentuk hasil={hasil} warna={warna} cx={11} cy={11} r={6.5} z={1} />
    </svg>
  );
}

function Bentuk({ hasil, warna, cx, cy, r, z }: { hasil: KkLembar["hasil"]; warna: string; cx: number; cy: number; r: number; z: number }) {
  if (!hasil) return <circle cx={cx} cy={cy} r={r * 0.78} fill={WARNA_BELUM} stroke="#fff" strokeWidth={1.4 / z} />;
  if (hasil === "terdampak") return <circle cx={cx} cy={cy} r={r} fill={warna} stroke="#fff" strokeWidth={1.4 / z} />;
  if (hasil === "tidak_terdampak") return <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={warna} strokeWidth={2.4 / z} />;
  const q = r * 1.25;
  return <polygon points={`${cx},${cy - q} ${cx + q},${cy} ${cx},${cy + q} ${cx - q},${cy}`} fill={warna} stroke="#fff" strokeWidth={1.4 / z} />;
}

type Props = {
  kk: KkLembar[];
  proj: Proyeksi | null;
  anggota: Map<number, Anggota>;
  pandang: Pandang;
  setPandang: (f: (p: Pandang) => Pandang) => void;
  terpilih: number | null;
  /** id KK yang ditampilkan penuh; selebihnya diredam (hasil saring status/PPL) */
  tampil: Set<number>;
  onPilih: (id: number) => void;
  /** posisi saya (hanya setelah tombol "Terdekat dari saya" ditekan) */
  saya: { lat: number; lng: number } | null;
};

function klem(p: Pandang): Pandang {
  const hw = L / 2 / p.z;
  const hh = T / 2 / p.z;
  return { z: p.z, cx: Math.max(hw, Math.min(L - hw, p.cx)), cy: Math.max(hh, Math.min(T - hh, p.cy)) };
}

export default function PetaKk({ kk, proj, anggota, pandang, setPandang, terpilih, tampil, onPilih, saya }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const ptr = useRef(new Map<number, { x: number; y: number }>());
  const gerak = useRef({ geser: false, jarak0: 0, z0: 1 });

  const z = pandang.z;
  const r = 7 / z;
  const viewBox = `${pandang.cx - L / 2 / z} ${pandang.cy - T / 2 / z} ${L / z} ${T / z}`;

  function bawah(e: React.PointerEvent) {
    ptr.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gerak.current.geser = false;
    if (ptr.current.size === 2) {
      const [a, b] = Array.from(ptr.current.values());
      gerak.current.jarak0 = Math.hypot(a.x - b.x, a.y - b.y);
      gerak.current.z0 = pandang.z;
    }
  }
  function pindah(e: React.PointerEvent) {
    const lama = ptr.current.get(e.pointerId);
    if (!lama || !svg.current) return;
    const baru = { x: e.clientX, y: e.clientY };
    ptr.current.set(e.pointerId, baru);
    if (ptr.current.size >= 2) {
      const [a, b] = Array.from(ptr.current.values());
      const j = Math.hypot(a.x - b.x, a.y - b.y);
      if (gerak.current.jarak0 > 0) {
        gerak.current.geser = true;
        const z0 = gerak.current.z0;
        const j0 = gerak.current.jarak0;
        setPandang((p) => klem({ ...p, z: Math.max(1, Math.min(Z_MAKS, (z0 * j) / j0)) }));
      }
      return;
    }
    const dx = baru.x - lama.x;
    const dy = baru.y - lama.y;
    if (!gerak.current.geser && Math.abs(dx) + Math.abs(dy) < 3) return;
    gerak.current.geser = true;
    const sk = L / pandang.z / (svg.current.clientWidth || L);
    setPandang((p) => klem({ ...p, cx: p.cx - dx * sk, cy: p.cy - dy * sk }));
  }
  function lepas(e: React.PointerEvent) {
    ptr.current.delete(e.pointerId);
    if (ptr.current.size < 2) gerak.current.jarak0 = 0;
    if (ptr.current.size === 0) setTimeout(() => (gerak.current.geser = false), 0);
  }

  // skala: batang sepanjang ~ 25% lebar tampilan, dibulatkan ke 10/20/50/100/200/500/1000 m
  let batang: { px: number; label: string } | null = null;
  if (proj) {
    const meter = (L / z) * 0.25 * proj.meterPerSatuan;
    const pil = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const m = [...pil].reverse().find((x) => x <= meter) ?? pil[0];
    batang = { px: m / proj.meterPerSatuan, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }

  const titik = proj ? kk.filter((k) => k.lat !== null && k.lng !== null) : [];
  const pakaiInisial = z >= 2.2;
  const px = (k: KkLembar) => proj!.x(k.lng as number);
  const py = (k: KkLembar) => proj!.y(k.lat as number);

  return (
    <svg
      ref={svg}
      viewBox={viewBox}
      role="img"
      aria-label="Sebaran titik KK pada Sub SLS"
      className="block h-auto w-full touch-none select-none bg-[#EEF2F7]"
      style={{ aspectRatio: `${L} / ${T}`, maxHeight: "64vh" }}
      onPointerDown={bawah}
      onPointerMove={pindah}
      onPointerUp={lepas}
      onPointerCancel={lepas}
    >
      <rect x={-400} y={-400} width={1200} height={1300} fill="#EEF2F7" />
      {/* kisi tipis sebagai pegangan visual saat menggeser (peta jalan menyusul di tahap 2) */}
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} stroke="#DDE4EE" strokeWidth={1 / z}>
          <line x1={i * 45} y1={-400} x2={i * 45} y2={900} />
          <line x1={-400} y1={i * 55} x2={800} y2={i * 55} />
        </g>
      ))}

      {titik.map((k) => {
        const a = k.ppl_akun_id ? anggota.get(k.ppl_akun_id) : undefined;
        const warna = k.hasil ? warnaPelaku(a) : WARNA_BELUM;
        const redup = !tampil.has(k.id);
        const x = px(k);
        const y = py(k);
        const pilih = terpilih === k.id;
        return (
          <g
            key={k.id}
            opacity={redup ? 0.2 : 1}
            style={{ cursor: "pointer" }}
            onClick={() => {
              if (!gerak.current.geser) onPilih(k.id);
            }}
          >
            {pilih && <circle cx={x} cy={y} r={r * 1.9} fill="none" stroke="#0F2A52" strokeWidth={2.2 / z} />}
            <Bentuk hasil={k.hasil} warna={warna} cx={x} cy={y} r={r} z={z} />
            {pakaiInisial && k.hasil && (
              <text
                x={x}
                y={y + r * 0.34}
                textAnchor="middle"
                fontSize={r * 0.95}
                fontWeight={800}
                fontFamily="inherit"
                {...(k.hasil === "tidak_terdampak"
                  ? { fill: "#0F2A52" }
                  : { fill: "#fff", stroke: "rgba(0,0,0,.45)", strokeWidth: 0.5 / z, paintOrder: "stroke" })}
              >
                {a ? inisial(a.nama) : "?"}
              </text>
            )}
            <circle cx={x} cy={y} r={r * 2.1} fill="transparent" />
          </g>
        );
      })}

      {saya && proj && (
        <g>
          <circle cx={proj.x(saya.lng)} cy={proj.y(saya.lat)} r={16 / z} fill="#1F5FD1" opacity={0.18} />
          <circle cx={proj.x(saya.lng)} cy={proj.y(saya.lat)} r={5.5 / z} fill="#1F5FD1" stroke="#fff" strokeWidth={2 / z} />
        </g>
      )}

      {batang && (
        <g transform={`translate(${pandang.cx - L / 2 / z + 10 / z} ${pandang.cy + T / 2 / z - 14 / z})`}>
          <line x1={0} y1={0} x2={batang.px} y2={0} stroke="#52627A" strokeWidth={2.4 / z} strokeLinecap="round" />
          <text x={0} y={-5 / z} fontSize={9 / z} fontWeight={700} fill="#52627A" fontFamily="inherit">
            {batang.label}
          </text>
        </g>
      )}
    </svg>
  );
}
