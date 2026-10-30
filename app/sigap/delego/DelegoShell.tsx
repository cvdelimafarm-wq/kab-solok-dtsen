"use client";

// app/sigap/delego/DelegoShell.tsx
//
// (26 Okt 2026) Bingkai Delego -- permintaan pengguna: begitu masuk menu Delego (web dan tampilan HP untuk kinerja, delegasi, dan manajemen tim),
// seluruh tampilan berganti hijau dengan merek Delego. Data dan akun tetap satu dengan SIGAP.
// Layar lebar: sidebar hijau tua + bilah atas. HP: header hijau, (pemberi) deretan pil menu tim, dan tab bawah (Delegasi, Lapor, Riwayat, Penilaian).

import Link from "next/link";
import TombolKembali from "@/app/components/TombolKembali";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { aturLibur, jamWib, tglPendek } from "@/lib/delego/hitung";
import { useHakDelegasi } from "./data";
import { KonteksDelegoRef, type KonteksDelego } from "./konteks";
import Lonceng from "./Lonceng";
import { Galat, Memuat } from "./ui";

type Ikon = "ringkas" | "beranda" | "papan" | "laporan" | "beban" | "pembinaan" | "tambah" | "tugas" | "lapor" | "riwayat" | "penilaian" | "libur" | "katalog" | "ulang";
const JALUR: Record<Ikon, string> = {
  ringkas: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  beranda: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  papan: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v12h-4z",
  laporan: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  beban: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  pembinaan: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
  tambah: "M12 5v14M5 12h14",
  tugas: "M4 6h16M4 12h16M4 18h10",
  lapor: "M5 12l4 4 10-10M5 20h14",
  riwayat: "M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4",
  libur: "M5 5h14v15H5zM5 10h14M9 3v4M15 3v4M9 14h2M13 14h2",
  katalog: "M5 4h11l3 3v13H5zM8 11h8M8 15h8M8 8h4",
  ulang: "M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4",
  penilaian: "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z",
};
function Gambar({ n, ukuran = 18 }: { n: Ikon; ukuran?: number }) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d={JALUR[n]} />
    </svg>
  );
}

/** Tanda merek Delego: satu garis yang bercabang menjadi tiga (tugas dibagikan). */
export function TandaDelego({ ukuran = 30 }: { ukuran?: number }) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0F6B63" />
      <path d="M7 16h7m0 0c3 0 3-7 7-7h4M14 16h11M14 16c3 0 3 7 7 7h4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26.5" cy="9" r="1.8" fill="#CFE4E1" />
      <circle cx="26.5" cy="16" r="1.8" fill="#CFE4E1" />
      <circle cx="26.5" cy="23" r="1.8" fill="#CFE4E1" />
    </svg>
  );
}

type Butir = { href: string; label: string; ikon: Ikon; persis?: boolean };
const BUTIR_TIM: Butir[] = [
  { href: "/sigap/delego", label: "Beranda tim", ikon: "beranda", persis: true },
  { href: "/sigap/delego/papan", label: "Papan delegasi", ikon: "papan" },
  { href: "/sigap/delego/laporan", label: "Laporan tim", ikon: "laporan" },
  { href: "/sigap/delego/beban", label: "Beban kerja", ikon: "beban" },
  { href: "/sigap/delego/pembinaan", label: "Pembinaan dan skor", ikon: "pembinaan" },
  { href: "/sigap/delego/jenis", label: "Katalog pekerjaan", ikon: "katalog" },
  { href: "/sigap/delego/rutin", label: "Pekerjaan berulang", ikon: "ulang" },
  { href: "/sigap/delego/libur", label: "Kalender libur", ikon: "libur" },
];
const BUTIR_RINGKAS: Butir = { href: "/sigap/delego/ringkasan", label: "Ringkasan bulanan", ikon: "ringkas" };
const BUTIR_BUAT: Butir = { href: "/sigap/delego/buat", label: "Buat delegasi", ikon: "tambah" };
const BUTIR_SAYA: Butir[] = [
  { href: "/sigap/delego/saya", label: "Delegasi saya", ikon: "tugas" },
  { href: "/sigap/delego/lapor", label: "Lapor harian", ikon: "lapor" },
  { href: "/sigap/delego/riwayat", label: "Riwayat", ikon: "riwayat" },
  { href: "/sigap/delego/penilaian", label: "Penilaian saya", ikon: "penilaian" },
];

const inisial = (nama: string) =>
  nama
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 1)
    .slice(0, 2)
    .map((k) => k[0].toUpperCase())
    .join("") || "?";

