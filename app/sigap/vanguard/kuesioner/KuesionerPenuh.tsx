"use client";

// app/sigap/vanguard/kuesioner/KuesionerPenuh.tsx
//
// (1 Nov 2026) VANGUARD V6d: Mode Kuesioner Penuh, Blok IV.1 (kasus K). Petugas menyalin catatan konsumsi ke kuesioner:
// pilih kelompok (A–N) atau cari rincian, ketuk rincian, isi K1–K4 (K5 dan K6 dihitung), lalu Periksa. Rekap IV.3.2 dihitung engine dari isian.
// Penilaian di SERVER (api/sigap/vanguard/kuesioner); kunci tidak ada di perangkat sampai petugas memilih "Lihat kunci".
// Masuk dari kartu kegiatan (?k=ID): setiap Periksa juga dicatat di server (latihan, V6g). Tanpa ?k=: tidak dicatat.
// Back (layar dan Back HP): lembar isian tertutup dulu, baru keluar halaman. Draf isian disimpan di perangkat (localStorage, boleh gagal).
// Papan isian (tab, cari, lembar rincian, rekap) ada di PapanIsianK.tsx (dipakai juga oleh Ujian Sertifikasi).
// Berkas ini TIDAK boleh mengimpor nilaiK.ts atau templat (dijaga tes vanguardPublik).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import "../vanguard.css";
import "./kuesioner.css";
import { apiPortal } from "@/app/portal/sesi";
import { bacaSesi } from "@/app/sigap/admin/api";
import { tujuanAman } from "@/lib/vanguard/navigasi";
import { hitungIv1 } from "@/lib/vanguard/kuesioner/engine";
import { cariRincianIv1 } from "@/lib/vanguard/kuesioner/rincian";
import { cariKasusKPublik } from "@/lib/vanguard/kuesioner/publik";
import { Lambang } from "../Logo";
import PapanIsianK, { fmt, type Isian } from "./PapanIsianK";

type Kesalahan = { jenis: string; tingkat: "fatal" | "berat" | "ringan"; r: number; art: number | null; pesan: string };
type Hasil = { benar: boolean; kesalahan: Kesalahan[]; sesuai: number; total: number; rekapSesuai: boolean; pembahasan?: string; rujukan?: string; kunci?: Isian[]; dicatat?: boolean; nomor?: number; bintang?: number; pesanCatat?: string };
type Soal = { benih: number; cerita: string; catatan: string[]; info: string[] };

const kunciDraf = (kode: string) => `vanguard.kp.d2.${kode}`; // {benih, isian}: draf terikat pada angka soal (benih)
const LABEL_TINGKAT = { fatal: "Fatal", berat: "Berat", ringan: "Ringan" } as const;

