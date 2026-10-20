"use client";

// app/sigap/spdt/PetaSpdt.tsx
//
// (16 Okt 2026; 21 Okt 2026 + latar peta jalan opsional lewat `tanpaLatar`, lihat page.tsx) Sebaran koordinat KK SPDT NTP pada kanvas titik (nol unduhan bila tanpa peta jalan, tetap tampil walau tanpa sinyal) -- sama dengan peta
// Lembar Pendataan bencana. WARNA = PPL (PPL sendiri: warna = Jorong). Titik ber-cincin putus-putus oranye = akurasi GPS rendah (> 50 m).
// Geser 1 jari, cubit 2 jari (tombol +/- ada di halaman); ketuk titik untuk membuka kartu KK. Tidak ada status/hasil pendataan.

import { useRef } from "react";
import { WARNA_BELUM, warnaIndeks, type Proyeksi } from "@/lib/pendataan";
import { akurasiRendah, inisialNama, type KkSpdt } from "@/lib/spdtNtp";

export type Pandang = { cx: number; cy: number; z: number };
export const PANDANG_AWAL: Pandang = { cx: 180, cy: 220, z: 1 };
const L = 360;
const T = 440;
const Z_MAKS = 12;

type Props = {
  kk: KkSpdt[];
  proj: Proyeksi | null;
  /** warna tiap KK (indeks palet) */
  warnaIndeksKk: (k: KkSpdt) => number;
  pandang: Pandang;
  setPandang: (f: (p: Pandang) => Pandang) => void;
  terpilih: number | null;
  onPilih: (id: number) => void;
  saya: { lat: number; lng: number } | null;
  /** (21 Okt 2026) true = ada peta jalan di bawah: latar dan kisi dibuat bening supaya peta terlihat (sama dengan PetaKk) */
  tanpaLatar?: boolean;
};

function klem(p: Pandang): Pandang {
  const hw = L / 2 / p.z;
  const hh = T / 2 / p.z;
  return { z: p.z, cx: Math.max(hw, Math.min(L - hw, p.cx)), cy: Math.max(hh, Math.min(T - hh, p.cy)) };
}

export default function PetaSpdt({ kk, proj, warnaIndeksKk, pandang, setPandang, terpilih, onPilih, saya, tanpaLatar = false }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const ptr = useRef(new Map<number, { x: number; y: number }>());
  const gerak = useRef({ geser: false, jarak0: 0, z0: 1 });

  const z = pandang.z;
  const r = 6.5 / z;
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
    // kanvas mengisi sisa layar: skala "meet" = sisi terpendek yang menentukan
    const skala = Math.min((svg.current.clientWidth || L) / (L / pandang.z), (svg.current.clientHeight || T) / (T / pandang.z));
    const sk = 1 / skala;
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
    const pil = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const m = [...pil].reverse().find((x) => x <= meter) ?? pil[0];
    batang = { px: m / proj.meterPerSatuan, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }

  const pakaiInisial = z >= 3;
  const urut = proj ? [...kk].sort((a, b) => (a.id === terpilih ? 1 : 0) - (b.id === terpilih ? 1 : 0)) : [];

  return (
    <svg
      ref={svg}
      viewBox={viewBox}
      role="img"
      aria-label="Sebaran titik koordinat KK"
      className={`block h-full w-full touch-none select-none ${tanpaLatar ? "bg-transparent" : "bg-[#EEF2F7]"}`}
      onPointerDown={bawah}
      onPointerMove={pindah}
      onPointerUp={lepas}
      onPointerCancel={lepas}
    >
      {!tanpaLatar && (
        <>
          <rect x={-400} y={-400} width={1200} height={1300} fill="#EEF2F7" />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} stroke="#DDE4EE" strokeWidth={1 / z}>
              <line x1={i * 45} y1={-400} x2={i * 45} y2={900} />
              <line x1={-400} y1={i * 55} x2={800} y2={i * 55} />
            </g>
          ))}
        </>
      )}

      {proj &&
        urut.map((k) => {
          const warna = k.ppl_akun_id == null ? WARNA_BELUM : warnaIndeks(warnaIndeksKk(k));
          const x = proj.x(k.lng);
          const y = proj.y(k.lat);
          const pilih = terpilih === k.id;
          return (
            <g
              key={k.id}
              style={{ cursor: "pointer" }}
              onClick={() => {
                if (!gerak.current.geser) onPilih(k.id);
              }}
            >
              {pilih && <circle cx={x} cy={y} r={r * 2} fill="none" stroke="#0F2A52" strokeWidth={2.2 / z} />}
              {akurasiRendah(k.akurasi_m) && <circle cx={x} cy={y} r={r * 1.55} fill="none" stroke="#D98E04" strokeWidth={1.6 / z} strokeDasharray={`${3 / z} ${2.4 / z}`} />}
              <circle cx={x} cy={y} r={r} fill={warna} stroke="#fff" strokeWidth={1.4 / z} />
              {pakaiInisial && (
                <text x={x} y={y + r * 0.34} textAnchor="middle" fontSize={r * 0.95} fontWeight={800} fontFamily="inherit" fill="#fff" stroke="rgba(0,0,0,.45)" strokeWidth={0.5 / z} paintOrder="stroke">
                  {inisialNama(k.ppl_nama)}
                </text>
              )}
              <circle cx={x} cy={y} r={r * 2.2} fill="transparent" />
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
