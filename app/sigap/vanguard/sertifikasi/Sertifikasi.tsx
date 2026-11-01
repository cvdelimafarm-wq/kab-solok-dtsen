"use client";

// app/sigap/vanguard/sertifikasi/Sertifikasi.tsx
//
// (1 Nov 2026) VANGUARD V7e: layar Ujian Sertifikasi (keputusan Iqbal 1 Nov): 15 butir acak dan berimbang, angka tiap butir acak, dinilai di SERVER (kunci tidak ada di perangkat),
// tingkat 1–5 bintang (Pemula, Dasar, Intermediate, Profesional, Expert). Sertifikat belum berdampak ke mana pun (kepemilikan saja). Latihan = format sama, tidak mengubah sertifikat.
// Layar: beranda (sertifikat, status, riwayat) -> ujian (daftar butir) -> butir (kuesioner IV.1 atau lembar V–VII) -> hasil (bintang + tinjauan).
// Back (layar dan Back HP) mundur satu tingkat: butir -> daftar -> beranda -> keluar halaman. Berkas ini TIDAK boleh mengimpor kunci atau templat.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import "../vanguard.css";
import "../kuesioner/kuesioner.css";
import "./sertifikasi.css";
import { apiPortal } from "@/app/portal/sesi";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { bacaSesi } from "@/app/sigap/admin/api";
import { compute, fmt as fmtRp } from "@/lib/vanguard/engine";
import { FUNGSI, TOMBOL, hitungEkspresi, tekanPad } from "@/lib/vanguard/keypad";
import { kutipanIv, lembarBlok } from "@/lib/vanguard/lembar";
import { tujuanAman } from "@/lib/vanguard/navigasi";
import { labelSel } from "@/lib/vanguard/sel";
import { NAMA_TINGKAT } from "@/lib/vanguard/sertifikasi/skor";
import type { KasusPublik, Nilai } from "@/lib/vanguard/tipe";
import { Lambang } from "../Logo";
import PapanIsianK, { type Isian } from "../kuesioner/PapanIsianK";

type Layar = "beranda" | "ujian" | "butir" | "hasil";
type Ringkas = { ujian: number; tingkat: number | null; skor: number | null; selesai_at: string | null } | null;
type Beranda = {
  status: { sertifikasiBoleh: boolean; alasan: string | null; bukaLagi: string | null; sudahBersertifikat: boolean };
  berjalan: number | null; jumlahButir: number;
  riwayat: { ujian: number; jenis: "sertifikasi" | "latihan"; mulai_at: string; selesai_at: string | null; skor: number | null; tingkat: number | null }[];
  sertifikat: { terbaru: Ringkas; tertinggi: Ringkas };
};
type Rincian = { jenis: string; tingkat: string; pesan: string; sel: string | null };
type ButirRingkas = { urut: number; kode: string; jenis: "k" | "v1"; judul: string; terjawab: boolean; benar?: boolean | null; poin?: number | null; rincian?: Rincian[] };
type UjianDetail = { ujian: { id: number; jenis: "sertifikasi" | "latihan"; jumlah: number; mulai_at: string; selesai_at: string | null; skor: number | null; tingkat: number | null; kedaluwarsa: boolean }; butir: ButirRingkas[] };
type Soal = { soal: { jenis: "k" | "v1"; kode: string; benih: number; judul: string; data: Record<string, unknown> }; terjawab: boolean };
type HasilUjian = { hasil: { skor: number; butirFatal: number; tingkat: number; nama: string }; jenis: "sertifikasi" | "latihan"; review: { urut: number; kode: string; judul: string; terjawab: boolean; benar: boolean | null; poin: number; rincian: Rincian[] }[] };
type Jawab = { benar: boolean; poin: number; semuaTerjawab: boolean; rincian?: Rincian[] };

const wibTeks = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " WIB" : "");
const html = (h: string) => ({ __html: h });
const Bintang = ({ n, pop }: { n: number; pop?: boolean }) => (
  <div className={`sr-bintang${pop ? " sr-pop" : ""}`} role="img" aria-label={`${n} dari 5 bintang`}>
    {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? "" : "off"}>★</span>)}
  </div>
);
const LABEL_JENIS_UJIAN = { sertifikasi: "Sertifikasi", latihan: "Latihan" } as const;
const kunciDrafUjian = (ujian: number, urut: number) => `vanguard.ujian.${ujian}.${urut}`;

