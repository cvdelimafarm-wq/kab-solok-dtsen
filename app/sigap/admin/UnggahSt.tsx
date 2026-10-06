"use client";

// app/sigap/admin/UnggahSt.tsx
//
// (5 Okt 2026) Kartu "Unggah PDF Surat Tugas gabungan" -- permintaan user: admin cukup mengunggah 1 PDF
// berisi semua ST. Teks tiap halaman dibaca DI BROWSER dgn pdf.js (CDN), nomor dicari dgn pola
// "NOMOR : B-xxxx/...", halaman tanpa nomor ikut ST sebelumnya. Pratinjau dicocokkan dgn data ST di tabel,
// lalu file + peta {nomor, halaman[] (0-based)} dikirim ke /api/sigap/admin/st-pdf (server memotong & menyimpan).

import { useMemo, useRef, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "./api";
import { BTN_G, BTN_O, Chip, Kartu, Pesan, Putar } from "./ui";
import type { BarisPen } from "./TabPenugasan";

const URL_PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const URL_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
const MAKS_BYTE = 40 * 1024 * 1024;
const POLA_NOMOR = /NOMOR\s*:\s*([A-Z0-9./-]+)/i;
const norm = (s: string) => s.toUpperCase().replace(/\s+/g, "");

type Peta = { nomor: string; halaman: number[] };
type Baca = { nHalaman: number; nTeks: number; peta: Peta[]; tanpaNomorAwal: number[] };
type Hasil = { disimpan: { nomor: string; nama: string | null }[]; tidak_dikenal: string[]; belum_berfile: { nomor: string; nama: string | null }[] };

// Tipe minimal pdf.js yg dipakai (modul dimuat dari CDN, tanpa paket npm).
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }>; destroy?: () => Promise<void> };

let pdfjsCache: PdfJs | null = null;
async function muatPdfJs(): Promise<PdfJs> {
  if (pdfjsCache) return pdfjsCache;
  const mod = (await import(/* webpackIgnore: true */ URL_PDFJS)) as PdfJs;
  mod.GlobalWorkerOptions.workerSrc = URL_WORKER;
  pdfjsCache = mod;
  return mod;
}

/** Baca teks per halaman & susun peta nomor ST -> halaman (0-based). */
async function bacaPdf(file: File): Promise<Baca> {
  const pdfjs = await muatPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const peta: Peta[] = [];
  const tanpaNomorAwal: number[] = [];
  let nTeks = 0;
  let kini: Peta | null = null;
  for (let i = 1; i <= doc.numPages; i++) {
    const hal = await doc.getPage(i);
    const isi = await hal.getTextContent();
    const mentah = isi.items.map((x) => x.str ?? "").join(" ");
    if (mentah.replace(/\s+/g, "").length > 0) nTeks++;
    // rapatkan spasi di sekitar "/" (pdf.js kadang memecah "B-1285 / 13030 / ..."); "-" & "." dibiarkan
    // agar tidak menyambung ke kata sesudah nomor.
    const teks = mentah.replace(/\s*\/\s*/g, "/");
    const m = teks.match(POLA_NOMOR);
    if (m) {
      const nomor = m[1].toUpperCase().replace(/[.\-/]+$/, "");
      const ada: Peta | undefined = peta.find((p) => norm(p.nomor) === norm(nomor));
      kini = ada ?? { nomor, halaman: [] };
      if (!ada) peta.push(kini);
      kini.halaman.push(i - 1);
    } else if (kini) {
      kini.halaman.push(i - 1); // halaman lanjutan ikut ST sebelumnya
    } else {
      tanpaNomorAwal.push(i - 1);
    }
  }
  await doc.destroy?.();
  return { nHalaman: doc.numPages, nTeks, peta, tanpaNomorAwal };
}

