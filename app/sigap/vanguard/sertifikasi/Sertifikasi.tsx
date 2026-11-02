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
import { cariRincianIv1 } from "@/lib/vanguard/kuesioner/rincian";
import { labelSel } from "@/lib/vanguard/sel";
import { NAMA_TINGKAT } from "@/lib/vanguard/sertifikasi/skor";
import type { KasusPublik, Nilai } from "@/lib/vanguard/tipe";
import { Lambang } from "../Logo";
import PapanIsianK, { type Isian } from "../kuesioner/PapanIsianK";
import PanduanPelatihan, { LabelWajib } from "../PanduanPelatihan"; // (2 Nov 2026) konteks pelatihan peserta
import { useKonteksPelatihan } from "../useKonteksPelatihan";
import { kartuTampil } from "@/lib/konteksVanguard";

type Layar = "beranda" | "ujian" | "butir" | "hasil" | "usul";
type JenisUjian = "sertifikasi" | "latihan" | "harian" | "tantangan";
type Ringkas = { ujian: number; tingkat: number | null; skor: number | null; selesai_at: string | null } | null;
type Beranda = {
  status: { sertifikasiBoleh: boolean; alasan: string | null; bukaLagi: string | null; sudahBersertifikat: boolean };
  berjalan: number | null; jumlahButir: number;
  kesegaran: { status: "segar" | "segera" | "perlu"; umurHari: number; sisaHari: number; jatuhTempo: string } | null;
  harian: { sekarang: number; terpanjang: number; selesaiHariIni: boolean; mulaiHariIni: boolean };
  tantangan: { minggu: number; selesai: boolean };
  riwayat: { ujian: number; jenis: JenisUjian; mulai_at: string; selesai_at: string | null; skor: number | null; tingkat: number | null }[];
  sertifikat: { terbaru: Ringkas; tertinggi: Ringkas };
};
type Penjelasan = { langkah: string[]; pembahasan: string; rujukan: string };
type Rincian = { jenis: string; tingkat: string; pesan: string; sel: string | null; anda?: number | null; seharusnya?: number | null; dari?: string };
type ButirRingkas = { urut: number; kode: string; jenis: "k" | "v1"; judul: string; terjawab: boolean; benar?: boolean | null; poin?: number | null; rincian?: Rincian[] };
type UjianDetail = { ujian: { id: number; jenis: JenisUjian; jumlah: number; mulai_at: string; selesai_at: string | null; skor: number | null; tingkat: number | null; kedaluwarsa: boolean }; butir: ButirRingkas[] };
type Soal = { soal: { jenis: "k" | "v1"; kode: string; benih: number; judul: string; data: Record<string, unknown> }; terjawab: boolean; jawaban?: Jawab & { isian: unknown } };
type HasilUjian = { hasil: { skor: number; butirFatal: number; tingkat: number; nama: string }; jenis: JenisUjian; review: { urut: number; kode: string; judul: string; terjawab: boolean; benar: boolean | null; poin: number; rincian: Rincian[]; penjelasan?: Penjelasan | null }[] };
type Jawab = { benar: boolean; poin: number; semuaTerjawab?: boolean; rincian?: Rincian[]; penjelasan?: Penjelasan | null };

const wibTeks = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " WIB" : "");
const html = (h: string) => ({ __html: h });
const Bintang = ({ n, pop }: { n: number; pop?: boolean }) => (
  <div className={`sr-bintang${pop ? " sr-pop" : ""}`} role="img" aria-label={`${n} dari 5 bintang`}>
    {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? "" : "off"}>★</span>)}
  </div>
);
const LABEL_JENIS_UJIAN = { sertifikasi: "Sertifikasi", latihan: "Latihan", harian: "Latihan harian", tantangan: "Tantangan mingguan" } as const;
const LABEL_KESEGARAN = { segar: "Segar", segera: "Segera disegarkan", perlu: "Perlu disegarkan" } as const;
type Usulanku = { id: number; judul: string; status: string; catatan_admin: string | null; dibuat_at: string };
const LABEL_STATUS_USULAN: Record<string, string> = { baru: "Menunggu tinjauan", diterima: "Diterima", ditolak: "Belum dapat dipakai", dikerjakan: "Sedang dijadikan soal" };
const kunciDrafUjian = (ujian: number, urut: number) => `vanguard.ujian.${ujian}.${urut}`;

