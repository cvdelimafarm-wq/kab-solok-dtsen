"use client";

// app/sigap/vanguard/PanduanPelatihan.tsx
//
// (2 Nov 2026) Kartu "Panduan pelatihan" di paling atas layar Vanguard dan layar Sertifikasi untuk PESERTA PELATIHAN, serta label WAJIB / DIHITUNG / OPSIONAL.
// Isi dihitung di lib/konteksVanguard.ts (murni). Ini banner/kartu, BUKAN modal: tidak menambah lapisan Back dan tidak menggandakan ModalVanguardWajib (di tab Hari ini).

import Link from "next/link";
import "./panduan.css";
import { labelKartu, panduanKonteks, type KartuVg, type KonteksPelatihan } from "@/lib/konteksVanguard";

export function LabelWajib({ konteks, kartu }: { konteks: KonteksPelatihan | null; kartu: KartuVg }) {
  if (!konteks) return null;
  const l = labelKartu(konteks.mode, kartu);
  return <span className={`pg-label ${l.jenis}`}>{l.teks}</span>;
}

export default function PanduanPelatihan({ konteks, hrefLatihan, onLatihan, mulai, semua, onSemua }: {
  konteks: KonteksPelatihan;
  /** Tautan tombol "Latihan hari ini" (layar Vanguard menuju layar Sertifikasi, tempat Latihan harian berada). */
  hrefLatihan?: string;
  /** Aksi tombol utama di layar yang sudah memuat Latihan harian (layar Sertifikasi). */
  onLatihan?: () => void;
  mulai?: boolean;
  semua: boolean;
  onSemua: (v: boolean) => void;
}) {
  const p = panduanKonteks(konteks);
  const aksiAktif = p.tombol.jenis === "latihan" || p.tombol.jenis === "bebas";
  return (
    <section className={`pg ${p.nada}`} aria-label="Panduan pelatihan">
      <div className="pg-atas">
        <span className="pg-tag">Panduan pelatihan</span>
        {konteks.mode !== "tidak_ada" && <span className={`pg-label ${p.wajib ? "wajib" : "dihitung"}`}>{p.wajib ? "WAJIB" : "DIANJURKAN"}</span>}
      </div>
      <div className="pg-keg">{p.kegiatan}</div>

      {(p.tenggat || p.sisa) && p.status !== "tuntas" && (
        <div className="pg-banner" role="status">
          {p.sisa && <b>{p.sisa}</b>}
          {p.tenggat && <span>· tenggat {p.tenggat}</span>}
          {p.mulaiPalingLambat && p.status === "belum_mulai" && <span>· mulai paling lambat {p.mulaiPalingLambat}</span>}
        </div>
      )}

      <h2>{p.judul}</h2>
      {p.petak.length > 0 && (
        <div className="pg-petak" role="list" aria-label={p.judul}>
          {p.petak.map((x, i) => (
            <span key={i} role="listitem" className={x.status} aria-label={`Hari ${i + 1}: ${x.status === "selesai" ? "selesai" : x.status === "hari_ini" ? "hari ini" : "belum"}`}>{x.status === "selesai" ? "✓" : `H${i + 1}`}</span>
          ))}
        </div>
      )}
      <p>{p.ket}</p>
      <p className="pg-langkah">{p.langkah}</p>

      <div className="pg-aksi">
        {aksiAktif && (onLatihan
          ? <button type="button" className="pg-btn" disabled={mulai} onClick={onLatihan}>{p.tombol.teks}</button>
          : <Link className="pg-btn" href={hrefLatihan ?? "/sigap/vanguard/sertifikasi?mulai=harian"}>{p.tombol.teks}</Link>)}
        {!aksiAktif && <span className="pg-btn diam" role="status">{p.tombol.teks}</span>}
      </div>

      <details>
        <summary>Apa yang dihitung dan apa yang tidak?</summary>
        <ul>{p.aturan.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </details>
      <button type="button" className="pg-semua" aria-pressed={semua} onClick={() => onSemua(!semua)}>{semua ? "Sembunyikan latihan tambahan" : "Tampilkan semua latihan"}</button>
    </section>
  );
}
