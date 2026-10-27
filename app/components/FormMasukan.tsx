"use client";

// app/components/FormMasukan.tsx
//
// (28 Okt 2026) Isian masukan (jenis, uraian, tangkapan layar opsional). Dipakai oleh lembar geser dari tombol melayang (TombolMasukan) dan halaman
// /sigap/masukan. Halaman, versi aplikasi, dan perangkat terisi otomatis; peran diisi server dari akun. Draf uraian disimpan di HP sampai terkirim.
// Mode "masuk sebagai" (simulasi) tidak mengirim apa pun: pesan jelas ditampilkan.

import { useEffect, useRef, useState } from "react";
import { kirimMultipart } from "@/app/sigap/foto/klien";
import { GAMBAR_MAKS_BYTE, ISI_MAKS, ISI_MIN, JENIS_MASUKAN, LABEL_JENIS, ringkasPerangkat, type JenisMasukan } from "@/lib/sigapMasukan";

const KUNCI_DRAF = "sigap_masukan_draf_v1";
const SISI_MAKS = 1280;

function bacaDraf(): { jenis: JenisMasukan; isi: string } | null {
  try {
    const o = JSON.parse(localStorage.getItem(KUNCI_DRAF) || "null") as { jenis?: unknown; isi?: unknown } | null;
    if (!o || typeof o.isi !== "string") return null;
    return { jenis: (JENIS_MASUKAN as readonly string[]).includes(String(o.jenis)) ? (o.jenis as JenisMasukan) : "saran", isi: o.isi.slice(0, ISI_MAKS) };
  } catch {
    return null;
  }
}
function simpanDraf(jenis: JenisMasukan, isi: string) {
  try {
    if (isi.trim()) localStorage.setItem(KUNCI_DRAF, JSON.stringify({ jenis, isi }));
    else localStorage.removeItem(KUNCI_DRAF);
  } catch {
    /* penyimpanan tidak tersedia: draf tidak diingat */
  }
}

/** Mengecilkan tangkapan layar (sisi terpanjang <= 1280 px, JPEG) supaya unggahan ringan di jaringan lambat; gagal -> berkas asli bila masih di bawah batas. */
async function kecilkan(f: File): Promise<File | null> {
  try {
    const bmp = await createImageBitmap(f);
    const skala = Math.min(1, SISI_MAKS / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * skala));
    c.height = Math.max(1, Math.round(bmp.height * skala));
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.8));
    if (blob && blob.size > 0) return new File([blob], "layar.jpg", { type: "image/jpeg" });
  } catch {
    /* lanjut ke berkas asli */
  }
  return f.size <= GAMBAR_MAKS_BYTE ? f : null;
}

