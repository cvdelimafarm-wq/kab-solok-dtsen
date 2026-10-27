"use client";

// app/sigap/foto/BagikanWa.tsx
//
// (27 Okt 2026) Tombol "WhatsApp" dan "Story WhatsApp" untuk foto ber-cap yang SUDAH terkirim (cap resmi dicetak server, jadi foto yang dibagikan = foto resmi).
// Membuka lembar bagikan HP dengan berkas foto (Web Share) beserta keterangan ("Hai, saya berbagi foto pendataan ... Link verifikasi: ..."); petugas memilih WhatsApp, lalu kontak/grup atau "Status saya". Peramban tidak bisa langsung memposting ke Status,
// jadi tombol Story hanya membuka lembar bagikan yang sama dengan petunjuk. Tanpa dukungan bagikan berkas (mis. komputer): foto diunduh. Foto disiapkan lebih dulu supaya
// lembar bagikan terbuka seketika (peramban mensyaratkan bagikan terjadi tepat setelah ketukan). Teks dan pemeriksaan dukungan: lib/bagikanWa.ts.

import { useEffect, useRef, useState } from "react";
import { ambilFotoUrl } from "./klien";
import { bisaBagikanBerkas, namaBerkasFoto, petunjukTujuan, teksBagikanFoto, type InfoFotoBagikan, type TujuanWa } from "@/lib/bagikanWa";

// (27 Okt 2026) Ikon WhatsApp = berkas SVG yang diunggah pemilik (glyph WhatsApp, 32x32, isi dan garis tepi satu warna). Jalurnya dipakai apa adanya (tidak digambar ulang);
// warna mengikuti teks tombol (currentColor): putih pada tombol hijau, hijau WhatsApp (#25D366) pada tombol berbingkai.
const JALUR_WA = "M26.576 5.363c-2.69-2.69-6.406-4.354-10.511-4.354-8.209 0-14.865 6.655-14.865 14.865 0 2.732 0.737 5.291 2.022 7.491l-0.038-0.070-2.109 7.702 7.879-2.067c2.051 1.139 4.498 1.809 7.102 1.809h0.006c8.209-0.003 14.862-6.659 14.862-14.868 0-4.103-1.662-7.817-4.349-10.507l0 0zM16.062 28.228h-0.005c-0 0-0.001 0-0.001 0-2.319 0-4.489-0.64-6.342-1.753l0.056 0.031-0.451-0.267-4.675 1.227 1.247-4.559-0.294-0.467c-1.185-1.862-1.889-4.131-1.889-6.565 0-6.822 5.531-12.353 12.353-12.353s12.353 5.531 12.353 12.353c0 6.822-5.53 12.353-12.353 12.353h-0zM22.838 18.977c-0.371-0.186-2.197-1.083-2.537-1.208-0.341-0.124-0.589-0.185-0.837 0.187-0.246 0.371-0.958 1.207-1.175 1.455-0.216 0.249-0.434 0.279-0.805 0.094-1.15-0.466-2.138-1.087-2.997-1.852l0.010 0.009c-0.799-0.74-1.484-1.587-2.037-2.521l-0.028-0.052c-0.216-0.371-0.023-0.572 0.162-0.757 0.167-0.166 0.372-0.434 0.557-0.65 0.146-0.179 0.271-0.384 0.366-0.604l0.006-0.017c0.043-0.087 0.068-0.188 0.068-0.296 0-0.131-0.037-0.253-0.101-0.357l0.002 0.003c-0.094-0.186-0.836-2.014-1.145-2.758-0.302-0.724-0.609-0.625-0.836-0.637-0.216-0.010-0.464-0.012-0.712-0.012-0.395 0.010-0.746 0.188-0.988 0.463l-0.001 0.002c-0.802 0.761-1.3 1.834-1.3 3.023 0 0.026 0 0.053 0.001 0.079l-0-0.004c0.131 1.467 0.681 2.784 1.527 3.857l-0.012-0.015c1.604 2.379 3.742 4.282 6.251 5.564l0.094 0.043c0.548 0.248 1.25 0.513 1.968 0.74l0.149 0.041c0.442 0.14 0.951 0.221 1.479 0.221 0.303 0 0.601-0.027 0.889-0.078l-0.031 0.004c1.069-0.223 1.956-0.868 2.497-1.749l0.009-0.017c0.165-0.366 0.261-0.793 0.261-1.242 0-0.185-0.016-0.366-0.047-0.542l0.003 0.019c-0.092-0.155-0.34-0.247-0.712-0.434z";
function IkonWa({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" stroke="currentColor" aria-hidden="true">
      <path d={JALUR_WA} />
    </svg>
  );
}

