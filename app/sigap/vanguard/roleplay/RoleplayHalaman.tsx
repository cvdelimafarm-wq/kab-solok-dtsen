"use client";

// app/sigap/vanguard/roleplay/RoleplayHalaman.tsx
//
// (8 Nov 2026) Roleplay bareng kelas. Satu halaman, dua tampilan menurut peran dari server: peserta (LayarPeserta) atau instruktur/panitia (LayarKelola).
// Server memutuskan segalanya (aktif/tidak, peran, kunci sesudah Periksa); halaman ini hanya menggambar dan mengirim. Poin TIDAK masuk nilai pelatihan.
// Polling 4 detik supaya peserta tahu sesi diperiksa dan instruktur melihat jumlah pengisi.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import "../vanguard.css";
import "../kuesioner/kuesioner.css";
import { apiPortal } from "@/app/portal/sesi";
import { bacaSesi } from "@/app/sigap/admin/api";
import { tujuanAman } from "@/lib/vanguard/navigasi";
import { Lambang } from "../Logo";
import PapanIsianK, { type Isian } from "../kuesioner/PapanIsianK";
import { SEL_PER_BLOK } from "@/lib/vanguard/sel";
import type { Blok } from "@/lib/vanguard/tipe";
import { adalahKelola, adalahPeserta, type KeadaanKelola, type KeadaanPeserta, type KeadaanRoleplay } from "./tipe";
import type { TampilHasil } from "@/lib/vanguard/roleplay/susun";

const BLOK_NILAI: { kode: Blok; nama: string }[] = [
  { kode: "A", nama: "V.A" }, { kode: "B", nama: "V.B" }, { kode: "C", nama: "V.C" }, { kode: "D", nama: "V.D" }, { kode: "E", nama: "V.E" },
  { kode: "F", nama: "V.F" }, { kode: "G", nama: "V.G" }, { kode: "VI", nama: "VI" }, { kode: "VII", nama: "VII" },
];
const WARNA = { benar: { bg: "#E3F6EC", bd: "#0F8A4F", tx: "#0F5C38", nama: "Benar" }, salah: { bg: "#FDE7E4", bd: "#C2362B", tx: "#8E1F16", nama: "Salah" }, kosong: { bg: "#FFF0DC", bd: "#D9822B", tx: "#8A4B00", nama: "Kosong padahal harus diisi" } } as const;
const fmtPoin = (x: number) => x.toLocaleString("id-ID", { maximumFractionDigits: 1 });

async function ambil(kegiatan: number, query = ""): Promise<KeadaanRoleplay | null> {
  try {
    return await apiPortal<KeadaanRoleplay>(`/api/sigap/vanguard/roleplay?kegiatan=${kegiatan}${query}`);
  } catch (e) {
    if (e instanceof Error && e.message === "SESI_BERAKHIR") return null;
    throw e;
  }
}

