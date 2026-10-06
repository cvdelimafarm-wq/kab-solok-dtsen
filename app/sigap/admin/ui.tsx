"use client";

// app/sigap/admin/ui.tsx
//
// (5 Okt 2026) Komponen kecil bersama halaman Admin SIGAP & Kelola Peran & Akses -- gaya mengikuti
// halaman petugas (header gradien navy, aksen emas, kartu putih rounded-2xl) -- permintaan user.
// (6 Okt 2026) Di layar lebar (lg) kartu ikut gaya backoffice yang flat & tenang (saran desain user):
// rounded-xl, garis tipis #E3E8EE, tanpa bayangan (konstanta KARTU_LG).

import BrandBps from "@/app/components/BrandBps";

export const INPUT =
  "rounded-lg border border-[#E3E8EE] bg-white px-2.5 py-1.5 text-[13px] text-[#14202E] outline-none transition focus:border-[#1F6FD1] focus:ring-2 focus:ring-[#1F6FD1]/15 disabled:bg-slate-100 disabled:text-slate-500";
export const BTN =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-[#1F6FD1] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-[#1A5DB0] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_O =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-[#CDD5DE] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#14202E] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_G =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-[#12816A] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-[#0E6B58] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_R =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-[#F0C4BF] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#B5352D] transition hover:bg-[#FBE5E2] disabled:cursor-not-allowed disabled:opacity-50";
export const TH = "sticky top-0 z-[1] whitespace-nowrap border-b border-[#CDD5DE] bg-[#F8FAFC] px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#4D5B6B]";
export const TD = "border-t border-[#E3E8EE] px-3.5 py-2.5 align-middle";
/** (6 Okt 2026) Gaya kartu layar lebar: flat, bertepi tipis. */
export const KARTU_LG = "lg:rounded-[10px] lg:border lg:border-[#E3E8EE] lg:shadow-none";

type Warna = "ok" | "wait" | "bad" | "mut" | "vio" | "navy";
const CHIP: Record<Warna, string> = {
  ok: "bg-[#DFF2EC] text-[#12816A]",
  wait: "bg-[#FBEFD6] text-[#9A6200]",
  bad: "bg-[#FBE5E2] text-[#B5352D]",
  mut: "bg-[#EDF0F4] text-[#4D5B6B]",
  vio: "bg-violet-50 text-violet-700",
  navy: "bg-[#E3EEFB] text-[#1F6FD1]",
};
export function Chip({ w = "mut", children, title }: { w?: Warna; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${CHIP[w]}`}>
      {children}
    </span>
  );
}

export function Kartu({ judul, ket, kanan, children, className = "" }: { judul?: React.ReactNode; ket?: React.ReactNode; kanan?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ${KARTU_LG} ${className}`}>
      {(judul || kanan) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {judul && <h3 className="text-[15px] font-semibold text-[#14202E]">{judul}</h3>}
          {ket && <span className="text-[12.5px] text-[#7B8794]">{ket}</span>}
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
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Pesan({ jenis = "galat", children, onTutup }: { jenis?: "galat" | "ok" | "info" | "peringatan"; children: React.ReactNode; onTutup?: () => void }) {
  // (6 Okt 2026) gaya "alert" desain user: latar putih, garis kiri 4px berwarna sesuai jenis
  const w =
    jenis === "galat"
      ? "border-l-[#B5352D] text-[#7F241E]"
      : jenis === "ok"
        ? "border-l-[#12816A] text-[#0E5E4E]"
        : jenis === "peringatan"
          ? "border-l-[#D9971F] text-[#6E4600]"
          : "border-l-[#1F6FD1] text-[#14202E]";
  return (
    <div role={jenis === "galat" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border border-[#E3E8EE] border-l-4 bg-white px-3.5 py-2.5 text-[13px] ${w}`}>
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
  return <span className={`inline-block animate-spin rounded-full border-[#1F6FD1]/20 border-t-[#1F6FD1] ${kecil ? "h-4 w-4 border-2" : "h-8 w-8 border-4"}`} />;
}

export function Memuat({ teks = "Memuat…" }: { teks?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[#7B8794]">
      <Putar kecil /> {teks}
    </div>
  );
}

export function KartuAngka({ label, nilai, ket, warna }: { label: string; nilai: React.ReactNode; ket?: React.ReactNode; warna?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-3.5 shadow-sm ${KARTU_LG}`}>
      <p className="text-[12px] text-[#7B8794]">{label}</p>
      <p className="mt-0.5 text-[22px] font-bold leading-tight lg:text-[20px]" style={warna ? { color: warna } : undefined}>
        {nilai}
      </p>
      {ket && <p className="text-[11px] font-semibold text-[#7B8794]">{ket}</p>}
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
    <header className="relative overflow-hidden bg-gradient-to-br from-[#0E2A47] via-[#123257] to-[#163A60] px-4 pb-5 pt-4 text-white sm:px-6">
      <div aria-hidden className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/5" />
      <div aria-hidden className="absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-[#D9971F]/10" />
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
        <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#D9971F]">{kecil}</p>
        <div className="mt-0.5 text-[21px] font-extrabold leading-tight sm:text-[23px]">{judul}</div>
        {children}
      </div>
    </header>
  );
}

export type ItemTab<K extends string> = { kode: K; label: string };
export function BarisTab<K extends string>({ tab, aktif, onPilih }: { tab: ItemTab<K>[]; aktif: K; onPilih: (k: K) => void }) {
  return (
    <nav className="sticky top-0 z-20 border-b border-[#E3E8EE] bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4" role="tablist">
        {tab.map((t) => (
          <button
            key={t.kode}
            type="button"
            role="tab"
            aria-selected={aktif === t.kode}
            onClick={() => onPilih(t.kode)}
            className={`whitespace-nowrap border-b-[3px] px-3 py-3 text-[13px] font-bold transition ${
              aktif === t.kode ? "border-[#D9971F] text-[#1F6FD1]" : "border-transparent text-[#7B8794] hover:text-[#1F6FD1]"
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
  return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F3F5F8] px-6 text-center text-[#14202E]">{children}</main>;
}
