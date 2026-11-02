"use client";

// app/sigap/pelatihan/instrumen/BagianMateri.tsx
//
// (2 Nov 2026) Tahap C: bagian atas tab Instrumen -- video belajar (dilacak sampai habis) dan tautan instrumen (dilacak sudah dibuka), plus formulir tambah untuk pengelola.
// Data: GET/POST /api/sigap/pelatihan/materi. SQL 20261102zm belum dijalankan -> bagian ini tidak tampil bagi peserta (berkas unduhan tetap jalan) dan memberi petunjuk bagi pengelola.

import { JudulIkon } from "./IkonInstrumen";
import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, BTN_R, INPUT, Kartu, Pesan } from "../../admin/ui";
import PemutarVideo, { type ProgresVideo } from "./PemutarVideo";
import { lupakanBenderaTab } from "../TabPelatihan";

const URL_MATERI = "/api/sigap/pelatihan/materi";

type Progres = { detik_unik: number; persen: number; selesai: boolean; manual: boolean };
type Materi = { id: number; urutan: number; jenis: "video" | "tautan"; judul: string; url: string; youtube_id: string | null; durasi_detik: number | null; wajib: boolean; progres: Progres | null };
type Ringkasan = { wajib_total: number; wajib_selesai: number; belum: number };
type Data = { tersedia: boolean; boleh_kelola: boolean; bisa_lapor: boolean; materi: Materi[]; ringkasan: Ringkasan };

const PostJson = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function Lencana({ wajib }: { wajib: boolean }) {
  return wajib ? <span className="rounded-full bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-bold text-[#8A5A00]">Wajib</span> : <span className="rounded-full bg-[#EEF2F8] px-2 py-0.5 text-[11px] font-semibold text-[#6B7A90]">Opsional</span>;
}

function Status({ m }: { m: Materi }) {
  const p = m.progres;
  if (!p) return null;
  if (p.selesai)
    return p.manual ? (
      <span className="text-[12px] font-semibold text-[#8A5A00]">✓ Ditandai manual</span>
    ) : (
      <span className="text-[12px] font-semibold text-[#1A7F4B]">{m.jenis === "video" ? "✓ Selesai ditonton" : "✓ Sudah dibuka"}</span>
    );
  if (m.jenis === "tautan") return <span className="text-[12px] text-[#B42318]">Belum dibuka</span>;
  return (
    <span className="flex items-center gap-2 text-[12px] text-[#6B7A90]">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#E3EAF4]">
        <span className="block h-full rounded-full bg-[#1F5FD1]" style={{ width: `${p.persen}%` }} />
      </span>
      {p.persen > 0 ? `${p.persen}%` : "Belum ditonton"}
    </span>
  );
}

