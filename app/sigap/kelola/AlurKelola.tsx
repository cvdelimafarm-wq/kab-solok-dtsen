"use client";

// app/sigap/kelola/AlurKelola.tsx
//
// (1 Nov 2026) Penunjuk tahap (di atas isi) dan tombol Sebelumnya/Berikutnya (di bawah isi) untuk halaman Kelola yang beralur.
// Logika urutan ada di lib/alurKelola.ts (murni, teruji). Dua bentuk: alur bertab (onPilih) dan alur berhalaman (tiap tahap punya href).
// (1 Nov 2026) Lajur ikon tahap di atas halaman (permintaan user): satu ikon per tahap, tahap sekarang biru, sebelumnya lembut, sesudahnya abu-abu; tiap ikon bisa diklik.
// Berikutnya BEBAS diklik. Bila halaman memberi `peringatan`, catatan kuning tampil di atas tombol (tidak memblokir).

import { useEffect, useRef } from "react";
import Link from "next/link";
import { nomorDariLabel, namaTanpaNomor, teksPosisi, tahapTerakhir, type PosisiAlur, type TahapAlur } from "@/lib/alurKelola";
import { IkonTahap } from "./IkonTahap";

type Umum = { posisi: PosisiAlur | null };

/**
 * Lajur ikon tahap. Sebelum tahap sekarang = lembut (sudah dilewati urutannya, BUKAN klaim selesai), sekarang = biru berlingkar, sesudahnya = abu-abu.
 * Tiap ikon bisa diklik (tautan bila tahap punya href, tombol bila alur bertab). Di layar sempit lajur digeser mendatar dan tahap sekarang
 * otomatis dibawa ke tengah. Lebih dari 12 tahap -> tidak digambar (terlalu padat).
 */
