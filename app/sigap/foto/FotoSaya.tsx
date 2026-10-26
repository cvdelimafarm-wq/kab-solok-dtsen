"use client";

// app/sigap/foto/FotoSaya.tsx
//
// (19 Okt 2026) Foto saya: (1) tag yang MENUNGGU keputusan saya (terima + pilih kegiatan & nomor sendiri / tolak),
// (2) foto yang saya ambil beserta status tag rekan dan tingkat kepercayaannya.
// Setelah Terima, nomor tidak dapat diubah dari sini (mengubah berarti mencabut baris = hapus; sengaja tidak ada).

import { useCallback, useEffect, useState } from "react";
import { ambilFotoUrl, ambilJson } from "./klien";
import { LABEL_ALASAN, MAKS_TAG, WARNA_NADA_PERIKSA, jendelaBagiFoto, labelFotoTanpaSinyal, statusPemeriksaan, type Kepercayaan, type TampilPeriksa } from "@/lib/sigapFoto";
import BagikanFoto, { type TagPilihan } from "./BagikanFoto";

type TagSaya = {
  id: number; foto_id: number; peran_tag: string; status: string; penugasan_id: number | null; slot: number | null; slot_usulan: number | null;
  foto: { id: number; kode: string; kegiatan_id: number; tanggal: string; diambil_at: string; lokasi_teks: string | null; kepercayaan: Kepercayaan; status_periksa: string; pemotret: string } | null;
};
type Diambil = { id: number; kode: string; kegiatan_id: number; tanggal: string; diambil_at: string; diterima_at?: string | null; lokasi_teks: string | null; kepercayaan: Kepercayaan; alasan: string[]; status_periksa: string; tag: { akun_id: number; nama: string; peran_tag: string; status: string; slot: number | null }[] };
type Mode = { kegiatan: { kegiatan_id: number; penugasan_id: number; nama: string; peran: string; jumlah_foto: number; mode: string }[] };

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
          return (
            <div key={t} className="rounded-xl border border-[#C9D3E6] bg-white px-3 pb-1 pt-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[#0F2A52]">{tgl(t)}</h3>
                <span className="text-right text-[11px] font-semibold text-[#55657D]">
                  {daftar.length} foto{diperiksa > 0 ? ` · ${diperiksa} sudah diperiksa` : ""}{menunggu > 0 ? ` · ${menunggu} menunggu` : ""}
                </span>
              </div>
              <ul className="mt-1 divide-y divide-[#EEF1F5]">
                {daftar.map((f) => {
                  const st = statusPemeriksaan(f.kepercayaan, f.status_periksa);
                  const no = nomorTeks(f);
                  const alasan = f.alasan.map((a) => LABEL_ALASAN[a] ?? a);
                  return (
                    <li key={f.id} className="py-2">
                      <button type="button" onClick={() => setBuka(buka === f.id ? null : f.id)} aria-expanded={buka === f.id} className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-[#0F2A52]">{jam(f.diambil_at)} WIB{no ? ` · ${no}` : ""}</span>
                          <span className="block truncate text-[11px] tracking-wide text-[#6B7A90]">{banyakKegiatan ? `${nama(f.kegiatan_id)} · ` : ""}{f.kode}</span>
                          {labelFotoTanpaSinyal(f.alasan, f.diambil_at, f.diterima_at) && <span className="block text-[11.5px] font-semibold leading-snug text-[#5E4300]">{labelFotoTanpaSinyal(f.alasan, f.diambil_at, f.diterima_at)}</span>}
                        </span>
                        <Lencana t={st} />
                      </button>
                      {/* alasan hanya ditampilkan selagi foto masih menunggu keputusan; sesudah diperiksa cukup di rincian */}
                      {st.perhatian && alasan.length > 0 && (
                        <div className={`mt-1 rounded-lg px-3 py-2 text-xs leading-snug ${st.nada === "merah" ? "bg-[#FDE8E8] text-[#7A1D22]" : "bg-[#FFF4D6] text-[#5E4300]"}`}>
                          <b className="block">Alasan menunggu pemeriksaan:</b>
                          <ul className="mt-0.5 list-disc pl-4">{alasan.map((a) => <li key={a}>{a}</li>)}</ul>
                        </div>
                      )}
                      {buka === f.id && (
                        <div className="mt-2 flex flex-col gap-2">
                          <Gambar id={f.id} alt={`Foto ${f.kode}`} />
                          {!st.perhatian && f.kepercayaan !== "hijau" && alasan.length > 0 && <div className="text-xs text-[#3C4C68]">Catatan sistem (sudah ditinjau): {alasan.join("; ")}.</div>}
                          <BagikanSusulan f={f} jumlahNomor={mode.find((k) => k.kegiatan_id === f.kegiatan_id)?.jumlah_foto ?? 5} muat={muat} />
                          {f.tag.some((x) => x.peran_tag !== "pemotret") && (
                            <div className="text-xs text-[#3C4C68]">Dibagikan: {f.tag.filter((x) => x.peran_tag !== "pemotret").map((x) => `${x.nama}: ${LABEL_STATUS[x.status] ?? x.status}${x.slot ? ` (foto ${x.slot})` : ""}`).join(" · ")}</div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
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
