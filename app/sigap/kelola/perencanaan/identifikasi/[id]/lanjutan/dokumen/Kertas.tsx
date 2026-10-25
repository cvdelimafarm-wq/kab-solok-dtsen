"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/dokumen/Kertas.tsx
//
// (25 Okt 2026, tahap 29) Tampilan kertas surat (undangan, surat pengantar, surat tugas atau SPK). Dipisah dari page.tsx karena Next.js hanya
// mengizinkan ekspor bawaan (default) dan konfigurasi tertentu dari berkas page.

import type { bangunDokumen } from "@/lib/keu/lanjutanDokumen";

export function Kertas({ dok }: { dok: NonNullable<ReturnType<typeof bangunDokumen>> }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <article
        id="kertas" aria-label={dok.judul}
        className="relative mx-auto w-full max-w-[794px] min-w-[560px] border border-[#DCE3EE] bg-white px-[56px] py-[48px] font-serif text-[13.5px] leading-[1.55] text-black shadow-sm"
      >
        {dok.konsep && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <span className="-rotate-[28deg] select-none text-[110px] font-bold tracking-[0.1em] text-black/[0.06]">KONSEP</span>
          </div>
        )}
        <header className="border-b-2 border-black pb-2 text-center font-bold uppercase leading-tight">
          {dok.instansi.map((x) => <div key={x}>{x}</div>)}
        </header>
        <div className="mt-4 flex justify-between gap-4">
          <table className="border-collapse text-left"><tbody>
            <tr><td className="pr-2 align-top">Nomor</td><td className="pr-2 align-top">:</td><td>{dok.nomor}</td></tr>
            <tr><td className="pr-2 align-top">Lampiran</td><td className="pr-2 align-top">:</td><td>{dok.lampiran || "-"}</td></tr>
            <tr><td className="pr-2 align-top">Perihal</td><td className="pr-2 align-top">:</td><td className="font-semibold">{dok.perihal}</td></tr>
          </tbody></table>
          <div className="whitespace-nowrap text-right">Arosuka, {dok.tanggalSurat}</div>
        </div>
        {dok.judul && <div className="mt-4 text-center font-bold underline">{dok.judul}</div>}
        <div className="mt-4">{dok.kepada.map((x) => <div key={x}>{x}</div>)}</div>
        {dok.pembuka && <p className="mb-0 mt-4 text-justify">{dok.pembuka}</p>}
        {dok.rincian.length > 0 && (
          <table className="mt-3 border-collapse text-left"><tbody>
            {dok.rincian.map(([k, v]) => <tr key={k}><td className="whitespace-nowrap pl-6 pr-2 align-top">{k}</td><td className="pr-2 align-top">:</td><td className="align-top">{v}</td></tr>)}
          </tbody></table>
        )}
        {dok.isi.map((p) => <p key={p} className="mb-0 mt-3 text-justify">{p}</p>)}
        {dok.penutup && <p className="mb-0 mt-3 text-justify">{dok.penutup}</p>}
        <div className="mt-8 flex justify-end">
          <div className="min-w-[220px] text-center">
            <div>{dok.ttd.jabatan}</div>
            <div className="h-[72px]" />
            <div className="font-bold underline">{dok.ttd.nama}</div>
          </div>
        </div>
        {dok.tabel && (
          <section className="mt-8 break-before-page">
            <div className="mb-2 font-bold">Lampiran: {dok.tabel.judul}</div>
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead><tr>{dok.tabel.kepala.map((h) => <th key={h} className="border border-black px-2 py-1">{h}</th>)}</tr></thead>
              <tbody>{dok.tabel.baris.map((b, i) => <tr key={i}>{b.map((c, j) => <td key={j} className="border border-black px-2 py-1">{c}</td>)}</tr>)}</tbody>
            </table>
          </section>
        )}
      </article>
    </div>
  );
}