function LajurIkon({ posisi, onPilih }: { posisi: PosisiAlur; onPilih?: (kode: string) => void }) {
  const wadah = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const w = wadah.current;
    const ini = w?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!w || !ini) return;
    w.scrollLeft = Math.max(0, ini.offsetLeft - (w.clientWidth - ini.offsetWidth) / 2);
  }, [posisi.indeks]);
  if (posisi.urutan.length > 12) return null;
  const n = posisi.urutan.length;
  return (
    <ol ref={wadah} className="m-0 mt-2.5 flex list-none gap-0 overflow-x-auto p-0 pb-1" aria-label="Ikon tahap alur">
      {posisi.urutan.map((t, i) => {
        const sekarang = i === posisi.indeks;
        const lewat = i < posisi.indeks;
        const no = nomorDariLabel(t.label);
        const nama = namaTanpaNomor(t.label);
        const warnaBulat = sekarang
          ? "bg-[#1F5FD1] text-white ring-4 ring-[#CFE0FB]"
          : lewat
            ? "bg-[#E3EEFF] text-[#1F5FD1]"
            : "bg-[#F1F4F9] text-[#8896AB]";
        const isi = (
          <>
            <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-full transition ${warnaBulat}`}>
              <IkonTahap kode={t.ikon ?? t.kode} />
            </span>
            <span className={`mt-1 line-clamp-2 w-full px-0.5 text-center text-[10.5px] leading-tight ${sekarang ? "font-extrabold text-[#1F5FD1]" : "font-semibold text-[#55657D]"}`}>
              {no !== null ? <b className="mr-0.5">{no}</b> : null}
              {nama}
            </span>
          </>
        );
        const kelas = "relative flex w-full flex-col items-center rounded-lg px-0.5 pb-1 pt-0.5 text-center";
        return (
          <li key={t.kode} className="relative min-w-[74px] flex-1">
            {i > 0 && <span aria-hidden className={`absolute left-0 right-1/2 top-[19px] h-0.5 ${i <= posisi.indeks ? "bg-[#9DB8E6]" : "bg-[#D5DDE9]"}`} />}
            {i < n - 1 && <span aria-hidden className={`absolute left-1/2 right-0 top-[19px] h-0.5 ${i < posisi.indeks ? "bg-[#9DB8E6]" : "bg-[#D5DDE9]"}`} />}
            {sekarang ? (
              <div className={kelas} aria-current="step" title={`Tahap sekarang: ${t.label}`}>
                {isi}
              </div>
            ) : t.href ? (
              <Link href={t.href} className={`${kelas} hover:bg-[#F4F8FE]`} title={t.label} aria-label={`Buka tahap ${t.label}`}>
                {isi}
              </Link>
            ) : (
              <button type="button" className={`${kelas} hover:bg-[#F4F8FE]`} title={t.label} aria-label={`Buka tahap ${t.label}`} onClick={() => onPilih?.(t.kode)}>
                {isi}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * `ringkas` (sub-alur di dalam tab): hanya judul + lajur ikon + "Selanjutnya"; keterangan tahap dan daftar lengkap dilewati karena sub-pilihan
 * di atasnya sudah menampilkan keterangan, dan penunjuk tab di atas halaman sudah memuat daftar tahap.
 */
export function PenunjukAlur({ posisi, nama, onPilih, ringkas }: Umum & { nama: string; onPilih?: (kode: string) => void; ringkas?: boolean }) {
  if (!posisi) return null;
  const berikut = posisi.berikutnya;
  return (
    <section aria-label={`Posisi dalam alur ${nama}`} className="rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[.4px] text-[#6B7A90]">{nama}</p>
          <p className="m-0 text-[14.5px] font-extrabold text-[#0F2A52]" aria-current="step">
            {teksPosisi(posisi)}
          </p>
        </div>
      </div>
      <LajurIkon posisi={posisi} onPilih={onPilih} />
      {!ringkas && posisi.tahap.ket && <p className="mb-0 mt-1 text-[12.5px] leading-snug text-[#55657D]">{posisi.tahap.ket}</p>}
      <p className="mb-0 mt-1.5 text-[12.5px] text-[#1F5FD1]">
        {berikut ? (
          <>
            <b>Selanjutnya:</b> {berikut.label}
            {berikut.ket ? <span className="text-[#55657D]"> — {berikut.ket}</span> : null}
          </>
        ) : (
          <b>{ringkas ? "Ini langkah terakhir di tahap ini." : "Ini tahap terakhir alur."}</b>
        )}
      </p>
      {!ringkas && <DaftarTahap posisi={posisi} onPilih={onPilih} />}
    </section>
  );
}

/** (1 Nov 2026) Seluruh tahap dijejerkan agar jelas apa saja yang harus dikerjakan; tahap sekarang ditandai, setiap tahap bisa dibuka. */
function DaftarTahap({ posisi, onPilih }: { posisi: PosisiAlur; onPilih?: (kode: string) => void }) {
  return (
    <details className="group mt-2 border-t border-[#EEF1F6] pt-2">
      <summary className="cursor-pointer list-none text-[12.5px] font-bold text-[#1F5FD1] [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Lihat seluruh tahap ({posisi.urutan.length}) ›</span>
        <span className="hidden group-open:inline">Sembunyikan daftar tahap ‹</span>
      </summary>
      <ol className="m-0 mt-2 grid list-none gap-1.5 p-0">
        {posisi.urutan.map((t, i) => {
          const sekarang = i === posisi.indeks;
          const isi = (
            <>
              <span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[10.5px] font-extrabold ${sekarang ? "bg-[#1F5FD1] text-white" : "bg-[#E3EEFF] text-[#1F5FD1]"}`}>{i + 1}</span>
              <span className="min-w-0">
                <b className={`block text-[13px] ${sekarang ? "text-[#1F5FD1]" : "text-[#0F2A52]"}`}>
                  {t.label}
                  {sekarang && <em className="ml-1.5 text-[11px] font-semibold not-italic text-[#6B7A90]">(Anda di sini)</em>}
                </b>
                {t.ket && <span className="block text-[12px] leading-snug text-[#55657D]">{t.ket}</span>}
              </span>
            </>
          );
          const kelas = `flex w-full gap-2.5 rounded-lg px-2 py-1.5 text-left ${sekarang ? "bg-[#F1F6FE]" : "hover:bg-[#F8FAFC]"}`;
          return (
            <li key={t.kode}>
              {sekarang ? (
                <div className={kelas} aria-current="step">{isi}</div>
              ) : t.href ? (
                <Link href={t.href} className={kelas}>{isi}</Link>
              ) : (
                <button type="button" className={kelas} onClick={() => onPilih?.(t.kode)}>{isi}</button>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

const kelasTombol = "flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-xl border px-3.5 py-2 text-left text-[13px] font-bold transition";
const kelasAktif = "border-[#CBD6E6] bg-white text-[#0F2A52] hover:border-[#1F5FD1] hover:bg-[#F4F8FE]";
const kelasUtama = "border-[#1F5FD1] bg-[#1F5FD1] text-white hover:bg-[#184EAF]";

function Tombol({ tahap, arah, onPilih }: { tahap: TahapAlur; arah: "sebelumnya" | "berikutnya"; onPilih?: (kode: string) => void }) {
  const maju = arah === "berikutnya";
  const isi = (
    <>
      {!maju && <span aria-hidden className="text-[18px] leading-none">‹</span>}
      <span className="min-w-0 flex-1">
        <small className={`block text-[10.5px] font-semibold uppercase tracking-[.4px] ${maju ? "text-blue-100" : "text-[#6B7A90]"}`}>{maju ? "Berikutnya" : "Sebelumnya"}</small>
        <span className="block truncate">{tahap.label}</span>
      </span>
      {maju && <span aria-hidden className="text-[18px] leading-none">›</span>}
    </>
  );
  const kelas = `${kelasTombol} ${maju ? kelasUtama : kelasAktif} ${maju ? "justify-end text-right" : ""}`;
  if (tahap.href) {
    return (
      <Link href={tahap.href} className={kelas} onClick={() => window.scrollTo({ top: 0 })}>
        {isi}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={kelas}
      onClick={() => {
        onPilih?.(tahap.kode);
        window.scrollTo({ top: 0 });
      }}
    >
      {isi}
    </button>
  );
}

/** `teksAkhir` (2 Nov 2026): kalimat pengganti di langkah terakhir (mis. "Langkah terakhir pelatihan"). `judul` (sub-alur): teks kecil di atas tombol, mis. "Langkah dalam tahap 7 · Administrasi & SPJ", agar tidak tertukar dengan tombol tahap di bawahnya. */
export function NavAlur({ posisi, onPilih, peringatan, judul, teksAkhir }: Umum & { onPilih?: (kode: string) => void; peringatan?: string | null; judul?: string; teksAkhir?: string }) {
  if (!posisi) return null;
  const adaTombol = posisi.sebelumnya || posisi.berikutnya;
  if (!adaTombol) return null;
  return (
    <nav aria-label="Sebelumnya dan berikutnya dalam alur" className="mt-4 space-y-2 border-t border-[#E3E8EE] pt-3">
      {judul && <p className="m-0 text-[11px] font-bold uppercase tracking-[.4px] text-[#6B7A90]">{judul}</p>}
      {peringatan && <p role="status" className="m-0 rounded-lg bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold text-[#7A5600]">{peringatan}</p>}
      <div className="flex gap-2.5">
        {posisi.sebelumnya ? <Tombol tahap={posisi.sebelumnya} arah="sebelumnya" onPilih={onPilih} /> : <span className="flex-1" />}
        {posisi.berikutnya ? <Tombol tahap={posisi.berikutnya} arah="berikutnya" onPilih={onPilih} /> : tahapTerakhir(posisi) ? <p className="m-0 flex flex-1 items-center justify-end text-[12.5px] font-bold text-[#13794B]">{teksAkhir ?? (judul ? "Langkah terakhir di tahap ini" : "Tahap terakhir alur")}</p> : null}
      </div>
    </nav>
  );
}

