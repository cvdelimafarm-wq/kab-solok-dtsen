"use client";

// app/components/TombolKembali.tsx
//
// (23 Okt 2026, audit navigasi Tahap 1) SATU tombol "Kembali" untuk seluruh SIGAP: ikon "‹" + nama tujuan ("‹ Kelola Pendataan"), posisi kiri atas,
// tinggi sentuh 44 px. Menggantikan tujuh bentuk lama (bulat "‹" berlabel/tanpa label, pil "‹ Kembali", pil "Tahapan", teks kecil, "← Daftar kegiatan", ...).
// Tujuan (lib/sigapNavigasi.ts, tujuanKembali): ?dari= bila ada dan aman (hanya jalur internal), kalau tidak induk logis halaman, kalau tidak Beranda.
// Perilaku riwayat memakai keAtas (app/portal/navigasi.ts): bila halaman sebelumnya memang tujuannya -> router.back() (riwayat tidak menumpuk),
// selain itu router.replace(tujuan). `tema`: "gelap" di atas header navy, "terang" di atas latar terang.
// `induk` = tujuan bawaan khusus halaman ini bila tak ada ?dari=; `onKlik` = perilaku sendiri (mis. menutup layar bagian dalam dulu) dengan `label` yang sesuai.

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { bacaJejak, keAtas } from "@/app/portal/navigasi";
import { bersihkanPath, cariSebelumnya, dariAman, indukDari, labelTujuan, sebelumnyaDariJejak } from "@/lib/sigapNavigasi";

// (30 Okt 2026) Halaman sebelumnya yang SEBENARNYA (riwayat peramban), lihat lib/sigapNavigasi.ts cariSebelumnya.
type NavApi = { currentEntry?: { index: number } | null; entries?: () => { url?: string }[] };
function sebelumnyaNyata(): string | null {
  try {
    const nav = (window as unknown as { navigation?: NavApi }).navigation;
    if (nav && typeof nav.entries === "function" && nav.currentEntry) return cariSebelumnya(nav.entries().map((e) => e.url ?? ""), nav.currentEntry.index, window.location.origin);
  } catch {
    /* lanjut ke jejak */
  }
  return sebelumnyaDariJejak(bacaJejak());
}

type Props = {
  tema?: "gelap" | "terang";
  /** Tujuan bawaan halaman ini bila tidak ada ?dari= yang valid (menggantikan induk logis). */
  induk?: string;
  /** Label sendiri (wajib bila memakai onKlik). */
  label?: string;
  /** Perilaku sendiri; bila ada, navigasi otomatis tidak dijalankan. */
  onKlik?: () => void;
  className?: string;
};

export default function TombolKembali({ tema = "gelap", induk, label, onKlik, className = "" }: Props) {
  const router = useRouter();
  const path = usePathname() || "/";
  const [dari, setDari] = useState<string | null>(null);
  const [sebelum, setSebelum] = useState<string | null>(null);
  useEffect(() => {
    try {
      setDari(new URLSearchParams(window.location.search).get("dari"));
    } catch {
      setDari(null);
    }
    setSebelum(sebelumnyaNyata());
  }, [path]);

  // ?dari= valid (bukan halaman ini sendiri) > `induk` halaman > induk logis > Beranda
  const d = dariAman(dari);
  const dariSah = d !== null && bersihkanPath(d) !== bersihkanPath(path);
  const href = dariSah && d ? d : induk ?? indukDari(path) ?? "/";
  // (30 Okt 2026) bila ada halaman sebelumnya di aplikasi, itulah tujuannya (satu langkah persis, sama dengan Back HP); ?dari= / induk hanya cadangan
  const teks = label ?? labelTujuan(sebelum ?? href);

  const warna =
    tema === "gelap"
      ? "bg-white/15 text-white active:bg-white/25"
      : "border border-[#D5DCE7] bg-white text-[#1B2B4B] active:bg-[#EAF1FC]";

  return (
    <button
      type="button"
      onClick={() => {
        if (onKlik) return onKlik();
        if (sebelumnyaNyata()) window.history.back();
        else keAtas(router, href);
      }}
      aria-label={`Kembali ke ${teks}`}
      className={`inline-flex min-h-[44px] max-w-full items-center gap-1 rounded-full pl-2.5 pr-3.5 text-[13px] font-bold ${warna} ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] flex-none fill-none stroke-current stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="truncate">{teks}</span>
    </button>
  );
}
