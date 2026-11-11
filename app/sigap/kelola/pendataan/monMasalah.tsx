"use client";

// app/sigap/kelola/pendataan/monMasalah.tsx
// (11 Nov 2026) Bagian tampilan bersama monitoring untuk HP: papan "Perlu tindakan" (siapa bermasalah, apa masalahnya, ke mana menyelesaikan)
// dan grafik batang capaian. Murni tampilan; angkanya dihitung pemanggil.

import Link from "next/link";
import { useState } from "react";

/** Tautan ke tab Kelola Pendataan tempat masalah diselesaikan. */
export const KE_NOTIFIKASI = "/sigap/kelola/pendataan?tab=siaran&sub=manual";
export const KE_VERIFIKASI_TRANSLOK = "/sigap/kelola/pendataan?tab=administrasi&sub=verifikasi";
export const KE_ALOKASI_TIM = "/sigap/kelola/pendataan?tab=tim";

export type AksiMasalah = { teks: string; href?: string; klik?: () => void };
export type Masalah = {
  kunci: string;
  nama: string;
  sub?: string;
  /** 3 = mendesak (merah), 2 = perlu perhatian (kuning), 1 = info (abu) */
  berat: 1 | 2 | 3;
  masalah: string;
  aksi: AksiMasalah[];
};

const GAYA: Record<1 | 2 | 3, { garis: string; chip: string; label: string }> = {
  3: { garis: "border-l-[#B42329]", chip: "bg-[#FDE8E8] text-[#9B1C23]", label: "Mendesak" },
  2: { garis: "border-l-[#D99A00]", chip: "bg-[#FFF4D6] text-[#8A6200]", label: "Perhatian" },
  1: { garis: "border-l-[#9AA8BC]", chip: "bg-[#EEF2F7] text-[#55657D]", label: "Info" },
};
const tombolAksi = "inline-flex min-h-[40px] items-center rounded-full bg-[#E4ECFA] px-3.5 text-[12.5px] font-extrabold text-[#0F2A52] active:bg-[#D3E0F6]";

