"use client";

// app/sigap/foto/FotoSaya.tsx
//
// (19 Okt 2026) Foto saya: (1) tag yang MENUNGGU keputusan saya (terima + pilih kegiatan & nomor sendiri / tolak),
// (2) foto yang saya ambil beserta status tag rekan dan tingkat kepercayaannya.
// Setelah Terima, nomor tidak dapat diubah dari sini (mengubah berarti mencabut baris = hapus; sengaja tidak ada).

import { useCallback, useEffect, useRef, useState } from "react";
import { ambilFotoUrl, ambilJson } from "./klien";
import { useData } from "@/app/portal/dataBersama";
import { jalurFotoSaya, umurTeks } from "@/lib/sigapFotoCache";
import { LABEL_ALASAN, MAKS_TAG, WARNA_NADA_PERIKSA, jendelaBagiFoto, labelFotoTanpaSinyal, statusPemeriksaan, type Kepercayaan, type TampilPeriksa } from "@/lib/sigapFoto";
import BagikanFoto, { type TagPilihan } from "./BagikanFoto";
import BagikanWa from "./BagikanWa";
import { hurufCadangan, susunHari } from "@/lib/sigapSusunHari";
import { peranRingkas } from "@/lib/sigapUrutanFoto";

type TagSaya = {
  id: number; foto_id: number; peran_tag: string; status: string; penugasan_id: number | null; slot: number | null; slot_usulan: number | null;
  foto: { id: number; kode: string; kegiatan_id: number; tanggal: string; diambil_at: string; lokasi_teks: string | null; kepercayaan: Kepercayaan; status_periksa: string; pemotret: string } | null;
};
type Diambil = { id: number; kode: string; kegiatan_id: number; tanggal: string; diambil_at: string; diterima_at?: string | null; lokasi_teks: string | null; kepercayaan: Kepercayaan; alasan: string[]; status_periksa: string; tag: { akun_id: number; nama: string; peran_tag: string; status: string; slot: number | null }[] };
type Mode = { kegiatan: { kegiatan_id: number; penugasan_id: number; nama: string; peran: string; jenis?: string; jumlah_foto: number; mode: string }[] };

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (t: string) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
const jam = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(11, 16).replace(":", ".");
const LABEL_STATUS: Record<string, string> = { diajukan: "Menunggu", diterima: "Diterima", ditolak: "Ditolak", ditahan: "Ditahan (perlu diperiksa)", dilepas: "Dilepas" };

// (23 Okt 2026) Lencana mengikuti hasil pemeriksaan PML/admin (lihat statusPemeriksaan di lib/sigapFoto.ts), bukan hanya tingkat kepercayaan sistem.
function Lencana({ t }: { t: TampilPeriksa }) {
  return <span className="inline-flex flex-none items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-[1.4] text-white" style={{ background: WARNA_NADA_PERIKSA[t.nada] }}>{t.label}</span>;
}

