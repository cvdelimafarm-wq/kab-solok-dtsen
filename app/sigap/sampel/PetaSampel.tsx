"use client";

// app/sigap/sampel/PetaSampel.tsx
//
// (11 Nov 2026) Peta sampel satu sub SLS yang sama dengan tab Peta di Lembar Pendataan bencana: kanvas penuh yang bisa digeser (1 jari) dan dicubit (2 jari), tombol +/-/semua,
// garis batas sub SLS, peta jalan offline sebagai latar (bila berkas tim ada), dan titik KK yang bisa diketuk untuk membuka kartu KK (diatur induk lewat onPilih).
// Warna titik = peran sampel (biru utama, oranye cadangan, abu = bukan sampel); cincin luar = hasil (hijau didata, kuning menolak, merah tidak ditemukan).
// KK yang tidak punya koordinat di master (mis. KK yang baru ditambahkan dari berkas sampel) TIDAK digambar; jumlahnya dinyatakan di bawah peta dan kartunya menulis
// "Koordinat tidak tersedia".

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { buatProyeksi, type Titik } from "@/lib/pendataan";
import { batangSkala, titikBatas } from "@/lib/petaWilayah";
import type { KkMaster } from "@/lib/alokasiWilayah";
import type { TagKk } from "@/lib/tagSampel";
import type { PandangPeta } from "@/lib/petaDasar";
import { LapisBatas } from "../pendataan/LapisBatas";
import KontrolPetaDasar from "../pendataan/KontrolPetaDasar";
import { useDasarTim } from "../pendataan/useDasar";
import type { StatusDasar } from "../pendataan/PetaDasar";
import { useGiliranLatar } from "./latarSubSls";
import { useBatasSub } from "./PetaSubSls";

const PetaDasar = dynamic(() => import("../pendataan/PetaDasar"), { ssr: false });

const L = 360;
const T = 440;
const Z_MAKS = 8;
const PANDANG_AWAL: PandangPeta = { cx: L / 2, cy: T / 2, z: 1 };
const WARNA = { utama: "#1F5FD1", cadangan: "#E08A00", lain: "#8896AB" } as const;
const WARNA_HASIL = { didata: "#13794B", menolak: "#D97706", tidak_ditemukan: "#B42329" } as const;