export function PapanMasalah({ judul, daftar, kosong, awal = 4 }: { judul: string; daftar: Masalah[]; kosong: string; awal?: number }) {
  const [semua, setSemua] = useState(false);
  const urut = [...daftar].sort((a, b) => b.berat - a.berat || a.nama.localeCompare(b.nama));
  const tampil = semua ? urut : urut.slice(0, awal);
  const mendesak = daftar.filter((m) => m.berat === 3).length;
  return (
    <section className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4" aria-label={judul}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">{judul}</h2>
        {daftar.length > 0 && (
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ${mendesak > 0 ? "bg-[#FDE8E8] text-[#9B1C23]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>
            {daftar.length} petugas{mendesak > 0 ? ` · ${mendesak} mendesak` : ""}
          </span>
        )}
      </div>
      {daftar.length === 0 && <p className="mt-2 rounded-[12px] bg-[#E8F6EE] px-3 py-2.5 text-[13px] text-[#0B6B3F]">{kosong}</p>}
      <ul className="mt-2.5 space-y-2">
        {tampil.map((m) => (
          <li key={m.kunci} className={`rounded-[12px] border border-[#E8EDF5] border-l-[5px] bg-white p-3 ${GAYA[m.berat].garis}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <b className="block break-words text-[14px] leading-tight text-[#0F2A52]">{m.nama}</b>
                {m.sub && <span className="text-[11.5px] text-[#6B7A90]">{m.sub}</span>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${GAYA[m.berat].chip}`}>{GAYA[m.berat].label}</span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-snug text-[#1B2B4B]">{m.masalah}</p>
            {m.aksi.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.aksi.map((a) =>
                  a.href ? (
                    <Link key={a.teks} href={a.href} className={tombolAksi}>
                      {a.teks} ›
                    </Link>
                  ) : (
                    <button key={a.teks} type="button" onClick={a.klik} className={tombolAksi}>
                      {a.teks}
                    </button>
                  ),
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {daftar.length > awal && (
        <button type="button" onClick={() => setSemua((x) => !x)} className="mt-2.5 min-h-[40px] w-full rounded-[10px] bg-[#F5F8FE] text-[12.5px] font-extrabold text-[#1F5FD1]">
          {semua ? "Tampilkan lebih sedikit" : `Tampilkan semua ${daftar.length}`}
        </button>
      )}
    </section>
  );
}

export type BatangItem = { kunci: string; label: string; sub?: string; persen: number; ket: string; klik?: () => void };

/** Grafik batang mendatar: urut dari capaian terendah. Garis putus-putus = target 100%. */
export function BatangCapaian({ judul, item, awal = 8, catatan }: { judul: string; item: BatangItem[]; awal?: number; catatan?: string }) {
  const [semua, setSemua] = useState(false);
  const urut = [...item].sort((a, b) => a.persen - b.persen || a.label.localeCompare(b.label));
  const tampil = semua ? urut : urut.slice(0, awal);
  if (item.length === 0) return null;
  return (
    <section className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4" aria-label={judul}>
      <h2 className="text-[15px] font-extrabold text-[#0F2A52]">{judul}</h2>
      {catatan && <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">{catatan}</p>}
      <ul className="mt-3 space-y-2">
        {tampil.map((b) => {
          const warna = b.persen >= 100 ? "bg-[#19A463]" : b.persen >= 50 ? "bg-[#1F5FD1]" : "bg-[#D99A00]";
          const isi = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-bold text-[#0F2A52]">{b.label}</span>
                <b className="shrink-0 text-[12.5px] tabular-nums text-[#0F2A52]">{b.persen}%</b>
              </div>
              <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-[#EEF2F7]" role="img" aria-label={`${b.label}: ${b.persen}% dari target`}>
                <div className={`h-full rounded-full ${warna}`} style={{ width: `${Math.min(100, b.persen)}%` }} />
              </div>
              <span className="text-[11px] text-[#6B7A90]">{b.sub ? `${b.sub} · ` : ""}{b.ket}</span>
            </>
          );
          return (
            <li key={b.kunci}>
              {b.klik ? (
                <button type="button" onClick={b.klik} className="block w-full rounded-[10px] px-1 py-1 text-left active:bg-[#F5F8FE]">
                  {isi}
                </button>
              ) : (
                <div className="px-1 py-1">{isi}</div>
              )}
            </li>
          );
        })}
      </ul>
      {item.length > awal && (
        <button type="button" onClick={() => setSemua((x) => !x)} className="mt-2 min-h-[40px] w-full rounded-[10px] bg-[#F5F8FE] text-[12.5px] font-extrabold text-[#1F5FD1]">
          {semua ? "Tampilkan lebih sedikit" : `Tampilkan semua ${item.length}`}
        </button>
      )}
    </section>
  );
}

export type SegmenHari = { kunci: string; label: string; bagian: { n: number; warna: string; nama: string }[]; klik?: () => void };

/** Batang bertumpuk per baris (mis. status translok per tanggal). */
export function TumpukHarian({ judul, baris, legenda, catatan }: { judul: string; baris: SegmenHari[]; legenda: { nama: string; warna: string }[]; catatan?: string }) {
  if (baris.length === 0) return null;
  return (
    <section className="mt-4 rounded-[18px] bg-white p-3 shadow-[0_8px_22px_rgba(15,42,82,.08)] sm:p-4" aria-label={judul}>
      <h2 className="text-[15px] font-extrabold text-[#0F2A52]">{judul}</h2>
      {catatan && <p className="mt-0.5 text-[11.5px] text-[#6B7A90]">{catatan}</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {legenda.map((l) => (
          <span key={l.nama} className="inline-flex items-center gap-1.5 text-[11.5px] text-[#55657D]">
            <i className={`inline-block h-2.5 w-2.5 rounded-sm ${l.warna}`} />
            {l.nama}
          </span>
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {baris.map((b) => {
          const total = b.bagian.reduce((a, x) => a + x.n, 0);
          const isi = (
            <div className="flex items-center gap-2">
              <span className="w-[54px] shrink-0 text-[12px] font-bold text-[#55657D]">{b.label}</span>
              <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-[#EEF2F7]" role="img" aria-label={`${b.label}: ${b.bagian.map((x) => `${x.nama} ${x.n}`).join(", ")}`}>
                {b.bagian.filter((x) => x.n > 0).map((x) => (
                  <div key={x.nama} className={`${x.warna} flex items-center justify-center text-[10px] font-extrabold text-white`} style={{ width: `${total > 0 ? (x.n / total) * 100 : 0}%` }} title={`${x.nama}: ${x.n}`}>
                    {total > 0 && x.n / total >= 0.12 ? x.n : ""}
                  </div>
                ))}
              </div>
              <span className="w-8 shrink-0 text-right text-[11.5px] tabular-nums text-[#6B7A90]">{total}</span>
            </div>
          );
          return (
            <li key={b.kunci}>
              {b.klik ? (
                <button type="button" onClick={b.klik} className="block min-h-[32px] w-full rounded-[8px] text-left active:bg-[#F5F8FE]">
                  {isi}
                </button>
              ) : (
                isi
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
