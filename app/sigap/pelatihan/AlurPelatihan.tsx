"use client";

// app/sigap/pelatihan/AlurPelatihan.tsx
//
// (2 Nov 2026) Penunjuk langkah pelatihan untuk peserta di HP (permintaan user: "bagaimana dengan tahapan pelatihan di HP?").
//  - StripPelatihan : lajur ikon langkah, warna = status (selesai hijau, sekarang biru, terlewat merah, menyusul abu-abu); cincin gelap = halaman yang sedang dibuka.
//  - PenunjukPelatihan : kartu kecil di atas halaman Undangan / Instrumen / Pretest / Posttest: "Langkah 3 dari 8 · Pretest" + lajur ikon.
//  - NavPelatihan : tombol Sebelumnya / Berikutnya di bawah halaman (memakai NavAlur yang sama dengan halaman Kelola).
// Urutan dan status dihitung di lib/alurPelatihan.ts (satu sumber untuk semua halaman). Berkas ini hanya menggambar.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { IkonTahap } from "../kelola/IkonTahap";
import { NavAlur } from "../kelola/AlurKelola";
import { catatanBerikutnya, posisiLangkah, progresLangkah, statusLangkah, teksLangkah, teksStatusLangkah, type LangkahPelatihan, type StatusLangkah } from "@/lib/alurPelatihan";

type Data = { daftar: LangkahPelatihan[]; status: StatusLangkah[] };

const WARNA_BULAT: Record<StatusLangkah, string> = {
  selesai: "bg-[#19A463] text-white",
  sekarang: "bg-[#1F5FD1] text-white",
  terlewat: "bg-[#B42329] text-white",
  menyusul: "bg-[#E1E9F6] text-[#5B6B84]",
};
const WARNA_CHIP: Record<StatusLangkah, string> = {
  selesai: "bg-[#E3F6EC] text-[#13794B]",
  sekarang: "bg-[#E3EEFF] text-[#1F5FD1]",
  terlewat: "bg-[#FDE8E8] text-[#B42329]",
  menyusul: "bg-[#EEF2F7] text-[#6B7A90]",
};