/** `ringkas` = tanpa judul dan petunjuk panjang (dipakai di penampil foto layar penuh). */
export default function BagikanWa({ fotoId, kode, lokasi, diambil_at, kegiatan, ringkas = false }: { fotoId: number; ringkas?: boolean } & InfoFotoBagikan) {
  const [berkas, setBerkas] = useState<File | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const dibatalkan = useRef(false);

  useEffect(() => {
    dibatalkan.current = false;
    setBerkas(null);
    setGalat(null);
    let url: string | null = null;
    (async () => {
      try {
        url = await ambilFotoUrl(fotoId);
        const blob = await (await fetch(url)).blob();
        if (!dibatalkan.current) setBerkas(new File([blob], namaBerkasFoto(kode), { type: blob.type || "image/jpeg" }));
      } catch (e) {
        if (!dibatalkan.current) setGalat(e instanceof Error && e.message ? e.message : "Foto tidak bisa disiapkan.");
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    })();
    return () => {
      dibatalkan.current = true;
    };
  }, [fotoId, kode]);

  async function bagikan(tujuan: TujuanWa) {
    if (!berkas || sibuk) return;
    setPesan(null);
    setSibuk(true);
    try {
      const asal = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin; // sama dengan isi QR pada cap
      const teks = teksBagikanFoto({ kode, lokasi, diambil_at, kegiatan, asal });
      if (typeof navigator !== "undefined" && bisaBagikanBerkas(navigator as unknown as Parameters<typeof bisaBagikanBerkas>[0], berkas)) {
        try {
          await navigator.share({ files: [berkas], text: teks, title: "Foto kegiatan" });
          setPesan(petunjukTujuan(tujuan));
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return; // petugas menutup lembar bagikan
          // gagal lain: jatuh ke unduhan
        }
      }
      const url = URL.createObjectURL(berkas);
      const a = document.createElement("a");
      a.href = url;
      a.download = berkas.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setPesan(tujuan === "status" ? "Foto diunduh ke HP. Buka WhatsApp > Status, lalu pilih foto ini dari galeri." : "Foto diunduh ke HP. Buka WhatsApp, lalu lampirkan foto ini dari galeri.");
    } finally {
      setSibuk(false);
    }
  }

  const siap = !!berkas && !galat;
  const dasar = "flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold disabled:opacity-50";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#C9D3E6] bg-white p-3" aria-label="Bagikan foto ke WhatsApp">
      {!ringkas && <div className="text-sm font-bold text-[#0F2A52]">Bagikan foto resmi (ber-cap)</div>}
      <div className="flex gap-2">
        <button type="button" disabled={!siap || sibuk} onClick={() => void bagikan("chat")} className={`${dasar} bg-[#1FA855] text-white`}>
          <IkonWa /> WhatsApp
        </button>
        <button type="button" disabled={!siap || sibuk} onClick={() => void bagikan("status")} className={`${dasar} border-2 border-[#25D366] bg-white text-[#12703A]`}>
          <IkonWa className="h-5 w-5 text-[#25D366]" /> Story WhatsApp
        </button>
      </div>
      {!siap && !galat && <p className="text-xs text-[#6B7A90]" role="status">Menyiapkan foto…</p>}
      {galat && <p className="text-xs font-semibold text-[#9B1C23]" role="alert">{galat}</p>}
      {pesan && <p className="rounded-lg bg-[#E3F6EC] px-3 py-2 text-xs font-semibold text-[#0B6B3F]" role="status">{pesan}</p>}
      {!ringkas && <p className="text-[11px] leading-snug text-[#6B7A90]">Story: lembar bagikan HP terbuka, pilih WhatsApp lalu &quot;Status saya&quot;. Foto memuat cap lokasi dan waktu resmi.</p>}
    </div>
  );
}