export default function Sertifikasi() {
  const q = useSearchParams();
  const tujuan = useMemo(() => { const d = q.get("dari"); return d ? tujuanAman(d) : "/sigap/vanguard"; }, [q]);
  const [layar, setLayar] = useState<Layar>("beranda");
  const [beranda, setBeranda] = useState<Beranda | null>(null);
  const [detail, setDetail] = useState<UjianDetail | null>(null);
  const [soal, setSoal] = useState<Soal | null>(null);
  const [urut, setUrut] = useState(0);
  const [hasil, setHasil] = useState<HasilUjian | null>(null);
  const [jawab, setJawab] = useState<Jawab | null>(null);
  const [kerja, setKerja] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [isianK, setIsianK] = useState<Isian[]>([]);
  const [vals, setVals] = useState<Nilai>({});
  const [pad, setPad] = useState<{ id: string; expr: string; ganti: boolean } | null>(null);
  const mulaiButir = useRef(Date.now());
  const skrol = useRef<HTMLDivElement>(null);

  const api = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
    setGalat(null);
    try { return await apiPortal<T>(url, init); } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return null;
      setGalat(e instanceof Error ? e.message : "Terjadi gangguan. Coba lagi.");
      return null;
    }
  }, []);

  const muatBeranda = useCallback(async () => { const r = await api<Beranda>("/api/sigap/vanguard/sertifikasi"); if (r) setBeranda(r); }, [api]);
  const muatDetail = useCallback(async (id: number) => { const r = await api<UjianDetail>(`/api/sigap/vanguard/sertifikasi?ujian=${id}`); if (r) setDetail(r); return r; }, [api]);

  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    void muatBeranda();
  }, [muatBeranda]);

  const keAtas = () => { setPad(null); setLayar((l) => (l === "butir" ? "ujian" : l === "ujian" || l === "hasil" ? "beranda" : l)); if (layar === "ujian" || layar === "hasil") void muatBeranda(); skrol.current?.scrollTo({ top: 0 }); };
  useTutupDenganBack(layar !== "beranda", keAtas);

  const mulai = async (jenis: "sertifikasi" | "latihan") => {
    setKerja(true);
    const r = await api<{ ujian: number; jumlah: number }>("/api/sigap/vanguard/sertifikasi", { method: "POST", body: JSON.stringify({ aksi: "mulai", jenis }) });
    if (r) { const d = await muatDetail(r.ujian); if (d) { setHasil(null); setLayar("ujian"); } }
    setKerja(false);
  };
  const lanjutkan = async (id: number) => { setKerja(true); const d = await muatDetail(id); if (d) { setHasil(null); setLayar("ujian"); } setKerja(false); };

  const bukaButir = async (b: ButirRingkas) => {
    if (!detail) return;
    setKerja(true); setJawab(null); setPad(null);
    const r = await api<Soal>(`/api/sigap/vanguard/sertifikasi?ujian=${detail.ujian.id}&butir=${b.urut}`);
    if (r) {
      setSoal(r); setUrut(b.urut); setVals({}); setIsianK([]);
      try { const t = window.localStorage.getItem(kunciDrafUjian(detail.ujian.id, b.urut)); if (t && !b.terjawab) { const d = JSON.parse(t); if (b.jenis === "k" && Array.isArray(d)) setIsianK(d); if (b.jenis === "v1" && d && typeof d === "object" && !Array.isArray(d)) setVals(d); } } catch { /* abaikan */ }
      mulaiButir.current = Date.now();
      setLayar("butir"); skrol.current?.scrollTo({ top: 0 });
    }
    setKerja(false);
  };
  // draf butir di perangkat (boleh gagal)
  useEffect(() => {
    if (layar !== "butir" || !detail || !soal || soal.terjawab) return;
    try { window.localStorage.setItem(kunciDrafUjian(detail.ujian.id, urut), JSON.stringify(soal.soal.jenis === "k" ? isianK : vals)); } catch { /* abaikan */ }
  }, [isianK, vals, layar, detail, soal, urut]);

  const kirimJawaban = async () => {
    if (!detail || !soal) return;
    setKerja(true);
    const isian = soal.soal.jenis === "k" ? isianK : vals;
    const r = await api<Jawab>("/api/sigap/vanguard/sertifikasi", { method: "POST", body: JSON.stringify({ aksi: "jawab", ujian: detail.ujian.id, urut, isian, durasiDtk: Math.round((Date.now() - mulaiButir.current) / 1000) }) });
    if (r) {
      setJawab(r); setSoal({ ...soal, terjawab: true });
      try { window.localStorage.removeItem(kunciDrafUjian(detail.ujian.id, urut)); } catch { /* abaikan */ }
      await muatDetail(detail.ujian.id);
    }
    setKerja(false);
  };
  const selesai = async (menyerah = false) => {
    if (!detail) return;
    if (menyerah && !window.confirm("Selesaikan sekarang? Butir yang belum dijawab dinilai 0.")) return;
    setKerja(true);
    const r = await api<HasilUjian>("/api/sigap/vanguard/sertifikasi", { method: "POST", body: JSON.stringify({ aksi: "selesai", ujian: detail.ujian.id, menyerah }) });
    if (r) { setHasil(r); setLayar("hasil"); skrol.current?.scrollTo({ top: 0 }); }
    setKerja(false);
  };

  // ---- lembar V–VII (butir lama) ----
  const kasusV1 = soal && soal.soal.jenis === "v1" ? (soal.soal.data as unknown as KasusPublik) : null;
  const e = useMemo(() => compute(vals), [vals]);
  const htmlLembar = useMemo(() => (kasusV1 ? lembarBlok(kasusV1, { vals, co: e.co, status: {} }) : ""), [kasusV1, vals, e]);
  const nilaiPad = pad ? hitungEkspresi(pad.expr) : null;
  const simpanPad = () => {
    if (!pad || nilaiPad === null || nilaiPad < 0) return;
    const bulat = Math.round(nilaiPad);
    setVals((x) => { const baru = { ...x }; if (bulat) baru[pad.id] = bulat; else delete baru[pad.id]; return baru; });
    setPad(null);
  };
  const klikLembar = (ev: React.MouseEvent) => {
    if (soal?.terjawab) return;
    const td = (ev.target as HTMLElement).closest<HTMLElement>("td.in");
    if (td?.dataset.id) { (document.activeElement as HTMLElement | null)?.blur(); setPad({ id: td.dataset.id, expr: vals[td.dataset.id] ? String(vals[td.dataset.id]) : "", ganti: !!vals[td.dataset.id] }); }
  };

  const terjawab = detail ? detail.butir.filter((b) => b.terjawab).length : 0;
  const total = detail ? detail.butir.length : 0;
  const latihan = detail?.ujian.jenis === "latihan";
  const judulLayar = layar === "hasil" ? "Hasil ujian" : layar === "butir" ? `Butir ${urut} dari ${total}` : layar === "ujian" ? (latihan ? "Latihan ujian" : "Ujian Sertifikasi") : "Sertifikasi kemampuan";
  const persen = layar === "beranda" ? 0 : total ? (terjawab / total) * 100 : 0;

  return (
    <div className="vg"><div className="phone">
      <div className="vgtop">
        <span className="lencana"><Lambang px={20} /></span>
        <div className="nm">VANGUARD<small>Sertifikasi kemampuan</small></div>
        {layar === "beranda" ? <Link href={tujuan}>Kembali</Link> : <button type="button" onClick={keAtas} style={{ minHeight: 44, padding: "0 12px", borderRadius: 99, background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>{layar === "butir" ? "Daftar butir" : "Beranda"}</button>}
      </div>
      <div className="appbar">
        <div className="l1"><b>BADAN PUSAT STATISTIK · VSEN26.KP</b><span className="r">RAHASIA</span></div>
        <h1>{judulLayar}</h1>
        {layar !== "beranda" && <div className="l3"><span>{terjawab} dari {total} butir dijawab</span>{detail && <span>{LABEL_JENIS_UJIAN[detail.ujian.jenis]}</span>}</div>}
        {layar !== "beranda" && <div className="bar"><i style={{ width: `${persen}%` }} /></div>}
      </div>

      <div className="scroll" ref={skrol}><div className="stack">
        {galat && <div className="catat gagal" role="alert">{galat}</div>}

        {layar === "beranda" && (
          !beranda ? <div className="sheet">Memuat…</div> : (
            <>
              <div className="sr-kartu">
                {beranda.sertifikat.tertinggi ? (
                  <>
                    <div className="sub">Sertifikat kemampuan Anda</div>
                    <Bintang n={beranda.sertifikat.tertinggi.tingkat ?? 0} />
                    <div className="nm">{NAMA_TINGKAT[beranda.sertifikat.tertinggi.tingkat ?? 1]}</div>
                    <div className="sub">Skor {beranda.sertifikat.tertinggi.skor} · {wibTeks(beranda.sertifikat.tertinggi.selesai_at)}</div>
                    {beranda.sertifikat.terbaru && beranda.sertifikat.terbaru.ujian !== beranda.sertifikat.tertinggi.ujian && <div className="sub">Ujian terbaru: {NAMA_TINGKAT[beranda.sertifikat.terbaru.tingkat ?? 1]} (skor {beranda.sertifikat.terbaru.skor})</div>}
                  </>
                ) : (
                  <>
                    <div className="sub">Belum bersertifikat</div>
                    <Bintang n={0} />
                    <div className="nm">Ikuti ujian pertama Anda</div>
                    <div className="sub">{beranda.jumlahButir} butir, angka tiap butir berbeda</div>
                  </>
                )}
              </div>
              {beranda.berjalan && <div className="catat ya" role="status"><b>Ada ujian yang belum selesai.</b> <button type="button" className="tog" disabled={kerja} onClick={() => void lanjutkan(beranda.berjalan as number)}>Lanjutkan</button></div>}
              {!beranda.berjalan && (
                <div className="sheet">
                  <span className="tag">Ujian Sertifikasi</span>
                  <p style={{ fontSize: 13 }}>{beranda.jumlahButir} butir acak dan berimbang dari berbagai blok kuesioner. Jawaban dinilai server; tiap butir dijawab sekali. Hasilnya tingkat 1–5 bintang.</p>
                  {!beranda.status.sertifikasiBoleh && <div className="catat tidak" role="status" style={{ marginTop: 6 }}>{beranda.status.alasan}{beranda.status.bukaLagi ? ` (terbuka ${wibTeks(beranda.status.bukaLagi)})` : ""}</div>}
                  <div className="btns" style={{ padding: "10px 0 0", border: 0 }}>
                    <button type="button" className="btn pri" disabled={kerja || !beranda.status.sertifikasiBoleh} onClick={() => void mulai("sertifikasi")}>{beranda.status.sudahBersertifikat ? "Sertifikasi ulang" : "Mulai ujian sertifikasi"}</button>
                    <button type="button" className="btn" disabled={kerja} onClick={() => void mulai("latihan")}>Latihan (format sama)</button>
                  </div>
                </div>
              )}
              <div className="sheet">
                <span className="tag">Tingkat kemampuan</span>
                <ul className="sr-aturan">{[1, 2, 3, 4, 5].map((n) => <li key={n}>{"★".repeat(n)} <b>{NAMA_TINGKAT[n]}</b></li>)}</ul>
                <p style={{ fontSize: 12, color: "#444", marginTop: 6 }}>Sertifikat ini hanya catatan kepemilikan kemampuan; belum berdampak ke penilaian atau penugasan apa pun.</p>
              </div>
              {beranda.riwayat.length > 0 && (
                <div className="sheet">
                  <span className="tag">Riwayat ujian</span>
                  {beranda.riwayat.map((r) => (
                    <div key={r.ujian} className="item" style={{ cursor: "default" }}>
                      <span className="num">{r.selesai_at ? r.tingkat : "…"}</span>
                      <span className="t">{LABEL_JENIS_UJIAN[r.jenis]}{r.selesai_at ? ` · ${NAMA_TINGKAT[r.tingkat ?? 1]}` : " · belum selesai"}<small>{wibTeks(r.mulai_at)}{r.skor !== null ? ` · skor ${r.skor}` : ""}</small></span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        )}

        {layar === "ujian" && detail && (
          <>
            {latihan && <div className="catat tidak" role="status"><b>Latihan:</b> format sama dengan ujian, rincian kesalahan tampil langsung, dan tidak mengubah sertifikat.</div>}
            {detail.ujian.kedaluwarsa && <div className="catat gagal" role="alert">Ujian ini sudah lewat batas waktu. Mulai ujian baru dari beranda.</div>}
            <div className="sr-chips" role="list">
              {detail.butir.map((b) => <button key={b.urut} type="button" role="listitem" className={`sr-chip${b.terjawab ? " ya" : ""}`} aria-label={`Butir ${b.urut}${b.terjawab ? " sudah dijawab" : ""}`} onClick={() => void bukaButir(b)}>{b.terjawab ? "✓" : b.urut}</button>)}
            </div>
            {detail.butir.map((b) => (
              <button key={b.urut} type="button" className={`item${b.terjawab ? " done" : ""}`} onClick={() => void bukaButir(b)}>
                <span className="num">{b.urut}</span>
                <span className="t">{b.judul}<small>{b.jenis === "k" ? "Kuesioner Blok IV.1" : "Isian Blok V–VII"}{b.terjawab && b.poin != null && latihan ? ` · ${b.poin} poin` : ""}</small></span>
                <span className="st">{b.terjawab ? "✓" : "▶"}</span>
              </button>
            ))}
            {!detail.ujian.kedaluwarsa && (
              <div className="btns" style={{ padding: "6px 0", border: 0 }}>
                <button type="button" className="btn pri" disabled={kerja || terjawab < total} onClick={() => void selesai(false)}>Selesai dan lihat hasil</button>
                {terjawab < total && <button type="button" className="btn" disabled={kerja} onClick={() => void selesai(true)}>Akhiri sekarang</button>}
              </div>
            )}
          </>
        )}

        {layar === "butir" && soal && (
          <>
            <div className="sheet memo">
              <span className="tag">Butir {urut} · {soal.soal.jenis === "k" ? "Kuesioner Blok IV.1" : "Isian Blok V–VII"}</span>
              <h2>{soal.soal.judul}</h2>
              {soal.soal.jenis === "k" ? (
                <>
                  <p>{String(soal.soal.data.cerita ?? "")}</p>
                  <ol style={{ margin: "0 0 6px 20px", fontSize: 13 }}>{((soal.soal.data.catatan as string[]) ?? []).map((c, i) => <li key={i} style={{ marginBottom: 3 }}>{c}</li>)}</ol>
                  <ul className="kp-info">{((soal.soal.data.info as string[]) ?? []).map((c, i) => <li key={i}>{c}</li>)}</ul>
                </>
              ) : (
                <>
                  <p dangerouslySetInnerHTML={html(String(soal.soal.data.cerita ?? ""))} />
                  {Array.isArray(soal.soal.data.info) && <ul>{(soal.soal.data.info as string[]).map((x, i) => <li key={i} dangerouslySetInnerHTML={html(x)} />)}</ul>}
                </>
              )}
            </div>
            {kasusV1?.iv && <div dangerouslySetInnerHTML={html(kutipanIv(kasusV1.iv))} />}
            {soal.terjawab && !jawab && <div className="catat ya" role="status">Butir ini sudah dijawab dan tidak dapat diubah.</div>}
            {soal.terjawab && jawab && (
              <div className={`catat ${jawab.benar ? "ya" : "tidak"}`} role="status">
                {jawab.benar ? <><b>Jawaban benar.</b> Poin {jawab.poin}.</> : <><b>Jawaban terkirim.</b> Poin {jawab.poin}.{latihan ? "" : " Rincian koreksi tampil di tinjauan setelah ujian selesai."}</>}
                {latihan && jawab.rincian && jawab.rincian.length > 0 && <ul style={{ margin: "6px 0 0 18px" }}>{jawab.rincian.map((r, i) => <li key={i}>{r.pesan}</li>)}</ul>}
              </div>
            )}
            {soal.soal.jenis === "k"
              ? <fieldset disabled={soal.terjawab} style={{ border: 0, minWidth: 0, display: "contents" }}><PapanIsianK isian={isianK} setIsian={setIsianK} tabAwal="I" /></fieldset>
              : <div className="stack" style={{ gap: 12 }} onClick={klikLembar} dangerouslySetInnerHTML={html(htmlLembar)} />}
          </>
        )}

        {layar === "hasil" && hasil && (
          <>
            <div className="sr-kartu">
              <div className="sub">{hasil.jenis === "sertifikasi" ? "Hasil Ujian Sertifikasi" : "Hasil latihan"}</div>
              <Bintang n={hasil.hasil.tingkat} pop />
              <div className="nm">{hasil.hasil.nama}</div>
              <div className="sr-skor" style={{ marginTop: 6 }}>{hasil.hasil.skor}</div>
              <div className="sub">skor dari 100 · {hasil.hasil.butirFatal} butir memuat kesalahan fatal</div>
              {hasil.jenis === "latihan" && <div className="sub" style={{ marginTop: 4 }}>Latihan tidak mengubah sertifikat Anda.</div>}
            </div>
            <div className="sheet"><span className="tag">Tinjauan butir</span>
              {hasil.review.map((r) => (
                <details key={r.urut} className={`sr-rev ${r.benar ? "ok" : "no"}`}>
                  <summary><span>{r.benar ? "✓" : r.terjawab ? "!" : "–"}</span><span>{r.urut}. {r.judul}</span><span className="poin">{r.poin}</span></summary>
                  {r.rincian.length > 0 ? <ul>{r.rincian.map((x, i) => <li key={i}><b>{x.tingkat === "fatal" ? "Fatal" : x.tingkat === "berat" ? "Berat" : "Ringan"}:</b> {x.pesan}</li>)}</ul> : <ul><li>{r.terjawab ? "Tidak ada kesalahan." : "Tidak dijawab."}</li></ul>}
                </details>
              ))}
            </div>
            <div className="btns" style={{ padding: "6px 0", border: 0 }}><button type="button" className="btn pri" onClick={() => { setLayar("beranda"); void muatBeranda(); }}>Kembali ke beranda sertifikasi</button></div>
          </>
        )}
      </div></div>

      {layar === "butir" && soal && (
        <div className="dock">
          <button type="button" className="btn" onClick={keAtas}>Daftar butir</button>
          <button type="button" className="btn pri" disabled={kerja || soal.terjawab} onClick={() => void kirimJawaban()}>{soal.terjawab ? "Sudah dijawab" : kerja ? "Mengirim…" : "Kirim jawaban"}</button>
        </div>
      )}
      <div className="vgfoot"><b>{detail && layar !== "beranda" ? (latihan ? "Latihan" : "Ujian Sertifikasi") : "Sertifikasi kemampuan"}</b> · belum berdampak ke penilaian</div>

      {pad && (
        <div className="ov"><div className="pad" role="dialog" aria-label="Isi angka">
          <div className="ttl">Isi angka (Rp)</div>
          <div className="lab">{labelSel(pad.id)}</div>
          <div className="disp">{pad.expr || "0"}</div>
          <div className="out">{nilaiPad === null ? "…" : nilaiPad < 0 ? "Tidak boleh negatif" : `Rp${fmtRp(nilaiPad)}`}</div>
          <div className="keys">
            {TOMBOL.map((t) => <button key={t} type="button" className={`k${/[÷×−+]/.test(t) ? " op" : ""}`} onClick={() => setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, t) } : p))}>{t}</button>)}
            {FUNGSI.map((f) => <button key={f.teks} type="button" className="k fn" style={{ gridColumn: "span 2" }} onClick={() => setPad((p) => (p ? { ...p, ...tekanPad(p.expr, p.ganti, f.nilai) } : p))}>{f.teks}</button>)}
          </div>
          <div className="row2">
            <button type="button" className="btn" onClick={() => setPad(null)}>Batal</button>
            <button type="button" className="btn" onClick={() => setPad((p) => (p ? { ...p, expr: "", ganti: false } : p))}>Kosongkan</button>
            <button type="button" className="btn pri" disabled={nilaiPad === null || nilaiPad < 0} onClick={simpanPad}>Simpan</button>
          </div>
        </div></div>
      )}
    </div></div>
  );
}
