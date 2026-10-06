"use client";

// app/sigap/admin/GrafikMonitoring.tsx
//
// (6 Okt 2026) Grafik ringkasan "monitoring umum" di atas tabel monitoring -- permintaan user: "untuk
// monitoring umumnya bisa dibuat grafik di atas". Dihitung di klien dari data bagian=monitoring
// (rows[].status per tanggal), digambar SVG sendiri (tanpa pustaka grafik):
//  a. Tren harian: kolom bertumpuk jumlah petugas lengkap / sebagian (hari ini) / terlewat / rencana per
//     tanggal, penanda "hari ini", tooltip saat hover.
//  b. Kepatuhan per kecamatan tujuan ST: batang horizontal % hari lengkap dari hari kerja yang sudah
//     lewat/hari ini, diurutkan, angka n/m di ujung.
// Warna mengikuti status (emerald lengkap, amber sebagian, merah terlewat, abu bergaris rencana) --
// identitas tidak hanya lewat warna: legenda + tooltip + tabel di bawahnya.

import { useEffect, useMemo, useRef, useState } from "react";
import { bulanSingkat, tglAngka, tglPanjang, tglPendek } from "./api";

export type StatusHari = "lengkap" | "sebagian" | "terlewat" | "rencana";
export type BarisGrafik = { penugasan_id: number; tujuan: string[]; status: Record<string, StatusHari> };

const URUTAN: StatusHari[] = ["lengkap", "sebagian", "terlewat", "rencana"];
export const WARNA_STATUS: Record<StatusHari, string> = { lengkap: "#059669", sebagian: "#FBBF24", terlewat: "#EF4444", rencana: "#CBD5E1" };
const LABEL: Record<StatusHari, string> = { lengkap: "Lengkap", sebagian: "Sebagian / hari ini", terlewat: "Terlewat", rencana: "Rencana" };
const TINTA = "#14202E";
const TINTA_2 = "#4D5B6B";
const TINTA_3 = "#7B8794";
const GRID = "#EDF0F4";
const SURFACE = "#FFFFFF";

/** Lebar kontainer (px) via ResizeObserver, supaya SVG digambar 1:1 (teks tidak ikut mengecil). */
function useLebar(awal = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(awal);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(240, Math.round(el.clientWidth)));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Langkah sumbu y yang "bulat" (1, 2, 5, 10, …) agar ≤ 5 garis. */
function skalaY(maks: number) {
  const m = Math.max(1, maks);
  const kandidat = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = kandidat.find((s) => m / s <= 4) ?? Math.ceil(m / 4);
  const atas = Math.ceil(m / step) * step;
  const tick: number[] = [];
  for (let v = 0; v <= atas; v += step) tick.push(v);
  return { atas, tick };
}

/** Path batang dengan ujung data membulat (atas) & dasar persegi. */
function batangAtas(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
/** Path batang horizontal dengan ujung kanan membulat. */
function batangKanan(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

const POLA_RENCANA = "pola-rencana-sigap";
function DefPola() {
  return (
    <defs>
      <pattern id={POLA_RENCANA} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="#E2E8F0" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="#94A3B8" strokeWidth="1.6" />
      </pattern>
    </defs>
  );
}
const isiStatus = (s: StatusHari) => (s === "rencana" ? `url(#${POLA_RENCANA})` : WARNA_STATUS[s]);

function Swatch({ s }: { s: StatusHari }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
      style={s === "rencana" ? { backgroundImage: "repeating-linear-gradient(135deg, #94A3B8 0 1.5px, #E2E8F0 1.5px 4px)" } : { background: WARNA_STATUS[s] }}
    />
  );
}

// ================================================================ Komponen utama
export default function GrafikMonitoring({ tanggal, hariIni, rows }: { tanggal: string[]; hariIni: string; rows: BarisGrafik[] }) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
      <TrenHarian tanggal={tanggal} hariIni={hariIni} rows={rows} />
      <KepatuhanKecamatan hariIni={hariIni} rows={rows} />
    </div>
  );
}

const KARTU = "rounded-2xl bg-white p-4 shadow-sm lg:rounded-xl lg:border lg:border-[#E3E8EE] lg:shadow-none";

