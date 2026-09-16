"use client";

import { useEffect, useRef, useState } from "react";

// ============================================================================
// Tab "Anomali Cepat AI" — DEMO/PROTOTIPE tampilan alur input yang "kelihatan
// canggih" (upload scan PDF kuesioner → AI baca & deteksi anomali otomatis).
// Fitur analisis-nya SENGAJA belum diaktifkan: begitu proses "AI" selesai
// jalan, selalu berakhir di kartu peringatan yang mengarahkan ke jalur resmi
// (entri data manual ke kantor / tab Anomali Cepat & Kelola Anomali yang
// memang sudah berfungsi). Tidak ada file yang benar-benar diunggah/diproses
// ke server di tab ini.
// ============================================================================

type Tahap = "idle" | "proses" | "diblokir";
type JenisKuesioner = "KP" | "M";

const LANGKAH_PROSES = [
  "Mengunggah dokumen...",
  "Membaca hasil scan (OCR)...",
  "Mengekstrak jawaban kuesioner...",
  "Menjalankan model deteksi anomali...",
];

function formatUkuran(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AnomaliCepatAiTab() {
  const [tahap, setTahap] = useState<Tahap>("idle");
  const [jenis, setJenis] = useState<JenisKuesioner>("KP");
  const [nks, setNks] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [langkahAktif, setLangkahAktif] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  function pilihFile(f: File | null) {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setFileError("Hanya file PDF hasil scan kuesioner yang didukung.");
      return;
    }
    setFileError(null);
    setFile(f);
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function mulaiProses() {
    if (!file) return;
    setTahap("proses");
    setLangkahAktif(0);
    for (let i = 0; i < LANGKAH_PROSES.length; i++) {
      await sleep(850);
      if (!isMounted.current) return;
      setLangkahAktif(i + 1);
    }
    await sleep(500);
    if (!isMounted.current) return;
    setTahap("diblokir");
  }

  function ulangi() {
    setTahap("idle");
    setLangkahAktif(0);
    setFile(null);
    setFileError(null);
  }

  return (
    <div className="space-y-4 pb-6">
      {/* ---------- Header hero ---------- */}
      <div className="relative overflow-hidden rounded-xl border border-navy-700/20 bg-gradient-to-br from-navy-900 via-navy-700 to-navy-400 p-5 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/5 blur-xl" />
        <div className="relative flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">
              ✨ AI &middot; Beta
            </span>
            <h1 className="mt-2 text-lg font-bold sm:text-xl">Anomali Cepat AI</h1>
            <p className="mt-1 max-w-md text-xs text-white/80 sm:text-sm">
              Unggah hasil scan kuesioner (PDF) — AI otomatis membaca jawaban dan mendeteksi
              anomali tanpa perlu entri data manual.
            </p>
          </div>
          <div className="hidden shrink-0 text-4xl sm:block">🤖</div>
        </div>
      </div>

      {/* ---------- Form input (tahap idle) ---------- */}
      {tahap === "idle" && (
        <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-ink/70">Jenis Kuesioner</label>
              <select
                value={jenis}
                onChange={(e) => setJenis(e.target.value as JenisKuesioner)}
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
              >
                <option value="KP">VSEN26.KP</option>
                <option value="M">VSEN26.M</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink/70">NKS (opsional)</label>
              <input
                type="text"
                value={nks}
                onChange={(e) => setNks(e.target.value)}
                placeholder="Contoh: 00068"
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
              />
            </div>
          </div>

          <label className="mt-3 block text-xs font-medium text-ink/70">Scan Kuesioner (PDF)</label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pilihFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-1 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
              dragOver ? "border-navy-700 bg-navy-50" : "border-line bg-paper/40 hover:border-navy-400"
            }`}
          >
            <span className="text-2xl">📄</span>
            {file ? (
              <>
                <p className="text-sm font-medium text-navy-900">{file.name}</p>
                <p className="text-xs text-ink/50">{formatUkuran(file.size)} &middot; siap diproses</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-navy-900">Seret &amp; lepas file PDF di sini</p>
                <p className="text-xs text-ink/50">atau klik untuk memilih file dari perangkat</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => pilihFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {fileError && <p className="mt-1.5 text-xs text-rust-700">⚠ {fileError}</p>}

          <button
            type="button"
            onClick={mulaiProses}
            disabled={!file}
            className="mt-4 w-full rounded-md bg-navy-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✨ Proses dengan AI
          </button>
          <p className="mt-2 text-center text-[11px] text-ink/40">
            Dokumen tidak dikirim ke mana pun sampai Anda menekan tombol di atas.
          </p>
        </div>
      )}

      {/* ---------- Animasi proses ---------- */}
      {tahap === "proses" && (
        <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-navy-900">
            Memproses{" "}
            <span className="font-mono text-navy-700">{file?.name}</span>
            {nks && <span className="text-ink/50"> &middot; NKS {nks}</span>}
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            {LANGKAH_PROSES.map((label, i) => {
              const selesai = i < langkahAktif;
              const aktif = i === langkahAktif;
              return (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                      selesai
                        ? "bg-moss-500 text-white"
                        : aktif
                        ? "animate-pulse bg-navy-700 text-white"
                        : "bg-line text-ink/40"
                    }`}
                  >
                    {selesai ? "✓" : i + 1}
                  </span>
                  <span className={selesai ? "text-ink/50 line-through" : aktif ? "font-medium text-navy-900" : "text-ink/40"}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-navy-700 transition-all duration-500"
              style={{ width: `${(langkahAktif / LANGKAH_PROSES.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ---------- Hasil: fitur dimatikan ---------- */}
      {tahap === "diblokir" && (
        <div className="rounded-xl border border-gold-400/60 bg-gold-100 p-5 text-center shadow-sm">
          <span className="text-3xl">⚠️</span>
          <p className="mt-2 text-sm font-bold text-gold-600 sm:text-base">
            Maaf, saat ini fitur analisis anomali otomatis (AI) sedang dimatikan.
          </p>
          <p className="mt-1.5 text-xs text-ink/70 sm:text-sm">
            Silakan eksekusi dengan entri data ke kantor — gunakan menu{" "}
            <span className="font-semibold text-navy-900">Anomali Cepat</span> (upload DBF hasil entri)
            atau <span className="font-semibold text-navy-900">Kelola Anomali</span> yang sudah berjalan normal.
          </p>
          <button
            type="button"
            onClick={ulangi}
            className="mt-4 rounded-md border border-navy-700 bg-white px-4 py-2 text-xs font-semibold text-navy-700 hover:bg-navy-50"
          >
            ↺ Coba Lagi
          </button>
        </div>
      )}
    </div>
  );
}
