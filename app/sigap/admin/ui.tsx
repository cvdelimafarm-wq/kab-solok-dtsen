"use client";

// app/sigap/admin/ui.tsx
//
// (5 Okt 2026) Komponen kecil bersama halaman Admin SIGAP & Kelola Peran & Akses -- gaya mengikuti
// halaman petugas (header gradien navy, aksen emas, kartu putih rounded-2xl) -- permintaan user.
// (6 Okt 2026) Di layar lebar (lg) kartu ikut gaya backoffice yang flat & tenang (saran desain user):
// rounded-xl, garis tipis #E3E8F0, tanpa bayangan (konstanta KARTU_LG).

import BrandBps from "@/app/components/BrandBps";

export const INPUT =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-[#13213A] outline-none transition focus:border-[#0F3D7A] focus:ring-2 focus:ring-[#0F3D7A]/15 disabled:bg-slate-100 disabled:text-slate-500";
export const BTN =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-[#0F3D7A] px-3 py-1.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#123B70] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_O =
  "inline-flex items-center justify-center gap-1 rounded-lg border-[1.5px] border-[#0F3D7A] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#0F3D7A] transition hover:bg-[#E8EEF8] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_G =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_R =
  "inline-flex items-center justify-center gap-1 rounded-lg border-[1.5px] border-red-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
export const TH = "whitespace-nowrap bg-[#F4F6FA] px-3 py-2 text-left text-[11px] font-extrabold text-[#55627A]";
export const TD = "border-t border-[#EEF1F5] px-3 py-2 align-middle";
/** (6 Okt 2026) Gaya kartu layar lebar: flat, bertepi tipis. */
export const KARTU_LG = "lg:rounded-xl lg:border lg:border-[#E3E8F0] lg:shadow-none";

type Warna = "ok" | "wait" | "bad" | "mut" | "vio" | "navy";
const CHIP: Record<Warna, string> = {
  ok: "bg-emerald-50 text-emerald-800",
  wait: "bg-amber-50 text-amber-800",
  bad: "bg-red-50 text-red-700",
  mut: "bg-slate-100 text-slate-500",
  vio: "bg-violet-50 text-violet-700",
  navy: "bg-[#E8EEF8] text-[#0F3D7A]",
};
export function Chip({ w = "mut", children, title }: { w?: Warna; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP[w]}`}>
      {children}
    </span>
  );
}

export function Kartu({ judul, ket, kanan, children, className = "" }: { judul?: React.ReactNode; ket?: React.ReactNode; kanan?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ${KARTU_LG} ${className}`}>
      {(judul || kanan) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {judul && <h3 className="text-[14px] font-extrabold">{judul}</h3>}
          {ket && <span className="text-[11.5px] font-semibold text-[#6B7890]">{ket}</span>}
          <div className="flex-1" />
          {kanan}
        </div>
      )}
      {children}
    </section>
  );
}

/** Tabel di dalam kartu putih, scroll horizontal bila sempit. */
export function TabelKartu({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-2xl bg-white shadow-sm ${KARTU_LG} ${className}`}>
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  );
}

export function Pesan({ jenis = "galat", children, onTutup }: { jenis?: "galat" | "ok" | "info" | "peringatan"; children: React.ReactNode; onTutup?: () => void }) {
  const w =
    jenis === "galat"
      ? "bg-red-50 text-red-800 border-red-200"
      : jenis === "ok"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : jenis === "peringatan"
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-[#E8EEF8] text-[#0F3D7A] border-[#C9D6EA]";
  return (
    <div role={jenis === "galat" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-medium ${w}`}>
      <div className="flex-1">{children}</div>
      {onTutup && (
        <button type="button" onClick={onTutup} className="font-bold opacity-60 hover:opacity-100" aria-label="Tutup">
          ×
        </button>
      )}
    </div>
  );
}

export function Putar({ kecil = false }: { kecil?: boolean }) {
  return <span className={`inline-block animate-spin rounded-full border-[#0F3D7A]/20 border-t-[#0F3D7A] ${kecil ? "h-4 w-4 border-2" : "h-8 w-8 border-4"}`} />;
}

export function Memuat({ teks = "Memuat…" }: { teks?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[#6B7890]">
      <Putar kecil /> {teks}
    </div>
  );
}

export function KartuAngka({ label, nilai, ket, warna }: { label: string; nilai: React.ReactNode; ket?: React.ReactNode; warna?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-3.5 shadow-sm ${KARTU_LG}`}>
      <p className="text-[11px] font-bold text-[#6B7890]">{label}</p>
      <p className="mt-0.5 text-[22px] font-extrabold leading-tight lg:text-[19px]" style={warna ? { color: warna } : undefined}>
        {nilai}
      </p>
      {ket && <p className="text-[11px] font-semibold text-[#6B7890]">{ket}</p>}
    </div>
  );
}

/** Header gradien navy halaman admin. */
export function HeaderAdmin({
  kecil,
  judul,
  kanan,
  onKeluar,
  children,
}: {
  kecil: string;
  judul: React.ReactNode;
  kanan?: React.ReactNode;
  onKeluar: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-[#0F3D7A] via-[#123B70] to-[#1E2A47] px-4 pb-5 pt-4 text-white sm:px-6">
      <div aria-hidden className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/5" />
      <div aria-hidden className="absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-[#F5B841]/10" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-2">
          <BrandBps className="min-w-0 text-blue-100" teksClassName="hidden text-[11px] font-bold uppercase leading-tight tracking-wider sm:inline" ukuran={24} kotakPutih />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {kanan}
            <button type="button" onClick={onKeluar} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20">
              Keluar
            </button>
          </div>
        </div>
        <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F5B841]">{kecil}</p>
        <div className="mt-0.5 text-[21px] font-extrabold leading-tight sm:text-[23px]">{judul}</div>
        {children}
      </div>
    </header>
  );
}

export type ItemTab<K extends string> = { kode: K; label: string };
export function BarisTab<K extends string>({ tab, aktif, onPilih }: { tab: ItemTab<K>[]; aktif: K; onPilih: (k: K) => void }) {
  return (
    <nav className="sticky top-0 z-20 border-b border-[#E3E8F0] bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4" role="tablist">
        {tab.map((t) => (
          <button
            key={t.kode}
            type="button"
            role="tab"
            aria-selected={aktif === t.kode}
            onClick={() => onPilih(t.kode)}
            className={`whitespace-nowrap border-b-[3px] px-3 py-3 text-[13px] font-bold transition ${
              aktif === t.kode ? "border-[#F5B841] text-[#0F3D7A]" : "border-transparent text-[#6B7890] hover:text-[#0F3D7A]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function LayarPenuh({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#EEF2F8] px-6 text-center text-[#13213A]">{children}</main>;
}