const NAMA_TINGKAT_SALAH: Record<string, string> = { fatal: "Fatal", berat: "Berat", ringan: "Ringan" };
const teksRp = (v: number | null | undefined) => (v ? `Rp${fmtRp(v)}` : "kosong");
/** Nama kotak yang mudah dibaca: lembar V–VII lewat labelSel; kasus kuesioner "R12 · nama rincian · ART 2". */
const labelKotak = (sel: string | null): string | null => {
  if (!sel) return null;
  const m = /^R(\d+)(?:A(\d+))?$/.exec(sel);
  if (m) { const nm = cariRincianIv1(Number(m[1]))?.nama; return `Blok IV.1 · Rincian ${m[1]}${nm ? ` (${nm})` : ""}${m[2] ? ` · ART ${m[2]}` : ""}`; }
  return labelSel(sel);
};
/** Arti singkat tiap jenis kesalahan, supaya tidak hanya "salah" tetapi juga apa sebabnya. */
const ARTI_JENIS: Record<string, string> = {
  harus_kosong: "Kotak ini tidak berlaku untuk cerita ini, jadi harus dibiarkan kosong. Angka yang diisi di sini membuat total ikut keliru.",
  belum_diisi: "Cerita memuat angka untuk kotak ini, tetapi kotaknya masih kosong.",
  salah_letak: "Angkanya sudah benar, hanya kotaknya yang keliru. Ini dihitung satu kesalahan (fatal).",
  konversi_seminggu: "Nilai yang dicatat masih nilai seminggu. Blok V meminta nilai setahun terakhir.",
  konversi_sebulan: "Nilai yang dicatat masih nilai sebulan. Blok V meminta nilai setahun terakhir.",
  angka_meleset: "Angka yang diisi berbeda dari nilai seharusnya.",
  jebakan: "Ini kesalahan yang sering terjadi pada kasus seperti ini.",
  alternatif: "Ini kesalahan yang sering terjadi pada kasus seperti ini.",
  diskrepansi: "Selisih Blok VI dan Blok VII harus nol. Ada isian di salah satu blok yang belum sesuai.",
  kontrol_vii: "Rincian 1 Blok VII harus sesuai tabel kontrol.",
};
/** Dua kotak berdampingan. Untuk salah letak, masing-masing menyebut letaknya ("di V.G · 4 Lahan/tanah" vs "di V.G · 2 Bangunan tempat tinggal"). */
function VsKotak({ x }: { x: Rincian }) {
  return (
    <div className="vs">
      <div className="anda"><small>Jawaban Anda</small><b>{teksRp(x.anda)}</b>{x.dari && <em>di {labelSel(x.dari)}</em>}</div>
      <div className="seharusnya"><small>Seharusnya</small><b>{teksRp(x.seharusnya)}</b>{x.dari && x.sel && <em>di {labelKotak(x.sel)}</em>}</div>
    </div>
  );
}
type Lihat = { x: Rincian; penjelasan: Penjelasan | null; bisaSorot: boolean };
/** Koreksi satu kesalahan: kotak mana, jawaban Anda vs seharusnya (bila ada angkanya), lalu petunjuk singkat; ketuk untuk pop-up penjelasan. */
function KoreksiButir({ daftar, penjelasan, bisaSorot, onLihat }: { daftar: Rincian[]; penjelasan: Penjelasan | null | undefined; bisaSorot: boolean; onLihat: (l: Lihat) => void }) {
  return (
    <div className="sr-kor">
      {daftar.map((x, i) => {
        const punyaNilai = x.anda !== undefined && x.seharusnya !== undefined;
        const kotak = labelKotak(x.sel);
        return (
          <div key={i} className={`kor ${x.tingkat}`}>
            <div className="kh"><span className="lv">{NAMA_TINGKAT_SALAH[x.tingkat] ?? x.tingkat}</span>{kotak && <span className="kt">{kotak}</span>}</div>
            {punyaNilai && <VsKotak x={x} />}
            <p className="ps">{x.pesan}</p>
            <button type="button" className="lihat" onClick={() => onLihat({ x, penjelasan: penjelasan ?? null, bisaSorot: bisaSorot && !!x.sel && !/^R\d/.test(x.sel) })}>Lihat penjelasan ›</button>
          </div>
        );
      })}
    </div>
  );
}