function Centang() {
  return (
    <svg aria-hidden focusable="false" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Lajur ikon langkah. `aktif` = kode halaman yang sedang dibuka (cincin gelap); null di halaman Langkah sendiri (tidak ada yang aktif).
 * `onGulir`: bila diberikan (halaman Langkah), langkah yang bagian dari halaman itu (presensi, Adu Sigap, foto) tidak berpindah halaman, hanya menggulir.
 * Digeser mendatar di layar sempit; langkah aktif (atau langkah "sekarang" pertama) dibawa ke tengah.
 */
export function StripPelatihan({ daftar, status, aktif, onGulir }: Data & { aktif: string | null; onGulir?: (kode: string) => void }) {
  const wadah = useRef<HTMLOListElement | null>(null);
  const fokus = aktif ?? daftar[Math.max(0, status.findIndex((s) => s === "sekarang"))]?.kode ?? null;
  useEffect(() => {
    const w = wadah.current;
    const ini = w?.querySelector<HTMLElement>('[data-fokus="1"]');
    if (!w || !ini) return;
    w.scrollLeft = Math.max(0, ini.offsetLeft - (w.clientWidth - ini.offsetWidth) / 2);
  }, [fokus]);
  const n = daftar.length;
  return (
    <ol ref={wadah} className="m-0 flex list-none gap-0 overflow-x-auto p-0 pb-1" aria-label="Ikon langkah pelatihan">
      {daftar.map((l, i) => {
        const s = status[i];
        const ini = l.kode === aktif;
        const kelas = "relative flex w-full flex-col items-center rounded-lg px-0.5 pb-1 pt-0.5 text-center";
        const isi = (
          <>
            <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-full transition ${WARNA_BULAT[s]} ${ini ? "outline outline-2 outline-offset-2 outline-[#0F2A52]" : ""} ${s === "sekarang" && !ini ? "shadow-[0_0_0_4px_#DCE8FB]" : ""}`}>
              {s === "selesai" ? <Centang /> : <IkonTahap kode={l.kode} />}
            </span>
            <span className={`mt-1 line-clamp-2 w-full px-0.5 text-center text-[10.5px] leading-tight ${ini ? "font-extrabold text-[#0F2A52]" : "font-semibold text-[#55657D]"}`}>
              <b className="mr-0.5">{i + 1}</b>
              {l.singkat}
              <span className="sr-only">, {teksStatusLangkah(s).toLowerCase()}</span>
            </span>
          </>
        );
        return (
          <li key={l.kode} className="relative min-w-[68px] flex-1" data-fokus={l.kode === fokus ? "1" : undefined}>
            {i > 0 && <span aria-hidden className={`absolute left-0 right-1/2 top-[19px] h-0.5 ${status[i - 1] === "selesai" ? "bg-[#7FCBA5]" : "bg-[#D5DDE9]"}`} />}
            {i < n - 1 && <span aria-hidden className={`absolute left-1/2 right-0 top-[19px] h-0.5 ${s === "selesai" ? "bg-[#7FCBA5]" : "bg-[#D5DDE9]"}`} />}
            {ini ? (
              <div className={kelas} aria-current="step" title={`Anda di langkah ${i + 1}: ${l.judul}`}>
                {isi}
              </div>
            ) : onGulir && !l.halaman ? (
              <button type="button" className={`${kelas} hover:bg-[#F4F8FE]`} title={l.judul} aria-label={`Ke langkah ${i + 1}: ${l.judul}`} onClick={() => onGulir(l.kode)}>
                {isi}
              </button>
            ) : (
              <Link href={l.href} className={`${kelas} hover:bg-[#F4F8FE]`} title={l.judul} aria-label={`Buka langkah ${i + 1}: ${l.judul}`}>
                {isi}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Kartu penunjuk di atas halaman langkah: "Langkah 3 dari 8 · Pretest", status, lajur ikon, dan jumlah langkah wajib yang selesai. */
export function PenunjukPelatihan({ daftar, status, aktif }: Data & { aktif: string }) {
  const posisi = posisiLangkah(daftar, aktif);
  if (!posisi) return null;
  const s = status[posisi.indeks];
  const p = progresLangkah(daftar);
  return (
    <section aria-label="Posisi dalam langkah pelatihan" className="rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[.4px] text-[#6B7A90]">Langkah pelatihan</p>
          <p className="m-0 text-[14.5px] font-extrabold text-[#0F2A52]" aria-current="step">
            {teksLangkah(posisi)}
          </p>
        </div>
        <span className={`mt-0.5 flex-none rounded-full px-2 py-0.5 text-[11px] font-extrabold ${WARNA_CHIP[s]}`}>{teksStatusLangkah(s)}</span>
      </div>
      <div className="mt-2.5">
        <StripPelatihan daftar={daftar} status={status} aktif={aktif} />
      </div>
      <p className="mb-0 mt-1 text-[12px] text-[#6B7A90]">
        {p.selesai} dari {p.wajib} langkah selesai · <Link href="/sigap/pelatihan" className="font-bold text-[#1F5FD1] underline">Lihat semua langkah</Link>
      </p>
    </section>
  );
}

/** Tombol Sebelumnya / Berikutnya di bawah halaman. Berikutnya bebas diklik; bila langkah itu belum saatnya, ada catatan kuning (tidak memblokir). */
export function NavPelatihan({ daftar, aktif }: { daftar: LangkahPelatihan[]; aktif: string }) {
  const posisi = posisiLangkah(daftar, aktif);
  if (!posisi) return null;
  return <NavAlur posisi={posisi} peringatan={catatanBerikutnya(daftar, aktif)} teksAkhir="Langkah terakhir pelatihan" />;
}

/** Dipakai komponen yang sudah punya daftar (Kerangka) -- menghitung status sekali. */
export const statusDari = (daftar: readonly LangkahPelatihan[]): StatusLangkah[] => statusLangkah(daftar);