const sah = (v: number | null, maks: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= maks;
/** KK yang punya koordinat sah di master */
export function adaKoordinat<T extends Pick<KkMaster, "lat" | "lng">>(k: T): k is T & { lat: number; lng: number } {
  return sah(k.lat, 90) && sah(k.lng, 180);
}

function klem(p: PandangPeta): PandangPeta {
  const hw = L / 2 / p.z;
  const hh = T / 2 / p.z;
  return { z: p.z, cx: Math.max(hw, Math.min(L - hw, p.cx)), cy: Math.max(hh, Math.min(T - hh, p.cy)) };
}

export default function PetaSampel({
  idsubsls,
  kk,
  tag,
  hanyaBertag,
  kunciDasar = null,
  terpilih,
  onPilih,
}: {
  idsubsls: string;
  kk: readonly KkMaster[];
  tag: ReadonlyMap<number, TagKk>;
  /** true = sampel sudah ditetapkan: hanya KK bertag yang digambar dan dihitung */
  hanyaBertag: boolean;
  kunciDasar?: number | null;
  terpilih: number | null;
  onPilih: (id: number | null) => void;
}) {
  const batas = useBatasSub(idsubsls);
  const fitur = batas.status === "ada" ? batas.fitur : null;
  const giliran = useGiliranLatar(idsubsls, kunciDasar != null);
  const dasar = useDasarTim(kunciDasar, giliran.punya);
  const [status, setStatus] = useState<StatusDasar | null>(null);
  const [alasan, setAlasan] = useState<string | null>(null);
  const [pandang, setPandang] = useState<PandangPeta>(PANDANG_AWAL);
  const [legenda, setLegenda] = useState(false);

  const dipakai = useMemo(() => (hanyaBertag ? kk.filter((k) => tag.has(k.id)) : kk), [kk, tag, hanyaBertag]);
  const berKoordinat = useMemo(() => dipakai.filter(adaKoordinat) as (KkMaster & { lat: number; lng: number })[], [dipakai]);
  const tanpaKoordinat = dipakai.length - berKoordinat.length;
  const proj = useMemo(() => {
    const semua: Titik[] = [...titikBatas(fitur), ...berKoordinat.map((k) => ({ lat: k.lat, lng: k.lng }))];
    return buatProyeksi(semua, L, T, 28);
  }, [fitur, berKoordinat]);

  // proyeksi berubah (batas selesai dimuat): kembali ke tampilan penuh
  useEffect(() => {
    setPandang(PANDANG_AWAL);
  }, [proj]);

  const pakaiDasar = giliran.punya && dasar.lapisan === "jalan" && !!dasar.sumber && status !== "gagal";
  const kunciSumber = !dasar.sumber ? "" : dasar.sumber.tipe === "blob" ? `b:${dasar.sumber.nama}:${dasar.sumber.blob.size}` : `o:${dasar.sumber.url}`;
  useEffect(() => {
    setStatus(null);
  }, [kunciSumber]);

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
        const { z0, jarak0 } = gerak.current;
        setPandang((p) => klem({ ...p, z: Math.max(1, Math.min(Z_MAKS, (z0 * j) / jarak0)) }));
      }
      return;
    }
    const dx = baru.x - lama.x;
    const dy = baru.y - lama.y;
    if (!gerak.current.geser && Math.abs(dx) + Math.abs(dy) < 3) return;
    gerak.current.geser = true;
    const skala = Math.min((svg.current.clientWidth || L) / (L / pandang.z), (svg.current.clientHeight || T) / (T / pandang.z));
    const sk = 1 / skala;
    setPandang((p) => klem({ ...p, cx: p.cx - dx * sk, cy: p.cy - dy * sk }));
  }
  function lepas(e: React.PointerEvent) {
    ptr.current.delete(e.pointerId);
    if (ptr.current.size < 2) gerak.current.jarak0 = 0;
    if (ptr.current.size === 0) setTimeout(() => (gerak.current.geser = false), 0);
  }

  if (batas.status === "memuat") return <p className="px-3.5 py-3 text-[12.5px] text-[#55657D]" aria-busy="true">Memuat peta…</p>;
  if (!proj) {
    return (
      <p className="mx-3 mt-2 rounded-[12px] bg-[#FFF4D6] px-3 py-2.5 text-[12.5px] font-semibold leading-snug text-[#8A6200]">
        Koordinat tidak tersedia untuk {dipakai.length > 0 ? `${dipakai.length} KK` : "KK"} sampel di sub SLS ini{batas.status === "tiada" ? ` dan ${batas.alasan.toLowerCase()}` : ""}. Lihat daftar KK dan gunakan patokan alamatnya.
      </p>
    );
  }

  let batang: { px: number; label: string } | null = null;
  {
    const meter = (L / z) * 0.25 * proj.meterPerSatuan;
    const b = batangSkala(proj.meterPerSatuan, (L / z) * 0.25);
    if (b.meter > 0 && meter > 0) batang = { px: b.lebar, label: b.meter >= 1000 ? `${b.meter / 1000} km` : `${b.meter} m` };
  }
  const urut: Record<"lain" | "cadangan" | "utama", number> = { lain: 0, cadangan: 1, utama: 2 };
  const peranDari = (k: KkMaster) => tag.get(k.id)?.peran ?? "lain";
  const titik = [...berKoordinat].sort((a, b) => urut[peranDari(a)] - urut[peranDari(b)]);
  const nUtama = berKoordinat.filter((k) => peranDari(k) === "utama").length;
  const nCad = berKoordinat.filter((k) => peranDari(k) === "cadangan").length;

  return (
    <figure className="px-3 pb-2 pt-2" aria-label="Peta sampel sub SLS">
      <div className="relative mx-auto w-full overflow-hidden rounded-[14px] border border-[#DCE5F2] bg-[#EEF2F7]" style={{ aspectRatio: `${L} / ${T}`, maxHeight: "72vh" }}>
        {pakaiDasar && dasar.sumber && <PetaDasar proj={proj} pandang={pandang} sumber={dasar.sumber} onStatus={(s, a) => { setStatus(s); setAlasan(a ?? null); }} />}
        <div className="absolute inset-0">
          <svg
            ref={svg}
            viewBox={viewBox}
            role="img"
            aria-label={`Sebaran ${berKoordinat.length} KK sampel`}
            className={`block h-full w-full touch-none select-none ${pakaiDasar && status === "siap" ? "bg-transparent" : "bg-[#EEF2F7]"}`}
            onPointerDown={bawah}
            onPointerMove={pindah}
            onPointerUp={lepas}
            onPointerCancel={lepas}
          >
            <LapisBatas fitur={fitur ? [fitur] : undefined} proj={proj} aktifId={idsubsls} z={z} />
            {titik.map((k) => {
              const t = tag.get(k.id);
              const peran = t?.peran ?? "lain";
              const x = proj.x(k.lng);
              const y = proj.y(k.lat);
              const pilih = terpilih === k.id;
              const rr = peran === "lain" ? r * 0.7 : r;
              return (
                <g key={k.id} style={{ cursor: "pointer" }} onClick={() => { if (!gerak.current.geser) onPilih(pilih ? null : k.id); }}>
                  {pilih && <circle cx={x} cy={y} r={rr * 2.1} fill="none" stroke="#0F2A52" strokeWidth={2.2 / z} />}
                  {t?.hasil && <circle cx={x} cy={y} r={rr * 1.55} fill="none" stroke={WARNA_HASIL[t.hasil]} strokeWidth={2.6 / z} />}
                  <circle cx={x} cy={y} r={rr} fill={WARNA[peran]} stroke="#fff" strokeWidth={1.4 / z} />
                  <circle cx={x} cy={y} r={rr * 2.1} fill="transparent" />
                </g>
              );
            })}
            {batang && (
              <g transform={`translate(${pandang.cx - L / 2 / z + 10 / z} ${pandang.cy + T / 2 / z - 14 / z})`}>
                <line x1={0} y1={0} x2={batang.px} y2={0} stroke="#52627A" strokeWidth={2.4 / z} strokeLinecap="round" />
                <text x={0} y={-5 / z} fontSize={9 / z} fontWeight={700} fill="#52627A" fontFamily="inherit">{batang.label}</text>
              </g>
            )}
          </svg>
        </div>
        {giliran.punya && <KontrolPetaDasar dasar={dasar} status={status} alasan={alasan} />}
        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_4px_12px_rgba(15,42,82,.15)]">
          <button type="button" aria-label="Perbesar" onClick={() => setPandang((p) => klem({ ...p, z: Math.min(Z_MAKS, p.z * 1.6) }))} className="grid h-[40px] w-[40px] place-items-center border-b border-[#EEF2F7] text-[20px] font-bold leading-none text-[#0F2A52] active:bg-[#F1F5FC]">+</button>
          <button type="button" aria-label="Perkecil" onClick={() => setPandang((p) => klem({ ...p, z: Math.max(1, p.z / 1.6) }))} className="grid h-[40px] w-[40px] place-items-center border-b border-[#EEF2F7] text-[20px] font-bold leading-none text-[#0F2A52] active:bg-[#F1F5FC]">−</button>
          <button type="button" aria-label="Tampilkan semua" onClick={() => setPandang(PANDANG_AWAL)} className="grid h-[40px] w-[40px] place-items-center text-[15px] font-bold leading-none text-[#0F2A52] active:bg-[#F1F5FC]">⤢</button>
        </div>
        {kunciDasar != null && !giliran.punya && (
          <button type="button" onClick={giliran.ambil} className="absolute left-2 top-2 z-[2] min-h-[32px] rounded-[9px] bg-white px-2.5 text-[11.5px] font-extrabold text-[#1F5FD1] shadow-[0_4px_12px_rgba(15,42,82,.15)] active:bg-[#F1F5FC]">
            Peta jalan di sini
          </button>
        )}
        <div className="absolute bottom-2 left-2 flex max-w-[200px] flex-col items-start gap-1">
          {legenda && (
            <div className="flex flex-col gap-0.5 rounded-[10px] bg-white/[.95] px-2.5 py-[5px] text-[10.5px] font-bold text-[#44546F]">
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.utama }} />Sampel utama</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.cadangan }} />Cadangan</span>
              {!hanyaBertag && <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.lain }} />Bukan sampel</span>}
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 align-middle" style={{ borderColor: WARNA_HASIL.didata }} />Cincin hijau = didata</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 align-middle" style={{ borderColor: WARNA_HASIL.menolak }} />Kuning = menolak</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 align-middle" style={{ borderColor: WARNA_HASIL.tidak_ditemukan }} />Merah = tidak ditemukan</span>
            </div>
          )}
          <button type="button" aria-expanded={legenda} onClick={() => setLegenda((v) => !v)} className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[10px] bg-white/[.95] px-2.5 text-[11px] font-extrabold text-[#44546F] shadow-[0_2px_8px_rgba(15,42,82,.15)] active:bg-[#F1F5FC]">
            Legenda
            {tanpaKoordinat > 0 && <i aria-label={`${tanpaKoordinat} KK tanpa koordinat`} className="h-2 w-2 rounded-full bg-[#D97706]" />}
          </button>
        </div>
      </div>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] font-semibold text-[#55657D]">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.utama }} />Utama {nUtama}</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: WARNA.cadangan }} />Cadangan {nCad}</span>
        <span className="text-[#6B7A90]">Ketuk titik untuk membuka kartu KK</span>
      </figcaption>
      {tanpaKoordinat > 0 && (
        <p className="mt-1 rounded-[10px] bg-[#FFF4D6] px-2.5 py-1.5 text-[11.5px] font-semibold leading-snug text-[#8A6200]">
          {tanpaKoordinat} KK sampel tidak punya koordinat di database, jadi tidak tampil di peta. Koordinat tidak tersedia untuk KK tersebut; cari lewat tab Daftar (nama, anggota, patokan).
        </p>
      )}
    </figure>
  );
}