export default function FormMasukan({ halaman, onSelesai, autoFokus = false }: { halaman?: string; onSelesai?: () => void; autoFokus?: boolean }) {
  const [jenis, setJenis] = useState<JenisMasukan>("saran");
  const [isi, setIsi] = useState("");
  const [gambar, setGambar] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [terkirim, setTerkirim] = useState(false);
  const berkasRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = bacaDraf();
    if (d) {
      setJenis(d.jenis);
      setIsi(d.isi);
    }
  }, []);

  useEffect(() => {
    if (!gambar) return setPratinjau(null);
    const u = URL.createObjectURL(gambar);
    setPratinjau(u);
    return () => URL.revokeObjectURL(u);
  }, [gambar]);

  function ubahIsi(v: string, j: JenisMasukan = jenis) {
    setIsi(v.slice(0, ISI_MAKS));
    simpanDraf(j, v.slice(0, ISI_MAKS));
  }

  async function pilihBerkas(f: File | undefined) {
    if (!f) return;
    setGalat(null);
    const k = await kecilkan(f);
    if (!k) return setGalat("Tangkapan layar terlalu besar atau tidak bisa dibaca.");
    setGambar(k);
  }

  async function kirimMasukan() {
    if (kirim) return;
    setGalat(null);
    if (isi.trim().length < ISI_MIN) return setGalat(`Tulis masukan minimal ${ISI_MIN} karakter.`);
    setKirim(true);
    try {
      const f = new FormData();
      f.set("jenis", jenis);
      f.set("isi", isi);
      f.set("halaman", halaman ?? window.location.pathname);
      f.set("versi", (process.env.NEXT_PUBLIC_BUILD_ID ?? "").slice(0, 8));
      const mandiri = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      f.set("perangkat", ringkasPerangkat(navigator.userAgent, !!mandiri));
      if (gambar) f.set("gambar", gambar);
      const h = await kirimMultipart<{ ok: boolean; id: number }>("/api/sigap/masukan", f);
      if (h.simulasi) return setGalat('Anda sedang dalam mode "Lihat sebagai" (simulasi): masukan tidak dikirim. Keluar dari simulasi untuk mengirim.');
      simpanDraf(jenis, "");
      setIsi("");
      setGambar(null);
      setTerkirim(true);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setGalat(m === "SESI_BERAKHIR" ? "Sesi berakhir. Masuk lagi, lalu kirim ulang (tulisan Anda tersimpan)." : m || "Gagal mengirim. Periksa sambungan, lalu coba lagi.");
    } finally {
      setKirim(false);
    }
  }

  if (terkirim)
    return (
      <div className="py-6 text-center" role="status">
        <p className="text-[16px] font-extrabold text-[#0F2A52]">Terima kasih, masukan terkirim</p>
        <p className="mt-1 text-[13px] text-[#5B6B84]">Admin akan membacanya. Statusnya bisa Anda lihat di halaman &quot;Masukan saya&quot;.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => setTerkirim(false)} className="min-h-[44px] rounded-xl border border-[#CDD5DE] px-4 text-[13.5px] font-bold text-[#1B2B4B]">
            Kirim lagi
          </button>
          {onSelesai && (
            <button type="button" onClick={onSelesai} className="min-h-[44px] rounded-xl bg-[#1F5FD1] px-5 text-[13.5px] font-bold text-white">
              Selesai
            </button>
          )}
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void kirimMasukan();
      }}
      className="space-y-3"
    >
      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-bold text-[#4D5B6B]">Jenis masukan</legend>
        <div className="flex flex-wrap gap-1.5">
          {JENIS_MASUKAN.map((j) => (
            <button
              key={j}
              type="button"
              aria-pressed={jenis === j}
              onClick={() => {
                setJenis(j);
                simpanDraf(j, isi);
              }}
              className={`min-h-[40px] rounded-full border px-3.5 text-[13px] font-bold ${jenis === j ? "border-[#1F5FD1] bg-[#E3EEFB] text-[#1F5FD1]" : "border-[#CDD5DE] bg-white text-[#4D5B6B]"}`}
            >
              {LABEL_JENIS[j]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-[12.5px] font-bold text-[#4D5B6B]">
          {jenis === "galat" ? "Apa yang salah? Apa yang Anda lakukan sebelumnya?" : jenis === "pertanyaan" ? "Apa yang ingin Anda tanyakan?" : "Apa yang sebaiknya diperbaiki atau ditambah?"}
        </span>
        <textarea
          value={isi}
          onChange={(e) => ubahIsi(e.target.value)}
          rows={5}
          maxLength={ISI_MAKS}
          autoFocus={autoFokus}
          placeholder="Tulis dengan singkat dan jelas"
          className="w-full resize-y rounded-xl border border-[#CDD5DE] bg-white px-3 py-2.5 text-[16px] leading-snug text-[#14202E] outline-none focus:border-[#1F5FD1] focus:ring-2 focus:ring-[#1F5FD1]/25"
        />
        <span className="mt-0.5 block text-right text-[11.5px] text-[#7B8794]">
          {isi.length}/{ISI_MAKS}
        </span>
      </label>

      <div>
        <input ref={berkasRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { void pilihBerkas(e.target.files?.[0]); e.target.value = ""; }} />
        {pratinjau ? (
          <div className="flex items-center gap-3 rounded-xl border border-[#E3E8EE] bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pratinjau} alt="Pratinjau tangkapan layar" className="h-16 w-16 flex-none rounded-lg object-cover" />
            <span className="min-w-0 flex-1 text-[12.5px] text-[#4D5B6B]">Tangkapan layar terlampir</span>
            <button type="button" onClick={() => setGambar(null)} className="min-h-[40px] flex-none rounded-lg px-3 text-[12.5px] font-bold text-red-700">
              Lepas
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => berkasRef.current?.click()} className="min-h-[44px] w-full rounded-xl border border-dashed border-[#9FB3CF] bg-[#F8FAFE] px-3 text-[13px] font-bold text-[#1F5FD1]">
            + Lampirkan tangkapan layar (opsional)
          </button>
        )}
      </div>

      <p className="text-[11.5px] leading-snug text-[#7B8794]">Halaman, peran, versi aplikasi, dan jenis perangkat ikut terkirim otomatis untuk membantu menelusuri masalah.</p>

      {galat && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
          {galat}
        </p>
      )}

      <button type="submit" disabled={kirim || isi.trim().length < ISI_MIN} className="min-h-[48px] w-full rounded-xl bg-[#1F5FD1] text-[14.5px] font-extrabold text-white disabled:opacity-50">
        {kirim ? "Mengirim…" : "Kirim masukan"}
      </button>
    </form>
  );
}
