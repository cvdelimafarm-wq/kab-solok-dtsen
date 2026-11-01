"use client";

// app/sigap/vanguard/Vanguard.tsx
//
// (1 Nov 2026) VANGUARD V2b: layar-layar Vanguard (pembuka, beranda, kasus, hasil akhir). Penilaian memakai engine murni lib/vanguard (kunci ada di perangkat: Mode Latihan).
// Dua mode (ditentukan CARA MASUK, bukan pilihan petugas):
//   bebas    = tanpa ?k=: tidak ada panggilan ke server; bintang hanya disimpan di perangkat (localStorage, boleh gagal);
//   tercatat = dengan ?k=ID dan boleh mencatat: tiap "Periksa" juga dikirim ke api/sigap/vanguard yang MENILAI ULANG dan mencatat. Gagal kirim tidak menghalangi umpan balik.
// HTML lembar, cerita, petunjuk, dan pembahasan berasal dari berkas kasus di repo (tepercaya, sama seperti prototipe); masukan petugas hanya bilangan bulat.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import "./vanguard.css";
import { apiPortal } from "@/app/portal/sesi";
import { bacaSesi } from "@/app/sigap/admin/api";
import { compute, engineChecks, fmt, hitungBintang, isiOtomatisR1, kasusBenar, rp } from "@/lib/vanguard/engine";
import { KASUS, KASUS_BERNILAI, MAKS_BINTANG, NAMA_LEVEL, URUTAN_LEVEL } from "@/lib/vanguard/kasus";
import { kutipanIv, lembarBlok, type Status } from "@/lib/vanguard/lembar";
import { FUNGSI, TOMBOL, hitungEkspresi, tekanTombol } from "@/lib/vanguard/keypad";
import { tujuanAman } from "@/lib/vanguard/navigasi";
import { labelSel } from "@/lib/vanguard/sel";
import type { Kasus, Koreksi, Kontrol, Nilai, PeriksaEngine } from "@/lib/vanguard/tipe";
import { Lambang, LogoPenuh } from "./Logo";

type Layar = "pembuka" | "beranda" | "kasus" | "akhir";
type Info = { memuat: boolean; mode: "bebas" | "tercatat"; boleh: boolean; alasan: string | null };
type Catat = { status: "tidak" | "mengirim" | "ok" | "gagal"; nomor?: number; pesan?: string };
type Hasil = {
  jenis: "benar" | "salah" | "kunci" | "bebas";
  bintang: number | null;
  baris: { k: string; e: number; u: number; ok: boolean }[];
  koreksi: Koreksi[];
  pemeriksaan: PeriksaEngine[];
  ctl: Kontrol | null;
};

const KUNCI_LOKAL = "vanguard.bebas.v1";
const html = (h: string) => ({ __html: h });
const bintangTeks = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));

