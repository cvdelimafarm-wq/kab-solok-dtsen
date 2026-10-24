// app/sigap/keu-ui.tsx
//
// (24 Okt 2026) Potongan tampilan bersama seluruh halaman Kertas Kerja Revisi POK (jadwal revisi, daftar RO, ruang kerja RO dan tabnya,
// realisasi), mengikuti papan mockup: halaman lebar dengan jejak dan judul, kartu berbingkai, KPI, chip bertitik, tombol kecil, kolom isian.

import type { ReactNode } from "react";
import Bingkai from "./kontrak/Bingkai";
import { KELAS_CHIP, type WarnaChip } from "@/lib/keu/revisi";

export const kartu = "min-w-0 rounded-xl border border-[#DCE3EE] bg-white p-4";
export const kolom = "box-border min-h-[40px] w-full rounded-md border border-[#C5D0E2] bg-white px-2.5 text-[14px] text-[#0F2A52] focus:outline-2 focus:outline-[#1F5FD1]";
export const label = "mb-1 block text-[11.5px] font-semibold text-[#5B6B84]";
export const tombol = "min-h-[40px] rounded-md px-3 text-[13px] font-semibold disabled:opacity-50";
export const tombolKecil = "min-h-[40px] rounded-md border border-[#C5D0E2] bg-white px-3 text-[13px] font-semibold text-[#1B2B4B] disabled:opacity-50";
export const tombolUtama = "min-h-[40px] rounded-md border border-[#1F5FD1] bg-[#1F5FD1] px-3 text-[13px] font-semibold text-white disabled:opacity-50";
export const tombolBahaya = "min-h-[40px] rounded-md border border-[#C5D0E2] bg-white px-3 text-[13px] font-semibold text-[#7A1D22] disabled:opacity-50";
export const tombolAktif = "min-h-[40px] rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 text-[13px] font-semibold text-[#1F5FD1]";
export const caps = "text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]";
export const judulKartu = "text-[16px] font-bold text-[#0F2A52]";
export const kisi = "grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))]";

export function Chip({ warna, children }: { warna: WarnaChip; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${KELAS_CHIP[warna]}`}>
      <i aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Galat({ pesan }: { pesan: string | string[] | null }) {
  const l = pesan === null ? [] : Array.isArray(pesan) ? pesan : [pesan];
  return l.length ? (
    <ul role="alert" className="space-y-1 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
      {l.map((x) => <li key={x}>{x}</li>)}
    </ul>
  ) : null;
}

export const Catatan = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[13px] text-[#5C4300]">{children}</div>
);
export const Tenang = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg border-l-4 border-[#1F5FD1] bg-[#EAF1FC] px-3 py-2.5 text-[13px] leading-relaxed text-[#1B2B4B]">{children}</div>
);
export const Memuat = ({ tinggi = "h-32" }: { tinggi?: string }) => <div className={`${tinggi} animate-pulse rounded-xl bg-white`} aria-busy="true" />;
export const Kosong = ({ teks }: { teks: string }) => <p className={`${kartu} text-[13px] text-[#5B6B84]`}>{teks}</p>;
export const Potong = () => <Catatan>Data terlalu banyak sehingga hanya sebagian yang ditampilkan.</Catatan>;

/** Kartu KPI papan mockup: label kecil, angka besar, keterangan. `warna` mewarnai angka (hj = hijau, mr = merah, kn = kuning). */
export function Kpi({ label: l, nilai, sub, warna }: { label: string; nilai: ReactNode; sub?: ReactNode; warna?: "hj" | "mr" | "kn" }) {
  const w = warna === "hj" ? "text-[#14653A]" : warna === "mr" ? "text-[#B42329]" : warna === "kn" ? "text-[#8A6200]" : "text-[#0F2A52]";
  return (
    <div className={`${kartu} flex flex-col gap-0.5`}>
      <span className="text-[11.5px] font-semibold text-[#5B6B84]">{l}</span>
      <span className={`break-words text-[22px] font-extrabold leading-tight ${w}`}>{nilai}</span>
      {sub && <span className="text-[12px] text-[#5B6B84]">{sub}</span>}
    </div>
  );
}

/** Bilah progres dua warna (hijau terverifikasi, kuning menunggu). */
export function Progres({ hijau, kuning }: { hijau: number; kuning: number }) {
  const h = Math.max(0, Math.min(100, hijau)), k = Math.max(0, Math.min(100 - h, kuning));
  return (
    <div className="flex h-1.5 overflow-hidden rounded-[3px] bg-[#E6EBF3]" aria-hidden>
      <i className="block h-full bg-[#2E9E63]" style={{ width: `${h}%` }} />
      <i className="block h-full bg-[#E3C25B]" style={{ width: `${k}%` }} />
    </div>
  );
}

export type Jejak = { t: string; href?: string };

/**
 * Kerangka halaman anggaran: bingkai Shell SIGAP (sidebar, topbar dengan jejak, Ctrl K; header navy di HP) dengan menu "Anggaran" aktif,
 * lalu tombol Kembali bernama, judul, keterangan, dan isi. Dipakai /sigap/revisi, /sigap/ro (+ /[kode]) dan /sigap/realisasi.
 */
export function HalamanKeu({ jejak, judul, sub, induk, labelKembali, children }: {
  jejak: Jejak[]; judul: ReactNode; sub?: ReactNode; induk?: string; labelKembali?: string; children: ReactNode;
}) {
  return (
    <Bingkai aktif="anggaran" kecil="SIGAP · Anggaran" jejak={jejak.map((j) => j.t)} judul={judul} sub={sub} kembali={{ induk, label: labelKembali }}>
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">{children}</div>
    </Bingkai>
  );
}