export default function UnggahSt({ kegiatanId, baris, onSelesai }: { kegiatanId: number; baris: BarisPen[]; onSelesai: () => void | Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [baca, setBaca] = useState<Baca | null>(null);
  const [tahap, setTahap] = useState<"diam" | "membaca" | "mengirim">("diam");
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [seret, setSeret] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stDb = useMemo(() => {
    const m = new Map<string, BarisPen>();
    for (const b of baris) if (b.st) m.set(norm(b.st.nomor), b);
    return m;
  }, [baris]);
  const cocok = baca ? baca.peta.filter((p) => stDb.has(norm(p.nomor))) : [];
  const tidakCocok = baca ? baca.peta.filter((p) => !stDb.has(norm(p.nomor))) : [];
  const scan = !!baca && baca.nTeks === 0;

  async function pilihFile(f: File | null | undefined) {
    setGalat(null);
    setHasil(null);
    setBaca(null);
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setGalat("Berkas harus PDF.");
    if (f.size > MAKS_BYTE) return setGalat("Ukuran PDF maksimal 40 MB.");
    setFile(f);
    setTahap("membaca");
    try {
      setBaca(await bacaPdf(f));
    } catch (e) {
      setGalat(`Gagal membaca PDF di browser: ${pesanGalat(e)}. Pastikan file tidak rusak/terkunci kata sandi dan koneksi internet tersedia (pembaca PDF dimuat dari CDN).`);
    } finally {
      setTahap("diam");
    }
  }

  async function kirim() {
    if (!file || !baca || cocok.length === 0) return;
    setTahap("mengirim");
    setGalat(null);
    try {
      const fd = new FormData();
      fd.append("kegiatan_id", String(kegiatanId));
      fd.append("file", file);
      fd.append("peta", JSON.stringify(baca.peta));
      const r = await fetchJson<Hasil>("/api/sigap/admin/st-pdf", { method: "POST", body: fd });
      setHasil(r);
      setBaca(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onSelesai();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setTahap("diam");
    }
  }

  return (
    <Kartu judul="Unggah PDF Surat Tugas gabungan">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSeret(true);
        }}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSeret(false);
          pilihFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${seret ? "border-[#1F6FD1] bg-[#E3EEFB]" : "border-[#9FB3D1] bg-[#F8FAFC] hover:bg-[#F3F5F8]"}`}
      >
        <p className="text-[13px] font-bold">
          📄 {file ? file.name : <>Tarik file PDF ke sini atau <u>pilih file</u></>}
        </p>
        <p className="mt-0.5 text-[11.5px] text-[#7B8794]">Sistem membaca nomor ST tiap halaman, memotong, dan menautkan ke petugasnya</p>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pilihFile(e.target.files?.[0])} />
      </div>

      {tahap === "membaca" && (
        <p className="mt-2 flex items-center gap-2 text-[12px] text-[#4D5B6B]">
          <Putar kecil /> Membaca teks setiap halaman…
        </p>
      )}

      {baca && scan && (
        <div className="mt-2">
          <Pesan jenis="peringatan">
            PDF ini tidak berisi teks ({baca.nHalaman} halaman) — tampaknya hasil <b>scan/foto</b>. Nomor ST tidak bisa dibaca otomatis. Gunakan PDF asli hasil ekspor dari aplikasi
            persuratan (bukan hasil scan), atau jalankan OCR dulu sebelum diunggah.
          </Pesan>
        </div>
      )}

      {baca && !scan && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <Chip w="navy">{baca.nHalaman} halaman</Chip>
            <Chip w="navy">{baca.peta.length} ST terbaca</Chip>
            <Chip w="ok">{cocok.length} cocok</Chip>
            {tidakCocok.length > 0 && <Chip w="wait">{tidakCocok.length} tidak dikenali</Chip>}
            {baca.tanpaNomorAwal.length > 0 && <Chip w="mut">{baca.tanpaNomorAwal.length} halaman awal tanpa nomor (diabaikan)</Chip>}
            <span className="flex-1" />
            <button type="button" className={BTN_O} onClick={() => pilihFile(null)} disabled={tahap !== "diam"}>
              Batal
            </button>
            <button type="button" className={BTN_G} onClick={kirim} disabled={tahap !== "diam" || cocok.length === 0}>
              {tahap === "mengirim" ? "Menyimpan…" : `Simpan ${cocok.length} file`}
            </button>
          </div>
          {baca.peta.length === 0 && <Pesan jenis="peringatan">Tidak ada pola “NOMOR : …” yang terbaca di PDF ini. Periksa apakah ini PDF Surat Tugas yang benar.</Pesan>}
          {baca.peta.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-[12px]">
                <tbody>
                  {baca.peta.map((p) => {
                    const b = stDb.get(norm(p.nomor));
                    return (
                      <tr key={p.nomor} className="border-b border-slate-100 last:border-0">
                        <td className="px-2.5 py-1.5 font-semibold">{p.nomor}</td>
                        <td className="px-2.5 py-1.5 text-[#7B8794]">hal. {p.halaman.map((h) => h + 1).join(", ")}</td>
                        <td className="px-2.5 py-1.5">{b ? <Chip w="ok">{b.nama}</Chip> : <Chip w="wait">tidak ada di data ST</Chip>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {tidakCocok.length > 0 && (
            <p className="text-[11.5px] text-[#7B8794]">Nomor yang tidak dikenali tidak disimpan. Isi dulu nomor ST petugasnya di tabel (tombol “Isi ST”), lalu unggah ulang.</p>
          )}
        </div>
      )}

      {galat && (
        <div className="mt-2">
          <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>
        </div>
      )}

      {hasil && (
        <div className="mt-2 space-y-1.5">
          <Pesan jenis="ok" onTutup={() => setHasil(null)}>
            {hasil.disimpan.length} file ST disimpan.
            {hasil.tidak_dikenal.length > 0 && <> {hasil.tidak_dikenal.length} nomor tidak dikenal: {hasil.tidak_dikenal.join(", ")}.</>}
          </Pesan>
          {hasil.belum_berfile.length > 0 && (
            <Pesan jenis="peringatan">
              {hasil.belum_berfile.length} ST masih belum berfile: {hasil.belum_berfile.slice(0, 12).map((x) => x.nama ? `${x.nomor} (${x.nama})` : x.nomor).join(", ")}
              {hasil.belum_berfile.length > 12 ? ", …" : ""}
            </Pesan>
          )}
        </div>
      )}
    </Kartu>
  );
}
