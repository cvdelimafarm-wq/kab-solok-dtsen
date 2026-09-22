"use client";

// app/penyisiran/_shared/kartu-monitoring.tsx
//
// Potongan UI BERSAMA utk "kartu monitoring bisa-difoto" -- gaya yg
// dipakai pertama kali di kartu "📋 Rekap Pendataan PPL"
// (app/penyisiran/perencanaan-lapangan.tsx, SeksiPemilihanSubsls,
// permintaan user "miripkan dengan [contoh desain]") lalu DITARIK ke sini
// (permintaan lanjutan user: "terapkan desain serupa + tombol salin
// gambar ke tabel monitoring lain juga") supaya SEMUA tabel monitoring di
// app ini (app/penyisiran/monitoring-terpadu.tsx, dan kartu Rekap
// Pendataan PPL sendiri) memakai SATU sumber warna/komponen -- bukan studi
// desain baru per tabel, cuma disusun ulang pakai potongan yg sama.
//
// KARENA kolom tabel tiap kartu monitoring BEDA2 (mis. Konflik Alokasi PPL
// tidak punya "progress", Kelengkapan SPJ ttg status Ada/Tidak, bukan
// persentase), file ini SENGAJA cuma menyediakan POTONGAN kecil (StatPill,
// bar progress berwarna, titik legenda, hook salin-gambar) -- BUKAN 1
// komponen tabel monolitik spt KontenRekapPpl di perencanaan-lapangan.tsx
// (itu tetap lokal di sana krn kolomnya spesifik). Setiap Seksi di
// monitoring-terpadu.tsx menyusun sendiri banner+table+footer-nya pakai
// potongan2 ini, supaya tetap fleksibel per tabel tapi tetap konsisten
// warna/gaya-nya.
//
// Ambang & warna progress SAMA PERSIS dgn KontenRekapPpl: >=80% hijau
// (Baik), 50-79% kuning (Perlu Perhatian), <50% merah (Perlu Tindak
// Lanjut). "noData" (abu2, "Belum Ada Data") dipakai kalau PENYEBUTnya 0
// (mis. Jumlah KK=0) -- beda dari 0% sungguhan (penyebut>0, pembilang=0).

import { useState } from "react";

export function progresMeta(pembilang: number, penyebut: number): { pct: number; noData: boolean; warna: string } {
  if (penyebut <= 0) return { pct: 0, noData: true, warna: "#9CA3AF" };
  const pct = Math.round((pembilang / penyebut) * 100);
  if (pct >= 80) return { pct, noData: false, warna: "#16A34A" };
  if (pct >= 50) return { pct, noData: false, warna: "#D97706" };
  return { pct, noData: false, warna: "#DC2626" };
}

export function BarProgres({ pembilang, penyebut }: { pembilang: number; penyebut: number }) {
  const m = progresMeta(pembilang, penyebut);
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[#E5E7EB]">
        <div
          className="h-full rounded-full"
          style={{ width: m.noData ? "100%" : `${Math.min(100, m.pct)}%`, backgroundColor: m.warna }}
        />
      </div>
      <span className="w-9 text-right text-[11px] font-bold tabular-nums" style={{ color: m.warna }}>
        {m.pct}%
      </span>
    </div>
  );
}

// "Stat pill" di kanan header banner (mis. Update Data/Total PPL/Total
// KK) -- gaya kotak biru muda spt contoh desain acuan.
export function StatPill({ ikon, label, nilai }: { ikon: string; label: string; nilai: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#BFD7F5] bg-[#EFF6FF] px-3 py-2">
      <span className="text-base leading-none">{ikon}</span>
      <div className="leading-tight">
        <p className="text-[9px] font-medium uppercase tracking-wide text-navy-700/70">{label}</p>
        <p className="text-sm font-bold text-navy-900">{nilai}</p>
      </div>
    </div>
  );
}

export function LegendaTitik({ warna, label }: { warna: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink/70">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: warna }} />
      {label}
    </span>
  );
}

// Baris legenda SIAP PAKAI utk 4 ambang progress standar (dipakai berulang
// di banyak kartu) -- kartu yg butuh legenda beda (mis. bukan progress %)
// menyusun sendiri pakai LegendaTitik langsung.
export function LegendaProgresStandar() {
  return (
    <div className="flex flex-wrap gap-3">
      <LegendaTitik warna="#16A34A" label="≥ 80% (Baik)" />
      <LegendaTitik warna="#D97706" label="50% - 79% (Perlu Perhatian)" />
      <LegendaTitik warna="#DC2626" label="< 50% (Perlu Tindak Lanjut)" />
      <LegendaTitik warna="#9CA3AF" label="Belum Ada Data" />
    </div>
  );
}

// Banner header kartu (ikon kotak biru + judul + subjudul + stat pill di
// kanan) -- baris paling atas SEMUA kartu monitoring yg sudah dirombak.
export function BannerKartu({
  ikon,
  judul,
  subjudul,
  children,
}: {
  ikon: string;
  judul: string;
  subjudul: string;
  children?: React.ReactNode; // StatPill-StatPill di kanan
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] text-xl text-white">
          {ikon}
        </div>
        <div>
          <p className="text-base font-bold text-navy-900">{judul}</p>
          <p className="text-xs text-ink/60">{subjudul}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// Baris catatan biru muda "💡" di footer kartu (dipakai bareng legenda).
export function CatatanKartu({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#BFD7F5] bg-[#EFF6FF] px-3 py-2 text-[11px] text-navy-900">
      <span>💡</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Hook "📋 Salin sebagai Gambar" -- html2canvas + Clipboard API, dgn
 * fallback unduh langsung kalau clipboard image tidak didukung browser.
 * Pola SAMA persis dgn salinSebagaiGambar di OhMonitoringPanel
 * (app/seruti/page.tsx) & SeksiPemilihanSubsls (perencanaan-lapangan.tsx)
 * -- ditarik jadi 1 hook di sini supaya tidak ditulis ulang di 9 kartu
 * Monitoring Terpadu.
 *
 * Pemanggil TETAP harus me-render node yang mau difoto sbg SALINAN
 * TERSEMBUNYI lebar tetap (`fixed -left-[9999px] top-0 w-[...]`, lihat
 * kartuRef di tiap Seksi) -- hook ini cuma mengurus proses salin/unduhnya,
 * BUKAN tempat merender node-nya (beda kartu beda struktur tabel).
 */
export function useSalinGambar(namaBerkas: string) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "done" | "error">("idle");

  async function salin(node: HTMLElement | null) {
    if (!node) return;
    setCopyStatus("copying");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(node, { backgroundColor: "#ffffff", scale: 2 });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setCopyStatus("error");
          return;
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopyStatus("done");
        } catch {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = namaBerkas;
          a.click();
          URL.revokeObjectURL(url);
          setCopyStatus("done");
        }
        setTimeout(() => setCopyStatus("idle"), 2500);
      }, "image/png");
    } catch {
      setCopyStatus("error");
    }
  }

  function labelTombol(default_: string): string {
    if (copyStatus === "copying") return "Menyalin...";
    if (copyStatus === "done") return "✓ Tersalin";
    if (copyStatus === "error") return "Gagal, coba lagi";
    return default_;
  }

  return { copyStatus, salin, labelTombol };
}
