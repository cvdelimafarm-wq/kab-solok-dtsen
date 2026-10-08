"use client";

// app/sigap/pelatihan/instrumen/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan > tab "Instrumen" (permintaan user): kuesioner, buku pedoman, dan PPT materi
// pelatihan yang dapat diunduh peserta. Pengelola (izin pelatihan.kelola) dapat mengunggah & menyembunyikan.

import { useCallback, useEffect, useRef, useState } from "react";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir, tglSedang } from "../../admin/api";
import { BTN, BTN_O, BTN_R, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Kerangka } from "../komponen";

type Jenis = "kuesioner" | "pedoman" | "materi";
type Berkas = { id: number; jenis: Jenis; judul: string; nama_file: string; ukuran: number | null; diunggah_at: string };
type Daftar = { boleh_kelola: boolean; berkas: Berkas[] };

const URL_INSTRUMEN = "/api/sigap/pelatihan/instrumen";
const GRUP: { jenis: Jenis; ikon: string; judul: string; ket: string; kosong: string; terima: string }[] = [
  { jenis: "kuesioner", ikon: "📋", judul: "Kuesioner", ket: "Kuesioner pendataan yang dipakai di lapangan.", kosong: "Kuesioner belum diunggah.", terima: ".pdf,.doc,.docx,.xls,.xlsx" },
  { jenis: "pedoman", ikon: "📖", judul: "Buku Pedoman", ket: "Pedoman pendataan: konsep, definisi, dan tata cara.", kosong: "Buku pedoman belum diunggah panitia. Akan tersedia di sini.", terima: ".pdf,.doc,.docx" },
  { jenis: "materi", ikon: "🖥️", judul: "PPT Materi Pelatihan", ket: "Bahan paparan pelatihan.", kosong: "PPT materi belum diunggah panitia. Akan tersedia di sini.", terima: ".ppt,.pptx,.pps,.ppsx,.pdf,.zip" },
];

function ukuranTeks(b: number | null) {
  if (!b) return "";
  return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export default function HalamanInstrumen() {
  const [data, setData] = useState<Daftar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | "unggah" | null>(null);

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Daftar>(URL_INSTRUMEN));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    muat();
  }, [muat]);

  async function unduh(b: Berkas) {
    setSibuk(b.id);
    setGalat(null);
    try {
      const res = await fetch(`${URL_INSTRUMEN}?unduh=${b.id}`, { headers: { Authorization: `Bearer ${bacaSesi() ?? ""}` }, cache: "no-store" });
      if (res.status === 401) return keMasuk();
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Gagal (${res.status}).`);
      if ((res.headers.get("content-type") ?? "").includes("application/json")) {
        const { url } = (await res.json()) as { url: string };
        window.location.href = url; // tautan sementara dari storage (mengunduh langsung)
      } else {
        const obj = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = obj;
        a.download = b.nama_file;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(obj), 60_000);
      }
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  async function sembunyikan(b: Berkas) {
    if (!window.confirm(`Sembunyikan "${b.judul}" dari daftar peserta? (berkas tidak dihapus dari penyimpanan)`)) return;
    setSibuk(b.id);
    try {
      await fetchJson(URL_INSTRUMEN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "sembunyikan", id: b.id }) });
      setInfo("Berkas disembunyikan.");
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  async function unggah(jenis: Jenis, judul: string, file: File) {
    setSibuk("unggah");
    setGalat(null);
    setInfo(null);
    try {
      const fd = new FormData();
      fd.set("jenis", jenis);
      fd.set("judul", judul);
      fd.set("file", file);
      const res = await fetch(URL_INSTRUMEN, { method: "POST", headers: { Authorization: `Bearer ${bacaSesi() ?? ""}` }, body: fd });
      if (res.status === 401) return keMasuk();
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Gagal (${res.status}).`);
      setInfo(`"${file.name}" berhasil diunggah.`);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  return (
    <Kerangka aktif="instrumen" judul="Instrumen Pelatihan" sub="Kuesioner, buku pedoman, dan PPT materi — dapat diunduh">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}
      {!data && !galat && <Memuat />}
      {data &&
        GRUP.map((g) => {
          const daftar = data.berkas.filter((b) => b.jenis === g.jenis);
          return (
            <Kartu key={g.jenis} judul={`${g.ikon} ${g.judul}`} ket={g.ket}>
              {daftar.length === 0 ? (
                <p className="rounded-lg bg-[#F6F8FB] px-3 py-2.5 text-[13px] text-[#6B7A90]">{g.kosong}</p>
              ) : (
                <ul className="space-y-2">
                  {daftar.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DDE6F3] px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold leading-snug">{b.judul}</p>
                        <p className="text-[11.5px] text-[#6B7A90]">
                          {b.nama_file}
                          {b.ukuran ? ` · ${ukuranTeks(b.ukuran)}` : ""} · diunggah {tglSedang(b.diunggah_at)}
                        </p>
                      </div>
                      <button type="button" className={BTN} disabled={sibuk === b.id} onClick={() => unduh(b)}>
                        {sibuk === b.id ? "Menyiapkan…" : "⬇ Unduh"}
                      </button>
                      {data.boleh_kelola && (
                        <button type="button" className={BTN_R} disabled={sibuk === b.id} onClick={() => sembunyikan(b)}>
                          Sembunyikan
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {data.boleh_kelola && <FormUnggah jenis={g.jenis} terima={g.terima} sibuk={sibuk === "unggah"} onUnggah={unggah} />}
            </Kartu>
          );
        })}
    </Kerangka>
  );
}

function FormUnggah({ jenis, terima, sibuk, onUnggah }: { jenis: Jenis; terima: string; sibuk: boolean; onUnggah: (j: Jenis, judul: string, f: File) => void }) {
  const [judul, setJudul] = useState("");
  const [nama, setNama] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EDF0F4] pt-3">
      <input className={`${INPUT} min-w-[180px] flex-1`} placeholder="Judul (opsional)" value={judul} onChange={(e) => setJudul(e.target.value)} />
      <input ref={ref} type="file" accept={terima} className="hidden" onChange={(e) => setNama(e.target.files?.[0]?.name ?? "")} />
      <button type="button" className={BTN_O} onClick={() => ref.current?.click()}>
        {nama ? `📎 ${nama.length > 28 ? nama.slice(0, 26) + "…" : nama}` : "Pilih berkas…"}
      </button>
      <button
        type="button"
        className={BTN}
        disabled={sibuk || !nama}
        onClick={() => {
          const f = ref.current?.files?.[0];
          if (!f) return;
          onUnggah(jenis, judul, f);
          setJudul("");
          setNama("");
          if (ref.current) ref.current.value = "";
        }}
      >
        {sibuk ? "Mengunggah…" : "⬆ Unggah"}
      </button>
    </div>
  );
}