export default function Vanguard() {
  const q = useSearchParams();
  const kegiatan = useMemo(() => { const v = q.get("k"); return v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null; }, [q]);
  const tujuan = useMemo(() => tujuanAman(q.get("dari")), [q]);

  const [layar, setLayar] = useState<Layar>("pembuka");
  const [idx, setIdx] = useState(0);
  const [vals, setVals] = useState<Nilai>({});
  const [status, setStatus] = useState<Status>({});
  const [hint, setHint] = useState(0);
  const [hints, setHints] = useState<Record<string, number>>({});
  const [tries, setTries] = useState<Record<string, number>>({});
  const [bintang, setBintang] = useState<Record<string, number>>({});
  const [rev, setRev] = useState<Record<string, boolean>>({});
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [catat, setCatat] = useState<Catat>({ status: "tidak" });
  const [pad, setPad] = useState<{ id: string; expr: string } | null>(null);
  const [pas, setPas] = useState(false);
  const [info, setInfo] = useState<Info>({ memuat: kegiatan !== null, mode: kegiatan ? "tercatat" : "bebas", boleh: false, alasan: null });
  const mulaiRef = useRef(Date.now());
  const hasilRef = useRef<HTMLDivElement | null>(null);
  const lembarRef = useRef<HTMLDivElement | null>(null);
  const skrol = useRef<HTMLDivElement | null>(null);

  const layarRef = useRef<Layar>("pembuka");
  layarRef.current = layar;
  const k: Kasus | null = layar === "kasus" ? KASUS[idx] ?? null : null;
  const dicatat = info.mode === "tercatat" && info.boleh;

  // ---------- masuk, mode, dan riwayat ----------
  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    if (kegiatan === null) {
      try {
        const s = JSON.parse(window.localStorage.getItem(KUNCI_LOKAL) ?? "null") as { bintang?: Record<string, number>; tries?: Record<string, number> } | null;
        if (s?.bintang) setBintang(s.bintang);
        if (s?.tries) setTries(s.tries);
      } catch { /* penyimpanan lokal boleh gagal */ }
      return;
    }
    let batal = false;
    (async () => {
      try {
        const r = await apiPortal<{ mode: "bebas" | "tercatat"; boleh: boolean; alasan: string | null; riwayat: { kasus: string; percobaan: number; benar: boolean; bintang: number }[] }>(`/api/sigap/vanguard?kegiatan=${kegiatan}`);
        if (batal) return;
        setInfo({ memuat: false, mode: r.mode, boleh: r.boleh, alasan: r.alasan });
        setTries(Object.fromEntries(r.riwayat.map((x) => [x.kasus, x.percobaan])));
        setBintang(Object.fromEntries(r.riwayat.filter((x) => x.benar).map((x) => [x.kasus, x.bintang])));
      } catch (e) {
        if (batal || (e instanceof Error && e.message === "SESI_BERAKHIR")) return;
        setInfo({ memuat: false, mode: "tercatat", boleh: false, alasan: "Tidak dapat memuat status pencatatan; latihan tetap bisa dilakukan tetapi tidak dicatat." });
      }
    })();
    return () => { batal = true; };
  }, [kegiatan]);

  useEffect(() => {
    if (kegiatan !== null) return;
    try { window.localStorage.setItem(KUNCI_LOKAL, JSON.stringify({ bintang, tries })); } catch { /* abaikan */ }
  }, [bintang, tries, kegiatan]);

  // ---------- riwayat peramban: Back = naik satu layar (pembuka -> keluar halaman) ----------
  const maju = useCallback((l: Layar, i?: number) => {
    // dari satu kasus ke kasus berikutnya: ganti entri (bukan tambah), supaya Back kembali ke daftar kasus
    if (l === "kasus" && layarRef.current === "kasus") window.history.replaceState({ vg: l, idx: i ?? 0 }, "");
    else window.history.pushState({ vg: l, idx: i ?? 0 }, "");
    setLayar(l);
    if (i !== undefined) setIdx(i);
  }, []);
  useEffect(() => {
    const surut = (e: PopStateEvent) => {
      const s = e.state as { vg?: Layar; idx?: number } | null;
      setPad(null);
      setLayar(s?.vg ?? "pembuka");
      if (s?.vg === "kasus" && typeof s.idx === "number") { setIdx(s.idx); setVals({}); setStatus({}); setHasil(null); setCatat({ status: "tidak" }); }
    };
    window.addEventListener("popstate", surut);
    return () => window.removeEventListener("popstate", surut);
  }, []);

  // ---------- hitungan dan lembar ----------
  const e = useMemo(() => compute(vals), [vals]);
  const htmlLembar = useMemo(() => (k ? lembarBlok(k, { vals, co: e.co, status }) : ""), [k, vals, e, status]);
  const disk = e.co.disk;

  useLayoutEffect(() => {
    const kotak = lembarRef.current;
    if (!kotak) return;
    kotak.querySelectorAll<HTMLElement>(".paper").forEach((p) => {
      const t = p.firstElementChild as HTMLElement | null;
      if (!t) return;
      t.style.zoom = "";
      if (pas) { const s = Math.min(1, (p.clientWidth - 2) / t.scrollWidth); if (s < 1) t.style.zoom = String(s); }
    });
  }, [htmlLembar, pas, layar]);

  // ---------- layar kasus ----------
  const bukaKasus = (i: number) => {
    const kode = KASUS[i].kode;
    setVals({}); setStatus({}); setHasil(null); setCatat({ status: "tidak" }); setHint(hints[kode] ?? 0); setPad(null);
    mulaiRef.current = Date.now();
    maju("kasus", i);
    skrol.current?.scrollTo({ top: 0 });
  };
  const keBeranda = () => { setPad(null); window.history.pushState({ vg: "beranda", idx: 0 }, ""); setLayar("beranda"); skrol.current?.scrollTo({ top: 0 }); };

  const kirim = async (kas: Kasus, isian: Nilai, lihatJawaban: boolean, petunjuk: number) => {
    if (!dicatat || kegiatan === null) return;
    setCatat({ status: "mengirim" });
    try {
      const r = await apiPortal<{ nomor: number; benar: boolean; bintang: number }>("/api/sigap/vanguard", {
        method: "POST",
        body: JSON.stringify({ kegiatan, kasus: kas.kode, isian, petunjuk, lihatJawaban, durasiDtk: Math.min(86400, Math.max(0, Math.round((Date.now() - mulaiRef.current) / 1000))) }),
      });
      setCatat({ status: "ok", nomor: r.nomor });
      setTries((t) => ({ ...t, [kas.kode]: r.nomor }));
      if (r.benar) { setBintang((b) => ({ ...b, [kas.kode]: Math.max(b[kas.kode] ?? 0, r.bintang) })); setHasil((h) => (h && h.jenis === "benar" ? { ...h, bintang: r.bintang } : h)); }
    } catch (err) {
      if (err instanceof Error && err.message === "SESI_BERAKHIR") return;
      setCatat({ status: "gagal", pesan: err instanceof Error ? err.message : "Gagal mencatat." });
    }
  };

  const gulirKeHasil = () => window.setTimeout(() => hasilRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);

  const periksa = () => {
    if (!k) return;
    const nomor = (tries[k.kode] ?? 0) + 1;
    setTries((t) => ({ ...t, [k.kode]: nomor }));
    if (k.bebas) {
      setHasil({ jenis: "bebas", bintang: null, baris: [], koreksi: [], pemeriksaan: engineChecks(e), ctl: e.ctl });
      gulirKeHasil();
      return;
    }
    const r = kasusBenar(k, vals);
    const st: Status = {};
    for (const b of r.evaluasi.rows) if (b.e !== 0 || b.u !== 0) st[b.k] = b.ok ? "ok" : "no";
    setStatus(st);
    const b = r.benar ? (rev[k.kode] ? 0 : hitungBintang({ petunjuk: hint, percobaan: nomor, lihatJawaban: false })) : null;
    if (b !== null) setBintang((x) => ({ ...x, [k.kode]: Math.max(x[k.kode] ?? 0, b) }));
    setHasil({ jenis: r.benar ? "benar" : "salah", bintang: b, baris: r.evaluasi.rows, koreksi: r.evaluasi.fb, pemeriksaan: r.pemeriksaan, ctl: k.lengkap && r.benar ? e.ctl : null });
    void kirim(k, vals, false, hint);
    gulirKeHasil();
  };

  const lihatJawaban = () => {
    if (!k) return;
    const kunci: Nilai = { ...k.kunci };
    const isi = k.lengkap ? isiOtomatisR1(kunci) : kunci;
    setRev((r) => ({ ...r, [k.kode]: true }));
    setBintang((b) => (b[k.kode] == null ? { ...b, [k.kode]: 0 } : b));
    setVals(isi);
    const r = kasusBenar(k, isi);
    const st: Status = {};
    for (const b of r.evaluasi.rows) if (b.e !== 0 || b.u !== 0) st[b.k] = "ok";
    setStatus(st);
    setHasil({ jenis: "kunci", bintang: null, baris: r.evaluasi.rows, koreksi: [], pemeriksaan: r.pemeriksaan, ctl: k.lengkap ? compute(isi).ctl : null });
    void kirim(k, isi, true, hint);
    gulirKeHasil();
  };

  // ---------- lembar entri (kalkulator) ----------
  const nilaiPad = pad ? hitungEkspresi(pad.expr) : null;
  const padSah = nilaiPad !== null && nilaiPad >= 0;
  const bukaPad = (id: string) => {
    (document.activeElement as HTMLElement | null)?.blur(); // fokus dilepas dari kotak agar Enter di kalkulator tidak membuka ulang kotak yang sama
    setPad({ id, expr: vals[id] ? String(vals[id]) : "" });
  };
  const simpanPad = useCallback(() => {
    if (!pad) return;
    const v = hitungEkspresi(pad.expr);
    if (v === null || v < 0) return;
    const bulat = Math.round(v);
    setVals((x) => { const baru = { ...x }; if (bulat) baru[pad.id] = bulat; else delete baru[pad.id]; return baru; });
    setStatus((s) => { if (!s[pad.id]) return s; const baru = { ...s }; delete baru[pad.id]; return baru; });
    setPad(null);
  }, [pad]);
  useEffect(() => {
    if (!pad) return;
    const tombol = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setPad(null);
      else if (ev.key === "Enter") { ev.preventDefault(); simpanPad(); }
      else if (ev.key === "Backspace") setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, "⌫") } : p));
      else if (/^[0-9()]$/.test(ev.key)) setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, ev.key) } : p));
      else if (ev.key === "," || ev.key === ".") setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, ",") } : p));
      else if (ev.key === "+") setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, "+") } : p));
      else if (ev.key === "-") setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, "−") } : p));
      else if (ev.key === "*" || ev.key === "x") setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, "×") } : p));
      else if (ev.key === "/") setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, "÷") } : p));
    };
    document.addEventListener("keydown", tombol);
    return () => document.removeEventListener("keydown", tombol);
  }, [pad, simpanPad]);

  const klikLembar = (ev: React.MouseEvent) => { const td = (ev.target as HTMLElement).closest<HTMLElement>("td.in"); if (td?.dataset.id) bukaPad(td.dataset.id); };
  const tombolLembar = (ev: React.KeyboardEvent) => {
    if (pad || (ev.key !== "Enter" && ev.key !== " ")) return;
    const td = (ev.target as HTMLElement).closest<HTMLElement>("td.in");
    if (td?.dataset.id) { ev.preventDefault(); bukaPad(td.dataset.id); }
  };

  const isiOtomatis = () => { setVals((v) => isiOtomatisR1(v)); setStatus({}); };
  const muatContoh = () => {
    const ali = KASUS.find((x) => x.nama === "ali");
    if (!ali) return;
    setVals(isiOtomatisR1({ ...ali.kunci, vii_p1: 0 }));
    setStatus({});
  };

  // ---------- total ----------
  const totalBintang = Object.entries(bintang).filter(([kode]) => KASUS_BERNILAI.some((x) => x.kode === kode)).reduce((a, [, b]) => a + b, 0);
  const selesai = KASUS_BERNILAI.filter((x) => bintang[x.kode] != null).length;
  const modeTeks = dicatat ? "Pelatihan · hasil Anda dicatat" : "Simulasi bebas · data tidak dicatat";

  // ---------- tampilan ----------
  const judul = layar === "kasus" && k ? `Kasus ${k.kode} · ${k.judul}` : layar === "akhir" ? "Hasil akhir" : "Simulasi isian Blok V–VII";
  const persen = layar === "akhir" ? 100 : layar === "kasus" ? (idx / KASUS.length) * 100 : (selesai / KASUS_BERNILAI.length) * 100;

  if (layar === "pembuka") {
    return (
      <div className="vg"><div className="phone">
        <div className="buka">
          <div className="atas">PELATIHAN PETUGAS · VSEN26.KP</div>
          <div className="kartu">
            <LogoPenuh />
            <div><div className="j1">Jaga data dari garis depan.</div><div className="j2">Simulasi pengisian kuesioner KP Susenas</div></div>
            <div className={`chip ${dicatat ? "ya" : "tidak"}`} role="status">
              {info.memuat ? "Memeriksa status pencatatan…" : dicatat ? "PELATIHAN · hasil Anda dicatat" : "SIMULASI BEBAS · data tidak dicatat"}
            </div>
            {!info.memuat && info.mode === "tercatat" && !info.boleh && info.alasan && <div className="j2" style={{ padding: "0 14px" }}>{info.alasan} Anda tetap dapat berlatih; hasilnya tidak dicatat.</div>}
          </div>
          <div className="bawah">
            <button type="button" className="masuk" disabled={info.memuat} onClick={() => maju("beranda")}>Masuk ke Vanguard</button>
            <Link className="pulang" href={tujuan}>← Kembali ke SIGAP</Link>
            <div className="oleh">Diselenggarakan oleh <b>BPS Kabupaten Solok</b></div>
          </div>
        </div>
      </div></div>
    );
  }

  return (
    <div className="vg"><div className="phone">
      <div className="vgtop">
        <span className="lencana"><Lambang px={20} /></span>
        <div className="nm">VANGUARD<small>Survey Intelligence Platform</small></div>
        <Link href={tujuan}>Kembali ke SIGAP</Link>
      </div>
      <div className="appbar">
        <div className="l1"><b>BADAN PUSAT STATISTIK · VSEN26.KP</b><span className="r">RAHASIA</span></div>
        <h1>{judul}</h1>
        <div className="l3"><span>★ {totalBintang} / {MAKS_BINTANG}</span><button className="tog" type="button" aria-pressed={pas} onClick={() => setPas((x) => !x)}>{pas ? "Kertas: pas layar" : "Kertas: geser"}</button></div>
        <div className="bar"><i style={{ width: `${persen}%` }} /></div>
      </div>

      <div className="scroll" ref={skrol}><div className="stack">
        {layar === "beranda" && <Beranda bintang={bintang} selesai={selesai} dicatat={dicatat} info={info} onBuka={bukaKasus} onAkhir={() => maju("akhir")} />}

        {layar === "kasus" && k && (
          <>
            <div className="sheet memo">
              <span className="tag">Kasus {k.kode} · {NAMA_LEVEL[k.level]}</span>
              <h2>{k.judul}</h2>
              <p dangerouslySetInnerHTML={html(k.cerita)} />
              {k.info && <ul>{k.info.map((x, i) => <li key={i} dangerouslySetInnerHTML={html(x)} />)}</ul>}
              {k.bebas && <div className="btns" style={{ padding: "8px 0 0", border: 0 }}><button type="button" className="btn" onClick={muatContoh}>Muat contoh Pak Ali</button></div>}
            </div>
            {k.iv && <div dangerouslySetInnerHTML={html(kutipanIv(k.iv))} />}
            <div className="legend"><span><i className="sw" style={{ background: "#fff" }} />isian Anda (ketuk)</span><span><i className="sw" style={{ background: "#f1f1f1" }} />otomatis</span><span><i className="sw" style={{ background: "#a6a6a6" }} />tidak berlaku</span></div>
            {hint > 0 && <div className="hint stack" style={{ gap: 6 }}>{k.petunjuk.slice(0, hint).map((t, i) => <div key={i}><b>Petunjuk {i + 1}.</b> <span dangerouslySetInnerHTML={html(t)} /></div>)}</div>}
            <div ref={lembarRef} className="stack" style={{ gap: 12 }} onClick={klikLembar} onKeyDown={tombolLembar} dangerouslySetInnerHTML={html(htmlLembar)} />
            {k.blok.includes("VII") && (
              <div className={`sheet dk ${Math.abs(disk) <= 1 ? "ok" : "no"}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12.5 }}><b>Diskrepansi</b> = selisih Blok VI − selisih Blok VII. Harus nol bila Blok VII konsisten dengan Blok V.</div>
                  <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 17, whiteSpace: "nowrap", color: Math.abs(disk) <= 1 ? "var(--good)" : "var(--bad)" }}>{rp(disk)}</div>
                </div>
              </div>
            )}
            <div ref={hasilRef}>
              {hasil && (
                <PanelHasil k={k} hasil={hasil} catat={catat} dicatat={dicatat} adaLanjut={idx < KASUS.length - 1}
                  onUlang={() => { setHasil(null); setStatus({}); setCatat({ status: "tidak" }); }} onKunci={lihatJawaban}
                  onLanjut={() => bukaKasus(idx + 1)} onAkhir={() => maju("akhir")} />
              )}
            </div>
          </>
        )}

        {layar === "akhir" && <Akhir bintang={bintang} total={totalBintang} dicatat={dicatat} onBuka={bukaKasus} onDaftar={keBeranda} />}
      </div></div>

      {layar === "kasus" && k && (
        <div className="dock">
          <button type="button" className="btn" aria-label="Daftar kasus" onClick={() => window.history.back()}>☰</button>
          {k.bebas ? <button type="button" className="btn amb" onClick={isiOtomatis}>Isi R.1 otomatis</button>
            : <button type="button" className="btn" disabled={hint >= k.petunjuk.length} onClick={() => { const n = Math.min(k.petunjuk.length, hint + 1); setHint(n); setHints((h) => ({ ...h, [k.kode]: n })); }}>Petunjuk{k.petunjuk.length ? ` ${hint}/${k.petunjuk.length}` : ""}</button>}
          <button type="button" className="btn pri" disabled={catat.status === "mengirim"} onClick={periksa}>Periksa</button>
        </div>
      )}
      <div className="vgfoot"><b>{modeTeks}</b>{dicatat ? "" : " · tidak menentukan kelulusan"}</div>

      {pad && (
        <div className="ov"><div className="pad" role="dialog" aria-label="Isi angka">
          <div className="ttl">Isi angka (Rp)</div>
          <div className="lab">{labelSel(pad.id)}</div>
          <div className="disp">{pad.expr || "0"}</div>
          <div className="out">{nilaiPad === null ? "…" : nilaiPad < 0 ? "Tidak boleh negatif" : `Rp${fmt(nilaiPad)}`}</div>
          <div className="keys">
            {TOMBOL.map((t) => <button key={t} type="button" className={`k${/[÷×−+]/.test(t) ? " op" : ""}`} onClick={() => setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, t) } : p))}>{t}</button>)}
            {FUNGSI.map((f) => <button key={f.teks} type="button" className="k fn" style={{ gridColumn: "span 2" }} onClick={() => setPad((p) => (p ? { ...p, expr: tekanTombol(p.expr, f.nilai) } : p))}>{f.teks}</button>)}
          </div>
          <div className="row2">
            <button type="button" className="btn" onClick={() => setPad(null)}>Batal</button>
            <button type="button" className="btn" onClick={() => setPad((p) => (p ? { ...p, expr: "" } : p))}>Kosongkan</button>
            <button type="button" className="btn pri" disabled={!padSah} onClick={simpanPad}>Simpan</button>
          </div>
        </div></div>
      )}
    </div></div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function Beranda({ bintang, selesai, dicatat, info, onBuka, onAkhir }: { bintang: Record<string, number>; selesai: number; dicatat: boolean; info: Info; onBuka: (i: number) => void; onAkhir: () => void }) {
  return (
    <>
      <div className={`catat ${dicatat ? "ya" : "tidak"}`} role="status">
        {dicatat ? <><b>Pelatihan:</b> setiap kali Anda menekan Periksa, percobaan dicatat untuk BPS Kabupaten Solok (kesalahan dan jumlah percobaan).</>
          : <><b>Simulasi bebas:</b> jawaban Anda tidak dicatat dan tidak menentukan apa pun. Berlatihlah sebebasnya.{info.mode === "tercatat" && info.alasan ? ` (${info.alasan})` : ""}</>}
      </div>
      <div className="sheet"><span className="tag">Cara main</span><p style={{ fontSize: 13 }}>Baca hasil wawancara dan kutipan Blok IV, lalu isi Blok V (dan VI–VII pada kasus lengkap) seperti di kuesioner. <b>Ketuk kotak isian</b> untuk memasukkan angka; kalkulator ada di lembar isian. Sel <span className="sw" style={{ background: "#a6a6a6", width: 11, height: 11 }} /> abu-abu tidak berlaku. Kotak bertinta biru adalah isian Anda; kotak abu muda dihitung otomatis.</p></div>
      <div className="panel"><div className="jd">RINGKASAN SAYA</div><div style={{ fontSize: 13, marginTop: 3 }}>{selesai} dari {KASUS_BERNILAI.length} kasus sudah dikerjakan.</div></div>
      {URUTAN_LEVEL.map((lv) => (
        <div key={lv}>
          <div><span className="lv">{lv} · {NAMA_LEVEL[lv]}</span></div>
          {KASUS.map((c, i) => c.level !== lv ? null : (
            <button key={c.kode} type="button" className={`item${bintang[c.kode] != null && !c.bebas ? " done" : ""}`} onClick={() => onBuka(i)}>
              <span className="num">{c.kode}</span>
              <span className="t">{c.judul}<small>{c.lengkap ? "Blok V–VII lengkap" : c.bebas ? "Tanpa kunci" : `Blok ${c.blok.map((b) => `V.${b}`).join(" + ")}`}</small></span>
              <span className="st">{bintang[c.kode] != null && !c.bebas ? bintangTeks(bintang[c.kode]) : ""}</span>
            </button>
          ))}
        </div>
      ))}
      {selesai >= KASUS_BERNILAI.length && <button type="button" className="btn pri" style={{ width: "100%" }} onClick={onAkhir}>Lihat hasil akhir</button>}
    </>
  );
}

function Akhir({ bintang, total, dicatat, onBuka, onDaftar }: { bintang: Record<string, number>; total: number; dicatat: boolean; onBuka: (i: number) => void; onDaftar: () => void }) {
  return (
    <>
      <div className="sheet" style={{ textAlign: "center" }}>
        <span className="tag">Skor</span><div className="score">{total} / {MAKS_BINTANG}</div>
        <p style={{ marginTop: 6, fontSize: 13 }}>{total >= MAKS_BINTANG * 0.8 ? "Sangat baik. Pola pasangan Blok IV dan V sudah dikuasai." : total >= MAKS_BINTANG * 0.5 ? "Cukup baik. Ulangi kasus bertanda bintang rendah." : "Pelajari lagi pasangan Blok IV dan V, lalu ulangi kasus."}</p>
        <p className="ref" style={{ marginTop: 6 }}>{dicatat ? "Hasil percobaan Anda tercatat untuk BPS Kabupaten Solok." : "Simulasi bebas: skor ini hanya tersimpan di perangkat Anda."}</p>
      </div>
      {KASUS_BERNILAI.map((c) => (
        <button key={c.kode} type="button" className="item" onClick={() => onBuka(KASUS.indexOf(c))}>
          <span className="num">{c.kode}</span><span className="t">{c.judul}</span><span className="st">{bintang[c.kode] != null ? bintangTeks(bintang[c.kode]) : "–"}</span>
        </button>
      ))}
      <button type="button" className="btn" style={{ width: "100%" }} onClick={onDaftar}>Daftar kasus</button>
    </>
  );
}

function KontrolTabel({ ctl }: { ctl: Kontrol }) {
  const baris = (a: [string, number][]) => a.map((x, i) => <tr key={i}><td>{x[0]}</td><td className="n">{fmt(x[1])}</td></tr>);
  return (
    <details className="ctl"><summary>Tabel kontrol engine (VII Rincian 1)</summary>
      <table><tbody>
        <tr className="t"><td colSpan={2}>Kontrol mengambil uang dan tabungan</td></tr>{baris(ctl.e)}
        <tr className="t"><td>Total 1</td><td className="n">{fmt(ctl.e1)}</td></tr>{baris(ctl.e2a)}
        <tr className="t"><td>Total 2</td><td className="n">{fmt(ctl.e2)}</td></tr>
        <tr className="t"><td>Mengambil uang dan tabungan (T1 − T2)</td><td className="n">{rp(ctl.r1k2)}</td></tr>
        <tr className="t"><td colSpan={2}>Kontrol menyimpan uang dan menabung</td></tr>{baris(ctl.h)}
        <tr className="t"><td>Total 1</td><td className="n">{fmt(ctl.h1)}</td></tr>
        <tr><td>Transfer modal dibayar (V.F K.4+K.5)</td><td className="n">{fmt(ctl.h2)}</td></tr>
        <tr className="t"><td>Menyimpan dan menabung (T1 − T2)</td><td className="n">{rp(ctl.r1k4)}</td></tr>
      </tbody></table>
    </details>
  );
}

function PanelHasil({ k, hasil, catat, dicatat, adaLanjut, onUlang, onKunci, onLanjut, onAkhir }: {
  k: Kasus; hasil: Hasil; catat: Catat; dicatat: boolean; adaLanjut: boolean;
  onUlang: () => void; onKunci: () => void; onLanjut: () => void; onAkhir: () => void;
}) {
  const benar = hasil.jenis === "benar";
  const kunci = hasil.jenis === "kunci";
  const bebas = hasil.jenis === "bebas";
  const baris = hasil.baris.filter((x) => x.e !== 0 || x.u !== 0);
  const jmlSalah = hasil.baris.filter((x) => !x.ok).length + hasil.pemeriksaan.filter((x) => !x.ok && !x.info).length;
  const bagus = benar || kunci || (bebas && hasil.pemeriksaan.every((x) => x.ok));
  const koreksi: { k: string | null; m: string }[] = [...(!kunci && k.nol && hasil.koreksi.length ? [{ k: null, m: k.nol }] : []), ...(kunci ? [] : hasil.koreksi)];
  return (
    <div className={`res ${bagus ? "good" : "bad"}`}>
      <div className="vd">
        <span className="ic">{bagus ? "✓" : "!"}</span>
        <div>
          <strong>{bebas ? "Validasi engine" : benar ? "Benar" : kunci ? "Jawaban yang benar" : "Belum tepat"}</strong>
          <small>{bebas ? "Hasil hitung otomatis dari isian Anda." : benar ? `Semua kotak dan validasi sesuai. ${bintangTeks(hasil.bintang ?? 0)}` : kunci ? "Kotak sudah diisi dengan jawaban benar." : `${jmlSalah} hal perlu diperbaiki.`}</small>
        </div>
      </div>
      <CatatInfo catat={catat} dicatat={dicatat} />
      {!bebas && (baris.length === 0
        ? <section><h3>Cek per kotak</h3><p style={{ fontSize: 13 }}>Semua kotak pada kasus ini seharusnya kosong.</p></section>
        : <section><h3>Cek per kotak</h3>
            <table className="tbl"><thead><tr><th>Kotak</th><th style={{ textAlign: "right" }}>Anda</th><th style={{ textAlign: "right" }}>Benar</th></tr></thead>
              <tbody>{baris.map((x) => <tr key={x.k}><td>{labelSel(x.k)}</td><td className={`n ${x.ok ? "y" : "x"}`}>{x.ok ? "✓ " : "✗ "}{fmt(x.u)}</td><td className="n">{fmt(x.e)}</td></tr>)}</tbody></table>
          </section>)}
      {hasil.pemeriksaan.length > 0 && (
        <section><h3>{bebas ? "Pemeriksaan" : "Validasi engine"}</h3>
          {hasil.pemeriksaan.map((x, i) => <div key={i} className={`chk ${x.ok ? "ok" : "no"}`}><b>{x.info ? "i" : x.ok ? "✓" : "✗"}</b><span>{x.t}</span></div>)}
          {hasil.ctl && <KontrolTabel ctl={hasil.ctl} />}
        </section>
      )}
      {koreksi.length > 0 && !bebas && (
        <section><h3>Koreksi</h3><ul className="fb">{koreksi.map((f, i) => <li key={i}>{f.k && <b>{labelSel(f.k)}. </b>}{f.m}</li>)}</ul></section>
      )}
      {(benar || kunci) && (
        <>
          <section><h3>Cara hitung</h3><ol className="steps">{k.langkah.map((s, i) => <li key={i} dangerouslySetInnerHTML={html(s)} />)}</ol></section>
          <section><h3>Pembahasan</h3><p style={{ fontSize: 13 }} dangerouslySetInnerHTML={html(k.pembahasan)} /><p className="ref" style={{ marginTop: 6 }}>Rujukan: {k.rujukan}</p></section>
          <div className="btns">{adaLanjut ? <button type="button" className="btn pri" onClick={onLanjut}>Kasus berikutnya</button> : <button type="button" className="btn pri" onClick={onAkhir}>Lihat hasil akhir</button>}</div>
        </>
      )}
      {hasil.jenis === "salah" && <div className="btns"><button type="button" className="btn pri" onClick={onUlang}>Coba lagi</button><button type="button" className="btn" onClick={onKunci}>Lihat jawaban</button></div>}
    </div>
  );
}

function CatatInfo({ catat, dicatat }: { catat: Catat; dicatat: boolean }) {
  if (!dicatat) return null;
  if (catat.status === "mengirim") return <div className="catat tidak" role="status" style={{ margin: "8px 12px" }}>Mencatat percobaan…</div>;
  if (catat.status === "ok") return <div className="catat ya" role="status" style={{ margin: "8px 12px" }}>Tercatat: percobaan ke-{catat.nomor} pada kasus ini.</div>;
  if (catat.status === "gagal") return <div className="catat gagal" role="alert" style={{ margin: "8px 12px" }}>Percobaan ini belum tercatat ({catat.pesan}). Tekan Periksa lagi bila sinyal sudah baik.</div>;
  return null;
}
