"use client";

// app/sigap/pelatihan/TabPelatihan.tsx
//
// (2 Nov 2026) Bilah 5 tab pelatihan di bagian bawah layar HP: Hari ini · Instrumen · Pelatihan · Kamera SIGAP · Monitoring.
// Hanya tampil untuk kegiatan yang saklar `tab_baru`-nya menyala (Kelola Pelatihan). Saklar mati / SQL belum dijalankan -> TabPelatihanOtomatis tidak menggambar apa pun,
// sehingga tampilan Langkah lama tidak berubah. Berkas ini hanya menggambar; data berasal dari GET /api/sigap/pelatihan/ketentuan.

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "../admin/api";

export type TabAktif = "hari-ini" | "instrumen" | "pelatihan" | "absen" | "kamera" | "monitoring";

/** Tab yang tampil: peserta melihat Pelatihan; panitia/instruktur melihat "Absen peserta" sebagai gantinya; peran ganda melihat keduanya. */
export type TabPeran = { pelatihan: boolean; absen: boolean };
export const TAB_PESERTA: TabPeran = { pelatihan: true, absen: false };

type Tab = { kode: TabAktif; label: string; href: string | null; ikon: React.ReactNode };

const GARIS = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IKON: Record<TabAktif, React.ReactNode> = {
  "hari-ini": (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...GARIS}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  ),
  instrumen: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...GARIS}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </svg>
  ),
  pelatihan: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...GARIS}>
      <path d="M3 9l9-5 9 5-9 5z" />
      <path d="M7 11.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5" />
    </svg>
  ),
  absen: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...GARIS}>
      <path d="M9 11.5l2 2 4-4.5" />
      <rect x="5" y="4" width="14" height="17" rx="3" />
      <path d="M9 4V3h6v1" />
    </svg>
  ),
  kamera: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...GARIS}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  monitoring: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...GARIS}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
};

/** Daftar tab. `kameraHref` kosong (bukan peserta / belum punya token) -> tab Kamera tetap tampil tetapi nonaktif. */
export function daftarTab(kameraHref: string | null, peran: TabPeran = TAB_PESERTA): Tab[] {
  const tab: Tab[] = [
    { kode: "hari-ini", label: "Hari ini", href: "/sigap/pelatihan/hari-ini", ikon: IKON["hari-ini"] },
    { kode: "instrumen", label: "Instrumen", href: "/sigap/pelatihan/instrumen", ikon: IKON.instrumen },
  ];
  if (peran.pelatihan) tab.push({ kode: "pelatihan", label: "Pelatihan", href: "/sigap/pelatihan?tab=pelatihan", ikon: IKON.pelatihan });
  if (peran.absen) tab.push({ kode: "absen", label: "Absen peserta", href: "/sigap/pelatihan/absen", ikon: IKON.absen });
  tab.push(
    { kode: "kamera", label: "Kamera", href: kameraHref, ikon: IKON.kamera },
    { kode: "monitoring", label: "Monitoring", href: "/sigap/pelatihan/monitoring", ikon: IKON.monitoring },
  );
  return tab;
}

/** Angka penanda per tab (mis. instrumen wajib yang belum dibuka). 0 / kosong = tanpa penanda. */
export type Lencana = Partial<Record<TabAktif, number>>;

export function TabPelatihan({ aktif, kameraHref, peran = TAB_PESERTA, lencana = {} }: { aktif: TabAktif; kameraHref: string | null; peran?: TabPeran; lencana?: Lencana }) {
  const tab = daftarTab(kameraHref, peran);
  return (
    <>
      <div aria-hidden className="h-[76px]" />
      <nav aria-label="Menu pelatihan" className="fixed inset-x-0 bottom-0 z-30 border-t border-[#DDE6F3] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${tab.length}, minmax(0, 1fr))` }}>
          {tab.map((t) => {
            const sedang = t.kode === aktif;
            const warna = sedang ? "text-[#1F5FD1]" : "text-[#6B7A90]";
            const isi = (
              <span className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold ${warna} ${t.href ? "" : "opacity-40"}`}>
                <span className={`relative grid h-7 w-12 place-items-center rounded-full ${sedang ? "bg-[#E3EEFF]" : ""}`}>
                  {t.ikon}
                  {(lencana[t.kode] ?? 0) > 0 && (
                    <span aria-label={`${lencana[t.kode]} belum selesai`} className="absolute right-1 top-0 grid h-4 min-w-[16px] place-items-center rounded-full bg-[#D92D20] px-1 text-[10px] font-bold leading-none text-white">
                      {Math.min(lencana[t.kode] ?? 0, 9)}
                    </span>
                  )}
                </span>
                <span className="leading-none">{t.label}</span>
              </span>
            );
            return (
              <li key={t.kode}>
                {t.href ? (
                  <Link href={t.href} aria-current={sedang ? "page" : undefined} className="block active:opacity-80">
                    {isi}
                  </Link>
                ) : (
                  <span aria-disabled className="block">
                    {isi}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

type Bendera = { tab_baru: boolean; kamera_href: string | null; kegiatan_id: number; tab: TabPeran; instrumen_belum: number };
// Bendera disimpan selama sesi tab peramban supaya perpindahan antar-halaman tidak memuat ulang dan bilah tidak berkedip.
let cacheBendera: { nilai: Bendera; sampai: number } | null = null;

export function useBenderaTab(): Bendera | null {
  const [b, setB] = useState<Bendera | null>(() => (cacheBendera && cacheBendera.sampai > Date.now() ? cacheBendera.nilai : null));
  useEffect(() => {
    if (cacheBendera && cacheBendera.sampai > Date.now()) return;
    let batal = false;
    fetchJson<Bendera>("/api/sigap/pelatihan/ketentuan")
      .then((r) => {
        const nilai: Bendera = { tab_baru: !!r.tab_baru, kamera_href: r.kamera_href ?? null, kegiatan_id: r.kegiatan_id, tab: r.tab ?? TAB_PESERTA, instrumen_belum: Number(r.instrumen_belum ?? 0) || 0 };
        cacheBendera = { nilai, sampai: Date.now() + 60_000 };
        if (!batal) setB(nilai);
      })
      .catch(() => undefined); // gagal -> tanpa bilah baru; halaman tetap berjalan
    return () => {
      batal = true;
    };
  }, []);
  return b;
}

/** Dipasang di Kerangka: menggambar bilah hanya bila kegiatan memakai tampilan baru. */
export function TabPelatihanOtomatis({ aktif }: { aktif: TabAktif }) {
  const b = useBenderaTab();
  if (!b || !b.tab_baru) return null;
  return <TabPelatihan aktif={aktif} kameraHref={b.kamera_href} peran={b.tab} lencana={{ instrumen: b.instrumen_belum }} />;
}

/** Untuk pengujian / pembaruan setelah pengelola mengubah saklar. */
export function lupakanBenderaTab() {
  cacheBendera = null;
}
