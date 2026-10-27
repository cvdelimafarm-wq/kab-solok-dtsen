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

// (27 Okt 2026) Ikon sederhana buatan sendiri (garis rapi 2 px, ukuran ikon sama): gelembung obrolan berpanah = kirim ke obrolan; lingkaran putus-putus bertanda plus = Story/Status.
// Sengaja bukan tiruan logo resmi WhatsApp (gambar logo resmi mudah tampak berantakan bila digambar ulang); nama "WhatsApp" tetap tertulis di tombol.
function IkonObrolan({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.4V16h-.5A2.5 2.5 0 0 1 4 13.5v-8A2.5 2.5 0 0 1 6.5 3z" />
      <path d="M8.5 9.5H15M12.5 7l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

function IkonStory({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3.2 2.6" />
      <path d="M12 8.5v7M8.5 12h7" />
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
          <IkonObrolan /> WhatsApp
        </button>
        <button type="button" disabled={!siap || sibuk} onClick={() => void bagikan("status")} className={`${dasar} border-2 border-[#1FA855] bg-white text-[#12703A]`}>
          <IkonStory /> Story WhatsApp
        </button>
      </div>
      {!siap && !galat && <p className="text-xs text-[#6B7A90]" role="status">Menyiapkan foto…</p>}
      {galat && <p className="text-xs font-semibold text-[#9B1C23]" role="alert">{galat}</p>}
      {pesan && <p className="rounded-lg bg-[#E3F6EC] px-3 py-2 text-xs font-semibold text-[#0B6B3F]" role="status">{pesan}</p>}
      {!ringkas && <p className="text-[11px] leading-snug text-[#6B7A90]">Story: lembar bagikan HP terbuka, pilih WhatsApp lalu &quot;Status saya&quot;. Foto memuat cap lokasi dan waktu resmi.</p>}
    </div>
  );
}
