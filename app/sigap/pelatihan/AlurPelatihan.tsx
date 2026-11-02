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
import { ringkasRinci, type Rinci, type StatusRinci } from "@/lib/progresPelatihan";
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
export function StripPelatihan({ daftar, status, aktif, onGulir, hrefAlih, cekGulir }: Data & { aktif: string | null; onGulir?: (kode: string) => void; hrefAlih?: Partial<Record<string, string>>; cekGulir?: (kode: string) => boolean }) {
  const wadah = useRef<HTMLOListElement | null>(null);
  const fokus = aktif ?? daftar[Math.max(0, status.findIndex((s) => s === "sekarang"))]?.kode ?? null;
  useEffect(() => {
    const w = wadah.current;
    const ini = w?.querySelector<HTMLElement>('[data-fokus="1"]');
    if (!w || !ini) return;
    // (2 Nov 2026) butir fokus dibawa ke tengah tetapi dijepit supaya butir pertama / terakhir tidak terpotong di tepi
    const maks = Math.max(0, w.scrollWidth - w.clientWidth);
    w.scrollLeft = Math.min(maks, Math.max(0, ini.offsetLeft - (w.clientWidth - ini.offsetWidth) / 2));
  }, [fokus]);
  const n = daftar.length;
  return (
    <ol ref={wadah} className="m-0 flex list-none gap-0 overflow-x-auto px-1 pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Ikon langkah pelatihan">
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
            ) : onGulir && !l.halaman && !cekGulir ? (
              <button type="button" className={`${kelas} hover:bg-[#F4F8FE]`} title={l.judul} aria-label={`Ke langkah ${i + 1}: ${l.judul}`} onClick={() => onGulir(l.kode)}>
                {isi}
              </button>
            ) : (
              <Link
                href={hrefAlih?.[l.kode] ?? l.href}
                className={`${kelas} hover:bg-[#F4F8FE]`}
                title={l.judul}
                aria-label={`Buka langkah ${i + 1}: ${l.judul}`}
                // (3 Nov 2026) bila kartu langkah ini ada di halaman yang sedang dibuka (tab Hari ini / Pelatihan), cukup menggulir ke kartunya
                onClick={(e) => {
                  if (onGulir && cekGulir?.(l.kode)) {
                    e.preventDefault();
                    onGulir(l.kode);
                  }
                }}
              >
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
export function PenunjukPelatihan({ daftar, status, aktif, hrefAlih }: Data & { aktif: string; hrefAlih?: Partial<Record<string, string>> }) {
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
        <StripPelatihan daftar={daftar} status={status} aktif={aktif} hrefAlih={hrefAlih} />
      </div>
      <p className="mb-0 mt-1 text-[12px] text-[#6B7A90]">
        {p.selesai} dari {p.wajib} langkah selesai
      </p>
    </section>
  );
}

/**
 * (3 Nov 2026) Kartu "Langkah pelatihan" untuk tab Hari ini dan tab Pelatihan (tanpa langkah "aktif": tab-tab ini memuat beberapa langkah sekaligus).
 * Isinya lajur ikon yang digeser mendatar, sama dengan tab Instrumen; menggantikan daftar tahap berjejer ke bawah. Ketuk ikon: menggulir ke kartunya bila ada di halaman ini,
 * kalau tidak membuka halamannya.
 */
export function LangkahGeser({ daftar, status, hrefAlih, onGulir, cekGulir }: Data & { hrefAlih?: Partial<Record<string, string>>; onGulir?: (kode: string) => void; cekGulir?: (kode: string) => boolean }) {
  if (daftar.length === 0) return null;
  const p = progresLangkah(daftar);
  const idx = Math.max(0, daftar.findIndex((l, i) => status[i] === "sekarang" && !l.tambahan));
  const berikut = p.semua ? null : daftar[idx];
  const s = berikut ? status[idx] : "selesai";
  return (
    <section aria-label="Langkah pelatihan" className="rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[.4px] text-[#6B7A90]">Langkah pelatihan</p>
          <p className="m-0 text-[14.5px] font-extrabold text-[#0F2A52]">{berikut ? `Berikutnya: ${berikut.singkat} · langkah ${idx + 1} dari ${daftar.length}` : "Semua langkah wajib selesai"}</p>
        </div>
        <span className={`mt-0.5 flex-none rounded-full px-2 py-0.5 text-[11px] font-extrabold ${WARNA_CHIP[s]}`}>{teksStatusLangkah(s)}</span>
      </div>
      <div className="mt-2.5">
        <StripPelatihan daftar={daftar} status={status} aktif={null} hrefAlih={hrefAlih} onGulir={onGulir} cekGulir={cekGulir} />
      </div>
      <p className="mb-0 mt-1 text-[12px] text-[#6B7A90]">
        {p.selesai} dari {p.wajib} langkah selesai · geser ikon ke samping untuk melihat semuanya
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

// ---------------------------------------------------------------------------------------------------------------------------------------------
// (2 Nov 2026) DAFTAR PROGRES (tab Pelatihan). Menggantikan kartu "LANGKAH BERIKUTNYA": satu baris per tahap, status tegas dan progres x/y.
// ---------------------------------------------------------------------------------------------------------------------------------------------
const GAYA_RINCI: Record<StatusRinci, { bulat: string; chip: string }> = {
  selesai: { bulat: "bg-[#19A463] text-white", chip: "bg-[#E3F6EC] text-[#13794B]" },
  berjalan: { bulat: "border-2 border-[#1F5FD1] bg-white text-[#1F5FD1]", chip: "bg-[#E3EEFF] text-[#1F5FD1]" },
  belum_dibuka: { bulat: "border-2 border-dashed border-[#9AA9BF] bg-white text-[#9AA9BF]", chip: "bg-[#FFF4D6] text-[#8A6200]" },
  belum_dikerjakan: { bulat: "border-2 border-[#9AA9BF] bg-white text-[#9AA9BF]", chip: "bg-[#EEF2F7] text-[#55657D]" },
  menyusul: { bulat: "border-2 border-[#E1E9F6] bg-[#F5F8FE] text-[#B6C1D3]", chip: "bg-[#EEF2F7] text-[#6B7A90]" },
  terlewat: { bulat: "bg-[#B42329] text-white", chip: "bg-[#FDE8E8] text-[#B42329]" },
  terkunci: { bulat: "border-2 border-[#E1E9F6] bg-[#F5F8FE] text-[#B6C1D3]", chip: "bg-[#EEF2F7] text-[#6B7A90]" },
};

function BulatRinci({ r, nomor }: { r: Rinci; nomor: number }) {
  return (
    <span className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[13px] font-extrabold ${GAYA_RINCI[r.status].bulat}`} aria-hidden>
      {r.status === "selesai" ? <Centang /> : r.status === "terlewat" ? "!" : nomor}
    </span>
  );
}

/**
 * Daftar progres tahap pelatihan. Tiap baris dapat diketuk: halaman sendiri -> membuka halamannya; presensi -> tab Hari ini; foto -> Kamera SIGAP;
 * tahap yang kartunya ada di halaman ini (Adu Sigap) -> menggulir ke kartunya.
 */
export function DaftarProgres({ rinci, hrefHariIni, hrefKamera, onGulir }: { rinci: Rinci[]; hrefHariIni: string; hrefKamera: string | null; onGulir?: (kode: string) => void }) {
  const r = ringkasRinci(rinci);
  return (
    <section aria-label="Progres pelatihan" className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.1)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[15.5px] font-extrabold text-[#0F2A52]">Progres pelatihan Anda</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-extrabold ${r.selesai === r.wajib ? "bg-[#E3F6EC] text-[#13794B]" : "bg-[#FFF4D6] text-[#8A6200]"}`}>
          {r.selesai}/{r.wajib} selesai
        </span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#E1E9F6]" role="progressbar" aria-valuemin={0} aria-valuemax={r.wajib} aria-valuenow={r.selesai} aria-label={`${r.selesai} dari ${r.wajib} tahap selesai`}>
        <div className="h-full rounded-full bg-[#19A463] transition-all" style={{ width: `${r.persen}%` }} />
      </div>
      <ol className="m-0 mt-3 list-none space-y-1.5 p-0">
        {rinci.map((x, i) => {
          const g = GAYA_RINCI[x.status];
          const dalam = (
            <>
              <BulatRinci r={x} nomor={i + 1} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold leading-snug text-[#0F2A52]">
                  {x.judul}
                  {x.tambahan && <span className="ml-1.5 text-[11px] font-semibold text-[#6B7A90]">(tambahan)</span>}
                </span>
                {x.progres && (
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#E1E9F6]" aria-hidden>
                    <span className="block h-full rounded-full bg-[#1F5FD1]" style={{ width: `${Math.round((x.progres.x / x.progres.y) * 100)}%` }} />
                  </span>
                )}
              </span>
              <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-extrabold ${g.chip}`}>{x.teks}</span>
            </>
          );
          const kelas = "flex w-full items-center gap-3 rounded-xl border border-[#EEF2F7] px-2.5 py-2 text-left hover:bg-[#F8FAFE]";
          const tujuan = x.halaman ? x.href : x.kode === "hadir" ? hrefHariIni : x.kode === "foto_awal" || x.kode === "foto_akhir" ? hrefKamera : null;
          return (
            <li key={x.kode}>
              {tujuan ? (
                <Link href={tujuan} className={kelas}>
                  {dalam}
                </Link>
              ) : onGulir ? (
                <button type="button" className={kelas} onClick={() => onGulir(x.kode)}>
                  {dalam}
                </button>
              ) : (
                <div className={kelas}>{dalam}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