export default function RoleplayHalaman() {
  const q = useSearchParams();
  const kegiatan = useMemo(() => { const v = q.get("k"); return v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null; }, [q]);
  const tujuan = useMemo(() => { const d = q.get("dari"); return d ? tujuanAman(d) : "/"; }, [q]);
  const [data, setData] = useState<KeadaanRoleplay | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [kelas, setKelas] = useState<number | null>(null);
  const [langkahLihat, setLangkahLihat] = useState<number | null>(null);
  const [pesertaLihat, setPesertaLihat] = useState<number | null>(null);
  const sibukRef = useRef(false);

  const muat = useCallback(async () => {
    if (!kegiatan || sibukRef.current) return;
    try {
      const r = await ambil(kegiatan, `${kelas ? `&kelas=${kelas}` : ""}${langkahLihat ? `&langkah=${langkahLihat}` : ""}${pesertaLihat ? `&peserta=${pesertaLihat}` : ""}`);
      if (r) { setData(r); setGalat(null); if (adalahKelola(r) && kelas === null && r.kelas !== null) setKelas(r.kelas); }
    } catch (e) { setGalat(e instanceof Error ? e.message : "Gagal memuat roleplay."); }
  }, [kegiatan, kelas, langkahLihat, pesertaLihat]);

  useEffect(() => {
    if (!bacaSesi()) { window.location.replace(`/?lanjut=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
    void muat();
    const t = setInterval(() => { if (document.visibilityState === "visible") void muat(); }, 4000);
    return () => clearInterval(t);
  }, [muat]);

  /** Kirim aksi ke server lalu pakai keadaan terbaru dari balasannya. */
  const kirim = useCallback(async (isi: Record<string, unknown>): Promise<boolean> => {
    if (!kegiatan) return false;
    sibukRef.current = true;
    try {
      const r = await apiPortal<KeadaanRoleplay>("/api/sigap/vanguard/roleplay", { method: "POST", body: JSON.stringify({ kegiatan, kelas, ...isi }) });
      setData(r); setGalat(null);
      return true;
    } catch (e) {
      if (!(e instanceof Error && e.message === "SESI_BERAKHIR")) setGalat(e instanceof Error ? e.message : "Gagal memproses.");
      return false;
    } finally { sibukRef.current = false; }
  }, [kegiatan, kelas]);

  const kepala = (
    <div className="vgtop">
      <span className="lencana"><Lambang px={20} /></span>
      <div className="nm">VANGUARD<small>Roleplay bareng kelas</small></div>
      <Link href={tujuan}>Kembali</Link>
    </div>
  );
  const bungkus = (isi: React.ReactNode) => <div className="vg"><div className="phone">{kepala}<div className="scroll"><div className="stack">{galat && <div className="catat gagal" role="alert">{galat}</div>}{isi}</div></div></div></div>;

  if (!kegiatan) return bungkus(<div className="sheet"><h2>Pelatihan tidak ditentukan</h2><p style={{ fontSize: 13 }}>Buka roleplay dari kartu di tab Hari ini.</p></div>);
  if (!data) return bungkus(<div className="sheet" style={{ fontSize: 13 }}>Memuat…</div>);
  if (!data.aktif) return bungkus(<div className="sheet"><h2>Roleplay belum aktif</h2><p style={{ fontSize: 13 }}>{data.alasan ?? "Roleplay belum diaktifkan di pelatihan ini."}</p></div>);
  if (adalahPeserta(data)) return <LayarPeserta data={data} kegiatan={kegiatan} kepala={kepala} galat={galat} setGalat={setGalat} />;
  if (adalahKelola(data)) {
    return (
      <div className="vg"><div className="phone">{kepala}
        <LayarKelola data={data} kirim={kirim} galat={galat} setKelas={(k) => { setKelas(k); setLangkahLihat(null); setPesertaLihat(null); }} lihatLangkah={setLangkahLihat} lihatPeserta={setPesertaLihat} />
      </div></div>
    );
  }
  return null;
}

// -------------------------------------------------------------------------------------------------------------------------------------------------------
// Peserta

function LayarPeserta({ data, kegiatan, kepala, galat, setGalat }: { data: KeadaanPeserta; kegiatan: number; kepala: React.ReactNode; galat: string | null; setGalat: (s: string | null) => void }) {
  const [isian, setIsian] = useState<Isian[]>([]);
  const [nilai, setNilai] = useState<Record<string, string>>({});
  const [siap, setSiap] = useState(false);
  const [simpan, setSimpan] = useState<"" | "menyimpan" | "tersimpan" | "gagal">("");
  const [bagian, setBagian] = useState<"iv1" | Blok>("iv1");
  const kotor = useRef(false);
  const terkunci = useMemo(() => new Set(data.terkunci), [data.terkunci]);

  // Muat isian dari server sekali (dan bila belum pernah terisi lokal); sesudahnya yang dipegang peserta menang, kecuali server menolak satuan terkunci.
  useEffect(() => {
    if (siap || !data.roleplay) return;
    setIsian((data.isian?.iv1 ?? []) as Isian[]);
    setNilai(Object.fromEntries(Object.entries(data.isian?.nilai ?? {}).map(([k, v]) => [k, String(v)])));
    setSiap(true);
  }, [data, siap]);

  const nilaiAngka = useMemo(() => {
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries(nilai)) { const t = v.replace(/[.\s]/g, ""); if (/^\d+$/.test(t)) o[k] = Number(t); }
    return o;
  }, [nilai]);

  const berjalan = data.roleplay?.status === "berjalan";
  useEffect(() => {
    if (!siap || !kotor.current || !berjalan) return;
    const t = setTimeout(async () => {
      setSimpan("menyimpan");
      try {
        const r = await apiPortal<{ ok: boolean; isian: { iv1: Isian[]; nilai: Record<string, number> }; ditolak: string[] }>("/api/sigap/vanguard/roleplay", { method: "POST", body: JSON.stringify({ kegiatan, aksi: "simpan", isian: { iv1: isian, nilai: nilaiAngka } }) });
        if (r.ditolak.length > 0) { setIsian(r.isian.iv1); setNilai(Object.fromEntries(Object.entries(r.isian.nilai).map(([k, v]) => [k, String(v)]))); setGalat("Sebagian jawaban terkunci karena sesinya sudah diperiksa instruktur; isian dikembalikan."); }
        else kotor.current = false;
        setSimpan("tersimpan");
      } catch (e) {
        if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
        setSimpan("gagal"); setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [isian, nilaiAngka, siap, berjalan, kegiatan, setGalat]);

  const ubahIv1: (f: (d: Isian[]) => Isian[]) => void = (f) => { kotor.current = true; setIsian(f); };
  const sedang = [...data.langkah].reverse().find((l) => l.status !== "selesai") ?? data.langkah[data.langkah.length - 1] ?? null;

  const kotakTerkunci = (id: string) => terkunci.has(`s:${id}`);

  return (
    <div className="vg"><div className="phone">
      {kepala}
      <div className="appbar">
        <div className="l1"><b>ROLEPLAY BARENG KELAS</b><span className="r">{data.roleplay?.status === "selesai" ? "SELESAI" : data.roleplay ? "BERJALAN" : "BELUM DIBUKA"}</span></div>
        <h1>{data.roleplay?.judul ?? "Roleplay bareng kelas"}</h1>
        <div className="l3"><span>{simpan === "menyimpan" ? "Menyimpan…" : simpan === "tersimpan" ? "Tersimpan" : simpan === "gagal" ? "Gagal menyimpan" : berjalan ? "Jawaban disimpan otomatis" : ""}</span></div>
      </div>
      <div className="scroll"><div className="stack">
        {galat && <div className="catat gagal" role="alert">{galat}</div>}
        <div className="catat tidak" role="status"><b>Latihan kelas:</b> poin roleplay tidak masuk nilai pelatihan, bintang, atau sertifikasi.</div>
        {data.pesan && <div className="hint">{data.pesan}</div>}
        {!data.roleplay && !data.pesan && <div className="sheet"><h2>Menunggu instruktur</h2><p style={{ fontSize: 13 }}>Roleplay belum dibuka. Halaman ini diperbarui otomatis.</p></div>}

        {data.roleplay && data.roleplay.status === "berjalan" && (
          <div className="hint" role="status">
            {sedang ? (sedang.status === "berjalan" ? <><b>Sesi {sedang.nomor} · {sedang.teks}</b><br />Dengarkan jawaban responden, lalu isi di bawah. Isi persis apa yang Anda dengar.</> : sedang.status === "diperiksa" ? <><b>Sesi {sedang.nomor} · {sedang.teks}</b><br />Instruktur sedang memeriksa. Jawaban sesi ini terkunci; tunggu sesi berikutnya.</> : <><b>Sesi {sedang.nomor} selesai.</b> Menunggu sesi berikutnya.</>) : <>Instruktur belum memulai sesi. Anda boleh mulai mengisi.</>}
          </div>
        )}

        {data.roleplay && data.roleplay.status === "selesai" && data.hasil && <HasilTampil h={data.hasil} />}
        {data.roleplay && data.roleplay.status === "selesai" && !data.hasil && <div className="sheet" style={{ fontSize: 13 }}>Roleplay selesai. Hasil belum tersedia.</div>}

        {data.roleplay && berjalan && siap && (
          <>
            <div role="tablist" aria-label="Bagian kuesioner" className="kp-tabs">
              <button type="button" role="tab" aria-selected={bagian === "iv1"} className="kp-tab" onClick={() => setBagian("iv1")}>IV.1</button>
              {BLOK_NILAI.map((b) => <button key={b.kode} type="button" role="tab" aria-selected={bagian === b.kode} className="kp-tab" onClick={() => setBagian(b.kode)}>{b.nama}</button>)}
            </div>
            {bagian === "iv1" ? (
              <PapanIsianK isian={isian} setIsian={ubahIv1} tabAwal="A" onUbah={() => { kotor.current = true; }} />
            ) : (
              <div className="sheet">
                <span className="tag">Blok {bagian === "VI" || bagian === "VII" ? bagian : `V.${bagian}`}</span>
                <p style={{ fontSize: 12.5, marginBottom: 8 }}>Isi nilai dalam rupiah per kotak. Kosongkan kotak yang tidak ada jawabannya.</p>
                {(SEL_PER_BLOK[bagian] ?? []).map((s) => (
                  <label key={s.id} className="kp-f" style={{ display: "block", marginBottom: 8, opacity: kotakTerkunci(s.id) ? 0.55 : 1 }}>
                    <span style={{ fontSize: 12.5 }}>{s.label}{kotakTerkunci(s.id) ? " · terkunci" : ""}</span>
                    <input inputMode="numeric" disabled={kotakTerkunci(s.id)} value={nilai[s.id] ?? ""} onChange={(e) => { kotor.current = true; setNilai((n) => ({ ...n, [s.id]: e.target.value })); }} />
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div></div>
      <div className="vgfoot"><b>Pelatihan · Roleplay bareng kelas</b> · tidak masuk nilai</div>
    </div></div>
  );
}

function HasilTampil({ h }: { h: TampilHasil }) {
  const [tab, setTab] = useState<"review" | "luar">("review");
  return (
    <>
      <div className="res good" role="status">
        <div className="vd"><span className="ic" aria-hidden>★</span><div><strong>Poin roleplay: {fmtPoin(h.poin)}</strong><small>{h.benar} benar · {h.salah} salah · {h.kosong} kosong dari {h.dinilai} isian dinilai{h.luar.length ? ` · ${h.luar.length} di luar cakupan` : ""}</small></div></div>
        <section><div className="ref">Skor = benar × 1 + salah × (−0,3). Poin = 100 × skor ÷ isian dinilai. Poin ini tidak masuk nilai pelatihan.</div></section>
      </div>
      <div role="tablist" className="kp-tabs">
        <button type="button" role="tab" aria-selected={tab === "review"} className="kp-tab" onClick={() => setTab("review")}>Review jawaban</button>
        <button type="button" role="tab" aria-selected={tab === "luar"} className="kp-tab" onClick={() => setTab("luar")}>Di luar cakupan{h.luar.length ? <span className="n">{h.luar.length}</span> : null}</button>
      </div>
      {tab === "review" && <ReviewDaftar h={h} />}
      {tab === "luar" && (
        <div className="sheet">
          {h.luar.length === 0 ? <p style={{ fontSize: 13 }}>Tidak ada isian di luar cakupan.</p> : (
            <>
              <p style={{ fontSize: 12.5 }}>Isian ini tidak ada dalam sesi mana pun, jadi dihitung salah (−0,3 per isian).</p>
              <ul style={{ margin: "6px 0 0 18px", fontSize: 13 }}>{h.luar.map((x) => <li key={x.kunci}>{x.label}: {x.jawaban}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function ReviewDaftar({ h }: { h: TampilHasil }) {
  return (
    <div>
      {h.review.length === 0 && <div className="sheet" style={{ fontSize: 13 }}>Belum ada isian yang dinilai.</div>}
      {h.review.map((r) => {
        const w = WARNA[r.hasil];
        return (
          <div key={r.kunci} style={{ background: w.bg, border: `1.5px solid ${w.bd}`, padding: "8px 10px", marginBottom: 6, fontSize: 13 }}>
            <b style={{ color: w.tx }}>{w.nama}</b> <span style={{ color: w.tx }}>({r.skor > 0 ? "+" : ""}{r.skor.toLocaleString("id-ID")})</span>
            <div style={{ fontWeight: 700 }}>{r.label}</div>
            <div>Jawaban Anda: {r.jawaban}</div>
            {r.hasil !== "benar" && <div>Jawaban benar: {r.benar.length ? r.benar.join("  atau  ") : "tidak diisi"}</div>}
            {r.konversi && <div style={{ color: w.tx }}>Petunjuk: ini {r.konversi.teks}.</div>}
            {r.salah_letak.length > 0 && <div style={{ color: w.tx }}>Petunjuk letak: {r.salah_letak.map((p) => `nilai Rp${p.nilai.toLocaleString("id-ID")} Anda tulis di ${p.label}`).join("; ")}.</div>}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------------------------------------------------------------
// Instruktur / panitia

type Kirim = (isi: Record<string, unknown>) => Promise<boolean>;
type FormBerikut = { bagian: string; dari: string; sampai: string };
const kosongForm: FormBerikut = { bagian: "iv1", dari: "", sampai: "" };
const bentukBerikut = (f: FormBerikut) => (f.bagian === "iv1" ? { bagian: "iv1", dari: Number(f.dari), sampai: f.sampai ? Number(f.sampai) : Number(f.dari) } : { bagian: f.bagian });

function FormCakupan({ f, setF, aktif }: { f: FormBerikut; setF: (x: FormBerikut) => void; aktif?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label className="kp-f"><span>Bagian kuesioner</span>
        <select value={f.bagian} disabled={aktif === false} onChange={(e) => setF({ ...f, bagian: e.target.value })} style={{ height: 40 }}>
          <option value="iv1">Blok IV.1 (rincian konsumsi)</option>
          {BLOK_NILAI.map((b) => <option key={b.kode} value={b.kode}>Blok {b.nama}</option>)}
        </select></label>
      {f.bagian === "iv1" && (
        <div className="kp-2">
          <label className="kp-f"><span>Dari R</span><input inputMode="numeric" value={f.dari} onChange={(e) => setF({ ...f, dari: e.target.value })} /></label>
          <label className="kp-f"><span>Sampai R <small>(kosong = satu rincian)</small></span><input inputMode="numeric" value={f.sampai} onChange={(e) => setF({ ...f, sampai: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}

function LayarKelola({ data, kirim, galat, setKelas, lihatLangkah, lihatPeserta }: { data: KeadaanKelola; kirim: Kirim; galat: string | null; setKelas: (k: number) => void; lihatLangkah: (n: number | null) => void; lihatPeserta: (id: number | null) => void }) {
  const [tab, setTab] = useState<"sesi" | "rekap">("sesi");
  const [form, setForm] = useState<FormBerikut>(kosongForm);
  const [judul, setJudul] = useState("");
  const [kerja, setKerja] = useState(false);
  const rp = data.roleplay;
  const akhir = data.langkah[data.langkah.length - 1] ?? null;
  const jalan = async (isi: Record<string, unknown>) => { setKerja(true); try { return await kirim(isi); } finally { setKerja(false); } };
  const formSah = form.bagian !== "iv1" || (/^\d+$/.test(form.dari) && (form.sampai === "" || /^\d+$/.test(form.sampai)));
  const sudahIsi = data.rekap.filter((r) => r.sudah_isi).length;
  const selesai = rp?.status === "selesai";

  return (
    <>
      <div className="appbar">
        <div className="l1"><b>ROLEPLAY · {data.peran === "pengelola" ? "PANITIA/ADMIN" : "INSTRUKTUR"}</b><span className="r">{selesai ? "SELESAI" : rp ? "BERJALAN" : "BELUM DIBUKA"}</span></div>
        <h1>{rp?.judul ?? "Roleplay bareng kelas"}</h1>
        <div className="l3"><span>{data.jumlah_peserta} peserta kelas · {sudahIsi} sudah mengisi</span></div>
      </div>
      <div className="scroll"><div className="stack">
        {galat && <div className="catat gagal" role="alert">{galat}</div>}
        {data.kelas_pilihan.length > 1 && (
          <label className="kp-f"><span>Kelas</span>
            <select value={data.kelas ?? ""} onChange={(e) => setKelas(Number(e.target.value))} style={{ height: 40 }}>{data.kelas_pilihan.map((k) => <option key={k.nomor} value={k.nomor}>{k.nama}</option>)}</select></label>
        )}
        {data.kelas === null && <div className="hint">Belum ada kelas untuk dikelola.</div>}

        {data.kelas !== null && (!rp || selesai) && (
          <div className="sheet">
            <span className="tag">{selesai ? "Roleplay terakhir selesai" : "Belum ada roleplay"}</span>
            <p style={{ fontSize: 13 }}>Peserta mewawancarai satu responden peran, lalu semua peserta mengisi jawaban yang sama di Vanguard masing-masing. Tidak ada soal dan kunci: Anda menandai jawaban yang benar sesudah Periksa.</p>
            <label className="kp-f"><span>Judul (boleh kosong)</span><input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={120} /></label>
            <div className="pad"><button type="button" className="btn pri" disabled={kerja} onClick={() => void jalan({ aksi: "buka", judul })}>{selesai ? "Buka roleplay baru" : "Buka roleplay"}</button></div>
          </div>
        )}

        {rp && (
          <div role="tablist" className="kp-tabs">
            <button type="button" role="tab" aria-selected={tab === "sesi"} className="kp-tab" onClick={() => setTab("sesi")}>Sesi</button>
            <button type="button" role="tab" aria-selected={tab === "rekap"} className="kp-tab" onClick={() => setTab("rekap")}>{selesai ? "Poin akhir" : "Per peserta · review"}</button>
          </div>
        )}

        {rp && tab === "sesi" && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.langkah.map((l) => (
                <button key={l.id} type="button" className="kp-tab" aria-selected={data.pemetaan?.langkah === l.nomor} onClick={() => lihatLangkah(l.nomor)}>
                  {l.nomor}. {l.teks} · {l.status === "berjalan" ? "berjalan" : l.status === "diperiksa" ? `periksa ${l.sudah_tanda}/${l.perlu_tanda}` : "selesai"}
                </button>
              ))}
            </div>

            {!selesai && (!akhir || akhir.status === "selesai") && (
              <div className="sheet">
                <span className="tag">{akhir ? "Sesi berikutnya" : "Sesi pertama"}</span>
                <FormCakupan f={form} setF={setForm} />
                <div className="pad"><button type="button" className="btn pri" disabled={kerja || !formSah} onClick={() => void jalan({ aksi: "tambah_langkah", ...bentukBerikut(form) })}>Mulai sesi</button></div>
              </div>
            )}

            {!selesai && akhir && akhir.status === "berjalan" && (
              <div className="sheet">
                <span className="tag">Sesi {akhir.nomor} berjalan</span>
                <h2>{akhir.teks}</h2>
                <p style={{ fontSize: 13 }}>Tanyakan ke responden, beri waktu peserta mengisi. {sudahIsi} dari {data.jumlah_peserta} peserta sudah mengisi. Saat Periksa ditekan, jawaban sesi ini dikunci untuk peserta.</p>
                <div className="pad"><button type="button" className="btn pri" disabled={kerja} onClick={() => void jalan({ aksi: "periksa" })}>PERIKSA</button></div>
              </div>
            )}

            {data.pemetaan && (
              <Pemetaan p={data.pemetaan} aktif={!selesai && akhir?.status === "diperiksa" && akhir.nomor === data.pemetaan.langkah} kerja={kerja} tandai={(kunci, benar) => void jalan({ aksi: "tandai", nomor: data.pemetaan!.langkah, kunci, benar })} />
            )}

            {!selesai && akhir && akhir.status === "diperiksa" && (
              <div className="sheet">
                <span className="tag">Ditandai {akhir.sudah_tanda} dari {akhir.perlu_tanda}</span>
                {!akhir.siap_lanjut && <p style={{ fontSize: 12.5 }}>Tombol lanjut aktif setelah semua isian ditandai. Variasi yang tidak dicentang dianggap salah.</p>}
                <h3 style={{ fontSize: 13, marginTop: 8 }}>Sesi berikutnya (opsional)</h3>
                <FormCakupan f={form} setF={setForm} aktif={akhir.siap_lanjut} />
                <div className="btns" style={{ padding: "10px 0 0", border: 0 }}>
                  <button type="button" className="btn" disabled={kerja} onClick={() => void jalan({ aksi: "buka_kembali" })}>Buka kembali</button>
                  <button type="button" className="btn amb" disabled={kerja || !akhir.siap_lanjut || !formSah} onClick={() => void jalan({ aksi: "lanjut", berikut: bentukBerikut(form) })}>Lanjut ke sesi berikutnya</button>
                  <button type="button" className="btn pri" disabled={kerja || !akhir.siap_lanjut} onClick={() => { if (window.confirm("Selesaikan roleplay dan umumkan poin ke peserta?")) void jalan({ aksi: "selesai" }); }}>Selesaikan roleplay dan umumkan poin</button>
                </div>
              </div>
            )}
          </>
        )}

        {rp && tab === "rekap" && (
          <div className="sheet">
            <span className="tag">{selesai ? "Poin akhir" : "Poin sementara"}</span>
            <p style={{ fontSize: 12.5, marginBottom: 6 }}>Dari isian yang sudah ditandai. Ketuk nama untuk melihat review berwarna.</p>
            <table className="tbl">
              <thead><tr><th>Nama</th><th style={{ textAlign: "right" }}>Poin</th><th style={{ textAlign: "right" }}>✓ / ✗ / –</th></tr></thead>
              <tbody>
                {data.rekap.map((r) => (
                  <tr key={r.akun_id}>
                    <td><button type="button" className="tog" onClick={() => lihatPeserta(data.review?.akun_id === r.akun_id ? null : r.akun_id)}>{r.nama}</button>{!r.sudah_isi ? <small> (belum mengisi)</small> : null}{r.luar ? <small> · {r.luar} di luar cakupan</small> : null}</td>
                    <td className="n">{fmtPoin(r.poin)}</td><td className="n">{r.benar} / {r.salah} / {r.kosong}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.review && (
              <div style={{ marginTop: 10 }}>
                <h3 style={{ fontSize: 13.5 }}>{data.review.nama} · {fmtPoin(data.review.poin)} poin</h3>
                <ReviewDaftar h={data.review} />
                {data.review.luar.length > 0 && <p style={{ fontSize: 12.5 }}>Di luar cakupan: {data.review.luar.map((x) => `${x.label} (${x.jawaban})`).join("; ")}</p>}
              </div>
            )}
          </div>
        )}
      </div></div>
      <div className="vgfoot"><b>Roleplay bareng kelas</b> · poin tidak masuk nilai pelatihan</div>
    </>
  );
}

function Pemetaan({ p, aktif, kerja, tandai }: { p: NonNullable<KeadaanKelola["pemetaan"]>; aktif: boolean; kerja: boolean; tandai: (kunci: string, benar: string[]) => void }) {
  if (p.satuan.length === 0) return <div className="sheet" style={{ fontSize: 13 }}>Tidak ada isian peserta pada sesi {p.langkah}. Tidak ada yang perlu ditandai.</div>;
  return (
    <div>
      {p.satuan.map((s) => {
        const benar = s.variasi.filter((v) => v.benar).map((v) => v.tanda);
        const alih = (tanda: string) => tandai(s.kunci, benar.includes(tanda) ? benar.filter((x) => x !== tanda) : [...benar, tanda]);
        return (
          <div key={s.kunci} className="sheet" style={{ marginBottom: 8, borderColor: s.ditandai ? "#0F8A4F" : "#000" }}>
            <span className="tag">{s.ditandai ? "Sudah ditandai" : "Belum ditandai"}</span>
            <h2 style={{ fontSize: 14 }}>{s.label}</h2>
            {s.variasi.map((v) => (
              <label key={v.tanda === "" ? "(kosong)" : v.tanda} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid #ddd", fontSize: 13, background: v.benar ? "#E3F6EC" : undefined }}>
                <input type="checkbox" style={{ marginTop: 3, width: 20, height: 20 }} checked={!!v.benar} disabled={!aktif || kerja} onChange={() => alih(v.tanda)} />
                <span style={{ flex: 1 }}>
                  <b>{v.teks}</b> <span style={{ color: "#444" }}>· {v.jumlah} peserta</span>
                  <small style={{ display: "block", color: "#444" }}>{v.nama.join(", ")}</small>
                </span>
              </label>
            ))}
            {aktif && !s.ditandai && <button type="button" className="btn" style={{ marginTop: 6 }} disabled={kerja} onClick={() => tandai(s.kunci, [])}>Tidak ada yang benar</button>}
          </div>
        );
      })}
    </div>
  );
}
