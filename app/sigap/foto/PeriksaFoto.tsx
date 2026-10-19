"use client";

// app/sigap/foto/PeriksaFoto.tsx
//
// (19 Okt 2026) Pemeriksaan foto kuning/merah oleh PML (timnya) dan admin. Menandai "Diperiksa" melepas tag yang ditahan
// ke nomor foto; "Dipertanyakan" hanya menandai (alasan wajib) dan TIDAK mencabut baris nomor foto yang sudah terisi.

import { useCallback, useEffect, useState } from "react";
import { ambilFotoUrl, ambilJson } from "./klien";
import { LABEL_ALASAN, LABEL_KEPERCAYAAN, WARNA_KEPERCAYAAN, type Kepercayaan } from "@/lib/sigapFoto";

type Baris = { id: number; kode: string; pemotret: string; tanggal: string; diambil_at: string; lokasi_teks: string | null; jarak_wilayah_m: number | null; akurasi_m: number | null; kepercayaan: Kepercayaan; alasan: string[] };

function Kartu({ b, muat }: { b: Baris; muat: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  useEffect(() => {
    let batal = false;
    let u: string | null = null;
    ambilFotoUrl(b.id).then((x) => { if (batal) URL.revokeObjectURL(x); else { u = x; setUrl(x); } }).catch(() => undefined);
    return () => { batal = true; if (u) URL.revokeObjectURL(u); };
  }, [b.id]);
  async function tandai(hasil: "diperiksa" | "dipertanyakan") {
    setSibuk(true);
    setPesan(null);
    try {
      await ambilJson("/api/sigap/foto/periksa", { method: "POST", body: { foto_id: b.id, hasil, catatan: alasan } });
      muat();
    } catch (e) {
      setPesan((e as Error).message);
    } finally {
      setSibuk(false);
    }
  }
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-[#C9D3E6] bg-white p-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Foto ${b.kode}`} className="max-h-72 w-full rounded-lg bg-black object-contain" />
      ) : (
        <div className="h-32 animate-pulse rounded-lg bg-[#EEF2F7]" />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-sm font-bold text-[#0F2A52]">{b.pemotret}</div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: WARNA_KEPERCAYAAN[b.kepercayaan] }}>{LABEL_KEPERCAYAAN[b.kepercayaan]}</span>
      </div>
      <div className="text-xs text-[#3C4C68]">{b.tanggal} · {b.kode}{b.lokasi_teks ? ` · ${b.lokasi_teks}` : ""}{b.akurasi_m != null ? ` · ±${Math.round(b.akurasi_m)} m` : ""}{b.jarak_wilayah_m != null ? ` · ${b.jarak_wilayah_m} m dari wilayah` : ""}</div>
      <ul className="list-disc pl-5 text-xs text-[#3C4C68]">{b.alasan.map((a) => <li key={a}>{LABEL_ALASAN[a] ?? a}</li>)}</ul>
      <label className="flex flex-col gap-1 text-xs font-bold text-[#0F2A52]">Alasan (wajib untuk Dipertanyakan)
        <input value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={500} className="min-h-[44px] rounded-lg border border-[#C9D3E6] px-3 text-sm font-normal" />
      </label>
      {pesan && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{pesan}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={sibuk || !alasan.trim()} onClick={() => void tandai("dipertanyakan")} className="min-h-[48px] flex-1 rounded-xl border-2 border-[#9B1C23] text-sm font-bold text-[#9B1C23] disabled:opacity-40">Dipertanyakan</button>
        <button type="button" disabled={sibuk} onClick={() => void tandai("diperiksa")} className="min-h-[48px] flex-1 rounded-xl bg-[#1E8E4E] text-sm font-extrabold text-white disabled:opacity-50">Diperiksa</button>
      </div>
    </li>
  );
}

export default function PeriksaFoto() {
  const [daftar, setDaftar] = useState<Baris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(() => {
    ambilJson<{ foto: Baris[] }>("/api/sigap/foto/periksa").then((d) => { setDaftar(d.foto); setGalat(null); }).catch((e: Error) => setGalat(e.message));
  }, []);
  useEffect(muat, [muat]);
  if (galat) return <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{galat}</div>;
  if (!daftar) return <div className="text-sm text-[#3C4C68]">Memuat…</div>;
  if (!daftar.length) return <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">Tidak ada foto yang perlu diperiksa.</div>;
  return <ul className="flex flex-col gap-3">{daftar.map((b) => <Kartu key={b.id} b={b} muat={muat} />)}</ul>;
}
