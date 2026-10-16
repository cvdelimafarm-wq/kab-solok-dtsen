"use client";

// app/sigap/spdt/DaftarSpdt.tsx
//
// (16 Okt 2026) Tab Daftar KK: pencarian, urutan (Nama / Terdekat), dikelompokkan per Jorong; tiap baris punya tombol Navigasi langsung.
// Daftar dibatasi bertahap (80 baris, "Tampilkan lebih banyak") agar tetap ringan di HP untuk Supervisor (811 KK).

import { useEffect, useMemo, useState } from "react";
import Ik from "./Ik";
import { catatBukaKk } from "./useSpdt";
import { akurasiRendah, judulKata, kelompokJorong, tautanNavigasi, teksJarak, type KkSpdt } from "@/lib/spdtNtp";

const HALAMAN = 80;

export default function DaftarSpdt({
  kk,
  jarak,
  urut,
  onUrut,
  cari,
  onCari,
  onPilih,
  terpilih,
  tampilPpl,
}: {
  kk: KkSpdt[];
  jarak: Map<number, number> | null;
  urut: "nama" | "dekat";
  onUrut: () => void;
  cari: string;
  onCari: (s: string) => void;
  onPilih: (id: number) => void;
  terpilih: number | null;
  tampilPpl: boolean;
}) {
  const [batas, setBatas] = useState(HALAMAN);
  useEffect(() => setBatas(HALAMAN), [kk, urut]);

  const datar = useMemo(() => {
    if (urut === "dekat" && jarak) return [...kk].sort((a, b) => (jarak.get(a.id) ?? 1e12) - (jarak.get(b.id) ?? 1e12));
    return null;
  }, [kk, urut, jarak]);
  const grup = useMemo(() => (datar ? null : kelompokJorong(kk)), [datar, kk]);

  const baris = (k: KkSpdt) => (
    <li key={k.id} className={`flex items-stretch gap-2 px-3 py-2.5 ${terpilih === k.id ? "bg-[#EAF1FC]" : ""}`}>
      <button type="button" onClick={() => onPilih(k.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14px] font-bold text-[#0F2A52]">{k.nama_kk}</span>
        <span className="block truncate text-[12px] text-[#55657D]">
          {k.anggota_lain ? `${k.anggota_lain} · ` : ""}
          {k.alamat ? judulKata(k.alamat) : judulKata(k.jorong)}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[#55657D]">
          {tampilPpl && <span className="font-semibold">{judulKata(k.ppl_nama)}</span>}
          {jarak?.has(k.id) && <span className="font-bold text-[#1F5FD1]">{teksJarak(jarak.get(k.id) as number)}</span>}
          {akurasiRendah(k.akurasi_m) && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FFF4D6] px-1.5 py-[1px] font-bold text-[#8A6200]">
              <Ik n="awas" className="h-3 w-3" />
              GPS ±{Math.round(k.akurasi_m ?? 0)} m
            </span>
          )}
        </span>
      </button>
      <a
        href={tautanNavigasi(k.lat, k.lng)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => catatBukaKk(k.id, true)}
        aria-label={`Navigasi ke ${k.nama_kk}`}
        className="grid h-11 w-11 flex-none place-items-center self-center rounded-full bg-[#1F5FD1] text-white active:bg-[#1A4FB0]"
      >
        <Ik n="arah" className="h-5 w-5" />
      </a>
    </li>
  );

  let sisa = batas;
  return (
    <section className="flex flex-1 flex-col gap-2 px-2.5 pb-24 pt-2">
      <div className="flex gap-1.5">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-[#DCE5F2] bg-white px-3 text-[#8A96A8]">
          <Ik n="cari" className="h-4 w-4" />
          <span className="sr-only">Cari nama KK</span>
          <input type="search" value={cari} onChange={(e) => onCari(e.target.value)} placeholder="Cari nama, alamat, jorong" className="min-w-0 flex-1 bg-transparent text-[14px] text-[#1B2B4B] outline-none placeholder:text-[#8A96A8]" />
        </label>
        <button type="button" onClick={onUrut} aria-label={`Urutan: ${urut === "nama" ? "per Jorong dan nama" : "terdekat"}. Ketuk untuk mengganti`} className="inline-flex h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-[12px] border border-[#DCE5F2] bg-white px-3 text-[13px] font-bold text-[#0F2A52] active:bg-[#F1F5FC]">
          <Ik n={urut === "dekat" ? "lokasi" : "pin"} className="h-4 w-4" />
          {urut === "nama" ? "Per Jorong" : "Terdekat"}
        </button>
      </div>

      {kk.length === 0 ? (
        <p className="rounded-[16px] bg-white px-4 py-8 text-center text-[13.5px] text-[#55657D]">Tidak ada KK yang cocok.</p>
      ) : datar ? (
        <ul className="divide-y divide-[#EEF2F7] overflow-hidden rounded-[16px] bg-white shadow-[0_6px_18px_rgba(15,42,82,.07)]">{datar.slice(0, batas).map(baris)}</ul>
      ) : (
        grup!.map((g) => {
          if (sisa <= 0) return null;
          const tampil = g.kk.slice(0, sisa);
          sisa -= tampil.length;
          return (
            <div key={g.kunci}>
              <h3 className="px-1 pb-1 pt-1.5 text-[12px] font-extrabold uppercase tracking-[0.04em] text-[#44546F]">
                {judulKata(g.jorong)} <span className="font-semibold normal-case tracking-normal text-[#6B7A90]">· {judulKata(g.nagari)} · {g.kk.length} KK</span>
              </h3>
              <ul className="divide-y divide-[#EEF2F7] overflow-hidden rounded-[16px] bg-white shadow-[0_6px_18px_rgba(15,42,82,.07)]">{tampil.map(baris)}</ul>
            </div>
          );
        })
      )}

      {kk.length > batas && (
        <button type="button" onClick={() => setBatas((b) => b + HALAMAN)} className="h-11 rounded-[12px] border border-[#CBD6E6] bg-white text-[13.5px] font-bold text-[#1F5FD1] active:bg-[#F1F5FC]">
          Tampilkan lebih banyak ({kk.length - batas} lagi)
        </button>
      )}
    </section>
  );
}
