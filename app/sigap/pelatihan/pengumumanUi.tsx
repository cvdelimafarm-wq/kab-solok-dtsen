"use client";

// app/sigap/pelatihan/pengumumanUi.tsx
//
// (8 Okt 2026) Tampilan modal pengumuman (dipakai halaman Langkah peserta DAN pratinjau di Kelola Pelatihan).
// Isi dirender sebagai elemen React dari hasil pengurai (tanpa HTML mentah), jadi aman dari kode berbahaya.

import { Fragment, useEffect, useRef } from "react";
import { IKON_PENGUMUMAN, JUDUL_BAWAAN_PENGUMUMAN, uraiIsi, urlAman, type JenisPengumuman, type Sebaris } from "@/lib/sigapPengumuman";

const GAYA: Record<JenisPengumuman, { ikon: string; judul: string }> = {
  info: { ikon: "bg-[#E6EEFC]", judul: "text-[#0F2A52]" },
  perhatian: { ikon: "bg-[#FFF1CC]", judul: "text-[#8A6200]" },
  penting: { ikon: "bg-[#FDE8E8]", judul: "text-[#B42329]" },
};

function Potongan({ s }: { s: Sebaris }) {
  switch (s.t) {
    case "tebal":
      return <b>{s.teks}</b>;
    case "sorot":
      return <mark className="rounded px-0.5" style={{ background: "#FFE680" }}>{s.teks}</mark>;
    case "tautan":
      return (
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#1F5FD1] underline">
          {s.teks}
        </a>
      );
    default:
      return <>{s.teks}</>;
  }
}

/** Isi pesan -> elemen (paragraf & daftar). */
export function IsiPengumuman({ isi }: { isi: string }) {
  const blok = uraiIsi(isi);
  return (
    <div className="space-y-2 text-[14.5px] leading-relaxed text-[#1B2B4B]">
      {blok.map((b, i) =>
        b.tipe === "p" ? (
          <p key={i} className="whitespace-pre-line">
            {b.baris.map((s, j) => (
              <Potongan key={j} s={s} />
            ))}
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.butir.map((butir, j) => (
              <li key={j}>
                {butir.map((s, k) => (
                  <Fragment key={k}>
                    <Potongan s={s} />
                  </Fragment>
                ))}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

export type DataModal = { jenis: JenisPengumuman; judul: string; isi: string; tombol_label: string | null; tombol_url: string | null };

/**
 * Satu modal pengumuman. `posisi`/`jumlah` = penunjuk antrian ("1 dari 3"); modal terakhir bertombol "Saya mengerti",
 * yang lain "Lanjut →". `sebagaiPratinjau` = tanpa overlay layar penuh (untuk di dalam kartu Kelola).
 */
export function ModalPengumuman({ d, posisi, jumlah, lanjut, sebagaiPratinjau = false }: { d: DataModal; posisi: number; jumlah: number; lanjut: () => void; sebagaiPratinjau?: boolean }) {
  const tombol = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (sebagaiPratinjau) return;
    tombol.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && lanjut();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [lanjut, sebagaiPratinjau]);
  const g = GAYA[d.jenis];
  const terakhir = posisi >= jumlah;
  const judul = d.judul || JUDUL_BAWAAN_PENGUMUMAN[d.jenis];
  const kartu = (
    <div role="dialog" aria-modal={!sebagaiPratinjau} aria-label={judul} className="max-h-full w-full max-w-sm overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] ${g.ikon}`} aria-hidden>
          {IKON_PENGUMUMAN[d.jenis]}
        </span>
        <h2 className={`min-w-0 flex-1 break-words text-[18px] font-extrabold leading-tight ${g.judul}`}>{judul}</h2>
        {jumlah > 1 && <span className="shrink-0 text-[11.5px] font-bold text-[#6B7A90]">{posisi} dari {jumlah}</span>}
      </div>
      {d.isi && (
        <div className="mt-3">
          <IsiPengumuman isi={d.isi} />
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {d.tombol_label && d.tombol_url && urlAman(d.tombol_url) && (
          <a href={d.tombol_url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1F5FD1] px-4 py-3 text-center text-[14.5px] font-extrabold text-white shadow-sm hover:bg-[#1A4FB8]">
            {d.tombol_label}
          </a>
        )}
        <button ref={tombol} type="button" onClick={lanjut} className="w-full rounded-xl border border-[#CBD6E6] bg-white px-4 py-2.5 text-[14px] font-bold text-[#1B2B4B] hover:bg-[#F5F8FE]">
          {terakhir ? "Saya mengerti" : "Lanjut →"}
        </button>
      </div>
      {jumlah > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: jumlah }, (_, i) => (
            <i key={i} className={`block h-1.5 w-1.5 rounded-full ${i + 1 === posisi ? "bg-[#1F5FD1]" : "bg-[#CBD6E6]"}`} />
          ))}
        </div>
      )}
    </div>
  );
  if (sebagaiPratinjau) return <div className="flex justify-center rounded-xl bg-black/55 p-4">{kartu}</div>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={lanjut}>
      {kartu}
    </div>
  );
}
