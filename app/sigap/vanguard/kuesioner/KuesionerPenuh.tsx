"use client";

// app/sigap/vanguard/kuesioner/KuesionerPenuh.tsx
//
// (1 Nov 2026) VANGUARD V6d: Mode Kuesioner Penuh, Blok IV.1 (kasus K). Petugas menyalin catatan konsumsi ke kuesioner:
// pilih kelompok (A–N) atau cari rincian, ketuk rincian, isi K1–K4 (K5 dan K6 dihitung), lalu Periksa. Rekap IV.3.2 dihitung engine dari isian.
// Penilaian di SERVER (api/sigap/vanguard/kuesioner); kunci tidak ada di perangkat sampai petugas memilih "Lihat kunci". Tahap ini latihan: tidak dicatat.
// Back (layar dan Back HP): lembar isian tertutup dulu, baru keluar halaman. Draf isian disimpan di perangkat (localStorage, boleh gagal).
// Berkas ini TIDAK boleh mengimpor nilaiK.ts atau kasus-k.json (dijaga tes vanguardPublik).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import "../vanguard.css";
import "./kuesioner.css";
import { apiPortal } from "@/app/portal/sesi";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { bacaSesi } from "@/app/sigap/admin/api";
import { tujuanAman } from "@/lib/vanguard/navigasi";
import { KELOMPOK_IV1, RINCIAN_IV1, cariRincianIv1, rincianLainnya, type RincianIv1 } from "@/lib/vanguard/kuesioner/rincian";
import { hitungBaris, hitungIv1, perART, periksaIv1, rekapIv32, type EntriIv1 } from "@/lib/vanguard/kuesioner/engine";
import { cariKasusKPublik } from "@/lib/vanguard/kuesioner/publik";
import { Lambang } from "../Logo";

type Isian = EntriIv1 & { nama?: string; satuan?: string };
type Kesalahan = { jenis: string; tingkat: "fatal" | "berat" | "ringan"; r: number; art: number | null; pesan: string };
type Hasil = { benar: boolean; kesalahan: Kesalahan[]; sesuai: number; total: number; rekapSesuai: boolean; pembahasan?: string; rujukan?: string; kunci?: Isian[] };
type Draf = { k1: string; k2: string; k3: string; k4: string; nama: string; satuan: string; sumber: string };
type Tab = string; // "A".."N" | "diisi" | "rekap"

const fmt = (x: number) => x.toLocaleString("id-ID", { maximumFractionDigits: 4 });
const kunciDraf = (kode: string) => `vanguard.kp.draf.${kode}`;
const kunciIsi = (e: Isian) => `${e.r}|${e.art ?? 0}`;
const kosongDraf = (): Draf => ({ k1: "", k2: "", k3: "", k4: "", nama: "", satuan: "", sumber: "" });
const LABEL_TINGKAT = { fatal: "Fatal", berat: "Berat", ringan: "Ringan" } as const;

/** Banyaknya: koma atau titik sebagai desimal. Nilai rupiah: titik/spasi = pemisah ribuan, tinggal angka. */
function bacaBanyak(s: string): number | undefined {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : NaN;
}
function bacaRupiah(s: string): number | undefined {
  const t = s.replace(/[.\s]/g, "");
  if (!t) return undefined;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}
function dariDraf(r: number, art: number, d: Draf): { e: Isian | null; salah: string | null } {
  const k1 = bacaBanyak(d.k1), k3 = bacaBanyak(d.k3), k2 = bacaRupiah(d.k2), k4 = bacaRupiah(d.k4);
  if ([k1, k2, k3, k4].some((x) => x !== undefined && Number.isNaN(x))) return { e: null, salah: "Isi dengan angka tak negatif. Banyaknya boleh desimal (koma); nilai rupiah bilangan bulat." };
  const e: Isian = { r };
  if (k1 !== undefined) e.k1 = k1;
  if (k2 !== undefined) e.k2 = k2;
  if (k3 !== undefined) e.k3 = k3;
  if (k4 !== undefined) e.k4 = k4;
  if (perART(r)) { e.art = art; if (d.sumber !== "") e.sumber = Number(d.sumber); }
  if (d.nama.trim()) e.nama = d.nama.trim();
  if (d.satuan.trim()) e.satuan = d.satuan.trim();
  const ada = k1 !== undefined || k2 !== undefined || k3 !== undefined || k4 !== undefined;
  return { e: ada ? e : null, salah: null };
}
const keDraf = (e: Isian | undefined): Draf => (e ? { k1: e.k1 === undefined ? "" : String(e.k1).replace(".", ","), k2: e.k2 === undefined ? "" : String(e.k2), k3: e.k3 === undefined ? "" : String(e.k3).replace(".", ","), k4: e.k4 === undefined ? "" : String(e.k4), nama: e.nama ?? "", satuan: e.satuan ?? "", sumber: e.sumber === undefined ? "" : String(e.sumber) } : kosongDraf());