export default function KuesionerPenuh() {
  const q = useSearchParams();
  const kode = useMemo(() => { const v = q.get("kasus"); return v && /^[A-Z][0-9]{2}$/.test(v) ? v : "K01"; }, [q]);
  const kasus = cariKasusKPublik(kode);
  const kegiatan = useMemo(() => { const v = q.get("k"); return v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null; }, [q]);
  const mulaiRef = useRef(Date.now());
  const tujuan = useMemo(() => { const d = q.get("dari"); return d ? tujuanAman(d) : "/sigap/vanguard"; }, [q]);

  const [isian, setIsian] = useState<Isian[]>([]);
  const [soal, setSoal] = useState<Soal | null>(null);
  const [galatSoal, setGalatSoal] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [petunjuk, setPetunjuk] = useState<string[]>([]);
  const [totalPetunjuk, setTotalPetunjuk] = useState<number | null>(null);
  const [kerja, setKerja] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const skrol = useRef<HTMLDivElement>(null);
  const hasilRef = useRef<HTMLDivElement>(null);

  const muatSoal = async (benih: number | null): Promise<Soal | null> => {
    setGalatSoal(null);
    try {
      const r = await apiPortal<{ benih: number; cerita: string; catatan: string[]; info: string[] }>(`/api/sigap/vanguard/kuesioner?kode=${kode}&soal=1${benih === null ? "" : `&benih=${benih}`}`);
      const x: Soal = { benih: r.benih, cerita: r.cerita, catatan: r.catatan, info: r.info };
      setSoal(x);
      return x;
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return null;
      setGalatSoal(e instanceof Error ? e.message : "Gagal memuat soal.");
      return null;
    }
  };

  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    let benihTersimpan: number | null = null;
    try {
      const t = window.localStorage.getItem(kunciDraf(kode));
      if (t) {
        const d = JSON.parse(t);
        if (d && Number.isInteger(d.benih) && Array.isArray(d.isian)) { benihTersimpan = d.benih; setIsian(d.isian.filter((x: Isian) => x && typeof x.r === "number")); }
      }
    } catch { /* penyimpanan lokal boleh gagal */ }
    void muatSoal(benihTersimpan).then((x) => { if (!x && benihTersimpan !== null) { setIsian([]); } setSiap(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kode]);
  useEffect(() => {
    if (!siap || !soal) return;
    try { window.localStorage.setItem(kunciDraf(kode), JSON.stringify({ benih: soal.benih, isian })); } catch { /* abaikan */ }
  }, [isian, siap, kode, soal]);


  const h = useMemo(() => hitungIv1(isian), [isian]);

  if (!kasus) {
    return (
      <div className="vg"><div className="phone"><div className="vgtop"><span className="lencana"><Lambang px={20} /></span><div className="nm">VANGUARD<small>Mode Kuesioner Penuh</small></div><Link href={tujuan}>Kembali</Link></div>
        <div className="scroll"><div className="sheet"><h2>Kasus tidak ditemukan</h2><p style={{ fontSize: 13 }}>Kode {kode} belum tersedia.</p></div></div></div></div>
    );
  }


  const minta = async (lihat: boolean) => {
    setKerja(true); setGalat(null);
    try {
      const r = await apiPortal<Hasil>("/api/sigap/vanguard/kuesioner", { method: "POST", body: JSON.stringify({ kode, benih: soal?.benih ?? 0, isian, lihat, ...(kegiatan ? { kegiatan, petunjuk: petunjuk.length, durasiDtk: Math.min(86400, Math.round((Date.now() - mulaiRef.current) / 1000)) } : {}) }) });
      setHasil(r);
      setTimeout(() => hasilRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(e instanceof Error ? e.message : "Gagal menilai isian. Coba lagi.");
    } finally { setKerja(false); }
  };
  const mintaPetunjuk = async () => {
    const n = petunjuk.length + 1;
    setKerja(true); setGalat(null);
    try {
      const r = await apiPortal<{ petunjuk: string[]; total: number }>(`/api/sigap/vanguard/kuesioner?kode=${kode}&petunjuk=${n}&benih=${soal?.benih ?? 0}`);
      setPetunjuk(r.petunjuk); setTotalPetunjuk(r.total);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat petunjuk.");
    } finally { setKerja(false); }
  };
  const soalBaru = async () => {
    if (isian.length > 0 && !window.confirm("Ganti ke soal baru dengan angka berbeda? Isian sekarang akan dihapus.")) return;
    const x = await muatSoal(null);
    if (x) { setIsian([]); setHasil(null); setPetunjuk([]); setTotalPetunjuk(null); setGalat(null); }
  };
  const ulang = () => {
    if (isian.length > 0 && !window.confirm("Hapus semua isian kasus ini dan mulai dari awal?")) return;
    setIsian([]); setHasil(null); setPetunjuk([]); setGalat(null);
  };

  const habisPetunjuk = totalPetunjuk !== null && petunjuk.length >= totalPetunjuk;

  return (
    <div className="vg"><div className="phone">
      <div className="vgtop">
        <span className="lencana"><Lambang px={20} /></span>
        <div className="nm">VANGUARD<small>Mode Kuesioner Penuh · uji coba</small></div>
        <Link href={tujuan}>Kembali</Link>
      </div>
      <div className="appbar">
        <div className="l1"><b>BADAN PUSAT STATISTIK · VSEN26.KP</b><span className="r">RAHASIA</span></div>
        <h1>Blok IV.1 · {kasus.kode} · {kasus.judul}</h1>
        <div className="l3"><span>{isian.length} rincian terisi · {h.komoditasRt + Object.values(h.komoditasPerArt).reduce((a, b) => a + b, 0)} komoditas</span><span><button className="tog" type="button" onClick={ulang}>Hapus isian</button> <button className="tog" type="button" onClick={soalBaru}>Soal baru</button></span></div>
      </div>

      <div className="scroll" ref={skrol}><div className="stack">
        <div className={`catat ${kegiatan ? "ya" : "tidak"}`} role="status">{kegiatan ? <><b>Pelatihan:</b> setiap kali Anda menekan Periksa, percobaan dicatat untuk BPS Kabupaten Solok.</> : <><b>Latihan bebas:</b> isian dinilai di server dan tidak dicatat.</>} Draf tersimpan di perangkat ini.</div>

        <details className="kp-cerita" open>
          <summary>Catatan konsumsi (baca dulu)</summary>
          {soal ? (
            <>
              <p>{soal.cerita}</p>
              <ol>{soal.catatan.map((c, i) => <li key={i}>{c}</li>)}</ol>
              <ul className="kp-info">{soal.info.map((c, i) => <li key={i}>{c}</li>)}</ul>
              <p className="ref">Nomor soal: {soal.benih === 0 ? "baku" : soal.benih}. Angka tiap soal berbeda.</p>
            </>
          ) : galatSoal ? <p role="alert">{galatSoal} <button type="button" className="tog" onClick={() => void muatSoal(null)}>Coba lagi</button></p> : <p>Memuat soal…</p>}
        </details>

        {petunjuk.length > 0 && <div className="hint" role="note"><b>Petunjuk</b><ol style={{ margin: "4px 0 0 18px" }}>{petunjuk.map((p, i) => <li key={i}>{p}</li>)}</ol></div>}

        <PapanIsianK isian={isian} setIsian={setIsian} tabAwal={kode === "K02" ? "M" : "I"} onUbah={() => setHasil(null)} />
        {galat && <div className="catat gagal" role="alert">{galat}</div>}

        <div ref={hasilRef}>
          {hasil && (
            <div className={`res ${hasil.benar ? "good" : "bad"}`} role="status">
              <div className="vd">
                <span className="ic" aria-hidden>{hasil.benar ? "✓" : "!"}</span>
                <div><strong>{hasil.benar ? "Semua rincian sudah benar" : `${hasil.kesalahan.length} temuan`}</strong>
                  <small>{hasil.sesuai} dari {hasil.total} rincian sesuai · rekap IV.3.2 {hasil.rekapSesuai ? "sesuai" : "belum sesuai"}</small></div>
              </div>
              {hasil.dicatat !== undefined && kegiatan && (
                <section><div className="ref" role="status">{hasil.dicatat ? `Tercatat sebagai percobaan ke-${hasil.nomor}${hasil.benar ? ` · ${"★".repeat(hasil.bintang ?? 0)}${"☆".repeat(Math.max(0, 3 - (hasil.bintang ?? 0)))}` : ""}.${hasil.pesanCatat ? ` ${hasil.pesanCatat}` : ""}` : `Hasil tidak dicatat: ${hasil.pesanCatat ?? "gagal"}`}</div></section>
              )}
              {hasil.kesalahan.length > 0 && (
                <section><h3>Yang perlu diperbaiki</h3>
                  <ul className="fb">{hasil.kesalahan.map((k, i) => (
                    <li key={i}><span className={`kp-lencana ${k.tingkat === "fatal" ? "kp-fatal" : k.tingkat === "ringan" ? "kp-ringan" : ""}`}>{LABEL_TINGKAT[k.tingkat]}</span>{k.pesan}</li>
                  ))}</ul>
                </section>
              )}
              {hasil.kunci && (
                <section><h3>Kunci</h3>
                  <table className="tbl"><thead><tr><th>R</th><th>Rincian</th><th style={{ textAlign: "right" }}>K1 · K2</th></tr></thead><tbody>
                    {hasil.kunci.map((k, i) => (
                      <tr key={i}><td className="n kiri">{k.r}</td><td>{k.nama ?? cariRincianIv1(k.r)?.nama}{k.satuan ? ` (${k.satuan})` : ""}</td><td className="n">{fmt(k.k1 ?? 0)} · Rp{fmt(k.k2 ?? 0)}</td></tr>
                    ))}</tbody></table>
                </section>
              )}
              {hasil.pembahasan && <section><h3>Pembahasan</h3><p style={{ fontSize: 13 }}>{hasil.pembahasan}</p>{hasil.rujukan && <p className="ref">Rujukan: {hasil.rujukan}</p>}</section>}
              {!hasil.kunci && !hasil.benar && <div className="btns"><button type="button" className="btn" disabled={kerja} onClick={() => minta(true)}>Lihat kunci</button></div>}
            </div>
          )}
        </div>
      </div></div>

      <div className="dock">
        <button type="button" className="btn" disabled={kerja || habisPetunjuk} onClick={mintaPetunjuk}>Petunjuk{totalPetunjuk !== null ? ` ${petunjuk.length}/${totalPetunjuk}` : ""}</button>
        <button type="button" className="btn pri" disabled={kerja || !soal || isian.length === 0} onClick={() => minta(false)}>{kerja ? "Memeriksa…" : "Periksa"}</button>
      </div>
      <div className="vgfoot"><b>{kegiatan ? "Pelatihan" : "Latihan"} · Mode Kuesioner Penuh</b>{kegiatan ? " · hasil dicatat" : " · tidak dicatat"}</div>

    </div></div>
  );
}
