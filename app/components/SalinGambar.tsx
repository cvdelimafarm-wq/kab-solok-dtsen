"use client";

// app/components/SalinGambar.tsx
//
// (2 Nov 2026) Tombol "Salin sebagai gambar" untuk grafik dan peta di seluruh sistem. Bungkus grafik dengan <SalinGambar nama="...">;
// bagian yang dibungkus difoto (html2canvas, dimuat saat diperlukan) lalu disalin ke papan klip sebagai PNG supaya bisa langsung
// ditempel di WhatsApp atau dokumen. Bila peramban tidak bisa menyalin gambar: dibagikan lewat lembar bagikan (HP), lalu diunduh.
// Tombol berada DI LUAR area yang difoto, jadi tidak ikut tampil di gambar.

import { useRef, useState, type ReactNode } from "react";

/** Nama berkas aman: huruf kecil, tanpa spasi/simbol, diakhiri tanggal ("peta-jadwal-seruti-2026-11-02.png"). */
export function namaBerkasGambar(judul: string, tanggal: string): string {
  const dasar = judul.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "grafik";
  return `${dasar}-${tanggal}.png`;
}

export type HasilSalin = "disalin" | "dibagikan" | "diunduh" | "batal";

/**
 * Menyalin PNG ke papan klip; jika tidak didukung, membagikan berkas (HP); jika tidak bisa juga, mengunduh.
 * `pembuat` diberikan sebagai Promise langsung ke ClipboardItem supaya tetap dalam satu ketukan (syarat Safari).
 */
export async function salinAtauBagikanGambar(pembuat: Promise<Blob>, nama: string): Promise<HasilSalin> {
  pembuat.catch(() => undefined); // galat ditangani pemanggil lewat await di bawah
  try {
    if (typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pembuat })]);
      return "disalin";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "batal";
    /* lanjut ke cadangan */
  }
  const blob = await pembuat;
  const berkas = new File([blob], nama, { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [berkas] })) {
    try {
      await navigator.share({ files: [berkas], title: nama });
      return "dibagikan";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "batal";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "diunduh";
}

async function fotoElemen(el: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const kanvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
  return new Promise<Blob>((ok, gagal) => kanvas.toBlob((b) => (b ? ok(b) : gagal(new Error("Gambar gagal dibuat."))), "image/png"));
}

const PESAN: Record<HasilSalin, string> = {
  disalin: "Gambar disalin. Tempelkan di WhatsApp atau dokumen.",
  dibagikan: "Gambar dibagikan.",
  diunduh: "Peramban ini tidak bisa menyalin gambar, jadi gambar diunduh.",
  batal: "",
};

export default function SalinGambar({ nama, children, className = "", rata = "kanan" }: { nama: string; children: ReactNode; className?: string; rata?: "kanan" | "kiri" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ teks: string; galat: boolean } | null>(null);

  async function salin() {
    if (sibuk || !ref.current) return;
    setSibuk(true);
    setPesan(null);
    try {
      const hari = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // WIB
      const hasil = await salinAtauBagikanGambar(fotoElemen(ref.current), namaBerkasGambar(nama, hari));
      if (hasil !== "batal") setPesan({ teks: PESAN[hasil], galat: false });
    } catch (e) {
      setPesan({ teks: e instanceof Error && e.message ? e.message : "Gagal membuat gambar.", galat: true });
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className={className}>
      <div ref={ref}>{children}</div>
      <div className={`mt-1.5 flex flex-wrap items-center gap-2 ${rata === "kanan" ? "justify-end" : "justify-start"}`}>
        {pesan && <span role="status" className={`text-[12px] font-semibold ${pesan.galat ? "text-[#B42318]" : "text-[#14653A]"}`}>{pesan.teks}</span>}
        <button type="button" onClick={salin} disabled={sibuk} aria-label={`Salin ${nama} sebagai gambar`}
          className="min-h-[34px] rounded-md border border-[#C5D0E2] bg-white px-2.5 text-[12.5px] font-semibold text-[#1B2B4B] hover:bg-[#EEF2F7] disabled:opacity-60">
          <span aria-hidden className="mr-1">📋</span>{sibuk ? "Membuat gambar…" : "Salin sebagai gambar"}
        </button>
      </div>
    </div>
  );
}