function Gambar({ id, alt }: { id: number; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);
  useEffect(() => {
    let batal = false;
    let u: string | null = null;
    ambilFotoUrl(id).then((x) => { if (batal) URL.revokeObjectURL(x); else { u = x; setUrl(x); } }).catch((e: Error) => !batal && setGagal(e.message));
    return () => { batal = true; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (gagal) return <div className="flex h-40 items-center justify-center rounded-lg bg-[#EEF2F7] px-3 text-center text-xs text-[#3C4C68]">{gagal}</div>;
  if (!url) return <div className="h-40 animate-pulse rounded-lg bg-[#EEF2F7]" aria-label="Memuat foto" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="max-h-72 w-full rounded-lg object-contain bg-black" />;
}

// (27 Okt 2026) Gambar kecil untuk kisi: baru dimuat saat ubin mendekati layar (foto asli ber-cap diambil dari server, jadi jangan semuanya sekaligus).
function Mini({ id, alt }: { id: number; alt: string }) {
  const kotak = useRef<HTMLSpanElement>(null);
  const [lihat, setLihat] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);
  useEffect(() => {
    const el = kotak.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setLihat(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setLihat(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!lihat) return;
    let batal = false;
    let u: string | null = null;
    ambilFotoUrl(id).then((x) => { if (batal) URL.revokeObjectURL(x); else { u = x; setUrl(x); } }).catch(() => !batal && setGagal(true));
    return () => { batal = true; if (u) URL.revokeObjectURL(u); };
  }, [lihat, id]);
  return (
    <span ref={kotak} className="absolute inset-0 block bg-[#EEF2F7]">
      {gagal ? (
        <span className="flex h-full items-center justify-center px-1 text-center text-[10.5px] font-semibold text-[#55657D]">Belum termuat</span>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="block h-full w-full animate-pulse bg-[#EEF2F7]" aria-label="Memuat foto" />
      )}
    </span>
  );
}

function IkonPeringatan() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M12 3 2.5 20h19L12 3z" fill="#F2B632" stroke="#8A6200" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 9.5v4.5" stroke="#3D2B00" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="#3D2B00" />
    </svg>
  );
}

/** Ubin persegi seragam seperti kisi di layar Hari Ini. Nomor = lingkaran biru tua; cadangan = lingkaran kuning dengan huruf. */
function Ubin({ id, lencana, cadangan, judul, sub, masalah, merah, dibuka, label, onKlik }: { id: number; lencana: string; cadangan?: boolean; judul: string; sub: string; masalah: boolean; merah: boolean; dibuka: boolean; label: string; onKlik: () => void }) {
  const batas = dibuka ? "border-[#0F2A52] ring-4 ring-[#BFD0F0]" : merah ? "border-[#D64550]" : masalah ? "border-[#F2B632]" : "border-[#C9D3E6]";
  return (
    <button type="button" onClick={onKlik} aria-expanded={dibuka} aria-label={label} className={`flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-white text-left transition ${batas}`}>
      <span className="relative block aspect-square w-full overflow-hidden">
        <Mini id={id} alt={judul} />
        <span className={`absolute left-1 top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs font-extrabold ${cadangan ? "bg-[#F2B632] text-[#3D2B00]" : "bg-[#0F2A52] text-white"}`}>{lencana}</span>
        {masalah && <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow" title="Perlu diperiksa"><IkonPeringatan /></span>}
      </span>
      <span className="block px-1.5 pb-1.5 pt-1">
        <span className="block break-normal text-[11.5px] font-extrabold leading-tight text-[#0F2A52]">{judul}</span>
        <span className="mt-0.5 block text-[11px] leading-tight text-[#3C4C68]">{sub}</span>
      </span>
    </button>
  );
}

// (26 Okt 2026) Membagikan foto yang SUDAH terkirim ke rekan, selama masih dalam H+1 (23.59 WIB sehari sesudah tanggal foto). Server menolak bila lewat.
function BagikanSusulan({ f, jumlahNomor, muat }: { f: Diambil; jumlahNomor: number; muat: () => void }) {
  const hariIni = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const [buka, setBuka] = useState(false);
  const [tag, setTag] = useState<TagPilihan[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const lain = f.tag.filter((x) => x.peran_tag !== "pemotret");
  const sisa = Math.max(0, MAKS_TAG - lain.length);
  if (!jendelaBagiFoto(f.tanggal, hariIni)) {
    return <p className="text-[11.5px] leading-snug text-[#55657D]">Berbagi foto ditutup: hanya bisa sampai akhir hari sesudah tanggal foto (H+1).</p>;
  }
  async function kirim() {
    setSibuk(true);
    setPesan(null);
    try {
      const r = await ambilJson<{ ok: boolean; simulasi?: boolean; ditambah?: number }>("/api/sigap/foto/tag", {
        method: "POST",
        body: { foto_id: f.id, tag: tag.map((t) => ({ akun_id: t.akun_id, slot_usulan: t.slot_usulan })) },
      });
      if (r.simulasi) {
        setPesan({ jenis: "galat", teks: "Mode simulasi (masuk sebagai akun lain): ajakan TIDAK dikirim." });
      } else {
        setPesan({ jenis: "ok", teks: r.ditambah ? `Ajakan terkirim ke ${r.ditambah} orang. Mereka memilih nomor fotonya sendiri.` : "Semua yang dipilih sudah pernah diajak." });
        setTag([]);
        setBuka(false);
        muat();
      }
    } catch (e) {
      setPesan({ jenis: "galat", teks: (e as Error).message });
    } finally {
      setSibuk(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {pesan && <div role={pesan.jenis === "galat" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-xs ${pesan.jenis === "ok" ? "bg-[#E3F6EC] text-[#0B6B3F]" : "bg-[#FDE8E8] text-[#9B1C23]"}`}>{pesan.teks}</div>}
      {sisa === 0 ? (
        <p className="text-[11.5px] text-[#55657D]">Foto ini sudah mencapai batas {MAKS_TAG} orang yang diajak.</p>
      ) : (
        <button type="button" onClick={() => setBuka((b) => !b)} aria-expanded={buka} className="min-h-[44px] rounded-xl border-2 border-[#0F2A52] text-sm font-bold text-[#0F2A52]">
          {buka ? "Sembunyikan pilihan rekan" : "Bagikan ke rekan"}
        </button>
      )}
      {buka && sisa > 0 && (
        <>
          <BagikanFoto kegiatanId={f.kegiatan_id} jumlahNomor={jumlahNomor} nilai={tag} onUbah={setTag} kecuali={lain.map((x) => x.akun_id)} maks={sisa} />
          <button type="button" onClick={() => void kirim()} disabled={sibuk || tag.length === 0} className="min-h-[48px] rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-40">
            {sibuk ? "Mengirim…" : tag.length ? `Kirim ajakan ke ${tag.length} orang` : "Pilih rekan dulu"}
          </button>
          <p className="text-[11px] leading-snug text-[#55657D]">Foto tidak dikirim ulang. Hanya ajakan; rekan menerima dan memilih nomornya sendiri.</p>
        </>
      )}
    </div>
  );
}

function KartuMenunggu({ t, mode, muat }: { t: TagSaya; mode: Mode["kegiatan"]; muat: () => void }) {
  const f = t.foto!;
  const luar = t.peran_tag === "luar_tim";
  // tim: hanya penugasan di kegiatan foto; luar tim: semua penugasan miliknya bermode kamera
  const pilihan = mode.filter((k) => (luar ? k.mode === "kamera" : k.kegiatan_id === f.kegiatan_id));
  const [pen, setPen] = useState<number | "">(pilihan[0]?.penugasan_id ?? "");
  const [slot, setSlot] = useState<number | "">(t.slot_usulan ?? "");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const maks = pilihan.find((k) => k.penugasan_id === pen)?.jumlah_foto ?? 5;

  async function putuskan(aksi: "terima" | "tolak") {
    setSibuk(true);
    setPesan(null);
    try {
      const r = await ambilJson<{ ok: boolean; simulasi?: boolean; status?: string; ditahan?: boolean }>("/api/sigap/foto/tag/keputusan", { method: "POST", body: { tag_id: t.id, aksi, penugasan_id: pen || undefined, slot: slot || undefined } });
      if (r.simulasi) setPesan("Mode simulasi: tidak dikirim.");
      else muat();
    } catch (e) {
      setPesan((e as Error).message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-[#C9D3E6] bg-white p-3">
      <Gambar id={f.id} alt={`Foto dari ${f.pemotret}`} />
      <div className="text-sm font-bold text-[#0F2A52]">{f.pemotret} mengajak Anda di foto ini</div>
      <div className="text-xs text-[#3C4C68]">{tgl(f.tanggal)} · {jam(f.diambil_at)} WIB{f.lokasi_teks ? ` · ${f.lokasi_teks}` : ""} · {f.kode}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Lencana t={statusPemeriksaan(f.kepercayaan, f.status_periksa)} />
        {luar && <span className="rounded-full bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-bold text-[#8A6200]">Di luar tim</span>}
      </div>
      {pilihan.length === 0 ? (
        <div className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs text-[#5E4300]">Tidak ada kegiatan Anda yang memakai Kamera SIGAP untuk menerima foto ini. Anda hanya bisa menolak.</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 flex flex-col gap-1 text-xs font-bold text-[#0F2A52]">Kegiatan
            <select value={pen} onChange={(e) => setPen(e.target.value ? Number(e.target.value) : "")} className="min-h-[44px] rounded-lg border border-[#C9D3E6] bg-white px-2 text-sm font-normal">
              {pilihan.map((k) => <option key={k.penugasan_id} value={k.penugasan_id}>{k.nama}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-bold text-[#0F2A52]">Nomor foto saya
            <select value={slot} onChange={(e) => setSlot(e.target.value ? Number(e.target.value) : "")} className="min-h-[44px] rounded-lg border border-[#C9D3E6] bg-white px-2 text-sm font-normal">
              <option value="">Pilih nomor…</option>
              {Array.from({ length: maks }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Foto {n}</option>)}
            </select>
          </label>
        </div>
      )}
      {pesan && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{pesan}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={sibuk} onClick={() => void putuskan("tolak")} className="min-h-[48px] flex-1 rounded-xl border-2 border-[#C9D3E6] text-sm font-bold text-[#0F2A52] disabled:opacity-50">Tolak</button>
        <button type="button" disabled={sibuk || !pen || !slot} onClick={() => void putuskan("terima")} className="min-h-[48px] flex-[2] rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-40">Terima</button>
      </div>
      <p className="text-[11px] text-[#3C4C68]">Setelah Terima, nomor tidak bisa diubah sendiri. Jika nomor itu sudah terisi, foto lama dilepas dari nomornya (tidak dihapus).</p>
    </li>
  );
}

type DataFoto = { diambil: Diambil[]; untuk_saya: TagSaya[]; ada_lagi?: boolean };

export default function FotoSaya() {
  // (27 Okt 2026) Daftar langsung tampil dari simpanan di HP (dataBersama.ts) lalu diperbarui diam-diam; dulu layar kosong sampai dua panggilan server selesai.
  // Awalnya 30 foto terbaru; "Tampilkan foto lebih lama" memuat sampai 100 (daftar pendek tetap tampil selagi yang panjang dimuat).
  const [semua, setSemua] = useState(false);
  const pendek = useData<DataFoto>(jalurFotoSaya(false), { aktif: !semua });
  const panjang = useData<DataFoto>(jalurFotoSaya(true), { aktif: semua });
  const md = useData<Mode>("/api/sigap/foto/mode");
  const aktifDaftar = semua && panjang.data ? panjang : pendek;
  const data = aktifDaftar.data;
  const galat = (semua ? panjang.galat ?? pendek.galat : pendek.galat);
  const mode = md.data?.kegiatan ?? [];
  const [buka, setBuka] = useState<number | null>(null);
  const [cadBuka, setCadBuka] = useState<Set<string>>(new Set()); // "tanggal|kegiatan" yang cadangannya dibuka (bawaan: tersembunyi)

  const mulaiPendek = pendek.muat;
  const mulaiPanjang = panjang.muat;
  const mulaiMode = md.muat;
  const muat = useCallback(() => {
    void (semua ? mulaiPanjang() : mulaiPendek());
    void mulaiMode();
  }, [semua, mulaiPendek, mulaiPanjang, mulaiMode]);

  if (!data) {
    if (galat) return <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{galat === "SESI_BERAKHIR" ? "Sesi berakhir. Masuk kembali." : galat}</div>;
    return <div className="text-sm text-[#3C4C68]">Memuat…</div>;
  }
  const menunggu = data.untuk_saya.filter((t) => t.status === "diajukan" && t.foto);
  const riwayat = data.untuk_saya.filter((t) => t.status !== "diajukan" && t.foto);
  const nama = (id: number) => mode.find((k) => k.kegiatan_id === id)?.nama ?? `Kegiatan ${id}`;
  // (23 Okt 2026) dikelompokkan per tanggal (terbaru di atas); nama kegiatan hanya ditulis bila petugas punya lebih dari satu kegiatan
  const kelompok = (() => {
    const m = new Map<string, Diambil[]>();
    for (const f of data.diambil) m.set(f.tanggal, [...(m.get(f.tanggal) ?? []), f]);
    return Array.from(m.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([t, daftar]) => ({ t, daftar: [...daftar].sort((x, y) => (x.diambil_at < y.diambil_at ? 1 : -1)) }));
  })();
  const banyakKegiatan = new Set(data.diambil.map((f) => f.kegiatan_id)).size > 1;
  const nomorTeks = (f: Diambil) => {
    const p = f.tag.find((x) => x.peran_tag === "pemotret");
    if (!p) return null;
    const no = p.slot ? `Foto ${p.slot}` : "Belum bernomor";
    const ket = p.status === "diterima" || p.status === "ditahan" ? "" : p.status === "dilepas" ? " (cadangan)" : ` (${(LABEL_STATUS[p.status] ?? p.status).toLowerCase()})`;
    return `${no}${ket}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-[#55657D]">
        <span>
          Diperbarui {umurTeks(aktifDaftar.tiba, Date.now())}
          {galat && galat !== "SESI_BERAKHIR" ? " · belum bisa memperbarui (tanpa sinyal?)" : ""}
        </span>
        <button type="button" onClick={muat} className="min-h-[32px] rounded-lg border border-[#C9D3E6] bg-white px-2.5 text-[11px] font-bold text-[#0F2A52]">Muat ulang</button>
      </div>
      <section aria-labelledby="h-menunggu" className="flex flex-col gap-2">
        <h2 id="h-menunggu" className="text-sm font-extrabold text-[#0F2A52]">Menunggu diterima ({menunggu.length})</h2>
        {menunggu.length === 0 && <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">Tidak ada ajakan foto yang menunggu.</div>}
        <ul className="flex flex-col gap-3">{menunggu.map((t) => <KartuMenunggu key={t.id} t={t} mode={mode} muat={muat} />)}</ul>
      </section>

      <section aria-labelledby="h-diambil" className="flex flex-col gap-2">
        <h2 id="h-diambil" className="text-sm font-extrabold text-[#0F2A52]">Foto yang saya ambil ({data.diambil.length})</h2>
        {kelompok.length === 0 && <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">Belum ada foto.</div>}
        {kelompok.map(({ t, daftar }) => {
          const menunggu = daftar.filter((f) => statusPemeriksaan(f.kepercayaan, f.status_periksa).perhatian).length;
          const diperiksa = daftar.filter((f) => f.status_periksa === "diperiksa").length;
          // (27 Okt 2026) per tanggal, lalu per kegiatan (nomor foto berlaku per kegiatan): kisi bernomor, cadangan disembunyikan
          const perKegiatan = Array.from(daftar.reduce((m, f) => m.set(f.kegiatan_id, [...(m.get(f.kegiatan_id) ?? []), f]), new Map<number, Diambil[]>()).entries()).map(([kid, d]) => ({ kid, susun: susunHari(d) }));
          const jumlahCadangan = perKegiatan.reduce((n, x) => n + x.susun.cadangan.length, 0);
          return (
            <div key={t} className="rounded-xl border border-[#C9D3E6] bg-white px-3 pb-3 pt-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[#0F2A52]">{tgl(t)}</h3>
                <span className="text-right text-[11px] font-semibold text-[#55657D]">
                  {daftar.length} foto{jumlahCadangan > 0 ? ` · ${jumlahCadangan} cadangan` : ""}{diperiksa > 0 ? ` · ${diperiksa} sudah diperiksa` : ""}{menunggu > 0 ? ` · ${menunggu} menunggu` : ""}
                </span>
              </div>
              {perKegiatan.map(({ kid, susun }) => {
                const kunci = `${t}|${kid}`;
                const cadTampil = cadBuka.has(kunci);
                const info = mode.find((k) => k.kegiatan_id === kid);
                const jenis = info?.jenis ?? null;
                const jumlahNomor = info?.jumlah_foto ?? 5;
                const dibuka = [...susun.nomor.map((u) => u.foto), ...susun.cadangan].find((f) => f.id === buka) ?? null;
                return (
                  <div key={kid} className="mt-2">
                    {banyakKegiatan && <div className="mb-1 text-[11.5px] font-bold text-[#3C4C68]">{nama(kid)}</div>}
                    {susun.nomor.length > 0 && <div className="mb-1 text-[11.5px] font-semibold text-[#55657D]">Nomor foto {susun.nomor.length}/{jumlahNomor}. Ketuk foto untuk membukanya.</div>}
                    <ol className="grid grid-cols-3 gap-2">
                      {susun.nomor.map(({ slot, foto: f, ditahan }) => {
                        const st = statusPemeriksaan(f.kepercayaan, f.status_periksa);
                        return (
                          <li key={f.id} className="h-full min-w-0">
                            <Ubin id={f.id} lencana={String(slot)} judul={peranRingkas(jenis, slot)} sub={`${jam(f.diambil_at)} WIB`} masalah={st.perhatian || ditahan} merah={st.nada === "merah"} dibuka={buka === f.id}
                              label={`Foto ${slot}, ${peranRingkas(jenis, slot)}, ${jam(f.diambil_at)} WIB, ${st.label}`} onKlik={() => setBuka(buka === f.id ? null : f.id)} />
                          </li>
                        );
                      })}
                    </ol>
                    {susun.nomor.length === 0 && susun.cadangan.length > 0 && <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">Belum ada foto yang menempati nomor.</div>}
                    {susun.cadangan.length > 0 && (
                      <button type="button" aria-expanded={cadTampil} onClick={() => setCadBuka((p) => { const n = new Set(p); if (n.has(kunci)) n.delete(kunci); else n.add(kunci); return n; })}
                        className="mt-2 min-h-[44px] w-full rounded-xl border-2 border-[#C9D3E6] text-[13px] font-bold text-[#1F5FBF]">
                        {cadTampil ? "Sembunyikan" : "Tampilkan"} foto cadangan ({susun.cadangan.length})
                      </button>
                    )}
                    {cadTampil && susun.cadangan.length > 0 && (
                      <>
                        <p className="mt-1 text-[11.5px] leading-snug text-[#55657D]">Tersimpan, belum bernomor. Untuk memasangnya ke sebuah nomor, buka layar Hari Ini lalu tekan Ganti urutan.</p>
                        <ol className="mt-1 grid grid-cols-3 gap-2">
                          {susun.cadangan.map((f, i) => {
                            const st = statusPemeriksaan(f.kepercayaan, f.status_periksa);
                            const huruf = hurufCadangan(i);
                            return (
                              <li key={f.id} className="h-full min-w-0">
                                <Ubin id={f.id} lencana={huruf} cadangan judul={`Cadangan ${huruf}`} sub={`${jam(f.diambil_at)} WIB`} masalah={st.perhatian} merah={st.nada === "merah"} dibuka={buka === f.id}
                                  label={`Foto cadangan ${huruf}, ${jam(f.diambil_at)} WIB, ${st.label}`} onKlik={() => setBuka(buka === f.id ? null : f.id)} />
                              </li>
                            );
                          })}
                        </ol>
                      </>
                    )}
                    {dibuka && (() => {
                      const f = dibuka;
                      const st = statusPemeriksaan(f.kepercayaan, f.status_periksa);
                      const no = nomorTeks(f);
                      const alasan = f.alasan.map((a) => LABEL_ALASAN[a] ?? a);
                      return (
                        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[#C9D3E6] bg-[#F7F9FD] p-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-[#0F2A52]">{jam(f.diambil_at)} WIB{no ? ` · ${no}` : ""}</span>
                              <span className="block truncate text-[11px] tracking-wide text-[#6B7A90]">{f.kode}</span>
                              {labelFotoTanpaSinyal(f.alasan, f.diambil_at, f.diterima_at) && <span className="block text-[11.5px] font-semibold leading-snug text-[#5E4300]">{labelFotoTanpaSinyal(f.alasan, f.diambil_at, f.diterima_at)}</span>}
                            </span>
                            <Lencana t={st} />
                          </div>
                          {/* alasan hanya ditampilkan selagi foto masih menunggu keputusan; sesudah diperiksa cukup di rincian */}
                          {st.perhatian && alasan.length > 0 && (
                            <div className={`rounded-lg px-3 py-2 text-xs leading-snug ${st.nada === "merah" ? "bg-[#FDE8E8] text-[#7A1D22]" : "bg-[#FFF4D6] text-[#5E4300]"}`}>
                              <b className="block">Alasan menunggu pemeriksaan:</b>
                              <ul className="mt-0.5 list-disc pl-4">{alasan.map((a) => <li key={a}>{a}</li>)}</ul>
                            </div>
                          )}
                          <Gambar id={f.id} alt={`Foto ${f.kode}`} />
                          <BagikanWa fotoId={f.id} kode={f.kode} lokasi={f.lokasi_teks} diambil_at={f.diambil_at} kegiatan={nama(f.kegiatan_id)} />
                          {!st.perhatian && f.kepercayaan !== "hijau" && alasan.length > 0 && <div className="text-xs text-[#3C4C68]">Catatan sistem (sudah ditinjau): {alasan.join("; ")}.</div>}
                          <BagikanSusulan f={f} jumlahNomor={jumlahNomor} muat={muat} />
                          {f.tag.some((x) => x.peran_tag !== "pemotret") && (
                            <div className="text-xs text-[#3C4C68]">Dibagikan: {f.tag.filter((x) => x.peran_tag !== "pemotret").map((x) => `${x.nama}: ${LABEL_STATUS[x.status] ?? x.status}${x.slot ? ` (foto ${x.slot})` : ""}`).join(" · ")}</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      {riwayat.length > 0 && (
        <section aria-labelledby="h-riwayat" className="flex flex-col gap-2">
          <h2 id="h-riwayat" className="text-sm font-extrabold text-[#0F2A52]">Riwayat ajakan</h2>
          <ul className="flex flex-col gap-1">
            {riwayat.map((t) => (
              <li key={t.id} className="rounded-lg bg-[#F7F9FD] px-3 py-2 text-xs text-[#3C4C68]">
                {t.foto!.pemotret} · {tgl(t.foto!.tanggal)} · {LABEL_STATUS[t.status] ?? t.status}{t.slot ? ` (foto ${t.slot})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