export default function BagianMateri() {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState<number | "simpan" | null>(null);

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Data>(URL_MATERI));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  const terimaProgres = useCallback(
    (id: number, p: ProgresVideo, selesaiBaru: boolean) => {
      setData((d) =>
        d
          ? {
              ...d,
              materi: d.materi.map((m) => {
                if (m.id !== id) return m;
                const persen = p.selesai ? 100 : m.durasi_detik ? Math.min(99, Math.floor((p.detik_unik / m.durasi_detik) * 100)) : 0;
                return { ...m, progres: { detik_unik: p.detik_unik, persen, selesai: p.selesai, manual: p.manual } };
              }),
            }
          : d
      );
      if (selesaiBaru) {
        lupakanBenderaTab(); // penanda "belum dibuka" di ikon tab diperbarui pada halaman berikutnya
        void muat();
      }
    },
    [muat]
  );

  async function bukaTautan(m: Materi) {
    window.open(m.url, "_blank", "noopener,noreferrer");
    if (!data?.bisa_lapor || m.progres?.selesai) return;
    try {
      const r = await fetchJson<{ progres: ProgresVideo }>(URL_MATERI, PostJson({ aksi: "buka", materi_id: m.id }));
      terimaProgres(m.id, r.progres, true);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }

  async function sembunyikan(m: Materi) {
    if (!window.confirm(`Sembunyikan "${m.judul}" dari daftar peserta? (progres peserta tetap tersimpan)`)) return;
    setSibuk(m.id);
    try {
      await fetchJson(URL_MATERI, PostJson({ aksi: "sembunyikan", id: m.id }));
      setInfo("Materi disembunyikan.");
      if (terbuka === m.id) setTerbuka(null);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  async function simpan(isi: { jenis: "video" | "tautan"; judul: string; url: string; durasi_menit: string; wajib: boolean }): Promise<boolean> {
    setSibuk("simpan");
    setGalat(null);
    setInfo(null);
    try {
      const menit = isi.durasi_menit.trim() === "" ? null : Number(isi.durasi_menit.replace(",", "."));
      await fetchJson(URL_MATERI, PostJson({ aksi: "simpan", jenis: isi.jenis, judul: isi.judul, url: isi.url, wajib: isi.wajib, durasi_detik: isi.jenis === "video" && menit !== null && Number.isFinite(menit) ? Math.round(menit * 60) : null, urutan: (data?.materi.length ?? 0) + 1 }));
      setInfo(isi.jenis === "video" ? "Video ditambahkan." : "Tautan ditambahkan.");
      await muat();
      return true;
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      return false;
    } finally {
      setSibuk(null);
    }
  }

  if (!data) return galat ? <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan> : null;
  if (!data.tersedia) {
    return data.boleh_kelola ? <Pesan jenis="galat">Fitur video dan tautan wajib belum aktif: jalankan SQL 20261102zm_pelatihan_materi.sql di database.</Pesan> : null;
  }
  const video = data.materi.filter((m) => m.jenis === "video");
  const tautan = data.materi.filter((m) => m.jenis === "tautan");
  if (data.materi.length === 0 && !data.boleh_kelola) return null;
  const r = data.ringkasan;

  return (
    <>
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}
      {data.bisa_lapor && r.wajib_total > 0 && (
        <p className={`rounded-xl px-3 py-2.5 text-[13px] font-semibold ${r.belum === 0 ? "bg-[#E7F6EE] text-[#1A7F4B]" : "bg-[#FFF4D6] text-[#8A5A00]"}`}>
          {r.belum === 0 ? "✓ Semua materi wajib sudah selesai." : `Materi wajib: ${r.wajib_selesai} dari ${r.wajib_total} selesai. Selesaikan sebelum mengerjakan tes.`}
        </p>
      )}

      {video.length > 0 && (
        <Kartu judul={<JudulIkon kunci="video" teks="Video belajar" />} ket="Tonton sampai habis dengan kecepatan normal. Hanya bagian yang benar-benar diputar yang dihitung.">
          <ul className="space-y-2">
            {video.map((m) => (
              <li key={m.id} className="rounded-xl border border-[#DDE6F3] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold leading-snug">
                      {m.judul} <Lencana wajib={m.wajib} />
                    </p>
                    <div className="mt-0.5">
                      <Status m={m} />
                    </div>
                  </div>
                  <button type="button" className={terbuka === m.id ? BTN_O : BTN} onClick={() => setTerbuka(terbuka === m.id ? null : m.id)}>
                    {terbuka === m.id ? "Tutup" : m.progres?.selesai ? "▶ Putar lagi" : "▶ Putar"}
                  </button>
                  {data.boleh_kelola && (
                    <button type="button" className={BTN_R} disabled={sibuk === m.id} onClick={() => sembunyikan(m)}>
                      Sembunyikan
                    </button>
                  )}
                </div>
                {terbuka === m.id && m.youtube_id && (
                  <PemutarVideo materiId={m.id} youtubeId={m.youtube_id} durasi={m.durasi_detik} bisaLapor={data.bisa_lapor} selesai={!!m.progres?.selesai} onProgres={(p, baru) => terimaProgres(m.id, p, baru)} />
                )}
              </li>
            ))}
          </ul>
        </Kartu>
      )}

      {tautan.length > 0 && (
        <Kartu judul={<JudulIkon kunci="tautan" teks="Tautan instrumen" />} ket="Buka tautan wajib sekurang-kurangnya sekali; pembukaan dicatat.">
          <ul className="space-y-2">
            {tautan.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DDE6F3] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold leading-snug">
                    {m.judul} <Lencana wajib={m.wajib} />
                  </p>
                  <div className="mt-0.5">
                    <Status m={m} />
                  </div>
                </div>
                <button type="button" className={BTN} onClick={() => bukaTautan(m)}>
                  ↗ Buka
                </button>
                {data.boleh_kelola && (
                  <button type="button" className={BTN_R} disabled={sibuk === m.id} onClick={() => sembunyikan(m)}>
                    Sembunyikan
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Kartu>
      )}

      {data.boleh_kelola && <FormMateri sibuk={sibuk === "simpan"} onSimpan={simpan} />}
    </>
  );
}

function FormMateri({ sibuk, onSimpan }: { sibuk: boolean; onSimpan: (i: { jenis: "video" | "tautan"; judul: string; url: string; durasi_menit: string; wajib: boolean }) => Promise<boolean> }) {
  const [jenis, setJenis] = useState<"video" | "tautan">("video");
  const [judul, setJudul] = useState("");
  const [url, setUrl] = useState("");
  const [menit, setMenit] = useState("");
  const [wajib, setWajib] = useState(true);
  return (
    <Kartu judul="➕ Tambah video atau tautan" ket="Video harus tautan YouTube. Tandai Wajib bila peserta harus menyelesaikannya; video wajib juga menahan Pretest bila 'Blokir antar tahapan' menyala.">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select className={`${INPUT} w-auto`} value={jenis} onChange={(e) => setJenis(e.target.value as "video" | "tautan")} aria-label="Jenis">
            <option value="video">Video (YouTube)</option>
            <option value="tautan">Tautan</option>
          </select>
          <input className={`${INPUT} min-w-[180px] flex-1`} placeholder="Judul" value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={160} />
        </div>
        <input className={INPUT} placeholder={jenis === "video" ? "https://youtu.be/…" : "https://…"} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" />
        <div className="flex flex-wrap items-center gap-3">
          {jenis === "video" && <input className={`${INPUT} w-36`} placeholder="Durasi (menit)" value={menit} onChange={(e) => setMenit(e.target.value)} inputMode="decimal" aria-label="Durasi dalam menit (opsional)" />}
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={wajib} onChange={(e) => setWajib(e.target.checked)} /> Wajib
          </label>
          <button
            type="button"
            className={BTN}
            disabled={sibuk || judul.trim().length < 3 || !url.trim()}
            onClick={async () => {
              if (await onSimpan({ jenis, judul, url, durasi_menit: menit, wajib })) {
                setJudul("");
                setUrl("");
                setMenit("");
              }
            }}
          >
            {sibuk ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
        {jenis === "video" && <p className="text-[11.5px] text-[#6B7A90]">Durasi boleh dikosongkan: pemutar peserta yang pertama akan melaporkannya.</p>}
      </div>
    </Kartu>
  );
}
