"use client";

// app/sigap/kelola/AlurKelola.tsx
//
// (1 Nov 2026) Penunjuk tahap (di atas isi) dan tombol Sebelumnya/Berikutnya (di bawah isi) untuk halaman Kelola yang beralur.
// Logika urutan ada di lib/alurKelola.ts (murni, teruji). Dua bentuk: alur bertab (onPilih) dan alur berhalaman (tiap tahap punya href).
// Berikutnya BEBAS diklik. Bila halaman memberi `peringatan`, catatan kuning tampil di atas tombol (tidak memblokir).

import Link from "next/link";
import { teksPosisi, tahapTerakhir, type PosisiAlur, type TahapAlur } from "@/lib/alurKelola";

type Umum = { posisi: PosisiAlur | null };

/** Titik-titik tahap: sebelum tahap sekarang = terisi lembut (sudah dilewati urutannya, BUKAN klaim selesai), sekarang = biru, sesudahnya = kosong. */
function Titik({ posisi }: { posisi: PosisiAlur }) {
  if (posisi.urutan.length > 12) return null;
  return (
    <ol className="m-0 flex list-none items-center gap-1.5 p-0" aria-hidden>
      {posisi.urutan.map((t, i) => (
        <li
          key={t.kode}
          className={`h-2 rounded-full transition-all ${i === posisi.indeks ? "w-6 bg-[#1F5FD1]" : i < posisi.indeks ? "w-2 bg-[#9DB8E6]" : "w-2 bg-[#D5DDE9]"}`}
        />
      ))}
    </ol>
  );
}

export function PenunjukAlur({ posisi, nama, onPilih }: Umum & { nama: string; onPilih?: (kode: string) => void }) {
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
        <Titik posisi={posisi} />
      </div>
      {posisi.tahap.ket && <p className="mb-0 mt-1 text-[12.5px] leading-snug text-[#55657D]">{posisi.tahap.ket}</p>}
      <p className="mb-0 mt-1.5 text-[12.5px] text-[#1F5FD1]">
        {berikut ? (
          <>
            <b>Selanjutnya:</b> {berikut.label}
            {berikut.ket ? <span className="text-[#55657D]"> — {berikut.ket}</span> : null}
          </>
        ) : (
          <b>Ini tahap terakhir alur.</b>
        )}
      </p>
      <DaftarTahap posisi={posisi} onPilih={onPilih} />
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

export function NavAlur({ posisi, onPilih, peringatan }: Umum & { onPilih?: (kode: string) => void; peringatan?: string | null }) {
  if (!posisi) return null;
  const adaTombol = posisi.sebelumnya || posisi.berikutnya;
  if (!adaTombol) return null;
  return (
    <nav aria-label="Sebelumnya dan berikutnya dalam alur" className="mt-4 space-y-2 border-t border-[#E3E8EE] pt-3">
      {peringatan && <p role="status" className="m-0 rounded-lg bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold text-[#7A5600]">{peringatan}</p>}
      <div className="flex gap-2.5">
        {posisi.sebelumnya ? <Tombol tahap={posisi.sebelumnya} arah="sebelumnya" onPilih={onPilih} /> : <span className="flex-1" />}
        {posisi.berikutnya ? <Tombol tahap={posisi.berikutnya} arah="berikutnya" onPilih={onPilih} /> : tahapTerakhir(posisi) ? <p className="m-0 flex flex-1 items-center justify-end text-[12.5px] font-bold text-[#13794B]">Tahap terakhir alur</p> : null}
      </div>
    </nav>
  );
}

