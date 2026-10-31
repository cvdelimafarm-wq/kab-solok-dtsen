"use client";

// app/portal/KartuSurvei.tsx
//
// (31 Okt 2026) Satu kartu per survei di Beranda (permintaan user): nama survei + satu poin mendesak sesuai peran. Pelatihan dan Pendataan satu survei
// boleh dua kartu. Peringatan merah (belum ada kegiatan sampai 13.00) di atas poin; realisasi berdampingan dengan poin Translok (bukan pengganti).
// Kartu usang (selesai) redup dan di urutan bawah. Aturan: lib/sigapBerandaKartu.ts. Tombol berukuran >= 44px.

import Link from "next/link";
import IkonMenu from "./IkonMenu";
import { labelPeran, poinKegiatanSelanjutnya, type KartuBeranda, type NadaPoin } from "@/lib/sigapBerandaKartu";

const GARIS: Record<NadaPoin, string> = { merah: "border-[#D43A3A]", emas: "border-[#F4B400]", biru: "border-[#3B78E0]", abu: "border-[#C9D3E3]", hijau: "border-[#19A463]" };
const TOMBOL: Record<NadaPoin, string> = { merah: "bg-[#B42329] text-white", emas: "bg-[#0F2A52] text-white", biru: "bg-[#1F5FD1] text-white", abu: "bg-[#EEF2F7] text-[#0F2A52]", hijau: "bg-[#E3F6EC] text-[#13794B]" };
const JENIS: Record<KartuBeranda["jenis"], string> = { pelatihan: "PELATIHAN", pendataan: "PENDATAAN", lain: "KEGIATAN" };

export default function KartuSurvei({ k, sibuk, onSso }: { k: KartuBeranda; sibuk?: boolean; onSso?: () => void }) {
  const r = k.realisasi;
  const judul = (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        <span className="text-[10.5px] font-extrabold tracking-[0.14em] text-[#6B7A90]">{JENIS[k.jenis]}</span>
        {k.peran && <span className="rounded-full bg-[#E6EEFC] px-2 py-[1px] text-[10.5px] font-bold text-[#1F5FD1]">{labelPeran(k.peran)}</span>}
        {k.redup && <span className="rounded-full bg-[#EEF2F7] px-2 py-[1px] text-[10.5px] font-bold text-[#6B7A90]">Selesai</span>}
      </span>
      <b className="mt-0.5 block text-[16px] font-extrabold leading-snug text-[#0F2A52]">{sibuk ? "Membuka…" : k.judul}</b>
    </span>
  );
  const kepala = k.sso ? (
    <button type="button" onClick={onSso} disabled={sibuk} className="flex w-full min-h-[44px] items-center gap-2 text-left">
      {judul}
      <span aria-hidden className="flex-none text-[20px] text-[#A5B3C7]">›</span>
    </button>
  ) : (
    <Link href={k.href} className="flex min-h-[44px] items-center gap-2" aria-label={`Buka ${k.judul}`}>
      {judul}
      <span aria-hidden className="flex-none text-[20px] text-[#A5B3C7]">›</span>
    </Link>
  );

  return (
    <article
      aria-label={k.judul}
      className={`rounded-[20px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)] ${k.redup ? "opacity-60 grayscale-[35%]" : ""}`}
    >
      {kepala}

      {k.peringatan && (
        <Link href={k.peringatan.href} role="alert" className="mt-2 flex items-start gap-2.5 rounded-[14px] border border-[#F2B8B5] bg-[#FDE8E8] px-3 py-2.5 text-[#7A1D22] active:bg-[#FAD4D2]">
          <IkonMenu n="awas" className="mt-0.5 h-5 w-5 flex-none text-[#B42329]" />
          <span className="min-w-0 flex-1 text-[13px] leading-snug">
            <b className="block text-[13.5px]">{k.peringatan.judul}</b>
            {k.peringatan.uraian}
          </span>
        </Link>
      )}

      {k.poin && !k.redup && (
        <div className={`mt-2 flex items-center gap-3 rounded-[14px] border-l-4 bg-[#F7FAFF] py-2.5 pl-3 pr-2.5 ${GARIS[k.poin.nada]}`}>
          <span className="min-w-0 flex-1">
            <b className="block text-[14.5px] font-extrabold leading-tight text-[#0F2A52]">{poinKegiatanSelanjutnya(k.poin.kode) ? `Selanjutnya: ${k.poin.judul}` : k.poin.judul}</b>
            {k.poin.uraian && <span className="mt-0.5 block text-[12.5px] leading-snug text-[#55657D]">{k.poin.uraian}</span>}
          </span>
          {/* (31 Okt 2026) Tombol kartu SELALU "Masuk" (permintaan user): tujuan tetap tugas yang disebut di sebelah kirinya; kata aksi aslinya hanya untuk pembaca layar */}
          <Link href={k.poin.href} aria-label={`Masuk: ${k.poin.aksi}`} className={`inline-flex min-h-[44px] flex-none items-center rounded-[12px] px-4 text-[13px] font-extrabold ${TOMBOL[k.poin.nada]}`}>
            Masuk
          </Link>
        </div>
      )}

      {r && !k.redup && (
        <div className="mt-2" role="group" aria-label="Realisasi pendataan">
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className={`font-bold ${r.bermasalah ? "text-[#B42329]" : "text-[#13794B]"}`}>{r.bermasalah ? "Realisasi tertinggal" : "Realisasi sesuai target"}</span>
            <span className="text-[#6B7A90]">{r.persen}%{r.persenWaktu !== null ? ` · waktu ${r.persenWaktu}%` : ""}</span>
          </div>
          <div className="relative mt-1 h-2 rounded-full bg-[#E1E9F6]" role="img" aria-label={`Realisasi ${r.persen} persen${r.persenWaktu !== null ? `, waktu terpakai ${r.persenWaktu} persen` : ""}`}>
            <span className={`absolute inset-y-0 left-0 rounded-full ${r.bermasalah ? "bg-[#D43A3A]" : "bg-[#19A463]"}`} style={{ width: `${Math.min(100, r.persen)}%` }} />
            {r.persenWaktu !== null && <span aria-hidden className="absolute -top-0.5 h-3 w-[3px] rounded bg-[#0F2A52]" style={{ left: `calc(${Math.min(100, r.persenWaktu)}% - 1px)` }} />}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-[#6B7A90]">{r.ket}</p>
        </div>
      )}
    </article>
  );
}