// ---------------------------------------------------------------- a. Tren harian
export function TrenHarian({ tanggal, hariIni, rows }: { tanggal: string[]; hariIni: string; rows: BarisGrafik[] }) {
  const [ref, W] = useLebar();
  const [hover, setHover] = useState<number | null>(null);

  const per = useMemo(
    () =>
      tanggal.map((t) => {
        const c: Record<StatusHari, number> = { lengkap: 0, sebagian: 0, terlewat: 0, rencana: 0 };
        for (const r of rows) {
          const s = r.status[t];
          if (s) c[s]++;
        }
        return { t, c, total: c.lengkap + c.sebagian + c.terlewat + c.rencana };
      }),
    [tanggal, rows]
  );
  const total = useMemo(() => {
    const c: Record<StatusHari, number> = { lengkap: 0, sebagian: 0, terlewat: 0, rencana: 0 };
    for (const p of per) for (const s of URUTAN) c[s] += p.c[s];
    return c;
  }, [per]);
  const adaRencana = total.rencana > 0;
  const statusTampil = URUTAN.filter((s) => s !== "rencana" || adaRencana);

  const H = 232;
  const m = { l: 30, r: 8, t: 18, b: 34 };
  const pw = Math.max(10, W - m.l - m.r);
  const ph = H - m.t - m.b;
  const n = per.length;
  const { atas, tick } = skalaY(Math.max(0, ...per.map((p) => p.total)));
  const slot = n ? pw / n : pw;
  const bw = Math.max(2, Math.min(24, slot * 0.68));
  const gap = slot >= 8 ? 2 : 0; // celah 2px warna permukaan antar segmen
  const y = (v: number) => m.t + ph - (v / atas) * ph;
  const tiapLabel = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 30))));
  const iHari = per.findIndex((p) => p.t === hariIni);

  const ringkasAria =
    n === 0
      ? "Tren harian: belum ada tanggal pada rentang."
      : `Tren harian jumlah petugas per status, ${tglPendek(tanggal[0])} sampai ${tglPendek(tanggal[n - 1])}: total ${total.lengkap} hari lengkap, ${total.sebagian} sebagian, ${total.terlewat} terlewat${adaRencana ? `, ${total.rencana} rencana` : ""}.`;

  const h = hover != null ? per[hover] : null;
  const xTip = hover != null ? m.l + slot * hover + slot / 2 : 0;

  return (
    <section className={KARTU}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13.5px] font-extrabold">Tren harian</h3>
        <span className="text-[11.5px] text-[#7B8794]">jumlah petugas per status laporan</span>
        <div className="flex-1" />
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#4D5B6B]" aria-label="Legenda">
          {statusTampil.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <Swatch s={s} />
              {LABEL[s]} <b className="font-bold text-[#14202E]">{total[s]}</b>
            </li>
          ))}
        </ul>
      </div>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        {n === 0 || per.every((p) => p.total === 0) ? (
          <p className="flex h-[150px] items-center justify-center text-[12px] text-[#7B8794]">Belum ada hari kerja pada rentang ini.</p>
        ) : (
          <>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ringkasAria} className="block max-w-full" style={{ fontFamily: "inherit" }}>
              <DefPola />
              {/* sorotan hari ini */}
              {iHari >= 0 && (
                <g>
                  <rect x={m.l + slot * iHari} y={m.t - 4} width={slot} height={ph + 4} fill="#1F6FD1" opacity={0.06} rx={3} />
                  <text x={Math.min(W - m.r - 2, Math.max(m.l + 2, m.l + slot * iHari + slot / 2))} y={m.t - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1F6FD1">
                    hari ini
                  </text>
                </g>
              )}
              {/* grid + sumbu y */}
              {tick.map((v) => (
                <g key={v}>
                  <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#D5DCE7" : GRID} strokeWidth={1} />
                  <text x={m.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={11} fill={TINTA_3} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {v}
                  </text>
                </g>
              ))}
              {/* kolom bertumpuk */}
              {per.map((p, i) => {
                const x = m.l + slot * i + (slot - bw) / 2;
                let dasar = 0;
                const seg = statusTampil.filter((s) => p.c[s] > 0);
                return (
                  <g key={p.t} opacity={hover == null || hover === i ? 1 : 0.45}>
                    {seg.map((s, j) => {
                      const y0 = y(dasar);
                      const y1 = y(dasar + p.c[s]);
                      dasar += p.c[s];
                      const tinggi = Math.max(0, y0 - y1 - (j > 0 ? gap : 0));
                      const atasSeg = y1;
                      return j === seg.length - 1 ? (
                        <path key={s} d={batangAtas(x, atasSeg, bw, tinggi, 4)} fill={isiStatus(s)} />
                      ) : (
                        <rect key={s} x={x} y={atasSeg} width={bw} height={tinggi} fill={isiStatus(s)} />
                      );
                    })}
                  </g>
                );
              })}
              {/* label sumbu x */}
              {per.map((p, i) => {
                // label tiap k tanggal; tanggal hari ini selalu berlabel, tetangganya yg terlalu dekat disembunyikan
                const dekatHariIni = iHari >= 0 && i !== iHari && Math.abs(i - iHari) < tiapLabel * 0.6;
                if (!(i === iHari || (i % tiapLabel === 0 && !dekatHariIni))) return null;
                const cx = m.l + slot * i + slot / 2;
                const bulan = i === 0 || tglAngka(p.t) <= tiapLabel;
                return (
                  <g key={p.t}>
                    <text x={cx} y={H - m.b + 15} textAnchor="middle" fontSize={11} fontWeight={i === iHari ? 800 : 500} fill={i === iHari ? "#1F6FD1" : TINTA_2}>
                      {tglAngka(p.t)}
                    </text>
                    {bulan && (
                      <text x={cx} y={H - m.b + 28} textAnchor="middle" fontSize={11} fill={TINTA_3}>
                        {bulanSingkat(p.t)}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* area hover (lebih besar dari batang) */}
              {per.map((p, i) => (
                <rect
                  key={p.t}
                  x={m.l + slot * i}
                  y={m.t - 4}
                  width={slot}
                  height={ph + 4}
                  fill={SURFACE}
                  opacity={0}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                >
                  <title>{`${tglPanjang(p.t)} — ${statusTampil.map((s) => `${LABEL[s].toLowerCase()} ${p.c[s]}`).join(", ")}`}</title>
                </rect>
              ))}
            </svg>
            {h && (
              <div
                className="pointer-events-none absolute top-1 z-10 w-[190px] rounded-lg border border-[#E3E8EE] bg-white px-2.5 py-2 text-[11.5px] shadow-md"
                style={{ left: Math.min(Math.max(0, xTip - 95), Math.max(0, W - 190)) }}
                role="status"
              >
                <p className="mb-1 font-bold" style={{ color: TINTA }}>
                  {tglPanjang(h.t)}
                </p>
                {statusTampil.map((s) => (
                  <p key={s} className="flex items-center gap-1.5 text-[#4D5B6B]">
                    <Swatch s={s} />
                    <span className="flex-1">{LABEL[s]}</span>
                    <b className="tabular-nums text-[#14202E]">{h.c[s]}</b>
                  </p>
                ))}
                <p className="mt-1 flex border-t border-[#EDF0F4] pt-1 text-[#4D5B6B]">
                  <span className="flex-1">Total petugas bekerja</span>
                  <b className="tabular-nums text-[#14202E]">{h.total}</b>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- b. Kepatuhan per kecamatan
export function KepatuhanKecamatan({ hariIni, rows }: { hariIni: string; rows: BarisGrafik[] }) {
  const [ref, W] = useLebar(360);
  const { data, kosong } = useMemo(() => {
    const peta = new Map<string, { n: number; m: number; petugas: number }>();
    for (const r of rows) {
      const kec = r.tujuan.length ? r.tujuan : ["Tanpa tujuan ST"];
      let n = 0,
        mm = 0;
      for (const [t, s] of Object.entries(r.status)) {
        if (s === "rencana" || t > hariIni) continue;
        mm++;
        if (s === "lengkap") n++;
      }
      for (const k of kec) {
        const x = peta.get(k) ?? { n: 0, m: 0, petugas: 0 };
        x.n += n;
        x.m += mm;
        x.petugas++;
        peta.set(k, x);
      }
    }
    const semua = Array.from(peta.entries()).map(([kec, v]) => ({ kec, ...v, p: v.m ? v.n / v.m : 0 }));
    return {
      data: semua.filter((d) => d.m > 0).sort((a, b) => b.p - a.p || b.m - a.m || a.kec.localeCompare(b.kec)),
      kosong: semua.filter((d) => d.m === 0).length,
    };
  }, [rows, hariIni]);

  const lebarLabel = Math.min(132, Math.max(88, W * 0.32));
  const lebarNilai = 78;
  const bx = lebarLabel + 8;
  const bwMaks = Math.max(30, W - bx - lebarNilai);
  const tinggiBaris = 26;
  const H = data.length * tinggiBaris + 4;
  const potong = (s: string) => {
    const maks = Math.floor(lebarLabel / 6.6);
    return s.length > maks ? s.slice(0, maks - 1) + "…" : s;
  };
  const totN = data.reduce((s, d) => s + d.n, 0);
  const totM = data.reduce((s, d) => s + d.m, 0);
  const aria =
    data.length === 0
      ? "Kepatuhan per kecamatan: belum ada hari kerja yang sudah lewat."
      : `Kepatuhan per kecamatan tujuan ST, persen hari lengkap dari hari kerja yang sudah lewat atau hari ini. Tertinggi ${data[0].kec} ${Math.round(data[0].p * 100)} persen, terendah ${data[data.length - 1].kec} ${Math.round(data[data.length - 1].p * 100)} persen.`;

  return (
    <section className={KARTU}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13.5px] font-extrabold">Kepatuhan per kecamatan</h3>
        <span className="text-[11.5px] text-[#7B8794]">% hari lengkap s.d. hari ini</span>
        <div className="flex-1" />
        {totM > 0 && (
          <span className="text-[11.5px] text-[#4D5B6B]">
            Total <b className="text-[#14202E]">{Math.round((totN / totM) * 100)}%</b> ({totN}/{totM})
          </span>
        )}
      </div>
      <div ref={ref} className="max-h-[260px] overflow-y-auto">
        {data.length === 0 ? (
          <p className="flex h-[150px] items-center justify-center text-center text-[12px] text-[#7B8794]">Belum ada hari kerja yang sudah lewat untuk dihitung.</p>
        ) : (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="block max-w-full" style={{ fontFamily: "inherit" }}>
            {data.map((d, i) => {
              const yy = i * tinggiBaris + 4;
              const tb = 12;
              const yb = yy + (tinggiBaris - tb) / 2 - 2;
              const lebar = d.p * bwMaks;
              return (
                <g key={d.kec}>
                  <title>{`${d.kec}: ${d.n} dari ${d.m} hari kerja lengkap (${Math.round(d.p * 100)}%) · ${d.petugas} petugas`}</title>
                  <text x={lebarLabel} y={yb + tb / 2 + 4} textAnchor="end" fontSize={11.5} fill={TINTA}>
                    {potong(d.kec)}
                  </text>
                  <rect x={bx} y={yb} width={bwMaks} height={tb} rx={4} fill="#F3F5F8" />
                  {lebar > 0 && <path d={batangKanan(bx, yb, Math.max(lebar, 3), tb, 4)} fill={WARNA_STATUS.lengkap} />}
                  <text x={bx + bwMaks + 6} y={yb + tb / 2 + 4} fontSize={11} fill={TINTA_2} style={{ fontVariantNumeric: "tabular-nums" }}>
                    <tspan fontWeight={700} fill={TINTA}>
                      {Math.round(d.p * 100)}%
                    </tspan>{" "}
                    {d.n}/{d.m}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {kosong > 0 && <p className="mt-1.5 text-[11px] text-[#7B8794]">{kosong} kecamatan belum punya hari kerja yang sudah lewat.</p>}
    </section>
  );
}
