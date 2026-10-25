"use client";

// app/sigap/kelola/perencanaan/identifikasi/Kontrol.tsx
//
// (25 Okt 2026) Kontrol isian kecil untuk formulir Identifikasi survei: pilihan tunggal, Ya/Tidak, penanda Fix/Perkiraan,
// tanggal, angka, dan kartu bagian bernomor huruf. Hanya tampilan; aturan ada di lib/keu/identifikasi.ts dan basis data.

import type { ReactNode } from "react";
import { kartu, kolom, label as kelasLabel } from "@/app/sigap/keu-ui";

const pil = "min-h-[40px] rounded-md border px-3 text-[13px] font-semibold disabled:opacity-60";
const pilMati = `${pil} border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]`;
const pilAktif = `${pil} border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]`;
const pilFix = `${pil} border-[#2E9E63] bg-[#E6F6EC] text-[#14653A]`;
const pilPerk = `${pil} border-[#C98A00] bg-[#FFF4D6] text-[#8A6200]`;

/** Pilihan tunggal berupa deretan tombol. */
export function Pilihan<T extends string>({ nilai, opsi, onPilih, mati, nama }: { nilai: T; opsi: readonly T[]; onPilih: (v: T) => void; mati?: boolean; nama: string }) {
  return (
    <div role="radiogroup" aria-label={nama} className="flex flex-wrap gap-1.5">
      {opsi.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={nilai === o} disabled={mati} className={nilai === o ? pilAktif : pilMati} onClick={() => onPilih(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function YaTidak({ nilai, onPilih, mati, nama }: { nilai: boolean; onPilih: (v: boolean) => void; mati?: boolean; nama: string }) {
  return (
    <div role="radiogroup" aria-label={nama} className="flex gap-1.5">
      <button type="button" role="radio" aria-checked={nilai} disabled={mati} className={nilai ? pilAktif : pilMati} onClick={() => onPilih(true)}>Ya</button>
      <button type="button" role="radio" aria-checked={!nilai} disabled={mati} className={!nilai ? pilAktif : pilMati} onClick={() => onPilih(false)}>Tidak</button>
    </div>
  );
}

/** Penanda kematangan data: Fix (hijau) atau Perkiraan (kuning). */
export function FixPerk({ perk, onPilih, mati, nama }: { perk: boolean; onPilih: (perk: boolean) => void; mati?: boolean; nama: string }) {
  return (
    <div role="radiogroup" aria-label={`${nama}: Fix atau Perkiraan`} className="flex gap-1.5">
      <button type="button" role="radio" aria-checked={!perk} disabled={mati} className={!perk ? pilFix : pilMati} onClick={() => onPilih(false)}>Fix</button>
      <button type="button" role="radio" aria-checked={perk} disabled={mati} className={perk ? pilPerk : pilMati} onClick={() => onPilih(true)}>≈ Perkiraan</button>
    </div>
  );
}

/** Kotak centang bergaya tombol. */
export function Centang({ aktif, onUbah, mati, children }: { aktif: boolean; onUbah: () => void; mati?: boolean; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={aktif} disabled={mati} className={aktif ? pilAktif : pilMati} onClick={onUbah}>
      <span aria-hidden className="mr-1.5">{aktif ? "☑" : "☐"}</span>
      {children}
    </button>
  );
}

export function Tgl({ nilai, onUbah, mati, nama, min }: { nilai: string; onUbah: (v: string) => void; mati?: boolean; nama: string; min?: string }) {
  return <input type="date" aria-label={nama} className={kolom} value={nilai} min={min} disabled={mati} onChange={(e) => onUbah(e.target.value)} />;
}

export function Angka({ nilai, onUbah, mati, nama, min = 0, maks = 100000 }: { nilai: number; onUbah: (v: number) => void; mati?: boolean; nama: string; min?: number; maks?: number }) {
  return (
    <input
      type="number" inputMode="numeric" aria-label={nama} className={kolom} value={Number.isFinite(nilai) ? nilai : 0} min={min} max={maks} disabled={mati}
      onChange={(e) => { const n = parseInt(e.target.value, 10); onUbah(Number.isNaN(n) ? min : Math.min(maks, Math.max(min, n))); }}
    />
  );
}

/** Isian dengan judul kecil di atasnya. */
export function Isian({ judul, ket, children }: { judul: string; ket?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className={kelasLabel}>{judul}</span>
      {children}
      {ket && <p className="mt-1 text-[12px] leading-snug text-[#5B6B84]">{ket}</p>}
    </div>
  );
}

/** Kartu satu bagian formulir: huruf, judul, dan penanda GSBPM. */
export function Bagian({ huruf, judul, gsbpm, children, id }: { huruf: string; judul: string; gsbpm?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={`${kartu} flex scroll-mt-20 flex-col gap-3.5`} aria-labelledby={`h-${huruf}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-[#EEF2F7] pb-2">
        <span aria-hidden className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[#0F2A52] text-[13px] font-extrabold text-[#E7C15A]">{huruf}</span>
        <h2 id={`h-${huruf}`} className="m-0 text-[16px] font-bold text-[#0F2A52]">{judul}</h2>
        {gsbpm && <span className="ml-auto rounded-full bg-[#EEF2F7] px-2.5 py-[2px] text-[11.5px] font-semibold text-[#44546F]">{gsbpm}</span>}
      </header>
      {children}
    </section>
  );
}

/** Catatan kecil berlatar abu. */
export const Cat = ({ children }: { children: ReactNode }) => (
  <p className="m-0 rounded-lg border border-[#D5DEEC] bg-[#F3F6FA] px-3 py-2 text-[12.5px] leading-snug text-[#44546F]">{children}</p>
);

// ---------------------------------------------------------------------------------------------------------------------
// Navigasi dari kartu samping ke kartu/isian formulir, dan daftar poin
// ---------------------------------------------------------------------------------------------------------------------

/** Menggulir ke elemen berid `id`, menyorotnya sebentar, lalu memfokuskan isian pertama di dalamnya. Mengembalikan false bila elemen tidak ada. */
export function loncat(id: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("ring-2", "ring-[#1F5FD1]", "ring-offset-2", "transition-shadow");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-[#1F5FD1]", "ring-offset-2"), 1800);
  const f = el.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])");
  if (f) window.setTimeout(() => f.focus({ preventScroll: true }), 350);
  return true;
}

/**
 * Teks yang bila diklik menuju kartu/isian `ke`. Tanpa tujuan, tampil sebagai teks biasa.
 * Tombol (bukan tautan) agar tidak mengubah alamat halaman; dapat dijangkau papan ketik.
 */
export function Tautan({ ke, children }: { ke: string | null; children: ReactNode }) {
  if (!ke) return <>{children}</>;
  return (
    <button type="button" onClick={() => { if (!loncat(ke) && ke.startsWith("tahap-")) loncat("bagian-a"); }}
      className="m-0 cursor-pointer border-0 bg-transparent p-0 text-left text-inherit underline decoration-[#1F5FD1]/50 decoration-dotted underline-offset-[3px] hover:text-[#1F5FD1] hover:decoration-solid focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1F5FD1]"
      title="Buka bagian yang bersangkutan">
      {children}<span aria-hidden className="ml-1 text-[#1F5FD1]">→</span>
    </button>
  );
}

/** Daftar poin ringkas. Tiap butir satu kalimat; butir boleh berupa elemen. */
export function Poin({ butir, kelas = "" }: { butir: ReactNode[]; kelas?: string }) {
  return (
    <ul className={`m-0 list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-[#44546F] marker:text-[#8FA3C2] ${kelas}`}>
      {butir.map((b, i) => <li key={i}>{b}</li>)}
    </ul>
  );
}
