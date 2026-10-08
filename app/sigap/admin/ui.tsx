"use client";

// app/sigap/admin/ui.tsx
//
// (5 Okt 2026) Komponen kecil bersama halaman Admin SIGAP & Kelola Peran & Akses -- gaya mengikuti
// halaman petugas (header gradien navy, aksen emas, kartu putih rounded-2xl) -- permintaan user.
// (6 Okt 2026) Di layar lebar (lg) kartu ikut gaya backoffice yang flat & tenang (saran desain user):
// rounded-xl, garis tipis #DDE6F3, tanpa bayangan (konstanta KARTU_LG).


export const INPUT =
  "rounded-lg border border-[#DDE6F3] bg-white px-2.5 py-1.5 text-[13px] text-[#1B2B4B] outline-none transition focus:border-[#1F5FD1] focus:ring-2 focus:ring-[#1F5FD1]/15 disabled:bg-slate-100 disabled:text-slate-500";
export const BTN =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-[#1F5FD1] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-[#1A4FB8] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_O =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-[#CBD6E6] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#1B2B4B] transition hover:bg-[#F5F8FE] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_G =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-[#13794B] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-[#0F6340] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_R =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-[#F0C4BF] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#B42329] transition hover:bg-[#FDE8E8] disabled:cursor-not-allowed disabled:opacity-50";
export const TH = "sticky top-0 z-[1] whitespace-nowrap border-b border-[#CBD6E6] bg-[#F5F8FE] px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#5B6B84]";
export const TD = "border-t border-[#DDE6F3] px-3.5 py-2.5 align-middle";
/** (6 Okt 2026) Gaya kartu layar lebar: flat, bertepi tipis. */
export const KARTU_LG = "lg:rounded-[10px] lg:border lg:border-[#DDE6F3] lg:shadow-none";

type Warna = "ok" | "wait" | "bad" | "mut" | "vio" | "navy";
const CHIP: Record<Warna, string> = {
  ok: "bg-[#E3F6EC] text-[#13794B]",
  wait: "bg-[#FFF4D6] text-[#8A6200]",
  bad: "bg-[#FDE8E8] text-[#B42329]",
  mut: "bg-[#EEF2F7] text-[#5B6B84]",
  vio: "bg-violet-50 text-violet-700",
  navy: "bg-[#E6EEFC] text-[#1F5FD1]",
};
export function Chip({ w = "mut", children, title }: { w?: Warna; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-[9px] px-2 py-[3px] text-[11px] font-bold ${CHIP[w]}`}>
      {children}
    </span>
  );
}

export function Kartu({ judul, ket, kanan, children, className = "" }: { judul?: React.ReactNode; ket?: React.ReactNode; kanan?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)] ${KARTU_LG} ${className}`}>
      {(judul || kanan) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {judul && <h3 className="text-[15px] font-extrabold text-[#0F2A52]">{judul}</h3>}
          {ket && <span className="text-[12.5px] text-[#6B7A90]">{ket}</span>}
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
    <div className={`overflow-x-auto rounded-[18px] bg-white shadow-[0_8px_22px_rgba(15,42,82,.08)] ${KARTU_LG} ${className}`}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Pesan({ jenis = "galat", children, onTutup }: { jenis?: "galat" | "ok" | "info" | "peringatan"; children: React.ReactNode; onTutup?: () => void }) {
  // (6 Okt 2026) gaya "alert" desain user: latar putih, garis kiri 4px berwarna sesuai jenis
  const w =
    jenis === "galat"
      ? "border-l-[#B42329] text-[#7A1D22]"
      : jenis === "ok"
        ? "border-l-[#13794B] text-[#0F6340]"
        : jenis === "peringatan"
          ? "border-l-[#F4B400] text-[#6B4C00]"
          : "border-l-[#1F5FD1] text-[#1B2B4B]";
  return (
    <div role={jenis === "galat" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border border-[#DDE6F3] border-l-4 bg-white px-3.5 py-2.5 text-[13px] ${w}`}>
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
  return <span className={`inline-block animate-spin rounded-full border-[#1F5FD1]/20 border-t-[#1F5FD1] ${kecil ? "h-4 w-4 border-2" : "h-8 w-8 border-4"}`} />;
}

export function Memuat({ teks = "Memuat…" }: { teks?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[#6B7A90]">
      <Putar kecil /> {teks}
    </div>
  );
}

export function KartuAngka({ label, nilai, ket, warna }: { label: string; nilai: React.ReactNode; ket?: React.ReactNode; warna?: string }) {
  return (
    <div className={`rounded-[18px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)] ${KARTU_LG}`}>
      <p className="text-[12px] text-[#6B7A90]">{label}</p>
      <p className="mt-0.5 text-[22px] font-bold leading-tight lg:text-[20px]" style={warna ? { color: warna } : undefined}>
        {nilai}
      </p>
      {ket && <p className="text-[11px] font-semibold text-[#6B7A90]">{ket}</p>}
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
    <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-4 pb-5 pt-4 text-white sm:px-6">
      <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-2">
          {/* (8 Okt 2026) Identitas SIGAP: petak putih berisi lambang S biru-emas + nama + kepanjangan (mockup identitas visual) */}
          <a href="/sigap" className="flex min-w-0 items-center gap-2.5" aria-label="SIGAP, Sistem Integrasi Kegiatan BPS">
            <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] bg-white shadow-[0_4px_12px_rgba(4,16,40,.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sigap-logo.png" alt="" width={29} height={29} className="h-[29px] w-[29px] object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block text-[18px] font-extrabold leading-none">SIGAP</span>
              <span className="mt-[3px] block truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-[#A9BCD8]">Sistem Integrasi Kegiatan BPS</span>
            </span>
          </a>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {kanan}
            <button type="button" onClick={onKeluar} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20">
              Keluar
            </button>
          </div>
        </div>
        <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F4B400]">{kecil}</p>
        <div className="mt-0.5 text-[22px] font-extrabold leading-tight tracking-[-0.3px] sm:text-[23px]">{judul}</div>
        {children}
      </div>
    </header>
  );
}

export type ItemTab<K extends string> = { kode: K; label: string };
export function BarisTab<K extends string>({ tab, aktif, onPilih }: { tab: ItemTab<K>[]; aktif: K; onPilih: (k: K) => void }) {
  return (
    <nav className="sticky top-0 z-20 border-b border-[#DDE6F3] bg-white shadow-[0_2px_8px_rgba(15,42,82,.05)]">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4" role="tablist">
        {tab.map((t) => (
          <button
            key={t.kode}
            type="button"
            role="tab"
            aria-selected={aktif === t.kode}
            onClick={() => onPilih(t.kode)}
            className={`whitespace-nowrap border-b-[3px] px-3 py-3 text-[13px] font-bold transition ${
              aktif === t.kode ? "border-[#F4B400] text-[#1F5FD1]" : "border-transparent text-[#6B7A90] hover:text-[#1F5FD1]"
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
  return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F8FE] px-6 text-center text-[#1B2B4B]">{children}</main>;
}
