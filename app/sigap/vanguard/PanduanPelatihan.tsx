"use client";

// app/sigap/vanguard/PanduanPelatihan.tsx
//
// (2 Nov 2026) Panduan pelatihan di paling atas layar Vanguard dan layar Sertifikasi untuk PESERTA PELATIHAN, serta label WAJIB / DIHITUNG / OPSIONAL.
// (3 Nov 2026) Dipisah jadi dua pintu yang ringkas:
//   MENU WAJIB          = Latihan wajib (runtutan N hari) + Sertifikasi wajib (ujian)  -> komponen default di bawah
//   LATIHAN BANK SOAL   = berlatih sebanyak-banyaknya, tidak memengaruhi pelatihan      -> KartuBankSoal
// Isi dihitung di lib/konteksVanguard.ts (murni). Ini kartu, BUKAN modal: tidak menambah lapisan Back dan tidak menggandakan ModalVanguardWajib (di tab Hari ini).

import Link from "next/link";
import type { ReactNode } from "react";
import "./panduan.css";
import { TEKS_BANK_SOAL, labelKartu, panduanKonteks, teksSertifikasiWajib, type KartuVg, type KonteksPelatihan } from "@/lib/konteksVanguard";

export function LabelWajib({ konteks, kartu }: { konteks: KonteksPelatihan | null; kartu: KartuVg }) {
  if (!konteks) return null;
  const l = labelKartu(konteks.mode, kartu);
  return <span className={`pg-label ${l.jenis}`}>{l.teks}</span>;
}

export default function PanduanPelatihan({ konteks, hrefLatihan, hrefSertifikasi, onLatihan, mulai }: {
  konteks: KonteksPelatihan;
  /** Tautan tombol "Latihan hari ini" (layar Vanguard menuju layar Sertifikasi, tempat Latihan harian berada). */
  hrefLatihan?: string;
  /** Bila diisi, kartu "Sertifikasi wajib" ikut tampil dengan tombol ke layar ujian (layar Vanguard). Di layar Sertifikasi cukup dikosongkan: kartu ujiannya sendiri ada di bawah. */
  hrefSertifikasi?: string;
  /** Aksi tombol utama di layar yang sudah memuat Latihan harian (layar Sertifikasi). */
  onLatihan?: () => void;
  mulai?: boolean;
}) {
  const p = panduanKonteks(konteks);
  const aksiAktif = p.tombol.jenis === "latihan" || p.tombol.jenis === "bebas";
  const sertif = hrefSertifikasi ? teksSertifikasiWajib(konteks) : null;
  return (
    <section className={`pg ${p.nada}`} aria-label={p.wajib ? "Menu wajib" : "Menu pelatihan"}>
      <div className="pg-atas">
        <span className="pg-tag">{p.wajib ? "Menu wajib" : "Menu pelatihan"}</span>
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

      <div className="pg-bagian">
        <h3>{p.status === "bebas" ? "Latihan harian" : "Latihan wajib"}</h3>
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
      </div>

      {sertif && hrefSertifikasi && (
        <div className="pg-bagian">
          <h3>{sertif.judul}</h3>
          <p>{sertif.ket}</p>
          <div className="pg-aksi"><Link className={`pg-btn${sertif.selesai ? " diam" : ""}`} href={hrefSertifikasi}>{sertif.tombol}</Link></div>
        </div>
      )}

      <details>
        <summary>Apa saja yang dihitung?</summary>
        <ul>{p.aturan.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </details>
    </section>
  );
}

/** Kartu "Latihan bank soal": satu tombol besar, sisanya terlipat supaya peserta tidak ragu memulai. */
export function KartuBankSoal({ ringkas, tombol, onMulai, children }: { ringkas: string; tombol: string; onMulai: () => void; children?: ReactNode }) {
  return (
    <section className="pg pg-bank" aria-label={TEKS_BANK_SOAL.judul}>
      <div className="pg-atas"><span className="pg-tag bank">{TEKS_BANK_SOAL.judul}</span><span className="pg-label dihitung">BOLEH BERKALI-KALI</span></div>
      <p>{TEKS_BANK_SOAL.isi}</p>
      <p className="pg-langkah">{ringkas}</p>
      <div className="pg-aksi"><button type="button" className="pg-btn" onClick={onMulai}>{tombol}</button></div>
      {children}
    </section>
  );
}