const LABEL_REKAP: string[] = [...KELOMPOK_IV1.slice(0, 12).map((k) => k.nama), "Makanan dan minuman jadi (IV.3.1)", "Rokok dan tembakau (IV.3.1)", "Jumlah", "Sebulan (× 30/7)"];

export default function KuesionerPenuh() {
  const q = useSearchParams();
  const kode = useMemo(() => { const v = q.get("kasus"); return v && /^[A-Z][0-9]{2}$/.test(v) ? v : "K01"; }, [q]);
  const kasus = cariKasusKPublik(kode);
  const tujuan = useMemo(() => { const d = q.get("dari"); return d ? tujuanAman(d) : "/sigap/vanguard"; }, [q]);

  const [isian, setIsian] = useState<Isian[]>([]);
  const [siap, setSiap] = useState(false);
  const [tab, setTab] = useState<Tab>("I");
  const [cari, setCari] = useState("");
  const [edit, setEdit] = useState<{ r: number; art: number } | null>(null);
  const [draf, setDraf] = useState<Draf>(kosongDraf());
  const [salahDraf, setSalahDraf] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [petunjuk, setPetunjuk] = useState<string[]>([]);
  const [totalPetunjuk, setTotalPetunjuk] = useState<number | null>(null);
  const [kerja, setKerja] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const skrol = useRef<HTMLDivElement>(null);
  const hasilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    try {
      const t = window.localStorage.getItem(kunciDraf(kode));
      if (t) { const d = JSON.parse(t); if (Array.isArray(d)) setIsian(d.filter((x) => x && typeof x.r === "number")); }
    } catch { /* penyimpanan lokal boleh gagal */ }
    setSiap(true);
  }, [kode]);
  useEffect(() => {
    if (!siap) return;
    try { window.localStorage.setItem(kunciDraf(kode), JSON.stringify(isian)); } catch { /* abaikan */ }
  }, [isian, siap, kode]);

  useTutupDenganBack(edit !== null, () => setEdit(null));

  const h = useMemo(() => hitungIv1(isian), [isian]);
  const rekap = useMemo(() => rekapIv32(h), [h]);
  const temuan = useMemo(() => periksaIv1(isian), [isian]);
  const terisiKel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of isian) { const r = cariRincianIv1(e.r); if (r) m[r.kel] = (m[r.kel] ?? 0) + 1; }
    return m;
  }, [isian]);

  const daftar: RincianIv1[] = useMemo(() => {
    const t = cari.trim().toLowerCase();
    if (t) return RINCIAN_IV1.filter((r) => r.nama.toLowerCase().includes(t) || String(r.no) === t.replace(/^r\.?\s*/, "") || (r.kode ?? "").includes(t));
    return RINCIAN_IV1.filter((r) => r.kel === tab);
  }, [cari, tab]);

  if (!kasus) {
    return (
      <div className="vg"><div className="phone"><div className="vgtop"><span className="lencana"><Lambang px={20} /></span><div className="nm">VANGUARD<small>Mode Kuesioner Penuh</small></div><Link href={tujuan}>Kembali</Link></div>
        <div className="scroll"><div className="sheet"><h2>Kasus tidak ditemukan</h2><p style={{ fontSize: 13 }}>Kode {kode} belum tersedia.</p></div></div></div></div>
    );
  }

  const bukaEdit = (r: number, art = 1) => {
    const ada = isian.find((e) => e.r === r && (e.art ?? 0) === (perART(r) ? art : 0));
    setDraf(keDraf(ada)); setSalahDraf(null); setEdit({ r, art });
  };
  const simpan = () => {
    if (!edit) return;
    const { e, salah } = dariDraf(edit.r, edit.art, draf);
    if (salah) { setSalahDraf(salah); return; }
    setIsian((daftarIsi) => {
      const sisa = daftarIsi.filter((x) => !(x.r === edit.r && (x.art ?? 0) === (perART(edit.r) ? edit.art : 0)));
      return e ? [...sisa, e].sort((a, b) => a.r - b.r || (a.art ?? 0) - (b.art ?? 0)) : sisa;
    });
    setHasil(null); setEdit(null);
  };
  const hapus = () => {
    if (!edit) return;
    setIsian((d) => d.filter((x) => !(x.r === edit.r && (x.art ?? 0) === (perART(edit.r) ? edit.art : 0))));
    setHasil(null); setEdit(null);
  };

  const minta = async (lihat: boolean) => {
    setKerja(true); setGalat(null);
    try {
      const r = await apiPortal<Hasil>("/api/sigap/vanguard/kuesioner", { method: "POST", body: JSON.stringify({ kode, isian, lihat }) });
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
      const r = await apiPortal<{ petunjuk: string[]; total: number }>(`/api/sigap/vanguard/kuesioner?kode=${kode}&petunjuk=${n}`);
      setPetunjuk(r.petunjuk); setTotalPetunjuk(r.total);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat petunjuk.");
    } finally { setKerja(false); }
  };
  const ulang = () => {
    if (isian.length > 0 && !window.confirm("Hapus semua isian kasus ini dan mulai dari awal?")) return;
    setIsian([]); setHasil(null); setPetunjuk([]); setGalat(null);
  };

  const rincianEdit = edit ? cariRincianIv1(edit.r) : undefined;
  const barisEdit = edit ? (() => { const { e } = dariDraf(edit.r, edit.art, draf); return e ? hitungBaris(e) : null; })() : null;
  const habisPetunjuk = totalPetunjuk !== null && petunjuk.length >= totalPetunjuk;
  const kelAktif = KELOMPOK_IV1.find((k) => k.kel === tab);

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
        <div className="l3"><span>{isian.length} rincian terisi · {h.komoditasRt + Object.values(h.komoditasPerArt).reduce((a, b) => a + b, 0)} komoditas</span><button className="tog" type="button" onClick={ulang}>Mulai ulang</button></div>
      </div>

      <div className="scroll" ref={skrol}><div className="stack">
        <div className="catat tidak" role="status"><b>Latihan:</b> isian dinilai di server dan tidak dicatat. Draf tersimpan di perangkat ini.</div>

        <details className="kp-cerita" open>
          <summary>Catatan konsumsi (baca dulu)</summary>
          <p>{kasus.cerita}</p>
          <ol>{kasus.catatan.map((c, i) => <li key={i}>{c}</li>)}</ol>
          <ul className="kp-info">{kasus.info.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </details>

        {petunjuk.length > 0 && <div className="hint" role="note"><b>Petunjuk</b><ol style={{ margin: "4px 0 0 18px" }}>{petunjuk.map((p, i) => <li key={i}>{p}</li>)}</ol></div>}

        <div role="tablist" aria-label="Kelompok komoditas" className="kp-tabs">
          {KELOMPOK_IV1.map((k) => (
            <button key={k.kel} type="button" role="tab" aria-selected={tab === k.kel && !cari.trim()} className="kp-tab" onClick={() => { setTab(k.kel); setCari(""); }}>
              {k.kel}{terisiKel[k.kel] ? <span className="n">{terisiKel[k.kel]}</span> : null}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={tab === "diisi" && !cari.trim()} className="kp-tab" onClick={() => { setTab("diisi"); setCari(""); }}>Diisi</button>
          <button type="button" role="tab" aria-selected={tab === "rekap" && !cari.trim()} className="kp-tab" onClick={() => { setTab("rekap"); setCari(""); }}>Rekap</button>
        </div>

        {(tab !== "rekap" && tab !== "diisi") || cari.trim() ? (
          <>
            <input className="kp-cari" type="search" inputMode="search" placeholder="Cari rincian (nama atau nomor R)" aria-label="Cari rincian" value={cari} onChange={(e) => setCari(e.target.value)} />
            <div className="kp-kel">{cari.trim() ? `${daftar.length} rincian cocok` : kelAktif ? `Kelompok ${kelAktif.kel} · ${kelAktif.nama} (R.${kelAktif.no}–R.${kelAktif.sampai})` : ""}</div>
            <div>
              {daftar.map((r) => {
                const ent = isian.filter((e) => e.r === r.no);
                const total = ent.reduce((a, e) => a + hitungBaris(e).k6, 0);
                return (
                  <button key={r.no} type="button" className={`item${ent.length ? " done" : ""}`} onClick={() => bukaEdit(r.no)}>
                    <span className="num">{r.no}</span>
                    <span className="t">{r.nama}<small>{r.satuan ? `Satuan: ${r.satuan}` : "Tulis nama dan satuan sendiri"}{r.kode ? ` · ${r.kode}` : ""}</small></span>
                    <span className="st">{ent.length ? `Rp${fmt(total)}` : "＋"}</span>
                  </button>
                );
              })}
              {daftar.length === 0 && <div className="sheet" style={{ fontSize: 13 }}>Tidak ada rincian yang cocok.</div>}
            </div>
          </>
        ) : null}

        {tab === "diisi" && !cari.trim() && (
          <div>
            {temuan.length > 0 && (
              <div className="hint" role="alert" style={{ marginBottom: 8 }}>
                <b>Perlu diperiksa (aturan kuesioner)</b>
                <ul style={{ margin: "4px 0 0 18px" }}>{temuan.map((t, i) => <li key={i}>R{t.r}{t.art ? ` ART ${t.art}` : ""}: {t.pesan}</li>)}</ul>
              </div>
            )}
            {isian.length === 0 && <div className="sheet" style={{ fontSize: 13 }}>Belum ada rincian terisi. Pilih kelompok atau cari rincian lalu ketuk barisnya.</div>}
            {isian.map((e) => {
              const b = hitungBaris(e); const r = cariRincianIv1(e.r);
              return (
                <button key={kunciIsi(e)} type="button" className="item done" onClick={() => bukaEdit(e.r, e.art ?? 1)}>
                  <span className="num">{e.r}</span>
                  <span className="t">{e.nama || r?.nama}{e.art ? ` · ART ${e.art}` : ""}<small className="v">K5 {fmt(b.k5)} · K6 Rp{fmt(b.k6)}</small></span>
                  <span className="st">✎</span>
                </button>
              );
            })}
          </div>
        )}

        {tab === "rekap" && !cari.trim() && (
          <div className="sheet">
            <span className="tag">Blok IV.3.2</span>
            <p style={{ fontSize: 12.5, marginBottom: 6 }}>Dihitung otomatis dari isian Blok IV.1 (K3 pembelian, K4 produksi sendiri/pemberian, K5 jumlah). Hanya dibaca.</p>
            <table className="tbl">
              <thead><tr><th>R</th><th>Kelompok</th><th style={{ textAlign: "right" }}>K3</th><th style={{ textAlign: "right" }}>K4</th><th style={{ textAlign: "right" }}>K5</th></tr></thead>
              <tbody>
                {rekap.map((b, i) => (
                  <tr key={b.r}><td className="n kiri">{b.r}</td><td>{LABEL_REKAP[i]}</td><td className="n">{b.r === 16 ? "" : fmt(b.k3)}</td><td className="n">{b.r === 16 ? "" : fmt(b.k4)}</td><td className="n">{fmt(b.k5)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {galat && <div className="catat gagal" role="alert">{galat}</div>}

        <div ref={hasilRef}>
          {hasil && (
            <div className={`res ${hasil.benar ? "good" : "bad"}`} role="status">
              <div className="vd">
                <span className="ic" aria-hidden>{hasil.benar ? "✓" : "!"}</span>
                <div><strong>{hasil.benar ? "Semua rincian sudah benar" : `${hasil.kesalahan.length} temuan`}</strong>
                  <small>{hasil.sesuai} dari {hasil.total} rincian sesuai · rekap IV.3.2 {hasil.rekapSesuai ? "sesuai" : "belum sesuai"}</small></div>
              </div>
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
        <button type="button" className="btn pri" disabled={kerja || isian.length === 0} onClick={() => minta(false)}>{kerja ? "Memeriksa…" : "Periksa"}</button>
      </div>
      <div className="vgfoot"><b>Latihan · Mode Kuesioner Penuh</b> · tidak dicatat</div>

      {edit && rincianEdit && (
        <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="kp-modal" role="dialog" aria-label={`Isi rincian ${edit.r}`}>
            <h2>R{edit.r} · {rincianEdit.nama}</h2>
            <div className="sub">{rincianEdit.satuan ? `Satuan baku: ${rincianEdit.satuan}` : "Rincian lainnya: tulis nama dan satuan"}{rincianEdit.kode ? ` · COICOP ${rincianEdit.kode}` : ""}</div>
            {perART(edit.r) && (
              <div className="kp-2">
                <label className="kp-f"><span>ART</span>
                  <select value={edit.art} onChange={(e) => bukaEdit(edit.r, Number(e.target.value))}>{Array.from({ length: 15 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                <label className="kp-f"><span>Sumber <small>R{edit.r}K7</small></span>
                  <select value={draf.sumber} onChange={(e) => setDraf({ ...draf, sumber: e.target.value })}><option value="">—</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
              </div>
            )}
            {rincianLainnya(rincianEdit) && (
              <div className="kp-2">
                <label className="kp-f"><span>Nama komoditas</span><input className="teks" value={draf.nama} autoCapitalize="characters" onChange={(e) => setDraf({ ...draf, nama: e.target.value })} /></label>
                <label className="kp-f"><span>Satuan</span><input className="teks" value={draf.satuan} autoCapitalize="characters" onChange={(e) => setDraf({ ...draf, satuan: e.target.value })} /></label>
              </div>
            )}
            <div className="kp-2">
              <label className="kp-f"><span>Dibeli: banyaknya <small>R{edit.r}K1</small></span><input inputMode="decimal" value={draf.k1} onChange={(e) => setDraf({ ...draf, k1: e.target.value })} /></label>
              <label className="kp-f"><span>Dibeli: nilai Rp <small>R{edit.r}K2</small></span><input inputMode="numeric" value={draf.k2} onChange={(e) => setDraf({ ...draf, k2: e.target.value })} /></label>
              <label className="kp-f"><span>Produksi/pemberian: banyaknya <small>R{edit.r}K3</small></span><input inputMode="decimal" value={draf.k3} onChange={(e) => setDraf({ ...draf, k3: e.target.value })} /></label>
              <label className="kp-f"><span>Produksi/pemberian: nilai Rp <small>R{edit.r}K4</small></span><input inputMode="numeric" value={draf.k4} onChange={(e) => setDraf({ ...draf, k4: e.target.value })} /></label>
              <label className="kp-f ro"><span>Jumlah banyaknya <small>K5 otomatis</small></span><input readOnly tabIndex={-1} value={barisEdit ? fmt(barisEdit.k5) : ""} /></label>
              <label className="kp-f ro"><span>Jumlah nilai Rp <small>K6 otomatis</small></span><input readOnly tabIndex={-1} value={barisEdit ? fmt(barisEdit.k6) : ""} /></label>
            </div>
            {salahDraf && <div className="catat gagal" role="alert" style={{ marginBottom: 8 }}>{salahDraf}</div>}
            <div className="pad"><div className="row2">
              <button type="button" className="btn" onClick={() => setEdit(null)}>Batal</button>
              <button type="button" className="btn" onClick={hapus}>Hapus</button>
              <button type="button" className="btn pri" onClick={simpan}>Simpan</button>
            </div></div>
          </div>
        </div>
      )}
    </div></div>
  );
}
