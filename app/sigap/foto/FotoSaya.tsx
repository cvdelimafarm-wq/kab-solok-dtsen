"use client";

// app/sigap/foto/FotoSaya.tsx
//
// (19 Okt 2026) Foto saya: (1) tag yang MENUNGGU keputusan saya (terima + pilih kegiatan & nomor sendiri / tolak),
// (2) foto yang saya ambil beserta status tag rekan dan tingkat kepercayaannya.
// Setelah Terima, nomor tidak dapat diubah dari sini (mengubah berarti mencabut baris = hapus; sengaja tidak ada).

import { useCallback, useEffect, useState } from "react";
import { ambilFotoUrl, ambilJson } from "./klien";
import { LABEL_ALASAN, LABEL_KEPERCAYAAN, WARNA_KEPERCAYAAN, type Kepercayaan } from "@/lib/sigapFoto";

type TagSaya = {
  id: number; foto_id: number; peran_tag: string; status: string; penugasan_id: number | null; slot: number | null; slot_usulan: number | null;
  foto: { id: number; kode: string; kegiatan_id: number; tanggal: string; diambil_at: string; lokasi_teks: string | null; kepercayaan: Kepercayaan; status_periksa: string; pemotret: string } | null;
};
type Diambil = { id: number; kode: string; kegiatan_id: number; tanggal: string; diambil_at: string; lokasi_teks: string | null; kepercayaan: Kepercayaan; alasan: string[]; status_periksa: string; tag: { akun_id: number; nama: string; peran_tag: string; status: string; slot: number | null }[] };
type Mode = { kegiatan: { kegiatan_id: number; penugasan_id: number; nama: string; peran: string; jumlah_foto: number; mode: string }[] };

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (t: string) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;
const jam = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(11, 16).replace(":", ".");
const LABEL_STATUS: Record<string, string> = { diajukan: "Menunggu", diterima: "Diterima", ditolak: "Ditolak", ditahan: "Ditahan (perlu diperiksa)", dilepas: "Dilepas" };

function Lencana({ k }: { k: Kepercayaan }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: WARNA_KEPERCAYAAN[k] }}>{LABEL_KEPERCAYAAN[k]}</span>;
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
        <Lencana k={f.kepercayaan} />
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

export default function FotoSaya() {
  const [data, setData] = useState<{ diambil: Diambil[]; untuk_saya: TagSaya[] } | null>(null);
  const [mode, setMode] = useState<Mode["kegiatan"]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [buka, setBuka] = useState<number | null>(null);

  const muat = useCallback(() => {
    Promise.all([ambilJson<{ diambil: Diambil[]; untuk_saya: TagSaya[] }>("/api/sigap/foto"), ambilJson<Mode>("/api/sigap/foto/mode")])
      .then(([d, m]) => { setData(d); setMode(m.kegiatan); setGalat(null); })
      .catch((e: Error) => setGalat(e.message));
  }, []);
  useEffect(muat, [muat]);

  if (galat) return <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{galat}</div>;
  if (!data) return <div className="text-sm text-[#3C4C68]">Memuat…</div>;
  const menunggu = data.untuk_saya.filter((t) => t.status === "diajukan" && t.foto);
  const riwayat = data.untuk_saya.filter((t) => t.status !== "diajukan" && t.foto);
  const nama = (id: number) => mode.find((k) => k.kegiatan_id === id)?.nama ?? `Kegiatan ${id}`;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="h-menunggu" className="flex flex-col gap-2">
        <h2 id="h-menunggu" className="text-sm font-extrabold text-[#0F2A52]">Menunggu diterima ({menunggu.length})</h2>
        {menunggu.length === 0 && <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">Tidak ada ajakan foto yang menunggu.</div>}
        <ul className="flex flex-col gap-3">{menunggu.map((t) => <KartuMenunggu key={t.id} t={t} mode={mode} muat={muat} />)}</ul>
      </section>

      <section aria-labelledby="h-diambil" className="flex flex-col gap-2">
        <h2 id="h-diambil" className="text-sm font-extrabold text-[#0F2A52]">Foto yang saya ambil ({data.diambil.length})</h2>
        <ul className="flex flex-col gap-2">
          {data.diambil.map((f) => (
            <li key={f.id} className="rounded-xl border border-[#C9D3E6] bg-white p-3">
              <button type="button" onClick={() => setBuka(buka === f.id ? null : f.id)} aria-expanded={buka === f.id} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[#0F2A52]">{nama(f.kegiatan_id)}</span>
                  <span className="block text-xs text-[#3C4C68]">{tgl(f.tanggal)} · {jam(f.diambil_at)} WIB · {f.kode}</span>
                </span>
                <Lencana k={f.kepercayaan} />
              </button>
              {buka === f.id && (
                <div className="mt-2 flex flex-col gap-2">
                  <Gambar id={f.id} alt={`Foto ${f.kode}`} />
                  {f.status_periksa !== "belum" && <div className="text-xs font-semibold text-[#0F2A52]">Pemeriksaan: {f.status_periksa === "diperiksa" ? "sudah diperiksa" : "dipertanyakan"}</div>}
                  {f.alasan.length > 0 && <ul className="list-disc pl-5 text-xs text-[#3C4C68]">{f.alasan.map((a) => <li key={a}>{LABEL_ALASAN[a] ?? a}</li>)}</ul>}
                  <div className="text-xs text-[#3C4C68]">{f.tag.map((t) => `${t.peran_tag === "pemotret" ? "Saya" : t.nama}: ${LABEL_STATUS[t.status] ?? t.status}${t.slot ? ` (foto ${t.slot})` : ""}`).join(" · ")}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
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