export default function DelegoShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname() ?? "";
  const h = useHakDelegasi();
  const [jam, setJam] = useState(() => jamWib(new Date()));
  useEffect(() => {
    const t = window.setInterval(() => setJam(jamWib(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const sesiBerakhir = !!h.galat && /sesi berakhir/i.test(h.galat);
  useEffect(() => {
    if (sesiBerakhir) router.replace("/");
  }, [sesiBerakhir, router]);

  const hak = h.data;
  const konteks = useMemo<KonteksDelego | null>(() => {
    if (!hak) return null;
    aturLibur(hak.libur ?? []); // kalender libur dipakai semua hitungan hari kerja (lib/delego/hitung.ts)
    const manajer = hak.semua || hak.lihat_ro.length > 0 || hak.beri_ro.length > 0;
    const pemberi = hak.semua || hak.beri_ro.length > 0;
    return { hak, hari: hak.hari_ini, jam, manajer, pemberi, bolehBeri: (ro) => hak.semua || hak.beri_ro.includes(ro), muatHak: h.muat };
  }, [hak, jam, h.muat]);

  const aktif = (b: Butir) => (b.persis ? path === b.href : path === b.href || path.startsWith(`${b.href}/`));
  const tim = konteks?.manajer ? [...BUTIR_TIM, ...(konteks.pemberi ? [BUTIR_BUAT] : []), ...(hak?.semua ? [BUTIR_RINGKAS] : [])] : [];
  const peran = !hak ? "" : hak.akun.jenis === "mitra" ? "Mitra statistik" : konteks?.pemberi ? "Ketua Tim" : "Pegawai";

  const tautan = (b: Butir) => (
    <Link
      key={b.href}
      href={b.href}
      aria-current={aktif(b) ? "page" : undefined}
      className={`flex min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${aktif(b) ? "bg-white/15 font-semibold text-white" : "text-[#CFE4E1] hover:bg-white/10 hover:text-white"}`}
    >
      <Gambar n={b.ikon} />
      {b.label}
    </Link>
  );

  return (
    <main className="min-h-screen bg-[#F3F5F7] text-[#14212B] lg:flex" style={{ fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* ------------------------------------------------ Sidebar (layar lebar) */}
      <aside className="sticky top-0 hidden print:!hidden h-screen w-[236px] shrink-0 flex-col self-start overflow-y-auto bg-[#0B3B38] px-3 py-4 lg:flex">
        <Link href="/sigap/delego" className="mb-4 flex items-center gap-2.5 px-1.5" aria-label="Delego, beranda">
          <TandaDelego ukuran={34} />
          <span className="leading-tight">
            <span className="block text-[18px] font-bold tracking-wide text-white">Delego</span>
            <span className="block text-[11.5px] text-[#9FC4BF]">BPS Kabupaten Solok</span>
          </span>
        </Link>
        <nav aria-label="Menu Delego" className="flex flex-1 flex-col gap-0.5">
          {tim.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7FAAA4]">Tim</div>
              {tim.map(tautan)}
              <div className="h-3" />
            </>
          )}
          <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7FAAA4]">Saya</div>
          {BUTIR_SAYA.map(tautan)}
        </nav>
        <div className="mt-4 space-y-2 border-t border-white/15 pt-3">
          {hak && (
            <div className="flex items-center gap-2.5 px-1.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#CFE4E1] text-[13px] font-bold text-[#0B3B38]">{inisial(hak.akun.nama)}</span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-white">{hak.akun.nama}</span>
                <span className="block text-[11.5px] text-[#9FC4BF]">{peran}</span>
              </span>
            </div>
          )}
          <Link href="/sigap/admin" className="flex min-h-[36px] items-center rounded-lg px-2.5 text-[12.5px] text-[#CFE4E1] hover:bg-white/10 hover:text-white">
            ← Kembali ke SIGAP
          </Link>
          <Link href="/" className="flex min-h-[36px] items-center rounded-lg px-2.5 text-[12.5px] text-[#CFE4E1] hover:bg-white/10 hover:text-white">
            Portal utama
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ------------------------------------------------ Header HP */}
        <header className="bg-[#0B3B38] px-4 pb-3 pt-3 text-white lg:hidden print:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href={konteks?.manajer ? "/sigap/delego" : "/sigap/delego/saya"} className="flex items-center gap-2" aria-label="Delego">
              <TandaDelego ukuran={30} />
              <span className="text-[18px] font-bold tracking-wide">Delego</span>
            </Link>
            <div className="flex items-center gap-2">
              {/* (30 Okt 2026) tombol Kembali seragam (satu langkah ke halaman sebelumnya); dulu tautan "SIGAP" ke /sigap/admin, bukan Beranda */}
              <TombolKembali tema="gelap" induk="/" className="max-w-[46vw]" />
              <Lonceng />
            </div>
          </div>
          {hak && (
            <div className="mt-2 text-[13px] text-[#CFE4E1]">
              {tglPendek(hak.hari_ini)} · {hak.akun.nama} · {peran}
            </div>
          )}
        </header>
        {tim.length > 0 && (
          <nav aria-label="Menu tim" className="flex gap-2 overflow-x-auto border-b border-[#D5DCE2] bg-white px-3 py-2 lg:hidden print:hidden">
            {tim.map((b) => (
              <Link
                key={b.href}
                href={b.href}
                aria-current={aktif(b) ? "page" : undefined}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold ${aktif(b) ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white text-[#14212B]"}`}
              >
                {b.label}
              </Link>
            ))}
          </nav>
        )}

        {/* ------------------------------------------------ Bilah atas (layar lebar) */}
        <div className="hidden items-center justify-end gap-3 px-6 pt-4 lg:flex print:!hidden">
          {hak && <span className="text-[13px] text-[#3B4A57]">{tglPendek(hak.hari_ini)}</span>}
          <Lonceng />
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-4 lg:px-6 lg:pb-8 lg:pt-3">
          {h.memuat && !hak && <Memuat teks="Menyiapkan Delego..." />}
          {h.galat && !hak && !sesiBerakhir && <Galat>{h.galat}</Galat>}
          {konteks && <KonteksDelegoRef.Provider value={konteks}>{children}</KonteksDelegoRef.Provider>}
        </div>

        {/* ------------------------------------------------ Tab bawah (HP) */}
        <nav aria-label="Menu saya" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#D5DCE2] bg-white lg:hidden print:hidden">
          {BUTIR_SAYA.map((b) => (
            <Link
              key={b.href}
              href={b.href}
              aria-current={aktif(b) ? "page" : undefined}
              className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[12px] ${aktif(b) ? "font-bold text-[#0B524C]" : "font-medium text-[#33404B]"}`}
            >
              <Gambar n={b.ikon} ukuran={22} />
              {b.label.replace(" saya", "").replace(" harian", "")}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