export default function Sertifikasi() {
  const q = useSearchParams();
  const tujuan = useMemo(() => { const d = q.get("dari"); return d ? tujuanAman(d) : "/sigap/vanguard"; }, [q]);
  const { konteks, siap } = useKonteksPelatihan(); // null = bukan peserta pelatihan: tampilan lama
  const [semua, setSemua] = useState(false); // "Tampilkan semua latihan"
  const [layar, setLayar] = useState<Layar>("beranda");
  const [beranda, setBeranda] = useState<Beranda | null>(null);
  const [detail, setDetail] = useState<UjianDetail | null>(null);
  const [soal, setSoal] = useState<Soal | null>(null);
  const [urut, setUrut] = useState(0);
  const [hasil, setHasil] = useState<HasilUjian | null>(null);
  const [jawab, setJawab] = useState<Jawab | null>(null);
  const [jelas, setJelas] = useState<Lihat | null>(null); // pop-up penjelasan kotak
  const [sorot, setSorot] = useState<{ target: string; asal?: string } | null>(null); // kotak yang disorot pada lembar
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

  const keAtas = () => { setPad(null); setJelas(null); setSorot(null); setLayar((l) => (l === "butir" ? "ujian" : l === "ujian" || l === "hasil" || l === "usul" ? "beranda" : l)); if (layar === "ujian" || layar === "hasil" || layar === "usul") void muatBeranda(); skrol.current?.scrollTo({ top: 0 }); };
  useTutupDenganBack(layar !== "beranda", keAtas);
  useTutupDenganBack(jelas !== null, () => setJelas(null)); // Back HP menutup pop-up dulu
  // sorot kotak pada lembar (merah berdenyut) dan gulir ke sana; hilang saat pindah butir
  useEffect(() => {
    if (!sorot || layar !== "butir") return;
    const el = skrol.current?.querySelector<HTMLElement>(`td[data-id="${sorot.target}"]`);
    const asal = sorot.asal ? skrol.current?.querySelector<HTMLElement>(`td[data-id="${sorot.asal}"]`) : null;
    if (!el) return;
    el.classList.add("sr-sorot");
    asal?.classList.add("sr-sorot-asal");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => { el.classList.remove("sr-sorot"); asal?.classList.remove("sr-sorot-asal"); };
  }, [sorot, layar, soal]);

  const mulai = async (jenis: JenisUjian) => {
    setKerja(true);
    const r = await api<{ ujian: number; jumlah: number; jenis?: JenisUjian; dilanjutkan?: boolean }>("/api/sigap/vanguard/sertifikasi", { method: "POST", body: JSON.stringify({ aksi: "mulai", jenis }) });
    // (V8d) Jangan diam-diam membuka ujian LAIN yang masih berjalan: beri tahu dan biarkan petugas memilih Lanjutkan atau Batalkan.
    if (r && r.dilanjutkan && r.jenis && r.jenis !== jenis) { setGalat(`Masih ada ${LABEL_JENIS_UJIAN[r.jenis].toLowerCase()} yang belum selesai. Lanjutkan atau batalkan dulu, lalu mulai ${LABEL_JENIS_UJIAN[jenis].toLowerCase()}.`); setKerja(false); return; }
    if (r) { const d = await muatDetail(r.ujian); if (d) { setHasil(null); setLayar("ujian"); } }
    setKerja(false);
  };
  const batalkan = async (id: number) => {
    if (!window.confirm("Batalkan ujian yang sedang berjalan? Jawaban yang sudah dikirim tidak dinilai. Jatah sertifikasi hari ini tetap terpakai.")) return;
    setKerja(true);
    const r = await api<{ dibatalkan: boolean }>("/api/sigap/vanguard/sertifikasi", { method: "POST", body: JSON.stringify({ aksi: "batal", ujian: id }) });
    if (r) await muatBeranda();
    setKerja(false);
  };
  const lanjutkan = async (id: number) => { setKerja(true); const d = await muatDetail(id); if (d) { setHasil(null); setLayar("ujian"); } setKerja(false); };

  // (2 Nov 2026) Tombol "Latihan hari ini" di layar Vanguard membawa ?mulai=harian: langsung memulai Latihan harian (sekali), kecuali hari ini sudah selesai atau ada ujian lain yang berjalan
  // (bagian atas layar sudah menawarkan Lanjutkan / Batalkan untuk yang berjalan; tidak dibuka diam-diam).
  const mulaiOtomatis = useRef(false);
  const mintaMulai = q.get("mulai") === "harian";
  useEffect(() => {
    if (!mintaMulai || mulaiOtomatis.current || !beranda || !siap) return;
    mulaiOtomatis.current = true;
    if (!beranda.berjalan && !beranda.harian.selesaiHariIni) void mulai("harian");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintaMulai, beranda, siap]);

  const bukaButir = async (b: ButirRingkas) => {
    if (!detail) return;
    setKerja(true); setJawab(null); setPad(null); setJelas(null); setSorot(null);
    const r = await api<Soal>(`/api/sigap/vanguard/sertifikasi?ujian=${detail.ujian.id}&butir=${b.urut}`);
    if (r) {
      setSoal(r); setUrut(b.urut); setVals({}); setIsianK([]);
      if (r.terjawab && r.jawaban) { // butir yang sudah dijawab: tampilkan isian sendiri dan koreksinya
        setJawab({ benar: r.jawaban.benar, poin: r.jawaban.poin, rincian: r.jawaban.rincian, penjelasan: r.jawaban.penjelasan });
        const isi = r.jawaban.isian;
        if (b.jenis === "k" && Array.isArray(isi)) setIsianK(isi as Isian[]);
        if (b.jenis === "v1" && isi && typeof isi === "object" && !Array.isArray(isi)) setVals(isi as Nilai);
      }
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

  // ---- usul kasus ----
  const [usulanku, setUsulanku] = useState<Usulanku[]>([]);
  const [formUsul, setFormUsul] = useState({ judul: "", cerita: "", jawaban: "", blok: "" });
  const [usulOk, setUsulOk] = useState(false);
  const muatUsulan = useCallback(async () => { const r = await api<{ usulan: Usulanku[] }>("/api/sigap/vanguard/usulan"); if (r) setUsulanku(r.usulan); }, [api]);
  const kirimUsul = async () => {
    setKerja(true); setUsulOk(false);
    const r = await api<{ id: number }>("/api/sigap/vanguard/usulan", { method: "POST", body: JSON.stringify(formUsul) });
    if (r) { setUsulOk(true); setFormUsul({ judul: "", cerita: "", jawaban: "", blok: "" }); await muatUsulan(); }
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
  // butir berikutnya yang belum dijawab (setelah butir ini, lalu berputar ke awal); tidak ada = semua sudah dijawab -> tombol "Selesai"
  const butirBerikut = detail ? (detail.butir.find((b) => b.urut > urut && !b.terjawab) ?? detail.butir.find((b) => b.urut !== urut && !b.terjawab)) : undefined;
  const latihan = !!detail && detail.ujian.jenis !== "sertifikasi"; // latihan, harian, tantangan: rincian langsung, tidak mengubah sertifikat
  const judulLayar = layar === "hasil" ? "Hasil ujian" : layar === "usul" ? "Usul kasus" : layar === "butir" ? `Butir ${urut} dari ${total}` : layar === "ujian" ? (detail ? (detail.ujian.jenis === "sertifikasi" ? "Ujian Sertifikasi" : LABEL_JENIS_UJIAN[detail.ujian.jenis]) : "Ujian") : "Sertifikasi kemampuan";
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
        {layar !== "beranda" && layar !== "usul" && <div className="l3"><span>{terjawab} dari {total} butir dijawab</span>{detail && <span>{LABEL_JENIS_UJIAN[detail.ujian.jenis]}</span>}</div>}
        {layar !== "beranda" && layar !== "usul" && <div className="bar"><i style={{ width: `${persen}%` }} /></div>}
      </div>

      <div className="scroll" ref={skrol}><div className="stack">
        {galat && <div className="catat gagal" role="alert">{galat}</div>}

        {layar === "beranda" && (
          !beranda || !siap ? <div className="sheet">{galat ? <button type="button" className="btn" onClick={() => void muatBeranda()}>Coba lagi</button> : "Memuat…"}</div> : (
            <>
              {konteks && <PanduanPelatihan konteks={konteks} mulai={kerja} semua={semua} onSemua={setSemua} onLatihan={() => void mulai(beranda.harian.selesaiHariIni ? "latihan" : "harian")} />}
              <div className="sr-kartu">
                {beranda.sertifikat.tertinggi ? (
                  <>
                    <div className="sub">Sertifikat kemampuan Anda</div>
                    <Bintang n={beranda.sertifikat.tertinggi.tingkat ?? 0} />
                    <div className="nm">{NAMA_TINGKAT[beranda.sertifikat.tertinggi.tingkat ?? 1]}</div>
                    <div className="sub">Skor {beranda.sertifikat.tertinggi.skor} · {wibTeks(beranda.sertifikat.tertinggi.selesai_at)}</div>
                    {beranda.kesegaran && <div className={`sr-segar ${beranda.kesegaran.status}`} role="status">{LABEL_KESEGARAN[beranda.kesegaran.status]}{beranda.kesegaran.status === "segera" ? ` · sisa ${beranda.kesegaran.sisaHari} hari` : beranda.kesegaran.status === "perlu" ? ` · sudah ${beranda.kesegaran.umurHari} hari` : ""}</div>}
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
              {beranda.berjalan && <div className="catat ya" role="status"><b>Ada ujian yang belum selesai.</b> <button type="button" className="tog" disabled={kerja} onClick={() => void lanjutkan(beranda.berjalan as number)}>Lanjutkan</button> <button type="button" className="tog" disabled={kerja} onClick={() => void batalkan(beranda.berjalan as number)}>Batalkan</button></div>}
              {!beranda.berjalan && (
                <div className="sheet">
                  <span className="tag">Ujian Sertifikasi</span><LabelWajib konteks={konteks} kartu="sertifikasi" />
                  <p style={{ fontSize: 13 }}>{beranda.jumlahButir} butir acak dan berimbang dari berbagai blok kuesioner. Jawaban dinilai server; tiap butir dijawab sekali. Hasilnya tingkat 1–5 bintang.</p>
                  {!beranda.status.sertifikasiBoleh && <div className="catat tidak" role="status" style={{ marginTop: 6 }}>{beranda.status.alasan}{beranda.status.bukaLagi ? ` (terbuka ${wibTeks(beranda.status.bukaLagi)})` : ""}</div>}
                  <div className="btns" style={{ padding: "10px 0 0", border: 0 }}>
                    <button type="button" className="btn pri" disabled={kerja || !beranda.status.sertifikasiBoleh} onClick={() => void mulai("sertifikasi")}>{beranda.status.sudahBersertifikat ? "Sertifikasi ulang" : "Mulai ujian sertifikasi"}</button>
                    <button type="button" className="btn" disabled={kerja} onClick={() => void mulai("latihan")}>Latihan (format sama)</button>
                  </div>
                </div>
              )}
              <div className="sheet">
                <span className="tag">Latihan harian</span><LabelWajib konteks={konteks} kartu="harian" />
                <div className="sr-streak" role="status"><span className="api" aria-hidden>🔥</span><b>{beranda.harian.sekarang}</b> hari beruntun<small>terpanjang {beranda.harian.terpanjang} hari</small></div>
                <p style={{ fontSize: 12.5, marginTop: 4 }}>{konteks && konteks.mode !== "tidak_ada" ? "3 butir (±5 menit) dengan angka berbeda tiap hari. Untuk pelatihan, setiap hari kalender dihitung, termasuk Sabtu dan Minggu; angka 🔥 di atas adalah rangkaian harian biasa." : "3 butir (±5 menit) dengan angka berbeda tiap hari. Sabtu dan Minggu tidak memutus rangkaian, dan hari ini yang belum berlatih tidak memutus apa pun."}</p>
                <div className="btns" style={{ padding: "8px 0 0", border: 0 }}><button type="button" className="btn pri" disabled={kerja || (beranda.harian.selesaiHariIni && !beranda.berjalan)} onClick={() => void mulai("harian")}>{beranda.harian.selesaiHariIni ? "Sudah selesai hari ini ✓" : beranda.harian.mulaiHariIni ? "Lanjutkan latihan harian" : "Mulai latihan harian"}</button></div>
              </div>
              {kartuTampil(konteks, "tantangan", semua) && (
              <div className="sheet">
                <span className="tag">Tantangan minggu ini</span><LabelWajib konteks={konteks} kartu="tantangan" />
                <p style={{ fontSize: 12.5 }}>5 butir yang sama untuk semua petugas minggu ini, disusun dari kesalahan yang paling sering muncul di Vanguard seminggu terakhir. Terbit tiap Senin.</p>
                <div className="btns" style={{ padding: "8px 0 0", border: 0 }}><button type="button" className="btn" disabled={kerja || (beranda.tantangan.selesai && !beranda.berjalan)} onClick={() => void mulai("tantangan")}>{beranda.tantangan.selesai ? "Tantangan minggu ini selesai ✓" : beranda.riwayat.some((r) => r.jenis === "tantangan" && !r.selesai_at) ? "Lanjutkan tantangan mingguan" : "Ikuti tantangan mingguan"}</button></div>
              </div>
              )}
              {kartuTampil(konteks, "usul", semua) && (
              <div className="sheet">
                <span className="tag">Usul kasus</span><LabelWajib konteks={konteks} kartu="usul" />
                <p style={{ fontSize: 12.5 }}>Pernah menemui kasus janggal di lapangan? Usulkan sebagai soal (tanpa nama atau data asli responden). Usulan yang diterima dijadikan soal dengan nama Anda tercantum.</p>
                <div className="btns" style={{ padding: "8px 0 0", border: 0 }}><button type="button" className="btn" onClick={() => { setLayar("usul"); void muatUsulan(); }}>Usul kasus baru</button></div>
              </div>
              )}
              {kartuTampil(konteks, "tingkat", semua) && (
              <div className="sheet">
                <span className="tag">Tingkat kemampuan</span><LabelWajib konteks={konteks} kartu="tingkat" />
                <ul className="sr-aturan">{[1, 2, 3, 4, 5].map((n) => <li key={n}>{"★".repeat(n)} <b>{NAMA_TINGKAT[n]}</b></li>)}</ul>
                <p style={{ fontSize: 12, color: "#444", marginTop: 6 }}>Sertifikat ini hanya catatan kepemilikan kemampuan; belum berdampak ke penilaian atau penugasan apa pun.</p>
              </div>
              )}
              {beranda.riwayat.length > 0 && (
                <div className="sheet">
                  <span className="tag">Riwayat ujian</span>
                  {beranda.riwayat.map((r) => (
                    <div key={r.ujian} className="item" style={{ cursor: "default" }}>
                      <span className="num">{r.selesai_at ? (r.tingkat ?? "–") : "…"}</span>
                      <span className="t">{LABEL_JENIS_UJIAN[r.jenis]}{r.selesai_at ? (r.tingkat === null ? " · dibatalkan" : ` · ${NAMA_TINGKAT[r.tingkat ?? 1]}`) : " · belum selesai"}<small>{wibTeks(r.mulai_at)}{r.skor !== null ? ` · skor ${r.skor}` : ""}</small></span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        )}

        {layar === "usul" && (
          <>
            <div className="sheet">
              <span className="tag">Usul kasus baru</span>
              <p style={{ fontSize: 12.5, marginBottom: 6 }}>Tulis dengan contoh rekaan. Jangan menulis nama, nomor KK, atau NIK asli responden.</p>
              <label className="kp-f"><span>Judul kasus</span><input className="teks" maxLength={120} value={formUsul.judul} onChange={(e) => setFormUsul({ ...formUsul, judul: e.target.value })} placeholder="mis. Beras raskin dibayar tunai" /></label>
              <label className="kp-f"><span>Ceritakan kasusnya</span><textarea className="sr-area" rows={5} maxLength={1500} value={formUsul.cerita} onChange={(e) => setFormUsul({ ...formUsul, cerita: e.target.value })} placeholder="Apa yang terjadi di rumah tangga itu, dengan angka contoh." /></label>
              <label className="kp-f"><span>Menurut Anda dicatat bagaimana? <small>(boleh kosong)</small></span><textarea className="sr-area" rows={3} maxLength={1500} value={formUsul.jawaban} onChange={(e) => setFormUsul({ ...formUsul, jawaban: e.target.value })} /></label>
              <label className="kp-f"><span>Blok yang terkait <small>(boleh kosong)</small></span><input className="teks" maxLength={60} value={formUsul.blok} onChange={(e) => setFormUsul({ ...formUsul, blok: e.target.value })} placeholder="mis. V.E atau IV.1" /></label>
              {usulOk && <div className="catat ya" role="status">Terima kasih! Usulan Anda terkirim dan akan ditinjau.</div>}
              <div className="btns" style={{ padding: "8px 0 0", border: 0 }}><button type="button" className="btn pri" disabled={kerja || formUsul.judul.trim().length < 5 || formUsul.cerita.trim().length < 30} onClick={() => void kirimUsul()}>{kerja ? "Mengirim…" : "Kirim usulan"}</button></div>
            </div>
            {usulanku.length > 0 && (
              <div className="sheet">
                <span className="tag">Usulan saya</span>
                {usulanku.map((u) => (
                  <div key={u.id} className="item" style={{ cursor: "default" }}>
                    <span className="num">{u.id}</span>
                    <span className="t">{u.judul}<small>{LABEL_STATUS_USULAN[u.status] ?? u.status} · {wibTeks(u.dibuat_at)}{u.catatan_admin ? ` · Catatan: ${u.catatan_admin}` : ""}</small></span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {layar === "ujian" && detail && (
          <>
            {latihan && <div className="catat tidak" role="status"><b>{detail.ujian.jenis === "harian" ? "Latihan harian" : detail.ujian.jenis === "tantangan" ? "Tantangan mingguan" : "Latihan"}:</b> rincian kesalahan tampil langsung dan tidak mengubah sertifikat Anda.</div>}
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
                {latihan && jawab.rincian && jawab.rincian.length > 0 && <KoreksiButir daftar={jawab.rincian} penjelasan={jawab.penjelasan} bisaSorot onLihat={setJelas} />}
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
              <div className="sub">{hasil.jenis === "sertifikasi" ? "Hasil Ujian Sertifikasi" : `Hasil ${LABEL_JENIS_UJIAN[hasil.jenis].toLowerCase()}`}</div>
              <Bintang n={hasil.hasil.tingkat} pop />
              <div className="nm">{hasil.hasil.nama}</div>
              <div className="sr-skor" style={{ marginTop: 6 }}>{hasil.hasil.skor}</div>
              <div className="sub">skor dari 100 · {hasil.hasil.butirFatal} butir memuat kesalahan fatal</div>
              {hasil.jenis !== "sertifikasi" && <div className="sub" style={{ marginTop: 4 }}>Tingkat di atas hanya perkiraan dari latihan ini; tidak mengubah sertifikat Anda.{hasil.jenis === "harian" ? " Rangkaian harian Anda bertambah." : ""}</div>}
            </div>
            <div className="sheet"><span className="tag">Tinjauan butir</span>
              {hasil.review.map((r) => (
                <details key={r.urut} className={`sr-rev ${r.benar ? "ok" : "no"}`}>
                  <summary><span>{r.benar ? "✓" : r.terjawab ? "!" : "–"}</span><span>{r.urut}. {r.judul}</span><span className="poin">{r.poin}</span></summary>
                  {r.rincian.length > 0 ? <KoreksiButir daftar={r.rincian} penjelasan={r.penjelasan} bisaSorot={false} onLihat={setJelas} /> : <ul><li>{r.terjawab ? "Tidak ada kesalahan." : "Tidak dijawab."}</li></ul>}
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
          {soal.terjawab
            ? <button type="button" className="btn pri" disabled={kerja} onClick={() => (butirBerikut ? void bukaButir(butirBerikut) : void selesai(false))}>{butirBerikut ? "Berikutnya ›" : kerja ? "Memuat…" : "Selesai ✓"}</button>
            : <button type="button" className="btn pri" disabled={kerja} onClick={() => void kirimJawaban()}>{kerja ? "Mengirim…" : "Kirim jawaban"}</button>}
        </div>
      )}
      <div className="vgfoot"><b>{detail && layar !== "beranda" ? (latihan ? "Latihan" : "Ujian Sertifikasi") : "Sertifikasi kemampuan"}</b> · belum berdampak ke penilaian</div>

      {jelas && (
        <div className="ov" onClick={() => setJelas(null)}><div className="pad sr-pop" role="dialog" aria-label="Penjelasan kotak" onClick={(ev) => ev.stopPropagation()}>
          <div className="ttl">Penjelasan · kesalahan {(NAMA_TINGKAT_SALAH[jelas.x.tingkat] ?? jelas.x.tingkat).toLowerCase()}</div>
          {labelKotak(jelas.x.sel) && <div className="lab">{labelKotak(jelas.x.sel)}</div>}
          {jelas.x.anda !== undefined && jelas.x.seharusnya !== undefined && <div className="sr-kor"><VsKotak x={jelas.x} /></div>}
          {ARTI_JENIS[jelas.x.jenis] && <><h4>Artinya</h4><p>{ARTI_JENIS[jelas.x.jenis]}</p></>}
          <h4>Catatan penilai</h4><p>{jelas.x.pesan}</p>
          {jelas.penjelasan && (jelas.penjelasan.langkah.length > 0 || jelas.penjelasan.pembahasan) && (
            <>
              <h4>Cara yang benar untuk butir ini</h4>
              {jelas.penjelasan.langkah.length > 0 && <ol>{jelas.penjelasan.langkah.map((l, i) => <li key={i} dangerouslySetInnerHTML={html(l)} />)}</ol>}
              {jelas.penjelasan.pembahasan && <p dangerouslySetInnerHTML={html(jelas.penjelasan.pembahasan)} />}
              {jelas.penjelasan.rujukan && <small className="ruj">Rujukan: {jelas.penjelasan.rujukan}</small>}
            </>
          )}
          <div className="row2">
            <button type="button" className="btn" onClick={() => setJelas(null)}>Tutup</button>
            {jelas.bisaSorot && jelas.x.sel && <button type="button" className="btn pri" onClick={() => { setSorot({ target: jelas.x.sel as string, asal: jelas.x.dari }); setJelas(null); }}>Tunjukkan di lembar</button>}
          </div>
        </div></div>
      )}
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
